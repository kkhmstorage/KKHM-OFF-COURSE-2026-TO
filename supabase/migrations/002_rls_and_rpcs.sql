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
