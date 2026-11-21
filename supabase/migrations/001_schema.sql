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
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('upcoming', 'active', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (academic_year_id, name),
  CONSTRAINT chk_semester_dates CHECK (end_date > start_date)
);

-- 10. subjects
CREATE TABLE IF NOT EXISTS public.subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
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
  name TEXT NOT NULL,
  description TEXT,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  revision INTEGER NOT NULL DEFAULT 1,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (academic_year_id, name)
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (template_id, day_of_week, period_number)
);

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
