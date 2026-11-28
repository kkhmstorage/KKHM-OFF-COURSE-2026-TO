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

-- 1. Bootstrap Administrator account (first login only; must be changed immediately)
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
ON CONFLICT (username) DO NOTHING;
-- NOTE: the bootstrap password above is public (it is in this GitHub repo).
-- Migration 006 (appended at the end of this file) forces it to be changed at first login.
-- Re-running this script NEVER resets an existing admin password.

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


-- ==============================================================================
-- KKHM Off-Course AMS — Migration 006: SECURITY HARDENING (hotfix)
-- Safe to run more than once. Run AFTER all earlier migrations / one-click setup.
--
-- Fixes (each one reproduced on a test database before writing this file):
--  F1  Public default admin password (kkhm / kkhm123.@) -> forced change on next login
--  F2  No brute-force protection on login -> 5 failures = 15 min lock per account
--  F3  Login error reveals "deactivated" accounts -> one generic message
--  F4  Session tokens stored in plain text, logout never revoked them
--      -> only SHA-256 of the token is stored; logout_session() revokes;
--         password change / deactivation revokes all of that user's sessions
--  F5  submit_report_unit(): NULL comparison let anonymous users and mentors
--      submit ANY student's report, and re-opened already-approved reports
--  F6  Students could forge mentor_comment / reviewed_by / reviewed_at on their
--      own period entries, and back-date draft reports to dodge the sequential lock
--  F7  Anyone logged in could insert audit_logs rows pretending to be the admin
--  F8  Mentors and students could read bcrypt password hashes (profiles.password_hash)
--  F9  Plain-text password written to profiles.password_hash on create
--  F10 GRANT ALL ROUTINES TO anon: every function (incl. internal ones) callable
--  F11 SECURITY DEFINER functions without a fixed search_path
-- ==============================================================================

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------------------------
-- New columns
-- ------------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS failed_login_count   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS password_changed_at  TIMESTAMPTZ;

ALTER TABLE public.user_sessions
  ADD COLUMN IF NOT EXISTS token_hash   TEXT,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_sessions_token_hash ON public.user_sessions(token_hash);

-- Old plain-text sessions can't be trusted any more: everyone signs in again once.
DELETE FROM public.user_sessions WHERE token_hash IS NULL;

-- F1: any account still on a password that is published in the GitHub repo must change it.
UPDATE public.profiles
SET must_change_password = TRUE
WHERE password_hash LIKE '$2%'
  AND (   password_hash = crypt('kkhm123.@',    password_hash)
       OR password_hash = crypt('1111',         password_hash)
       OR password_hash = crypt('Student@2026', password_hash)
       OR password_hash = crypt('Mentor@2026',  password_hash));

-- ------------------------------------------------------------------------------
-- F9: never keep a plain-text password. Anything written to password_hash that is
-- not already a bcrypt hash gets hashed by the database itself.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_profiles_hash_password()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
BEGIN
  IF NEW.password_hash IS NOT NULL AND NEW.password_hash NOT LIKE '$2%' THEN
    IF LENGTH(NEW.password_hash) < 8 THEN
      RAISE EXCEPTION 'Password must be at least 8 characters.';
    END IF;
    NEW.password_hash := crypt(NEW.password_hash, gen_salt('bf', 10));
    NEW.password_changed_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS profiles_hash_password ON public.profiles;
CREATE TRIGGER profiles_hash_password
  BEFORE INSERT OR UPDATE OF password_hash ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_profiles_hash_password();

-- Fix any plain-text value already stored (created by the old frontend).
UPDATE public.profiles
SET password_hash = crypt(password_hash, gen_salt('bf', 10)), must_change_password = TRUE
WHERE password_hash NOT LIKE '$2%';

-- Password change or deactivation ends every open session of that user.
CREATE OR REPLACE FUNCTION public.trg_profiles_revoke_sessions()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.password_hash IS DISTINCT FROM OLD.password_hash
     OR (OLD.is_active AND NOT NEW.is_active) THEN
    DELETE FROM public.user_sessions WHERE profile_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS profiles_revoke_sessions ON public.profiles;
CREATE TRIGGER profiles_revoke_sessions
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_profiles_revoke_sessions();

-- ------------------------------------------------------------------------------
-- Session helpers (F4, F11)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS UUID LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_auth_uid UUID;
  v_token TEXT;
  v_profile_id UUID;
BEGIN
  BEGIN
    v_auth_uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_auth_uid := NULL;
  END;
  IF v_auth_uid IS NOT NULL THEN
    SELECT id INTO v_profile_id FROM public.profiles WHERE auth_user_id = v_auth_uid AND is_active;
    IF v_profile_id IS NOT NULL THEN RETURN v_profile_id; END IF;
  END IF;

  BEGIN
    v_token := current_setting('request.headers', true)::json->>'x-kkhm-session';
  EXCEPTION WHEN OTHERS THEN
    v_token := NULL;
  END;
  IF v_token IS NULL OR LENGTH(v_token) < 32 OR LENGTH(v_token) > 128 THEN
    RETURN NULL;
  END IF;

  SELECT s.profile_id INTO v_profile_id
  FROM public.user_sessions s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE s.token_hash = encode(digest(v_token, 'sha256'), 'hex')
    AND s.expires_at > NOW()
    AND p.is_active;
  RETURN v_profile_id;
END;
$$;

ALTER FUNCTION public.current_user_role()  SET search_path = public, pg_temp;
ALTER FUNCTION public.is_admin()           SET search_path = public, pg_temp;
ALTER FUNCTION public.current_student_id() SET search_path = public, pg_temp;
ALTER FUNCTION public.current_mentor_id()  SET search_path = public, pg_temp;
ALTER FUNCTION public.is_assigned_mentor(UUID, UUID) SET search_path = public, pg_temp;

