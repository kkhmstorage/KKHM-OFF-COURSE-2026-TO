-- ==============================================================================
-- KKHM Islamic & Arts College — Off-Course Activity Management System
-- Migration 001: Complete Normalized PostgreSQL Schema (22 Core Tables)
-- Compatible with Supabase (PostgreSQL 15+)
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Helper trigger for automatic updated_at timestamps
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 1. profiles (Unified Admin / Mentor / Student identity & admin-controlled credentials)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'mentor', 'student')),
  full_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_username_lower ON public.profiles(LOWER(username));
CREATE INDEX IF NOT EXISTS idx_profiles_email_lower ON public.profiles(LOWER(email));

-- Session table for unified username/password authentication via RPC
CREATE TABLE IF NOT EXISTS public.user_sessions (
  token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. students
CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  admission_number TEXT NOT NULL UNIQUE,
  batch_name TEXT NOT NULL,
  guardian_phone TEXT,
  notes TEXT,
  cic_ad_no TEXT,
  clg_ad_no TEXT,
  academic_year_text TEXT,
  semester_text TEXT,
  semester_period TEXT,
  course_stream TEXT,
  college_name TEXT,
  subject_title TEXT,
  proposal_app_no TEXT,
  course_credit TEXT,
  guide_name TEXT,
  whatsapp_number TEXT,
  reference_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_students_batch ON public.students(batch_name);
CREATE INDEX IF NOT EXISTS idx_students_course_stream ON public.students(course_stream);
CREATE INDEX IF NOT EXISTS idx_students_cic_ad_no ON public.students(cic_ad_no);
CREATE INDEX IF NOT EXISTS idx_students_clg_ad_no ON public.students(clg_ad_no);

-- 3. mentors
CREATE TABLE IF NOT EXISTS public.mentors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  employee_code TEXT NOT NULL UNIQUE,
  designation TEXT NOT NULL DEFAULT 'Faculty Mentor',
  department TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. academic_years
CREATE TABLE IF NOT EXISTS public.academic_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_academic_year_dates CHECK (end_date > start_date)
);

-- 5. app_settings (Singleton institutional settings, including global active academic year)
CREATE TABLE IF NOT EXISTS public.app_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  institution_name TEXT NOT NULL DEFAULT 'KKHM Islamic & Arts College',
  application_name TEXT NOT NULL DEFAULT 'KKHM Off-Course Activity Management System',
  logo_url TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  default_language TEXT NOT NULL DEFAULT 'en',
  selected_academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL,
  in_app_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  reminder_hour INTEGER NOT NULL DEFAULT 17 CHECK (reminder_hour BETWEEN 0 AND 23),
  session_timeout_hours INTEGER NOT NULL DEFAULT 168,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. academic_year_settings (Configurable working days, periods, entry mode & approval mode per year)
CREATE TABLE IF NOT EXISTS public.academic_year_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id UUID NOT NULL UNIQUE REFERENCES public.academic_years(id) ON DELETE CASCADE,
  working_days INTEGER[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6], -- 1=Mon .. 7=Sun
  period_count INTEGER NOT NULL DEFAULT 8 CHECK (period_count BETWEEN 1 AND 16),
  week_start_day INTEGER NOT NULL DEFAULT 1 CHECK (week_start_day BETWEEN 1 AND 7),
  entry_mode TEXT NOT NULL DEFAULT 'daily' CHECK (entry_mode IN ('daily', 'weekly')),
  approval_mode TEXT NOT NULL DEFAULT 'daily' CHECK (approval_mode IN ('daily', 'weekly')),
  default_period_timings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. student_academic_enrollments (Year-wise student enrollment separation)
CREATE TABLE IF NOT EXISTS public.student_academic_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  class_batch TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'withdrawn')),
  enrolled_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, academic_year_id)
);

CREATE INDEX IF NOT EXISTS idx_enrollments_year ON public.student_academic_enrollments(academic_year_id);

