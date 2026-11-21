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