-- ------------------------------------------------------------------------------
-- Login with lockout and generic errors (F2, F3, F4, F1)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.authenticate_user(p_identifier TEXT, p_password TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_token TEXT;
  c_generic CONSTANT TEXT := 'Invalid username/email or password.';
BEGIN
  IF p_identifier IS NULL OR p_password IS NULL
     OR LENGTH(p_identifier) > 200 OR LENGTH(p_password) > 200 THEN
    RAISE EXCEPTION '%', c_generic;
  END IF;

  SELECT * INTO v_profile FROM public.profiles
  WHERE LOWER(username) = LOWER(TRIM(p_identifier))
  LIMIT 1;
  IF v_profile.id IS NULL THEN
    SELECT * INTO v_profile FROM public.profiles
    WHERE LOWER(email) = LOWER(TRIM(p_identifier))
    LIMIT 1;
  END IF;

  IF v_profile.id IS NULL THEN
    PERFORM crypt(p_password, gen_salt('bf', 10));  -- same time cost as a real check
    RAISE EXCEPTION '%', c_generic;
  END IF;

  IF v_profile.locked_until IS NOT NULL AND v_profile.locked_until > NOW() THEN
    RAISE EXCEPTION 'Too many failed attempts. Try again after % minutes.',
      CEIL(EXTRACT(EPOCH FROM (v_profile.locked_until - NOW())) / 60);
  END IF;

  IF v_profile.password_hash <> crypt(p_password, v_profile.password_hash) THEN
    UPDATE public.profiles
    SET failed_login_count = failed_login_count + 1,
        locked_until = CASE WHEN failed_login_count + 1 >= 5
                            THEN NOW() + INTERVAL '15 minutes' ELSE locked_until END
    WHERE id = v_profile.id;
    INSERT INTO public.audit_logs(actor_profile_id, actor_name, actor_role, action, record_type, record_id, details)
    VALUES (v_profile.id, v_profile.full_name, v_profile.role, 'LOGIN_FAILED', 'profile', v_profile.id::text,
            jsonb_build_object('failed_count', v_profile.failed_login_count + 1));
    -- RAISE would roll back the counter, so return an error object instead.
    RETURN jsonb_build_object('error', c_generic);
  END IF;

  IF NOT v_profile.is_active THEN
    RAISE EXCEPTION '%', c_generic;
  END IF;

  UPDATE public.profiles
  SET last_login_at = NOW(), failed_login_count = 0, locked_until = NULL
  WHERE id = v_profile.id;

  DELETE FROM public.user_sessions WHERE expires_at < NOW();

  v_token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO public.user_sessions(profile_id, token_hash, expires_at)
  VALUES (v_profile.id, encode(digest(v_token, 'sha256'), 'hex'), NOW() + INTERVAL '12 hours');

  INSERT INTO public.audit_logs(actor_profile_id, actor_name, actor_role, action, record_type, record_id, details)
  VALUES (v_profile.id, v_profile.full_name, v_profile.role, 'USER_LOGIN', 'profile', v_profile.id::text,
          jsonb_build_object('username', v_profile.username));

  RETURN jsonb_build_object(
    'session_token', v_token,
    'profile', jsonb_build_object(
      'id', v_profile.id,
      'role', v_profile.role,
      'full_name', v_profile.full_name,
      'username', v_profile.username,
      'email', v_profile.email,
      'phone', v_profile.phone,
      'is_active', v_profile.is_active,
      'is_temporary_password', v_profile.must_change_password
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.logout_session()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE v_token TEXT;
BEGIN
  BEGIN
    v_token := current_setting('request.headers', true)::json->>'x-kkhm-session';
  EXCEPTION WHEN OTHERS THEN v_token := NULL; END;
  IF v_token IS NULL THEN RETURN FALSE; END IF;
  DELETE FROM public.user_sessions WHERE token_hash = encode(digest(v_token, 'sha256'), 'hex');
  RETURN TRUE;
END;
$$;

-- Any signed-in user can change their own password (needed for forced first change).
CREATE OR REPLACE FUNCTION public.change_own_password(p_old_password TEXT, p_new_password TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE v_profile public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = public.current_profile_id();
  IF v_profile.id IS NULL THEN RAISE EXCEPTION 'Not signed in.'; END IF;
  IF v_profile.password_hash <> crypt(p_old_password, v_profile.password_hash) THEN
    RAISE EXCEPTION 'Current password is wrong.';
  END IF;
  IF p_new_password IS NULL OR LENGTH(p_new_password) < 8 OR p_new_password = p_old_password THEN
    RAISE EXCEPTION 'New password must be at least 8 characters and different from the old one.';
  END IF;
  UPDATE public.profiles
  SET password_hash = crypt(p_new_password, gen_salt('bf', 10)),
      must_change_password = FALSE, password_changed_at = NOW()
  WHERE id = v_profile.id;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_credentials(
  p_target_profile_id UUID,
  p_new_username TEXT,
  p_new_password TEXT DEFAULT NULL
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_admin public.profiles%ROWTYPE;
  v_pwd TEXT := NULLIF(TRIM(COALESCE(p_new_password, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden: Only administrators can manage login credentials.';
  END IF;
  IF p_new_username IS NULL OR LENGTH(TRIM(p_new_username)) < 3 THEN
    RAISE EXCEPTION 'Username must be at least 3 characters.';
  END IF;
  IF v_pwd IS NOT NULL AND LENGTH(v_pwd) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters.';
  END IF;

  SELECT * INTO v_admin FROM public.profiles WHERE id = public.current_profile_id();

  UPDATE public.profiles
  SET username = TRIM(p_new_username),
      password_hash = CASE WHEN v_pwd IS NOT NULL THEN crypt(v_pwd, gen_salt('bf', 10)) ELSE password_hash END,
      -- admin setting someone else's password -> that person must change it; own change clears the flag
      must_change_password = CASE
        WHEN v_pwd IS NULL THEN must_change_password
        WHEN p_target_profile_id = v_admin.id THEN FALSE
        ELSE TRUE END,
      failed_login_count = CASE WHEN v_pwd IS NOT NULL THEN 0 ELSE failed_login_count END,
      locked_until = CASE WHEN v_pwd IS NOT NULL THEN NULL ELSE locked_until END
  WHERE id = p_target_profile_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'User not found.'; END IF;

  INSERT INTO public.audit_logs(actor_profile_id, actor_name, actor_role, action, record_type, record_id, details)
  VALUES (v_admin.id, v_admin.full_name, v_admin.role, 'CREDENTIALS_UPDATED', 'profile', p_target_profile_id::text,
          jsonb_build_object('username', TRIM(p_new_username), 'password_changed', v_pwd IS NOT NULL));
  RETURN TRUE;
END;
$$;

-- ------------------------------------------------------------------------------
-- F5: report submission ownership + state checks
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_report_unit(p_submission_id UUID)
RETURNS public.report_submissions LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_sub public.report_submissions%ROWTYPE;
  v_year public.academic_years%ROWTYPE;
  v_student_id UUID := public.current_student_id();
  v_is_admin BOOLEAN := public.is_admin();
BEGIN
  IF NOT v_is_admin AND v_student_id IS NULL THEN
    RAISE EXCEPTION 'Forbidden: only the student can submit this report.';
  END IF;

  SELECT * INTO v_sub FROM public.report_submissions WHERE id = p_submission_id FOR UPDATE;
  IF v_sub.id IS NULL THEN RAISE EXCEPTION 'Report submission not found.'; END IF;

  IF NOT v_is_admin AND v_sub.student_id IS DISTINCT FROM v_student_id THEN
    RAISE EXCEPTION 'Forbidden: You can only submit your own reports.';
  END IF;

  IF v_sub.status NOT IN ('not_started', 'draft', 'returned') THEN
    RAISE EXCEPTION 'This report is already % and cannot be submitted again.', v_sub.status;
  END IF;

  SELECT * INTO v_year FROM public.academic_years WHERE id = v_sub.academic_year_id;
  IF v_year.status = 'closed' THEN
    RAISE EXCEPTION 'Cannot submit reports for a closed academic year.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.report_submissions prev
    WHERE prev.student_id = v_sub.student_id
      AND prev.academic_year_id = v_sub.academic_year_id
      AND prev.start_date < v_sub.start_date
      AND prev.status <> 'approved'
  ) THEN
    RAISE EXCEPTION 'Sequential lock active: Previous reporting unit must be fully approved before submitting this unit.';
  END IF;

  UPDATE public.period_activity_entries
  SET approval_status = 'pending'
  WHERE submission_id = p_submission_id AND approval_status = 'returned';

  UPDATE public.report_submissions
  SET status = 'pending_review', submitted_at = NOW()
  WHERE id = p_submission_id
  RETURNING * INTO v_sub;
  RETURN v_sub;
END;
$$;

ALTER FUNCTION public.review_period_entry(UUID, TEXT, TEXT) SET search_path = public, pg_temp;

-- ------------------------------------------------------------------------------
-- F6: fields a student must never set through the API
-- (Trigger only restricts direct API callers; SECURITY DEFINER RPCs run as owner.)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_guard_period_entries()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.report_submissions rs
                 WHERE rs.id = NEW.submission_id AND rs.student_id = NEW.student_id
                   AND rs.academic_year_id = NEW.academic_year_id) THEN
    RAISE EXCEPTION 'Entry does not belong to this report.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.approval_status := 'pending';
    NEW.mentor_comment := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
  ELSE
    IF NEW.student_id <> OLD.student_id OR NEW.academic_year_id <> OLD.academic_year_id
       OR NEW.activity_date <> OLD.activity_date OR NEW.period_number <> OLD.period_number
       OR NEW.planned_activity_snapshot <> OLD.planned_activity_snapshot
       OR NEW.approval_status <> OLD.approval_status
       OR NEW.mentor_comment IS DISTINCT FROM OLD.mentor_comment
       OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at THEN
      RAISE EXCEPTION 'Only the activity text, status and notes can be edited.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_period_entries ON public.period_activity_entries;
CREATE TRIGGER guard_period_entries
  BEFORE INSERT OR UPDATE ON public.period_activity_entries
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_period_entries();

CREATE OR REPLACE FUNCTION public.trg_guard_report_submissions()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'draft';
    NEW.submitted_at := NULL;
    NEW.approved_at := NULL;
    -- mentor is always taken from the real assignment, never from the client
    SELECT ma.mentor_id INTO NEW.mentor_id
    FROM public.mentor_assignments ma
    WHERE ma.student_id = NEW.student_id AND ma.academic_year_id = NEW.academic_year_id AND ma.is_active
    LIMIT 1;
    IF NEW.end_date < NEW.start_date OR NEW.start_date > (NOW() AT TIME ZONE 'Asia/Kolkata')::date THEN
      RAISE EXCEPTION 'Invalid report dates.';
    END IF;
  ELSE
    IF NEW.student_id <> OLD.student_id OR NEW.academic_year_id <> OLD.academic_year_id
       OR NEW.unit_key <> OLD.unit_key OR NEW.start_date <> OLD.start_date OR NEW.end_date <> OLD.end_date
       OR NEW.mentor_id IS DISTINCT FROM OLD.mentor_id OR NEW.status <> OLD.status
       OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
      RAISE EXCEPTION 'Report dates, mentor and status cannot be changed directly.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_report_submissions ON public.report_submissions;
CREATE TRIGGER guard_report_submissions
  BEFORE INSERT OR UPDATE ON public.report_submissions
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_report_submissions();

-- ------------------------------------------------------------------------------
-- F7: audit log actor is always the real signed-in user; rows can't be changed
-- ------------------------------------------------------------------------------
-- NOT security definer on purpose: current_user must stay the API role (anon)
-- so we can tell direct API inserts apart from inserts made inside our own RPCs.
CREATE OR REPLACE FUNCTION public.trg_audit_logs_stamp_actor()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
DECLARE v_id UUID; v_name TEXT; v_role TEXT;
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    SELECT id, full_name, role INTO v_id, v_name, v_role
    FROM public.profiles WHERE id = public.current_profile_id();
    IF v_id IS NULL THEN RAISE EXCEPTION 'Not signed in.'; END IF;
    NEW.actor_profile_id := v_id;
    NEW.actor_name := v_name;
    NEW.actor_role := v_role;
    NEW.created_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS audit_logs_stamp_actor ON public.audit_logs;
CREATE TRIGGER audit_logs_stamp_actor
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_logs_stamp_actor();

REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM anon, authenticated;

-- ------------------------------------------------------------------------------
-- F8: password hash and lock fields are invisible to the API
-- ------------------------------------------------------------------------------
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, auth_user_id, role, full_name, username, email, phone, is_active,
              last_login_at, created_at, updated_at, must_change_password)
  ON public.profiles TO anon, authenticated;
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (full_name, email, phone, is_active, role, username) ON public.profiles TO anon, authenticated;
-- INSERT stays (admin-only by RLS); the trigger above hashes the password.

REVOKE ALL ON public.user_sessions FROM anon, authenticated;

-- ------------------------------------------------------------------------------
-- F10: only the functions the app actually calls are callable from the API
-- ------------------------------------------------------------------------------
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.authenticate_user(TEXT, TEXT),
  public.logout_session(),
  public.change_own_password(TEXT, TEXT),
  public.admin_update_credentials(UUID, TEXT, TEXT),
  public.submit_report_unit(UUID),
  public.review_period_entry(UUID, TEXT, TEXT),
  -- used inside RLS policies, so the calling role needs them:
  public.current_profile_id(),
  public.current_user_role(),
  public.is_admin(),
  public.current_student_id(),
  public.current_mentor_id(),
  public.is_assigned_mentor(UUID, UUID)
TO anon, authenticated;

-- Trigger functions need no API grant. set_updated_at is a trigger too.

-- ------------------------------------------------------------------------------
-- Admin check list: accounts still on a published default password
--   SELECT username, role FROM public.profiles WHERE must_change_password ORDER BY role, username;
-- ==============================================================================


-- ==============================================================================
-- KKHM Off-Course AMS — Migration 007
-- CIC Off-Course rules, proposals, Thamheediyya pool, admin-visible passwords
-- Run AFTER 006_security_hardening.sql. Safe to run more than once.
--
-- Rules enforced by the database (not only by the screen):
--  * Thamheediyya : only Urdu may be opted out; the replacement must come from the
--                   Thamheediyya Off-Course Pool, offered for that semester;
--                   the same pool part can never be taken twice (covers the
--                   "Soft Skills / Event Management studied in sem 1-2 cannot be
--                   chosen again in sem 3-4" note).
--  * Aliya        : any number of ELECTIVE subjects may be opted out until the
--                   total opted-out credit reaches 3.
--  * PG           : same, up to 6 credits.
--  * A subject (by code) can be opted out only once per student; Urdu is exempt.
--  * Off Course proposals only for Aliya / PG; group proposals max 6 students;
--    a student cannot submit the same topic again after it was approved.
--  * Passwords of students and mentors are kept ENCRYPTED in a private table so
--    the administrator can see the current password; every view is audit-logged.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------------------------
-- 1. Institution profile (each college runs its own copy of the app + database)
-- ------------------------------------------------------------------------------
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS institution_short_name TEXT,
  ADD COLUMN IF NOT EXISTS institution_address    TEXT,
  ADD COLUMN IF NOT EXISTS cic_college_code       TEXT;

-- ------------------------------------------------------------------------------
-- 2. Course chart: every syllabus subject with stage, semester, type and credit
-- ------------------------------------------------------------------------------
ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS academic_stage TEXT,
  ADD COLUMN IF NOT EXISTS semester_no    INTEGER,
  ADD COLUMN IF NOT EXISTS course_type    TEXT NOT NULL DEFAULT 'core',
  ADD COLUMN IF NOT EXISTS is_urdu        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS credit         NUMERIC(4,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scheme         TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_subjects_course_type') THEN
    ALTER TABLE public.subjects ADD CONSTRAINT chk_subjects_course_type
      CHECK (course_type IN ('core', 'elective', 'interdisciplinary', 'off_course'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_subjects_stage') THEN
    ALTER TABLE public.subjects ADD CONSTRAINT chk_subjects_stage
      CHECK (academic_stage IS NULL OR academic_stage IN ('thamheediyya', 'aliya', 'pg'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_subjects_credit') THEN
    ALTER TABLE public.subjects ADD CONSTRAINT chk_subjects_credit CHECK (credit >= 0 AND credit <= 20);
  END IF;
END $$;

-- Student's current position in the 8-year / 16-semester programme
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS academic_stage TEXT,
  ADD COLUMN IF NOT EXISTS stage_semester_no INTEGER,
  ADD COLUMN IF NOT EXISTS scheme TEXT;

CREATE OR REPLACE FUNCTION public.stage_max_semester(p_stage TEXT)
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_stage WHEN 'thamheediyya' THEN 4 WHEN 'aliya' THEN 8 WHEN 'pg' THEN 4 END;
$$;

CREATE OR REPLACE FUNCTION public.stage_credit_cap(p_stage TEXT)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_stage WHEN 'aliya' THEN 3 WHEN 'pg' THEN 6 ELSE NULL END;
$$;

-- ------------------------------------------------------------------------------
-- 3. Thamheediyya Off-Course Pool (CIC Board of Studies, 2026)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.offcourse_pool_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_year TEXT NOT NULL DEFAULT '2026',
  course_name TEXT NOT NULL,
  topic TEXT NOT NULL,                       -- must be written exactly like this on CIC forms
  semester_nos INTEGER[] NOT NULL,           -- Thamheediyya semesters where this part is offered
  exam_mode TEXT,
  mark TEXT,
  exam_language TEXT,
  note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pool_year, topic)
);

INSERT INTO public.offcourse_pool_items (course_name, topic, semester_nos, exam_mode, mark, exam_language, note) VALUES
 ('Basics of Spanish Language and Culture', 'BASICS OF SPANISH LANGUAGE AND CULTURE [BLOCK-1]', '{1}', 'Written', '50', 'Spanish', 'IGNOU SWAYAM BL-001'),
 ('Basics of Spanish Language and Culture', 'BASICS OF SPANISH LANGUAGE AND CULTURE [BLOCK-2]', '{2}', 'Written', '50', 'Spanish', 'IGNOU SWAYAM BL-001'),
 ('Basics of Spanish Language and Culture', 'BASICS OF SPANISH LANGUAGE AND CULTURE [BLOCK-3]', '{3}', 'Written', '50', 'Spanish', 'IGNOU SWAYAM BL-001'),
 ('Basics of Spanish Language and Culture', 'BASICS OF SPANISH LANGUAGE AND CULTURE [BLOCK-4]', '{4}', 'Written', '50', 'Spanish', 'IGNOU SWAYAM BL-001'),
 ('English in Daily Life', 'ENGLISH IN DAILY LIFE [BLOCK-1]', '{1}', 'Written', '50', 'English', 'IGNOU SWAYAM BEGLA-135'),
 ('English in Daily Life', 'ENGLISH IN DAILY LIFE [BLOCK-2]', '{2}', 'Written', '50', 'English', 'IGNOU SWAYAM BEGLA-135'),
 ('English in Daily Life', 'ENGLISH IN DAILY LIFE [BLOCK-3]', '{3}', 'Written', '50', 'English', 'IGNOU SWAYAM BEGLA-135'),
 ('English in Daily Life', 'ENGLISH IN DAILY LIFE [BLOCK-4]', '{4}', 'Written', '50', 'English', 'IGNOU SWAYAM BEGLA-135'),
 ('Basics of Event Management', 'BASICS OF EVENT MANAGEMENT [PART-1]', '{1,3}', 'Written', '50', 'Any Language', 'IGNOU SWAYAM BHC-011'),
 ('Basics of Event Management', 'BASICS OF EVENT MANAGEMENT [PART-2]', '{2,4}', 'Written', '50', 'Any Language', 'IGNOU SWAYAM BHC-011'),
 ('Soft Skills', 'SOFT SKILLS [BLOCK-1,2]', '{1,3}', 'Written', '50', 'Any Language', 'IGNOU SWAYAM BHC-001'),
 ('Soft Skills', 'SOFT SKILLS [BLOCK-2,4]', '{2,4}', 'Written', '50', 'Any Language', 'IGNOU SWAYAM BHC-001'),
 ('Principles of Qur''anic Recitation (Tajveed)', 'PRINCIPLES OF QUR''ANIC RECITATION [TAJVEED]', '{1}', 'Written & Oral', 'Written 40, Oral 10', 'Any Language', NULL),
 ('Japanese Language', 'JAPANESE LANGUAGE [PART-1]', '{1}', 'Written/Practical/Viva Voce', '50', 'Japanese', 'Minna no Nihongo L1-13'),
 ('Japanese Language', 'JAPANESE LANGUAGE [PART-2]', '{2}', 'Written/Practical/Viva Voce', '50', 'Japanese', 'Minna no Nihongo L14-25'),
 ('Japanese Language', 'JAPANESE LANGUAGE [PART-3]', '{3}', 'Written/Practical/Viva Voce', '50', 'Japanese', 'Minna no Nihongo II L26-37'),
 ('Japanese Language', 'JAPANESE LANGUAGE [PART-4]', '{4}', 'Written/Practical/Viva Voce', '50', 'Japanese', 'Minna no Nihongo II L38-50')
ON CONFLICT (pool_year, topic) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 4. CIC proposal models (PRPS codes from the Proposal Manual)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.offcourse_proposal_models (
  code TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  exam_mode TEXT,
  mark TEXT,
  max_credit NUMERIC(4,2),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO public.offcourse_proposal_models (code, title, exam_mode, mark, max_credit) VALUES
 ('PRPS1',  'Advanced Level Web Design Front End Study', 'Practical', '100', 2),
 ('PRPS2',  'Advanced Animation Study', 'Practical', '100', 2),
 ('PRPS3',  'Advanced Graphic Design Study', 'Practical', '100', 2),
 ('PRPS4',  'Advanced MS Excel Study', 'Practical', '100', 2),
 ('PRPS5',  'Advanced MS Office Study', 'Practical', '100', 2),
 ('PRPS6',  'Advanced Study in Microsoft Word', 'Practical', '100', 1.5),
 ('PRPS7',  'Speech Designing', 'As per the manual', '100', 2),
 ('PRPS8',  'Video Editing Study', 'Practical', '100', 2),
 ('PRPS9',  'Thajweed', 'As per the manual', '50+50', 1.5),
 ('PRPS10', 'Modern Ideologies & Islamic Worldview (By SEM)', 'Written', '100', 3),
 ('PRPS11', 'Pedagogy Of Language Teaching and Moral Studies Education (SEM)', 'Written & Practical', '50+50', 3),
 ('PRPS12', 'Certificate Programme in Counselling Psychology (by SEM)', 'Written & Practical', '50+50', 3),
 ('PRPS13', 'Indian Polity Laxmikant Part 1-2', 'Written', '100', 2.5),
 ('PRPS14', 'Indian Polity Laxmikant Part 3-4', 'Written', '100', 2.5),
 ('PRPS15', 'Indian Polity Laxmikant Part 5-8', 'Written', '100', 2.5),
 ('PRPS16', 'AI Integrated Pedagogy', 'Viva & Practical', '100', 3)
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 5. Off Course proposals (individual / group) and their CIC decision
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.offcourse_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  proposal_type TEXT NOT NULL DEFAULT 'individual' CHECK (proposal_type IN ('individual', 'group')),
  academic_stage TEXT NOT NULL CHECK (academic_stage IN ('aliya', 'pg')),
  semester_period TEXT CHECK (semester_period IN ('Nov', 'May')),
  topic TEXT NOT NULL CHECK (LENGTH(TRIM(topic)) >= 3),
  model_code TEXT REFERENCES public.offcourse_proposal_models(code),
  proposed_credit NUMERIC(4,2) NOT NULL CHECK (proposed_credit > 0 AND proposed_credit <= 6),
  guide_mentor_id UUID REFERENCES public.mentors(id) ON DELETE SET NULL,
  guide_name TEXT,
  guide_phone TEXT,
  guide_email TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'principal_approved', 'submitted_to_cic',
    'approved', 'approved_with_changes', 'approved_conditional',
    'rewrite', 'rejected', 'withdrawn')),
  principal_approved_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  cic_decided_at TIMESTAMPTZ,
  approved_credit NUMERIC(4,2),
  exam_language TEXT,
  exam_modes TEXT[] NOT NULL DEFAULT '{}',
  application_no TEXT,
  remarks TEXT,
  work_submission_due DATE,                 -- 15 days before the written exam
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_proposal_exam_modes CHECK (exam_modes <@ ARRAY[
    'Written','Practical','Project Submission','Viva','Field Work','Certificate Submission',
    'Report Submission','Study Note Submission','Assignment','Translation','Seminar','Book Submission']::TEXT[])
);

CREATE TABLE IF NOT EXISTS public.offcourse_proposal_members (
  proposal_id UUID NOT NULL REFERENCES public.offcourse_proposals(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  is_leader BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (proposal_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_proposal_members_student ON public.offcourse_proposal_members(student_id);

CREATE OR REPLACE FUNCTION public.proposal_is_approved(p_status TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT p_status IN ('approved', 'approved_with_changes', 'approved_conditional');
$$;

CREATE OR REPLACE FUNCTION public.trg_proposal_rules()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.updated_at := NOW();
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    -- allowed moves of the CIC workflow
    IF NOT (
         (OLD.status = 'draft'              AND NEW.status IN ('principal_approved', 'withdrawn'))
      OR (OLD.status = 'principal_approved' AND NEW.status IN ('submitted_to_cic', 'draft', 'withdrawn'))
      OR (OLD.status = 'submitted_to_cic'   AND NEW.status IN ('approved', 'approved_with_changes',
                                                               'approved_conditional', 'rewrite', 'rejected'))
      OR (OLD.status = 'rewrite'            AND NEW.status IN ('draft', 'withdrawn'))
      OR (public.proposal_is_approved(OLD.status) AND public.proposal_is_approved(NEW.status))
    ) THEN
      RAISE EXCEPTION 'Proposal status cannot move from % to %.', OLD.status, NEW.status;
    END IF;
    IF NEW.status = 'principal_approved' THEN NEW.principal_approved_at := NOW(); END IF;
    IF NEW.status = 'submitted_to_cic'   THEN NEW.submitted_at := NOW(); END IF;
    IF NEW.status IN ('approved', 'approved_with_changes', 'approved_conditional', 'rewrite', 'rejected') THEN
      NEW.cic_decided_at := COALESCE(NEW.cic_decided_at, NOW());
    END IF;
  END IF;
  IF public.proposal_is_approved(NEW.status) AND (NEW.approved_credit IS NULL OR NEW.approved_credit <= 0) THEN
    RAISE EXCEPTION 'Enter the credit approved by CIC.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS proposal_rules ON public.offcourse_proposals;
CREATE TRIGGER proposal_rules BEFORE INSERT OR UPDATE ON public.offcourse_proposals
  FOR EACH ROW EXECUTE FUNCTION public.trg_proposal_rules();

CREATE OR REPLACE FUNCTION public.trg_proposal_member_rules()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_prop public.offcourse_proposals%ROWTYPE;
  v_count INTEGER;
  v_stage TEXT;
BEGIN
  SELECT * INTO v_prop FROM public.offcourse_proposals WHERE id = NEW.proposal_id;
  SELECT COUNT(*) INTO v_count FROM public.offcourse_proposal_members
  WHERE proposal_id = NEW.proposal_id AND student_id <> NEW.student_id;
  IF v_prop.proposal_type = 'individual' AND v_count >= 1 THEN
    RAISE EXCEPTION 'An individual proposal has only one student. Use a group proposal.';
  END IF;
  IF v_prop.proposal_type = 'group' AND v_count >= 6 THEN
    RAISE EXCEPTION 'A group proposal can have at most 6 students.';
  END IF;
  SELECT academic_stage INTO v_stage FROM public.students WHERE id = NEW.student_id;
  IF v_stage IS NOT NULL AND v_stage <> v_prop.academic_stage THEN
    RAISE EXCEPTION 'Only % students can be added to this proposal.', v_prop.academic_stage;
  END IF;
  IF v_stage = 'thamheediyya' THEN
    RAISE EXCEPTION 'Thamheediyya students do not submit proposals; they choose from the Off-Course Pool.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.offcourse_proposal_members m
    JOIN public.offcourse_proposals p ON p.id = m.proposal_id
    WHERE m.student_id = NEW.student_id AND p.id <> NEW.proposal_id
      AND public.proposal_is_approved(p.status)
      AND LOWER(TRIM(p.topic)) = LOWER(TRIM(v_prop.topic))
  ) THEN
    RAISE EXCEPTION 'This student already has an approved proposal with the same topic.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS proposal_member_rules ON public.offcourse_proposal_members;
CREATE TRIGGER proposal_member_rules BEFORE INSERT OR UPDATE ON public.offcourse_proposal_members
  FOR EACH ROW EXECUTE FUNCTION public.trg_proposal_member_rules();

-- ------------------------------------------------------------------------------
-- 6. Student opt-out / replacement records (one row per opted-out subject)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_offcourse_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  academic_stage TEXT NOT NULL CHECK (academic_stage IN ('thamheediyya', 'aliya', 'pg')),
  semester_no INTEGER NOT NULL CHECK (semester_no BETWEEN 1 AND 8),
  semester_period TEXT CHECK (semester_period IN ('Nov', 'May')),
  opted_out_subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
  opted_out_credit NUMERIC(4,2) NOT NULL DEFAULT 0,
  replacement_type TEXT NOT NULL CHECK (replacement_type IN ('pool', 'off_course', 'interdisciplinary')),
  pool_item_id UUID REFERENCES public.offcourse_pool_items(id) ON DELETE RESTRICT,
  proposal_id UUID REFERENCES public.offcourse_proposals(id) ON DELETE SET NULL,
  interdisciplinary_subject_id UUID REFERENCES public.subjects(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_selection_replacement CHECK (
       (replacement_type = 'pool'              AND pool_item_id IS NOT NULL)
    OR (replacement_type = 'off_course'        AND proposal_id IS NOT NULL)
    OR (replacement_type = 'interdisciplinary' AND interdisciplinary_subject_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_offcourse_sel_student ON public.student_offcourse_selections(student_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_offcourse_sel_subject
  ON public.student_offcourse_selections(student_id, opted_out_subject_id) WHERE status <> 'cancelled';
CREATE UNIQUE INDEX IF NOT EXISTS uq_offcourse_sel_pool_part
  ON public.student_offcourse_selections(student_id, pool_item_id) WHERE status <> 'cancelled' AND pool_item_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.trg_offcourse_selection_rules()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_sub public.subjects%ROWTYPE;
  v_pool public.offcourse_pool_items%ROWTYPE;
  v_prop public.offcourse_proposals%ROWTYPE;
  v_used NUMERIC;
  v_cap NUMERIC;
BEGIN
  NEW.updated_at := NOW();
  IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;

  IF NEW.semester_no > public.stage_max_semester(NEW.academic_stage) THEN
    RAISE EXCEPTION '% has only % semesters.', NEW.academic_stage, public.stage_max_semester(NEW.academic_stage);
  END IF;

  SELECT * INTO v_sub FROM public.subjects WHERE id = NEW.opted_out_subject_id;
  NEW.opted_out_credit := v_sub.credit;

  IF v_sub.academic_stage IS NOT NULL AND v_sub.academic_stage <> NEW.academic_stage THEN
    RAISE EXCEPTION 'Subject "%" is not a % subject.', v_sub.name, NEW.academic_stage;
  END IF;
  IF v_sub.semester_no IS NOT NULL AND v_sub.semester_no <> NEW.semester_no THEN
    RAISE EXCEPTION 'Subject "%" belongs to semester %, not %.', v_sub.name, v_sub.semester_no, NEW.semester_no;
  END IF;

  -- a subject (by code) can be opted out only once; Urdu is the exception
  IF NOT v_sub.is_urdu AND EXISTS (
    SELECT 1 FROM public.student_offcourse_selections s
    JOIN public.subjects x ON x.id = s.opted_out_subject_id
    WHERE s.student_id = NEW.student_id AND s.status <> 'cancelled' AND s.id <> NEW.id
      AND LOWER(TRIM(x.code)) = LOWER(TRIM(v_sub.code))
  ) THEN
    RAISE EXCEPTION 'Subject "%" was already opted out once. After that it is treated as a core course.', v_sub.name;
  END IF;

  IF NEW.academic_stage = 'thamheediyya' THEN
    IF NOT v_sub.is_urdu THEN
      RAISE EXCEPTION 'Thamheediyya students can opt out only Urdu.';
    END IF;
    IF NEW.replacement_type <> 'pool' THEN
      RAISE EXCEPTION 'Thamheediyya students must choose the replacement from the Off-Course Pool.';
    END IF;
    SELECT * INTO v_pool FROM public.offcourse_pool_items WHERE id = NEW.pool_item_id;
    IF NOT v_pool.is_active THEN
      RAISE EXCEPTION 'This pool subject is no longer offered.';
    END IF;
    IF NOT (NEW.semester_no = ANY (v_pool.semester_nos)) THEN
      -- the pool allows another semester only when needed; admin must write the reason in notes
      IF COALESCE(TRIM(NEW.notes), '') = '' THEN
        RAISE EXCEPTION '"%" is meant for semester %. To take it in semester %, write the reason in Notes.',
          v_pool.topic, array_to_string(v_pool.semester_nos, '/'), NEW.semester_no;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Aliya / PG
  IF NEW.replacement_type = 'pool' THEN
    RAISE EXCEPTION 'The Off-Course Pool is only for Thamheediyya. Use an Off Course proposal or an interdisciplinary subject.';
  END IF;
  IF v_sub.course_type <> 'elective' THEN
    RAISE EXCEPTION 'Only elective courses can be opted out ("%" is %).', v_sub.name, v_sub.course_type;
  END IF;
  IF v_sub.credit <= 0 THEN
    RAISE EXCEPTION 'Set the credit of "%" in the course chart first.', v_sub.name;
  END IF;

  v_cap := public.stage_credit_cap(NEW.academic_stage);
  SELECT COALESCE(SUM(opted_out_credit), 0) INTO v_used
  FROM public.student_offcourse_selections
  WHERE student_id = NEW.student_id AND academic_stage = NEW.academic_stage
    AND status <> 'cancelled' AND id <> NEW.id;
  IF v_used + NEW.opted_out_credit > v_cap THEN
    RAISE EXCEPTION 'Credit limit: % students may opt out at most % credits. Already used %, this subject has %.',
      NEW.academic_stage, v_cap, v_used, NEW.opted_out_credit;
  END IF;

  IF NEW.replacement_type = 'off_course' THEN
    SELECT * INTO v_prop FROM public.offcourse_proposals WHERE id = NEW.proposal_id;
    IF v_prop.academic_stage <> NEW.academic_stage THEN
      RAISE EXCEPTION 'The proposal is for %, not %.', v_prop.academic_stage, NEW.academic_stage;
    END IF;
    IF v_prop.status IN ('rejected', 'withdrawn') THEN
      RAISE EXCEPTION 'A rejected or withdrawn proposal cannot be used.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.offcourse_proposal_members
                   WHERE proposal_id = NEW.proposal_id AND student_id = NEW.student_id) THEN
      RAISE EXCEPTION 'The student is not a member of this proposal.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS offcourse_selection_rules ON public.student_offcourse_selections;
CREATE TRIGGER offcourse_selection_rules BEFORE INSERT OR UPDATE ON public.student_offcourse_selections
  FOR EACH ROW EXECUTE FUNCTION public.trg_offcourse_selection_rules();

-- ------------------------------------------------------------------------------
-- 7. RLS for the new tables
-- ------------------------------------------------------------------------------
ALTER TABLE public.offcourse_pool_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offcourse_proposal_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offcourse_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offcourse_proposal_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_offcourse_selections ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies
           WHERE schemaname = 'public' AND tablename IN
             ('offcourse_pool_items', 'offcourse_proposal_models', 'offcourse_proposals',
              'offcourse_proposal_members', 'student_offcourse_selections')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

CREATE POLICY "Admin manage pool" ON public.offcourse_pool_items FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Signed-in read pool" ON public.offcourse_pool_items FOR SELECT USING (public.current_profile_id() IS NOT NULL);
CREATE POLICY "Admin manage models" ON public.offcourse_proposal_models FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Signed-in read models" ON public.offcourse_proposal_models FOR SELECT USING (public.current_profile_id() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.is_proposal_member(p_proposal_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.offcourse_proposal_members
                 WHERE proposal_id = p_proposal_id AND student_id = public.current_student_id());
$$;
CREATE OR REPLACE FUNCTION public.is_proposal_visible_to_mentor(p_proposal_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.offcourse_proposals p
    WHERE p.id = p_proposal_id AND public.current_mentor_id() IS NOT NULL
      AND (p.guide_mentor_id = public.current_mentor_id()
           OR EXISTS (SELECT 1 FROM public.offcourse_proposal_members m
                      JOIN public.mentor_assignments ma ON ma.student_id = m.student_id AND ma.is_active
                      WHERE m.proposal_id = p.id AND ma.mentor_id = public.current_mentor_id())));
$$;

CREATE POLICY "Admin manage proposals" ON public.offcourse_proposals FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Member read proposals" ON public.offcourse_proposals FOR SELECT USING (public.is_proposal_member(id));
CREATE POLICY "Mentor read proposals" ON public.offcourse_proposals FOR SELECT USING (public.is_proposal_visible_to_mentor(id));

CREATE POLICY "Admin manage proposal members" ON public.offcourse_proposal_members FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Member read proposal members" ON public.offcourse_proposal_members FOR SELECT USING (public.is_proposal_member(proposal_id));
CREATE POLICY "Mentor read proposal members" ON public.offcourse_proposal_members FOR SELECT USING (public.is_proposal_visible_to_mentor(proposal_id));

CREATE POLICY "Admin manage selections" ON public.student_offcourse_selections FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Student read own selections" ON public.student_offcourse_selections FOR SELECT USING (student_id = public.current_student_id());
CREATE POLICY "Mentor read assigned selections" ON public.student_offcourse_selections FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.mentor_assignments ma
          WHERE ma.student_id = student_offcourse_selections.student_id
            AND ma.mentor_id = public.current_mentor_id() AND ma.is_active));

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.offcourse_pool_items, public.offcourse_proposal_models, public.offcourse_proposals,
  public.offcourse_proposal_members, public.student_offcourse_selections
TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 8. Password vault: admin can see the current password of students and mentors
--    Encrypted with a random key that lives in a schema the API cannot reach.
-- ------------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.app_secret (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  vault_key TEXT NOT NULL
);
INSERT INTO private.app_secret (id, vault_key)
VALUES (1, encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS private.password_vault (
  profile_id UUID PRIMARY KEY,
  enc BYTEA NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
REVOKE ALL ON ALL TABLES IN SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.vault_store(p_profile_id UUID, p_plain TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public, extensions, pg_temp AS $$
BEGIN
  INSERT INTO private.password_vault (profile_id, enc, updated_at)
  VALUES (p_profile_id, pgp_sym_encrypt(p_plain, (SELECT vault_key FROM private.app_secret WHERE id = 1)), NOW())
  ON CONFLICT (profile_id) DO UPDATE SET enc = EXCLUDED.enc, updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION private.vault_read(p_profile_id UUID)
RETURNS TEXT LANGUAGE sql SECURITY DEFINER SET search_path = private, public, extensions, pg_temp AS $$
  SELECT pgp_sym_decrypt(v.enc, (SELECT vault_key FROM private.app_secret WHERE id = 1))
  FROM private.password_vault v WHERE v.profile_id = p_profile_id;
$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;

-- the hashing trigger now also keeps the vault copy for non-admin users
CREATE OR REPLACE FUNCTION public.trg_profiles_hash_password()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
BEGIN
  IF NEW.password_hash IS NOT NULL AND NEW.password_hash NOT LIKE '$2%' THEN
    IF LENGTH(NEW.password_hash) < 8 THEN
      RAISE EXCEPTION 'Password must be at least 8 characters.';
    END IF;
    IF NEW.role <> 'admin' THEN
      PERFORM private.vault_store(NEW.id, NEW.password_hash);
    END IF;
    NEW.password_hash := crypt(NEW.password_hash, gen_salt('bf', 10));
    NEW.password_changed_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_profiles_vault_cleanup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  DELETE FROM private.password_vault WHERE profile_id = OLD.id;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS profiles_vault_cleanup ON public.profiles;
CREATE TRIGGER profiles_vault_cleanup AFTER DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_profiles_vault_cleanup();

-- credentials RPCs: same as 006 + vault copy
CREATE OR REPLACE FUNCTION public.admin_update_credentials(
  p_target_profile_id UUID,
  p_new_username TEXT,
  p_new_password TEXT DEFAULT NULL
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_admin public.profiles%ROWTYPE;
  v_role TEXT;
  v_pwd TEXT := NULLIF(TRIM(COALESCE(p_new_password, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden: Only administrators can manage login credentials.';
  END IF;
  IF p_new_username IS NULL OR LENGTH(TRIM(p_new_username)) < 3 THEN
    RAISE EXCEPTION 'Username must be at least 3 characters.';
  END IF;
  IF v_pwd IS NOT NULL AND LENGTH(v_pwd) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters.';
  END IF;

  SELECT * INTO v_admin FROM public.profiles WHERE id = public.current_profile_id();
  SELECT role INTO v_role FROM public.profiles WHERE id = p_target_profile_id;
  IF v_role IS NULL THEN RAISE EXCEPTION 'User not found.'; END IF;

  UPDATE public.profiles
  SET username = TRIM(p_new_username),
      password_hash = CASE WHEN v_pwd IS NOT NULL THEN crypt(v_pwd, gen_salt('bf', 10)) ELSE password_hash END,
      -- admin accounts must replace a password someone else set; others: admin keeps a copy
      must_change_password = CASE
        WHEN v_pwd IS NULL THEN must_change_password
        WHEN v_role = 'admin' AND p_target_profile_id <> v_admin.id THEN TRUE
        ELSE FALSE END,
      failed_login_count = CASE WHEN v_pwd IS NOT NULL THEN 0 ELSE failed_login_count END,
      locked_until = CASE WHEN v_pwd IS NOT NULL THEN NULL ELSE locked_until END
  WHERE id = p_target_profile_id;

  IF v_pwd IS NOT NULL AND v_role <> 'admin' THEN
    PERFORM private.vault_store(p_target_profile_id, v_pwd);
  END IF;

  INSERT INTO public.audit_logs(actor_profile_id, actor_name, actor_role, action, record_type, record_id, details)
  VALUES (v_admin.id, v_admin.full_name, v_admin.role, 'CREDENTIALS_UPDATED', 'profile', p_target_profile_id::text,
          jsonb_build_object('username', TRIM(p_new_username), 'password_changed', v_pwd IS NOT NULL));
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.change_own_password(p_old_password TEXT, p_new_password TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE v_profile public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = public.current_profile_id();
  IF v_profile.id IS NULL THEN RAISE EXCEPTION 'Not signed in.'; END IF;
  IF v_profile.password_hash <> crypt(p_old_password, v_profile.password_hash) THEN
    RAISE EXCEPTION 'Current password is wrong.';
  END IF;
  IF p_new_password IS NULL OR LENGTH(p_new_password) < 8 OR p_new_password = p_old_password THEN
    RAISE EXCEPTION 'New password must be at least 8 characters and different from the old one.';
  END IF;
  UPDATE public.profiles
  SET password_hash = crypt(p_new_password, gen_salt('bf', 10)),
      must_change_password = FALSE, password_changed_at = NOW()
  WHERE id = v_profile.id;
  IF v_profile.role <> 'admin' THEN
    PERFORM private.vault_store(v_profile.id, p_new_password);
  END IF;
  RETURN TRUE;
END;
$$;

-- Admin: see one user's current password (logged)
CREATE OR REPLACE FUNCTION public.admin_view_password(p_profile_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_admin public.profiles%ROWTYPE; v_pwd TEXT; v_target public.profiles%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Forbidden: administrators only.'; END IF;
  SELECT * INTO v_admin FROM public.profiles WHERE id = public.current_profile_id();
  SELECT * INTO v_target FROM public.profiles WHERE id = p_profile_id;
  IF v_target.id IS NULL THEN RAISE EXCEPTION 'User not found.'; END IF;
  IF v_target.role = 'admin' THEN RAISE EXCEPTION 'Administrator passwords are never shown.'; END IF;
  v_pwd := private.vault_read(p_profile_id);
  INSERT INTO public.audit_logs(actor_profile_id, actor_name, actor_role, action, record_type, record_id, details)
  VALUES (v_admin.id, v_admin.full_name, v_admin.role, 'PASSWORD_VIEWED', 'profile', p_profile_id::text,
          jsonb_build_object('username', v_target.username, 'available', v_pwd IS NOT NULL));
  RETURN v_pwd;   -- NULL = set before this feature existed; reset it to see it
END;
$$;

-- Admin: list current passwords of many users at once (for printing slips; logged)
CREATE OR REPLACE FUNCTION public.admin_list_passwords(p_profile_ids UUID[])
RETURNS TABLE (profile_id UUID, username TEXT, full_name TEXT, password TEXT, uses_default BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_admin public.profiles%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Forbidden: administrators only.'; END IF;
  SELECT * INTO v_admin FROM public.profiles WHERE id = public.current_profile_id();
  INSERT INTO public.audit_logs(actor_profile_id, actor_name, actor_role, action, record_type, record_id, details)
  VALUES (v_admin.id, v_admin.full_name, v_admin.role, 'PASSWORDS_LISTED', 'profile', NULL,
          jsonb_build_object('count', COALESCE(array_length(p_profile_ids, 1), 0)));
  RETURN QUERY
  SELECT p.id, p.username, p.full_name, private.vault_read(p.id), p.must_change_password
  FROM public.profiles p
  WHERE p.id = ANY (p_profile_ids) AND p.role <> 'admin'
  ORDER BY p.full_name;
END;
$$;

-- Admin: give each selected user a new random password (readable, 8 chars) and return them
CREATE OR REPLACE FUNCTION public.admin_reset_passwords(p_profile_ids UUID[])
RETURNS TABLE (profile_id UUID, username TEXT, full_name TEXT, password TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_admin public.profiles%ROWTYPE;
  v_id UUID;
  v_pwd TEXT;
  c_letters CONSTANT TEXT := 'abcdefghjkmnpqrstuvwxyz';
  c_digits  CONSTANT TEXT := '23456789';
  i INTEGER;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Forbidden: administrators only.'; END IF;
  SELECT * INTO v_admin FROM public.profiles WHERE id = public.current_profile_id();
  FOREACH v_id IN ARRAY p_profile_ids LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_id AND role <> 'admin');
    v_pwd := upper(substr(c_letters, 1 + (get_byte(gen_random_bytes(1), 0) % 23), 1));
    FOR i IN 1..3 LOOP
      v_pwd := v_pwd || substr(c_letters, 1 + (get_byte(gen_random_bytes(1), 0) % 23), 1);
    END LOOP;
    FOR i IN 1..4 LOOP
      v_pwd := v_pwd || substr(c_digits, 1 + (get_byte(gen_random_bytes(1), 0) % 8), 1);
    END LOOP;
    UPDATE public.profiles
    SET password_hash = crypt(v_pwd, gen_salt('bf', 10)), must_change_password = FALSE,
        failed_login_count = 0, locked_until = NULL, password_changed_at = NOW()
    WHERE id = v_id;
    PERFORM private.vault_store(v_id, v_pwd);
  END LOOP;
  INSERT INTO public.audit_logs(actor_profile_id, actor_name, actor_role, action, record_type, record_id, details)
  VALUES (v_admin.id, v_admin.full_name, v_admin.role, 'PASSWORDS_RESET', 'profile', NULL,
          jsonb_build_object('count', COALESCE(array_length(p_profile_ids, 1), 0)));
  RETURN QUERY
  SELECT p.id, p.username, p.full_name, private.vault_read(p.id)
  FROM public.profiles p WHERE p.id = ANY (p_profile_ids) AND p.role <> 'admin'
  ORDER BY p.full_name;
END;
$$;

-- ------------------------------------------------------------------------------
-- 9. Function grants (006 revoked everything; grant what the app calls)
-- ------------------------------------------------------------------------------
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.authenticate_user(TEXT, TEXT),
  public.logout_session(),
  public.change_own_password(TEXT, TEXT),
  public.admin_update_credentials(UUID, TEXT, TEXT),
  public.admin_view_password(UUID),
  public.admin_list_passwords(UUID[]),
  public.admin_reset_passwords(UUID[]),
  public.submit_report_unit(UUID),
  public.review_period_entry(UUID, TEXT, TEXT),
  public.current_profile_id(),
  public.current_user_role(),
  public.is_admin(),
  public.current_student_id(),
  public.current_mentor_id(),
  public.is_assigned_mentor(UUID, UUID),
  public.is_proposal_member(UUID),
  public.is_proposal_visible_to_mentor(UUID),
  public.stage_max_semester(TEXT),
  public.stage_credit_cap(TEXT),
  public.proposal_is_approved(TEXT)
TO anon, authenticated;