-- 8. mentor_assignments (One active primary mentor per student per academic year, full history preserved)
CREATE TABLE IF NOT EXISTS public.mentor_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  mentor_id UUID NOT NULL REFERENCES public.mentors(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  assigned_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ended_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_mentor_per_student_year
  ON public.mentor_assignments(student_id, academic_year_id)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_mentor_assignments_mentor_year
  ON public.mentor_assignments(mentor_id, academic_year_id, is_active);

-- 9. semesters
CREATE TABLE IF NOT EXISTS public.semesters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  academic_stage TEXT NOT NULL DEFAULT 'thamheediyya' CHECK (academic_stage IN ('thamheediyya', 'aliya', 'pg')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('upcoming', 'active', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (academic_year_id, name),
  CONSTRAINT chk_semester_dates CHECK (end_date > start_date)
);

ALTER TABLE public.semesters
  ADD COLUMN IF NOT EXISTS academic_stage TEXT NOT NULL DEFAULT 'thamheediyya';

-- 10. subjects
CREATE TABLE IF NOT EXISTS public.subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Core',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. semester_subjects
CREATE TABLE IF NOT EXISTS public.semester_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  semester_id UUID NOT NULL REFERENCES public.semesters(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (semester_id, subject_id)
);

-- 12. student_subject_selections (Explicitly tracks Selected & Not Selected per student per semester)
CREATE TABLE IF NOT EXISTS public.student_subject_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  semester_id UUID NOT NULL REFERENCES public.semesters(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  selection_status TEXT NOT NULL CHECK (selection_status IN ('selected', 'not_selected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, semester_id, subject_id)
);

-- 13. timetable_templates
CREATE TABLE IF NOT EXISTS public.timetable_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  semester_id UUID REFERENCES public.semesters(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  revision INTEGER NOT NULL DEFAULT 1,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. timetable_slots
CREATE TABLE IF NOT EXISTS public.timetable_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.timetable_templates(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  period_number INTEGER NOT NULL CHECK (period_number >= 1),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  planned_activity TEXT NOT NULL,
  is_off_course BOOLEAN NOT NULL DEFAULT FALSE,
  off_course_student_ids TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (template_id, day_of_week, period_number)
);

ALTER TABLE public.timetable_slots
  ADD COLUMN IF NOT EXISTS is_off_course BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS off_course_student_ids TEXT[] NOT NULL DEFAULT '{}';

-- 15. student_timetable_assignments
CREATE TABLE IF NOT EXISTS public.student_timetable_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.timetable_templates(id) ON DELETE CASCADE,
  effective_start_date DATE NOT NULL,
  effective_end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_tt_assign ON public.student_timetable_assignments(student_id, academic_year_id, is_active);

-- 16. timetable_overrides (Date-specific or student-specific planned activity changes without rewriting past snapshots)
CREATE TABLE IF NOT EXISTS public.timetable_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
  override_date DATE NOT NULL,
  period_number INTEGER NOT NULL CHECK (period_number >= 1),
  planned_activity TEXT NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 17. academic_calendar_exceptions (Holidays, Special Working Days, Weekly Offs, Period Cancellations)
CREATE TABLE IF NOT EXISTS public.academic_calendar_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  exception_date DATE NOT NULL,
  exception_type TEXT NOT NULL CHECK (exception_type IN ('holiday', 'weekly_off', 'special_working_day', 'period_cancellation')),
  period_number INTEGER CHECK (period_number IS NULL OR period_number >= 1),
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calendar_exc_year_date ON public.academic_calendar_exceptions(academic_year_id, exception_date);

-- 18. report_submissions (Approval & submission units with snapshotted Entry & Approval modes)
CREATE TABLE IF NOT EXISTS public.report_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  semester_id UUID REFERENCES public.semesters(id) ON DELETE SET NULL,
  mentor_id UUID REFERENCES public.mentors(id) ON DELETE SET NULL,
  unit_key TEXT NOT NULL, -- 'YYYY-MM-DD' for daily approval, 'WEEK-YYYY-MM-DD' (week start) for weekly approval
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  entry_mode_snapshot TEXT NOT NULL CHECK (entry_mode_snapshot IN ('daily', 'weekly')),
  approval_mode_snapshot TEXT NOT NULL CHECK (approval_mode_snapshot IN ('daily', 'weekly')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('not_started', 'draft', 'submitted', 'pending_review', 'partially_reviewed', 'returned', 'approved')
  ),
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, academic_year_id, unit_key)
);

CREATE INDEX IF NOT EXISTS idx_submissions_year_status ON public.report_submissions(academic_year_id, status);
CREATE INDEX IF NOT EXISTS idx_submissions_mentor ON public.report_submissions(mentor_id, academic_year_id);

-- 19. period_activity_entries (Individual relational row per period — never stored as a monolithic JSON blob)
CREATE TABLE IF NOT EXISTS public.period_activity_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.report_submissions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  activity_date DATE NOT NULL,
  period_number INTEGER NOT NULL CHECK (period_number >= 1),
  planned_activity_snapshot TEXT NOT NULL,
  actual_activity TEXT NOT NULL DEFAULT '',
  activity_status TEXT NOT NULL DEFAULT 'completed' CHECK (
    activity_status IN ('completed', 'no_activity', 'absent', 'cancelled')
  ),
  optional_notes TEXT,
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    approval_status IN ('pending', 'approved', 'returned')
  ),
  mentor_comment TEXT,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, academic_year_id, activity_date, period_number)
);

