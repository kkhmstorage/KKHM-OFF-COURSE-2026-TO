export type UserRole = 'admin' | 'mentor' | 'student';

export type AcademicYearStatus = 'open' | 'closed';
export type SemesterStatus = 'upcoming' | 'active' | 'closed';
export type AcademicStage = 'thamheediyya' | 'aliya' | 'pg';
export type EnrollmentStatus = 'active' | 'completed' | 'withdrawn';
export type SubjectSelectionStatus = 'selected' | 'not_selected';
export type WorkflowMode = 'daily' | 'weekly';

export type CalendarExceptionType =
  | 'holiday'
  | 'weekly_off'
  | 'special_working_day'
  | 'period_cancellation';

export type ReportSubmissionStatus =
  | 'not_started'
  | 'draft'
  | 'submitted'
  | 'pending_review'
  | 'partially_reviewed'
  | 'returned'
  | 'approved';

export type PeriodActivityStatus = 'completed' | 'no_activity' | 'absent' | 'cancelled';
export type PeriodApprovalStatus = 'pending' | 'approved' | 'returned';

export type NotificationCategory =
  | 'report_submitted'
  | 'report_approved'
  | 'report_returned'
  | 'period_unlocked'
  | 'system_alert';

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
  username: string;
  email: string;
  phone?: string;
  /** Only used inside isolated local sandbox mode; in Supabase production mode passwords live hashed inside PostgreSQL */
  password_sandbox?: string;
  /** Secure SHA-256 hash used in sandbox mode so plaintext passwords are never stored in client code */
  password_hash_sandbox?: string;
  /** Flags temporary first-login setup */
  is_temporary_password?: boolean;
  /** still on a password published in the repo (set by migration 006) */
  must_change_password?: boolean;
  is_active: boolean;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
}

export type CicCourseStream =
  | 'Wafy'
  | 'Wafy Arts'
  | 'Wafiyya'
  | 'Wafiyya Day'
  | 'Wafiyya Arts'
  | 'Wafiyya Distance';

export type CicSemesterPeriod = 'Nov' | 'May';

