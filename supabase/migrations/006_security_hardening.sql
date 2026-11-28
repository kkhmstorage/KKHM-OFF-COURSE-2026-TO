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