CREATE INDEX IF NOT EXISTS idx_period_entries_submission ON public.period_activity_entries(submission_id);
CREATE INDEX IF NOT EXISTS idx_period_entries_year_date ON public.period_activity_entries(academic_year_id, activity_date);
CREATE INDEX IF NOT EXISTS idx_period_entries_approval ON public.period_activity_entries(approval_status);

-- 20. report_review_history (Immutable audit trail of all mentor approvals, returns, and student resubmissions)
CREATE TABLE IF NOT EXISTS public.report_review_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.report_submissions(id) ON DELETE CASCADE,
  period_entry_id UUID NOT NULL REFERENCES public.period_activity_entries(id) ON DELETE CASCADE,
  actor_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('submitted', 'approved', 'returned', 'resubmitted')),
  comment TEXT,
  activity_snapshot TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_history_period ON public.report_review_history(period_entry_id, created_at DESC);

-- 21. notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('report_submitted', 'report_approved', 'report_returned', 'period_unlocked', 'system_alert')),
  link_target TEXT,
  reference_id UUID,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(recipient_profile_id, is_read, created_at DESC);

-- 22. audit_logs (Append-only administrative & workflow audit ledger)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  record_type TEXT NOT NULL,
  record_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);

-- Attach updated_at triggers
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles', 'students', 'mentors', 'academic_years', 'app_settings',
    'academic_year_settings', 'student_academic_enrollments', 'mentor_assignments',
    'semesters', 'subjects', 'student_subject_selections', 'timetable_templates',
    'timetable_slots', 'student_timetable_assignments', 'academic_calendar_exceptions',
    'report_submissions', 'period_activity_entries'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I;', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();', t, t);
  END LOOP;
END $$;
-- ==============================================================================
-- KKHM Islamic & Arts College — Off-Course Activity Management System
-- Migration 002: Row Level Security (RLS), Session Helpers & Transactional RPCs
-- ==============================================================================

-- Session resolution helper: supports both Supabase Auth JWT and x-kkhm-session header
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS UUID LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_auth_uid UUID;
  v_session_token TEXT;
  v_profile_id UUID;
BEGIN
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NOT NULL THEN
    SELECT id INTO v_profile_id FROM public.profiles WHERE auth_user_id = v_auth_uid AND is_active = TRUE;
    IF v_profile_id IS NOT NULL THEN
      RETURN v_profile_id;
    END IF;
  END IF;

  BEGIN
    v_session_token := current_setting('request.headers', true)::json->>'x-kkhm-session';
  EXCEPTION WHEN OTHERS THEN
    v_session_token := NULL;
  END;

  IF v_session_token IS NOT NULL AND v_session_token <> '' THEN
    SELECT s.profile_id INTO v_profile_id
    FROM public.user_sessions s
    JOIN public.profiles p ON p.id = s.profile_id
    WHERE s.token = v_session_token::uuid
      AND s.expires_at > NOW()
      AND p.is_active = TRUE;
    RETURN v_profile_id;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.profiles WHERE id = public.current_profile_id();
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(public.current_user_role() = 'admin', FALSE);
$$;

CREATE OR REPLACE FUNCTION public.current_student_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM public.students WHERE profile_id = public.current_profile_id();
$$;

CREATE OR REPLACE FUNCTION public.current_mentor_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM public.mentors WHERE profile_id = public.current_profile_id();
$$;

