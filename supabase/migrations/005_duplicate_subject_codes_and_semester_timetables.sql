-- Migration 005: Allow Duplicate Subject Codes & Semester-aware Timetable Templates
-- Allows multiple off-course subjects in a semester to share the same subject code.
-- Adds semester_id to timetable_templates so timetables can be organized and scoped per semester.

ALTER TABLE public.subjects DROP CONSTRAINT IF EXISTS subjects_code_key;
DROP INDEX IF EXISTS subjects_code_key;

ALTER TABLE public.timetable_templates ADD COLUMN IF NOT EXISTS semester_id UUID REFERENCES public.semesters(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_timetable_templates_semester_id ON public.timetable_templates(semester_id);