export interface Student {
  id: string;
  profile_id: string;
  admission_number: string;
  batch_name: string;
  /** CIC Admission Number */
  cic_ad_no?: string;
  /** College Admission Number (alias/explicit) */
  clg_ad_no?: string;
  /** Academic Year (e.g. 2026-27) */
  academic_year_text?: string;
  /** Semester (e.g. Semester 1, 2) */
  semester_text?: string;
  /** Session Period (Nov / May) */
  semester_period?: CicSemesterPeriod | string;
  /** Course Stream */
  course_stream?: CicCourseStream | string;
  /** College Affiliation & Name */
  college_name?: string;
  /** Subject / Off-Course Topic Title */
  subject_title?: string;
  /** Off Course Proposal Application Number */
  proposal_app_no?: string;
  /** Course Credit */
  course_credit?: string;
  /** Name of Guide */
  guide_name?: string;
  /** Whatsapp Number */
  whatsapp_number?: string;
  /** Reference / bibliography / notes */
  reference_notes?: string;
  guardian_phone?: string;
  notes?: string;
  /** Current position in the 8-year programme (migration 007) */
  academic_stage?: AcademicStage | null;
  stage_semester_no?: number | null;
  scheme?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Mentor {
  id: string;
  profile_id: string;
  employee_code: string;
  designation: string;
  department?: string;
  created_at: string;
  updated_at: string;
}

export interface AcademicYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: AcademicYearStatus;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface PeriodTiming {
  period_number: number;
  start_time: string;
  end_time: string;
}

export interface AppSettings {
  id: 1;
  institution_name: string;
  application_name: string;
  logo_url?: string;
  timezone: string;
  default_language: 'en' | 'ml';
  selected_academic_year_id: string;
  in_app_notifications_enabled: boolean;
  reminder_hour: number;
  session_timeout_hours: number;
  institution_short_name?: string | null;
  institution_address?: string | null;
  cic_college_code?: string | null;
  updated_at: string;
}

export interface AcademicYearSettings {
  id: string;
  academic_year_id: string;
  working_days: number[]; // ISO weekday: 1=Mon ... 7=Sun
  period_count: number;
  week_start_day: number; // 1=Mon
  entry_mode: WorkflowMode;
  approval_mode: WorkflowMode;
  default_period_timings: PeriodTiming[];
  updated_at: string;
}

export interface StudentAcademicEnrollment {
  id: string;
  student_id: string;
  academic_year_id: string;
  class_batch: string;
  status: EnrollmentStatus;
  enrolled_at: string;
  created_at: string;
}

export interface MentorAssignment {
  id: string;
  student_id: string;
  mentor_id: string;
  academic_year_id: string;
  assigned_date: string;
  ended_date?: string;
  is_active: boolean;
  created_at: string;
}

export interface Semester {
  id: string;
  academic_year_id: string;
  name: string;
  academic_stage?: AcademicStage;
  start_date: string;
  end_date: string;
  status: SemesterStatus;
  created_at: string;
}

export type CourseType = 'core' | 'elective' | 'interdisciplinary' | 'off_course';

export interface Subject {
  id: string;
  code: string;
  name: string;
  category: string;
  is_active: boolean;
  created_at: string;
  /** Course chart (migration 007): which stage / semester the syllabus places it in */
  academic_stage?: AcademicStage | null;
  semester_no?: number | null;
  course_type?: CourseType;
  is_urdu?: boolean;
  credit?: number;
  scheme?: string | null;
}

/** Thamheediyya Off-Course Pool part (CIC Board of Studies) */
export interface OffCoursePoolItem {
  id: string;
  pool_year: string;
  course_name: string;
  topic: string;
  semester_nos: number[];
  exam_mode?: string | null;
  mark?: string | null;
  exam_language?: string | null;
  note?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface OffCourseProposalModel {
  code: string;
  title: string;
  exam_mode?: string | null;
  mark?: string | null;
  max_credit?: number | null;
  is_active: boolean;
}

export type ProposalStatus =
  | 'draft'
  | 'principal_approved'
  | 'submitted_to_cic'
  | 'approved'
  | 'approved_with_changes'
  | 'approved_conditional'
  | 'rewrite'
  | 'rejected'
  | 'withdrawn';

export const EXAM_MODES = [
  'Written',
  'Practical',
  'Project Submission',
  'Viva',
  'Field Work',
  'Certificate Submission',
  'Report Submission',
  'Study Note Submission',
  'Assignment',
  'Translation',
  'Seminar',
  'Book Submission',
] as const;

export interface OffCourseProposal {
  id: string;
  academic_year_id: string;
  proposal_type: 'individual' | 'group';
  academic_stage: 'aliya' | 'pg';
  semester_period?: 'Nov' | 'May' | null;
  topic: string;
  model_code?: string | null;
  proposed_credit: number;
  guide_mentor_id?: string | null;
  guide_name?: string | null;
  guide_phone?: string | null;
  guide_email?: string | null;
  status: ProposalStatus;
  principal_approved_at?: string | null;
  submitted_at?: string | null;
  cic_decided_at?: string | null;
  approved_credit?: number | null;
  exam_language?: string | null;
  exam_modes: string[];
  application_no?: string | null;
  remarks?: string | null;
  work_submission_due?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OffCourseProposalMember {
  proposal_id: string;
  student_id: string;
  is_leader: boolean;
  created_at: string;
}

export type OffCourseReplacementType = 'pool' | 'off_course' | 'interdisciplinary';

export interface StudentOffCourseSelection {
  id: string;
  student_id: string;
  academic_year_id: string;
  academic_stage: AcademicStage;
  semester_no: number;
  semester_period?: 'Nov' | 'May' | null;
  opted_out_subject_id: string;
  opted_out_credit: number;
  replacement_type: OffCourseReplacementType;
  pool_item_id?: string | null;
  proposal_id?: string | null;
  interdisciplinary_subject_id?: string | null;
  status: 'active' | 'completed' | 'cancelled';
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SemesterSubject {
  id: string;
  semester_id: string;
  subject_id: string;
}

export interface StudentSubjectSelection {
  id: string;
  student_id: string;
  academic_year_id: string;
  semester_id: string;
  subject_id: string;
  selection_status: SubjectSelectionStatus;
  updated_at: string;
}

export interface TimetableTemplate {
  id: string;
  academic_year_id: string;
  semester_id?: string;
  academic_stage?: AcademicStage;
  name: string;
  description?: string;
  is_published: boolean;
  revision: number;
  published_at?: string;
  created_at: string;
  updated_at: string;
}

export interface TimetableSlot {
  id: string;
  template_id: string;
  day_of_week: number; // 1=Mon..7=Sun
  period_number: number;
  start_time: string;
  end_time: string;
  subject_id?: string;
  planned_activity: string;
  /** True when this slot is configured as an Off-Course period (class-wide in Thamheediyya, or has ticked students in Aliya/PG) */
  is_off_course?: boolean;
  /** Explicit list of student IDs scheduled for Off-Course in this period (Aliya / PG mode) */
  off_course_student_ids?: string[];
}

export interface StudentTimetableAssignment {
  id: string;
  student_id: string;
  academic_year_id: string;
  template_id: string;
  effective_start_date: string;
  effective_end_date?: string;
  is_active: boolean;
  created_at: string;
}

export interface TimetableOverride {
  id: string;
  academic_year_id: string;
  student_id?: string;
  override_date: string;
  period_number: number;
  planned_activity: string;
  reason?: string;
  created_at: string;
}

export interface AcademicCalendarException {
  id: string;
  academic_year_id: string;
  exception_date: string;
  exception_type: CalendarExceptionType;
  period_number?: number;
  student_id?: string;
  title: string;
  notes?: string;
  created_by?: string;
  created_at: string;
}

export interface ReportSubmission {
  id: string;
  student_id: string;
  academic_year_id: string;
  semester_id?: string;
  mentor_id?: string;
  unit_key: string; // 'YYYY-MM-DD' for daily approval, 'WEEK-YYYY-MM-DD' for weekly approval
  start_date: string;
  end_date: string;
  entry_mode_snapshot: WorkflowMode;
  approval_mode_snapshot: WorkflowMode;
  status: ReportSubmissionStatus;
  submitted_at?: string;
  approved_at?: string;
  created_at: string;
  updated_at: string;
}

export interface PeriodActivityEntry {
  id: string;
  submission_id: string;
  student_id: string;
  academic_year_id: string;
  activity_date: string;
  period_number: number;
  planned_activity_snapshot: string;
  actual_activity: string;
  activity_status: PeriodActivityStatus;
  optional_notes?: string;
  approval_status: PeriodApprovalStatus;
  mentor_comment?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ReportReviewHistory {
  id: string;
  submission_id: string;
  period_entry_id: string;
  actor_profile_id: string;
  actor_name: string;
  action: 'submitted' | 'approved' | 'returned' | 'resubmitted';
  comment?: string;
  activity_snapshot?: string;
  created_at: string;
}

export interface NotificationItem {
  id: string;
  recipient_profile_id: string;
  academic_year_id?: string;
  title: string;
  message: string;
  category: NotificationCategory;
  link_target?: string;
  reference_id?: string;
  is_read: boolean;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_profile_id?: string;
  actor_name: string;
  actor_role: string;
  action: string;
  record_type: string;
  record_id?: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface DatabaseSnapshot {
  profiles: Profile[];
  students: Student[];
  mentors: Mentor[];
  academic_years: AcademicYear[];
  app_settings: AppSettings;
  academic_year_settings: AcademicYearSettings[];
  student_academic_enrollments: StudentAcademicEnrollment[];
  mentor_assignments: MentorAssignment[];
  semesters: Semester[];
  subjects: Subject[];
  semester_subjects: SemesterSubject[];
  student_subject_selections: StudentSubjectSelection[];
  timetable_templates: TimetableTemplate[];
  timetable_slots: TimetableSlot[];
  student_timetable_assignments: StudentTimetableAssignment[];
  timetable_overrides: TimetableOverride[];
  academic_calendar_exceptions: AcademicCalendarException[];
  report_submissions: ReportSubmission[];
  period_activity_entries: PeriodActivityEntry[];
  report_review_history: ReportReviewHistory[];
  notifications: NotificationItem[];
  audit_logs: AuditLog[];
  offcourse_pool_items: OffCoursePoolItem[];
  offcourse_proposal_models: OffCourseProposalModel[];
  offcourse_proposals: OffCourseProposal[];
  offcourse_proposal_members: OffCourseProposalMember[];
  student_offcourse_selections: StudentOffCourseSelection[];
}

export interface AuthSession {
  token: string;
  profile: Profile;
  student?: Student;
  mentor?: Mentor;
}