CREATE OR REPLACE FUNCTION public.is_assigned_mentor(p_student_id UUID, p_year_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mentor_assignments ma
    WHERE ma.student_id = p_student_id
      AND ma.academic_year_id = p_year_id
      AND ma.mentor_id = public.current_mentor_id()
      AND ma.is_active = TRUE
  );
$$;

-- ==============================================================================
-- UNIFIED LOGIN & ADMIN CREDENTIAL CONTROL RPCs
-- Single login interface for Admin, Mentor, Student with bcrypt password hashes
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.authenticate_user(p_identifier TEXT, p_password TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_token UUID;
BEGIN
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE LOWER(username) = LOWER(TRIM(p_identifier))
     OR LOWER(email) = LOWER(TRIM(p_identifier))
  LIMIT 1;

  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'Invalid username/email or password.';
  END IF;

  IF NOT v_profile.is_active THEN
    RAISE EXCEPTION 'This account has been deactivated by the administrator.';
  END IF;

  IF v_profile.password_hash <> crypt(p_password, v_profile.password_hash) THEN
    RAISE EXCEPTION 'Invalid username/email or password.';
  END IF;

  UPDATE public.profiles SET last_login_at = NOW() WHERE id = v_profile.id;

  INSERT INTO public.user_sessions(profile_id, expires_at)
  VALUES (v_profile.id, NOW() + INTERVAL '7 days')
  RETURNING token INTO v_token;

  INSERT INTO public.audit_logs(actor_profile_id, actor_name, actor_role, action, record_type, record_id, details)
  VALUES (v_profile.id, v_profile.full_name, v_profile.role, 'USER_LOGIN', 'profile', v_profile.id::text, jsonb_build_object('username', v_profile.username));

  RETURN jsonb_build_object(
    'session_token', v_token,
    'profile', jsonb_build_object(
      'id', v_profile.id,
      'role', v_profile.role,
      'full_name', v_profile.full_name,
      'username', v_profile.username,
      'email', v_profile.email,
      'phone', v_profile.phone,
      'is_active', v_profile.is_active
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_credentials(
  p_target_profile_id UUID,
  p_new_username TEXT,
  p_new_password TEXT DEFAULT NULL
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_admin public.profiles%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden: Only administrators can manage login credentials.';
  END IF;

  SELECT * INTO v_admin FROM public.profiles WHERE id = public.current_profile_id();

  UPDATE public.profiles
  SET
    username = TRIM(p_new_username),
    password_hash = CASE
      WHEN p_new_password IS NOT NULL AND LENGTH(TRIM(p_new_password)) >= 6
      THEN crypt(p_new_password, gen_salt('bf'))
      ELSE password_hash
    END
  WHERE id = p_target_profile_id;

  INSERT INTO public.audit_logs(actor_profile_id, actor_name, actor_role, action, record_type, record_id, details)
  VALUES (
    v_admin.id, v_admin.full_name, v_admin.role,
    'CREDENTIALS_UPDATED', 'profile', p_target_profile_id::text,
    jsonb_build_object('username', TRIM(p_new_username), 'password_changed', (p_new_password IS NOT NULL AND LENGTH(TRIM(p_new_password)) >= 6))
  );

  RETURN TRUE;
END;
$$;

-- ==============================================================================
-- BACKEND-ENFORCED SEQUENTIAL LOCKING & SUBMISSION RPC
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.submit_report_unit(p_submission_id UUID)
RETURNS public.report_submissions LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sub public.report_submissions%ROWTYPE;
  v_year public.academic_years%ROWTYPE;
  v_prev_unapproved BOOLEAN;
  v_student_id UUID;
BEGIN
  v_student_id := public.current_student_id();
  SELECT * INTO v_sub FROM public.report_submissions WHERE id = p_submission_id;

  IF v_sub.id IS NULL THEN
    RAISE EXCEPTION 'Report submission not found.';
  END IF;

  IF NOT public.is_admin() AND v_sub.student_id <> v_student_id THEN
    RAISE EXCEPTION 'Forbidden: You can only submit your own reports.';
  END IF;

  SELECT * INTO v_year FROM public.academic_years WHERE id = v_sub.academic_year_id;
  IF v_year.status = 'closed' THEN
    RAISE EXCEPTION 'Cannot submit reports for a closed academic year.';
  END IF;

  -- Verify sequential locking: any earlier reporting unit for this student in this year must be approved
  SELECT EXISTS (
    SELECT 1 FROM public.report_submissions prev
    WHERE prev.student_id = v_sub.student_id
      AND prev.academic_year_id = v_sub.academic_year_id
      AND prev.start_date < v_sub.start_date
      AND prev.status <> 'approved'
  ) INTO v_prev_unapproved;

  IF v_prev_unapproved THEN
    RAISE EXCEPTION 'Sequential lock active: Previous reporting unit must be fully approved before submitting this unit.';
  END IF;

  -- Reset returned periods to pending on resubmission
  UPDATE public.period_activity_entries
  SET approval_status = 'pending'
  WHERE submission_id = p_submission_id
    AND approval_status = 'returned';

  UPDATE public.report_submissions
  SET status = 'pending_review', submitted_at = NOW()
  WHERE id = p_submission_id
  RETURNING * INTO v_sub;

  RETURN v_sub;
END;
$$;

-- ==============================================================================
-- BACKEND-ENFORCED MENTOR PERIOD REVIEW RPC (Protects student text immutability)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.review_period_entry(
  p_period_entry_id UUID,
  p_decision TEXT,
  p_comment TEXT DEFAULT NULL
)
RETURNS public.period_activity_entries LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_entry public.period_activity_entries%ROWTYPE;
  v_actor public.profiles%ROWTYPE;
  v_year public.academic_years%ROWTYPE;
  v_total_req INTEGER;
  v_approved_cnt INTEGER;
  v_returned_cnt INTEGER;
  v_new_sub_status TEXT;
BEGIN
  IF p_decision NOT IN ('approved', 'returned') THEN
    RAISE EXCEPTION 'Invalid review decision.';
  END IF;

  IF p_decision = 'returned' AND (p_comment IS NULL OR LENGTH(TRIM(p_comment)) = 0) THEN
    RAISE EXCEPTION 'A correction comment is mandatory when returning a period.';
  END IF;

  SELECT * INTO v_entry FROM public.period_activity_entries WHERE id = p_period_entry_id;
  IF v_entry.id IS NULL THEN
    RAISE EXCEPTION 'Period entry not found.';
  END IF;

  SELECT * INTO v_year FROM public.academic_years WHERE id = v_entry.academic_year_id;
  IF v_year.status = 'closed' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Closed academic years cannot be modified.';
  END IF;

  IF NOT public.is_admin() AND NOT public.is_assigned_mentor(v_entry.student_id, v_entry.academic_year_id) THEN
    RAISE EXCEPTION 'Forbidden: You are not the assigned mentor for this student in this academic year.';
  END IF;

  SELECT * INTO v_actor FROM public.profiles WHERE id = public.current_profile_id();

  -- Strictly update review fields only; NEVER alter student's actual_activity
  UPDATE public.period_activity_entries
  SET
    approval_status = p_decision,
    mentor_comment = CASE WHEN p_comment IS NOT NULL THEN TRIM(p_comment) ELSE mentor_comment END,
    reviewed_by = v_actor.id,
    reviewed_at = NOW()
  WHERE id = p_period_entry_id
  RETURNING * INTO v_entry;

  INSERT INTO public.report_review_history(submission_id, period_entry_id, actor_profile_id, actor_name, action, comment, activity_snapshot)
  VALUES (v_entry.submission_id, v_entry.id, v_actor.id, v_actor.full_name, p_decision, TRIM(COALESCE(p_comment, '')), v_entry.actual_activity);

  -- Recompute parent submission unit status
  SELECT
    COUNT(*) FILTER (WHERE activity_status <> 'cancelled'),
    COUNT(*) FILTER (WHERE activity_status <> 'cancelled' AND approval_status = 'approved'),
    COUNT(*) FILTER (WHERE activity_status <> 'cancelled' AND approval_status = 'returned')
  INTO v_total_req, v_approved_cnt, v_returned_cnt
  FROM public.period_activity_entries
  WHERE submission_id = v_entry.submission_id;

  IF v_returned_cnt > 0 THEN
    v_new_sub_status := 'returned';
  ELSIF v_total_req > 0 AND v_approved_cnt = v_total_req THEN
    v_new_sub_status := 'approved';
  ELSIF v_approved_cnt > 0 THEN
    v_new_sub_status := 'partially_reviewed';
  ELSE
    v_new_sub_status := 'pending_review';
  END IF;

  UPDATE public.report_submissions
  SET
    status = v_new_sub_status,
    approved_at = CASE WHEN v_new_sub_status = 'approved' THEN NOW() ELSE NULL END
  WHERE id = v_entry.submission_id;

  RETURN v_entry;
END;
$$;

-- ==============================================================================
-- ENABLE ROW LEVEL SECURITY ON ALL 22 TABLES
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_year_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_academic_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentor_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semester_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_subject_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_timetable_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_calendar_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.period_activity_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_review_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Policies: profiles
CREATE POLICY "Admin full access profiles" ON public.profiles FOR ALL USING (public.is_admin());
CREATE POLICY "Self read profile" ON public.profiles FOR SELECT USING (id = public.current_profile_id());
CREATE POLICY "Mentor read assigned student profiles" ON public.profiles FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.students st
    JOIN public.mentor_assignments ma ON ma.student_id = st.id
    WHERE st.profile_id = profiles.id AND ma.mentor_id = public.current_mentor_id()
  )
);

-- Policies: students
CREATE POLICY "Admin full access students" ON public.students FOR ALL USING (public.is_admin());
CREATE POLICY "Student read own student record" ON public.students FOR SELECT USING (profile_id = public.current_profile_id());
CREATE POLICY "Mentor read assigned students" ON public.students FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.mentor_assignments ma WHERE ma.student_id = students.id AND ma.mentor_id = public.current_mentor_id())
);

