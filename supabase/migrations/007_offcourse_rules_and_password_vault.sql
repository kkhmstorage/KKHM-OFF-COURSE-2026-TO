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
