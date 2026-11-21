-- ==============================================================================
-- KKHM Islamic & Arts College — Off-Course Activity Management System
-- Migration 003: Initial Bootstrap Seed & RLS Verification Suite
-- ==============================================================================

-- 1. Bootstrap temporary Administrator account (Admin is prompted to change username & password on first login)
INSERT INTO public.profiles (role, full_name, username, email, phone, password_hash, is_active)
VALUES (
  'admin',
  'Principal Administrator',
  'kkhmoffcourse',
  'admin@kkhmcollege.edu.in',
  '+91 495 2450100',
  crypt('1111', gen_salt('bf')),
  TRUE
)
ON CONFLICT (username) DO NOTHING;

-- 2. Bootstrap Initial Open Academic Year (2026-27) & Institutional Settings
INSERT INTO public.academic_years (name, start_date, end_date, status, description)
VALUES ('2026-27', '2026-06-01', '2027-03-31', 'open', 'Current Academic Year 2026-27')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.app_settings (id, institution_name, application_name, timezone, default_language, selected_academic_year_id)
SELECT
  1,
  'KKHM Islamic & Arts College',
  'KKHM Off-Course Activity Management System',
  'Asia/Kolkata',
  'en',
  id
FROM public.academic_years
WHERE name = '2026-27'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.academic_year_settings (academic_year_id, working_days, period_count, week_start_day, entry_mode, approval_mode)
SELECT id, ARRAY[1,2,3,4,5,6], 8, 1, 'daily', 'daily'
FROM public.academic_years
WHERE name = '2026-27'
ON CONFLICT (academic_year_id) DO NOTHING;

-- ==============================================================================
-- RLS SECURITY VERIFICATION QUERIES (Run in Supabase SQL Editor to verify)
-- ==============================================================================
-- Test 1: Confirm RLS is enabled on all 22 tables
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
--
-- Test 2: Verify Student cannot read another student's period_activity_entries
-- SET LOCAL request.headers = '{"x-kkhm-session": "<student_a_session_token>"}';
-- SELECT COUNT(*) FROM public.period_activity_entries WHERE student_id <> public.current_student_id(); -- MUST BE 0
--
-- Test 3: Verify Student cannot self-approve a period entry
-- UPDATE public.period_activity_entries SET approval_status = 'approved' WHERE student_id = public.current_student_id(); -- MUST FAIL RLS
--
-- Test 4: Verify Mentor cannot access unassigned students
-- SET LOCAL request.headers = '{"x-kkhm-session": "<mentor_a_session_token>"}';
-- SELECT COUNT(*) FROM public.students WHERE id NOT IN (SELECT student_id FROM public.mentor_assignments WHERE mentor_id = public.current_mentor_id()); -- MUST BE 0
--
-- Test 5: Verify Non-Admin cannot modify app_settings or academic_year_settings
-- UPDATE public.app_settings SET institution_name = 'Unauthorized'; -- MUST AFFECT 0 ROWS / FAIL RLS