-- Policies: mentors
CREATE POLICY "Admin full access mentors" ON public.mentors FOR ALL USING (public.is_admin());
CREATE POLICY "Authenticated read mentors" ON public.mentors FOR SELECT USING (public.current_profile_id() IS NOT NULL);

-- Policies: academic_years, app_settings, academic_year_settings, semesters, subjects, semester_subjects, timetable_templates, timetable_slots, calendar_exceptions
CREATE POLICY "Admin manage academic_years" ON public.academic_years FOR ALL USING (public.is_admin());
CREATE POLICY "Authenticated read academic_years" ON public.academic_years FOR SELECT USING (public.current_profile_id() IS NOT NULL);

CREATE POLICY "Admin manage app_settings" ON public.app_settings FOR ALL USING (public.is_admin());
CREATE POLICY "Public read app_settings" ON public.app_settings FOR SELECT USING (TRUE);

CREATE POLICY "Admin manage year_settings" ON public.academic_year_settings FOR ALL USING (public.is_admin());
CREATE POLICY "Authenticated read year_settings" ON public.academic_year_settings FOR SELECT USING (public.current_profile_id() IS NOT NULL);

CREATE POLICY "Admin manage enrollments" ON public.student_academic_enrollments FOR ALL USING (public.is_admin());
CREATE POLICY "Student read own enrollments" ON public.student_academic_enrollments FOR SELECT USING (student_id = public.current_student_id());
CREATE POLICY "Mentor read assigned enrollments" ON public.student_academic_enrollments FOR SELECT USING (public.is_assigned_mentor(student_id, academic_year_id));

