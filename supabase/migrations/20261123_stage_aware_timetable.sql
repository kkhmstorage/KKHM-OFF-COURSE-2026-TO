-- KKHM AMS — Stage-Aware Off-Course Timetable Migration (Idempotent)
-- Adds academic_stage to semesters (Thamheediyya / Aliya / PG)
-- and class-wide / per-student Off-Course fields to timetable_slots.

ALTER TABLE public.semesters
  ADD COLUMN IF NOT EXISTS academic_stage TEXT NOT NULL DEFAULT 'thamheediyya';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_semesters_academic_stage'
  ) THEN
    ALTER TABLE public.semesters
      ADD CONSTRAINT chk_semesters_academic_stage
      CHECK (academic_stage IN ('thamheediyya', 'aliya', 'pg'));
  END IF;
END $$;

ALTER TABLE public.timetable_slots
  ADD COLUMN IF NOT EXISTS is_off_course BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS off_course_student_ids TEXT[] NOT NULL DEFAULT '{}';