CREATE POLICY "Admin manage mentor_assignments" ON public.mentor_assignments FOR ALL USING (public.is_admin());
CREATE POLICY "Student read own mentor_assignments" ON public.mentor_assignments FOR SELECT USING (student_id = public.current_student_id());
CREATE POLICY "Mentor read own mentor_assignments" ON public.mentor_assignments FOR SELECT USING (mentor_id = public.current_mentor_id());

CREATE POLICY "Admin manage semesters" ON public.semesters FOR ALL USING (public.is_admin());
CREATE POLICY "Authenticated read semesters" ON public.semesters FOR SELECT USING (public.current_profile_id() IS NOT NULL);

CREATE POLICY "Admin manage subjects" ON public.subjects FOR ALL USING (public.is_admin());
CREATE POLICY "Authenticated read subjects" ON public.subjects FOR SELECT USING (public.current_profile_id() IS NOT NULL);

CREATE POLICY "Admin manage semester_subjects" ON public.semester_subjects FOR ALL USING (public.is_admin());
CREATE POLICY "Authenticated read semester_subjects" ON public.semester_subjects FOR SELECT USING (public.current_profile_id() IS NOT NULL);

CREATE POLICY "Admin manage subject_selections" ON public.student_subject_selections FOR ALL USING (public.is_admin());
CREATE POLICY "Student read own subject_selections" ON public.student_subject_selections FOR SELECT USING (student_id = public.current_student_id());
CREATE POLICY "Mentor read assigned subject_selections" ON public.student_subject_selections FOR SELECT USING (public.is_assigned_mentor(student_id, academic_year_id));

CREATE POLICY "Admin manage timetable_templates" ON public.timetable_templates FOR ALL USING (public.is_admin());
CREATE POLICY "Authenticated read timetable_templates" ON public.timetable_templates FOR SELECT USING (public.current_profile_id() IS NOT NULL);

CREATE POLICY "Admin manage timetable_slots" ON public.timetable_slots FOR ALL USING (public.is_admin());
CREATE POLICY "Authenticated read timetable_slots" ON public.timetable_slots FOR SELECT USING (public.current_profile_id() IS NOT NULL);

CREATE POLICY "Admin manage timetable_assignments" ON public.student_timetable_assignments FOR ALL USING (public.is_admin());
CREATE POLICY "Student read own timetable_assignments" ON public.student_timetable_assignments FOR SELECT USING (student_id = public.current_student_id());
CREATE POLICY "Mentor read assigned timetable_assignments" ON public.student_timetable_assignments FOR SELECT USING (public.is_assigned_mentor(student_id, academic_year_id));

CREATE POLICY "Admin manage timetable_overrides" ON public.timetable_overrides FOR ALL USING (public.is_admin());
CREATE POLICY "Authenticated read timetable_overrides" ON public.timetable_overrides FOR SELECT USING (public.current_profile_id() IS NOT NULL);

CREATE POLICY "Admin manage calendar_exceptions" ON public.academic_calendar_exceptions FOR ALL USING (public.is_admin());
CREATE POLICY "Authenticated read calendar_exceptions" ON public.academic_calendar_exceptions FOR SELECT USING (public.current_profile_id() IS NOT NULL);

-- Policies: report_submissions
CREATE POLICY "Admin full access submissions" ON public.report_submissions FOR ALL USING (public.is_admin());
CREATE POLICY "Student read own submissions" ON public.report_submissions FOR SELECT USING (student_id = public.current_student_id());
CREATE POLICY "Student insert own draft submissions in open year" ON public.report_submissions FOR INSERT WITH CHECK (
  student_id = public.current_student_id()
  AND status IN ('draft', 'not_started')
  AND EXISTS (SELECT 1 FROM public.academic_years y WHERE y.id = academic_year_id AND y.status = 'open')
);
CREATE POLICY "Student update own draft or returned submissions" ON public.report_submissions FOR UPDATE USING (
  student_id = public.current_student_id()
  AND status IN ('draft', 'returned')
  AND EXISTS (SELECT 1 FROM public.academic_years y WHERE y.id = academic_year_id AND y.status = 'open')
) WITH CHECK (status IN ('draft', 'returned'));
CREATE POLICY "Mentor read assigned submissions" ON public.report_submissions FOR SELECT USING (public.is_assigned_mentor(student_id, academic_year_id));

-- Policies: period_activity_entries
CREATE POLICY "Admin full access period_entries" ON public.period_activity_entries FOR ALL USING (public.is_admin());
CREATE POLICY "Student read own period_entries" ON public.period_activity_entries FOR SELECT USING (student_id = public.current_student_id());
CREATE POLICY "Student insert own period_entries in open year" ON public.period_activity_entries FOR INSERT WITH CHECK (
  student_id = public.current_student_id()
  AND approval_status = 'pending'
  AND activity_status <> 'cancelled'
  AND EXISTS (SELECT 1 FROM public.academic_years y WHERE y.id = academic_year_id AND y.status = 'open')
);
CREATE POLICY "Student update own non-approved period_entries" ON public.period_activity_entries FOR UPDATE USING (
  student_id = public.current_student_id()
  AND approval_status IN ('pending', 'returned')
  AND EXISTS (SELECT 1 FROM public.academic_years y WHERE y.id = academic_year_id AND y.status = 'open')
) WITH CHECK (approval_status IN ('pending', 'returned') AND activity_status <> 'cancelled');
CREATE POLICY "Mentor read assigned period_entries" ON public.period_activity_entries FOR SELECT USING (public.is_assigned_mentor(student_id, academic_year_id));

-- Policies: report_review_history
CREATE POLICY "Admin full access review_history" ON public.report_review_history FOR ALL USING (public.is_admin());
CREATE POLICY "Student read own review_history" ON public.report_review_history FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.report_submissions rs WHERE rs.id = submission_id AND rs.student_id = public.current_student_id())
);
CREATE POLICY "Mentor read assigned review_history" ON public.report_review_history FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.report_submissions rs WHERE rs.id = submission_id AND public.is_assigned_mentor(rs.student_id, rs.academic_year_id))
);

-- Policies: notifications
CREATE POLICY "Admin full access notifications" ON public.notifications FOR ALL USING (public.is_admin());
CREATE POLICY "User manage own notifications" ON public.notifications FOR ALL USING (recipient_profile_id = public.current_profile_id());

-- Policies: audit_logs (Read-only for admins; append-only; never editable by ordinary users)
CREATE POLICY "Admin read audit_logs" ON public.audit_logs FOR SELECT USING (public.is_admin());
CREATE POLICY "Authenticated insert audit_logs" ON public.audit_logs FOR INSERT WITH CHECK (public.current_profile_id() IS NOT NULL);
-- ==============================================================================
-- KKHM Islamic & Arts College — Off-Course Activity Management System
-- Migration 003: Initial Bootstrap Seed & RLS Verification Suite
-- ==============================================================================

-- 1. Bootstrap Administrator account (kkhm / kkhm123.@)
INSERT INTO public.profiles (role, full_name, username, email, phone, password_hash, is_active)
VALUES (
  'admin',
  'Principal Administrator',
  'kkhm',
  'admin@kkhmcollege.edu.in',
  '+91 495 2450100',
  crypt('kkhm123.@', gen_salt('bf')),
  TRUE
)
ON CONFLICT (username) DO UPDATE
SET password_hash = crypt('kkhm123.@', gen_salt('bf')),
    is_active = TRUE;

-- Also migrate legacy kkhmoffcourse username to kkhm if it exists
UPDATE public.profiles
SET username = 'kkhm',
    password_hash = crypt('kkhm123.@', gen_salt('bf')),
    is_active = TRUE
WHERE username = 'kkhmoffcourse';

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
-- ==============================================================================
-- Migration 004: Add Coordination of Islamic Colleges (CIC) Student Fields
-- Compatible with Supabase (PostgreSQL 15+)
-- ==============================================================================

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS cic_ad_no TEXT,
  ADD COLUMN IF NOT EXISTS clg_ad_no TEXT,
  ADD COLUMN IF NOT EXISTS academic_year_text TEXT,
  ADD COLUMN IF NOT EXISTS semester_text TEXT,
  ADD COLUMN IF NOT EXISTS semester_period TEXT,
  ADD COLUMN IF NOT EXISTS course_stream TEXT,
  ADD COLUMN IF NOT EXISTS college_name TEXT,
  ADD COLUMN IF NOT EXISTS subject_title TEXT,
  ADD COLUMN IF NOT EXISTS proposal_app_no TEXT,
  ADD COLUMN IF NOT EXISTS course_credit TEXT,
  ADD COLUMN IF NOT EXISTS guide_name TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT,
  ADD COLUMN IF NOT EXISTS reference_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_students_course_stream ON public.students(course_stream);
CREATE INDEX IF NOT EXISTS idx_students_cic_ad_no ON public.students(cic_ad_no);
CREATE INDEX IF NOT EXISTS idx_students_clg_ad_no ON public.students(clg_ad_no);

-- ==============================================================================
-- Migration 005: PostgREST API Permissions for Anon and Authenticated Roles
-- Ensures Supabase client SDK can query tables without 'permission denied'
-- ==============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- ==============================================================================
-- Migration 006: Duplicate Subject Codes & Semester-aware Timetables
-- ==============================================================================
ALTER TABLE public.subjects DROP CONSTRAINT IF EXISTS subjects_code_key;
DROP INDEX IF EXISTS subjects_code_key;

ALTER TABLE public.timetable_templates ADD COLUMN IF NOT EXISTS semester_id UUID REFERENCES public.semesters(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_timetable_templates_semester_id ON public.timetable_templates(semester_id);
