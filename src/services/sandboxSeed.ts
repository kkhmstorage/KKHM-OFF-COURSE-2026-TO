import { addDays, getDefaultPeriodTimings, getTodayIST, getDayOfWeekISO } from '../lib/dateUtils';
import type {
  AcademicCalendarException,
  AcademicYear,
  AcademicYearSettings,
  AuditLog,
  DatabaseSnapshot,
  Mentor,
  MentorAssignment,
  NotificationItem,
  PeriodActivityEntry,
  Profile,
  ReportReviewHistory,
  ReportSubmission,
  Semester,
  SemesterSubject,
  Student,
  StudentAcademicEnrollment,
  StudentSubjectSelection,
  StudentTimetableAssignment,
  Subject,
  TimetableSlot,
  TimetableTemplate,
} from '../types/domain';

/**
 * Isolated Sandbox Dataset for Preview Mode (only loaded when Supabase env vars
 * are not configured). Never mixed with production Supabase PostgreSQL records.
 */
export function createIsolatedSandboxSeed(): DatabaseSnapshot {
  const now = new Date().toISOString();
  const today = getTodayIST();

  // Compute recent working dates ending near today (skipping Sundays)
  const recentWorkingDates: string[] = [];
  let cursor = today;
  let guard = 0;
  while (recentWorkingDates.length < 5 && guard < 14) {
    if (getDayOfWeekISO(cursor) !== 7) {
      recentWorkingDates.unshift(cursor);
    }
    cursor = addDays(cursor, -1);
    guard++;
  }
  const [d1, d2, d3, d4, d5] = recentWorkingDates;

  const year2024Id = 'ay-2024-25';
  const year2025Id = 'ay-2025-26';
  const year2026Id = 'ay-2026-27';

  const academic_years: AcademicYear[] = [
    {
      id: year2024Id,
      name: '2024-25',
      start_date: '2024-06-03',
      end_date: '2025-03-31',
      status: 'closed',
      description: 'Archived academic year 2024-25 (read-only historical record).',
      created_at: '2024-06-01T04:00:00Z',
      updated_at: '2025-04-02T10:00:00Z',
    },
    {
      id: year2025Id,
      name: '2025-26',
      start_date: '2025-06-02',
      end_date: '2026-03-31',
      status: 'closed',
      description: 'Archived academic year 2025-26 (read-only historical record).',
      created_at: '2025-06-01T04:00:00Z',
      updated_at: '2026-04-02T10:00:00Z',
    },
    {
      id: year2026Id,
      name: '2026-27',
      start_date: '2026-06-01',
      end_date: '2027-03-31',
      status: 'open',
      description: 'Active academic year for KKHM Islamic & Arts College.',
      created_at: '2026-05-20T04:00:00Z',
      updated_at: now,
    },
  ];

  const defaultTimings8 = getDefaultPeriodTimings(8);

  const academic_year_settings: AcademicYearSettings[] = [
    {
      id: 'ays-2024',
      academic_year_id: year2024Id,
      working_days: [1, 2, 3, 4, 5, 6],
      period_count: 8,
      week_start_day: 1,
      entry_mode: 'daily',
      approval_mode: 'daily',
      default_period_timings: defaultTimings8,
      updated_at: '2024-06-01T04:00:00Z',
    },
    {
      id: 'ays-2025',
      academic_year_id: year2025Id,
      working_days: [1, 2, 3, 4, 5, 6],
      period_count: 8,
      week_start_day: 1,
      entry_mode: 'weekly',
      approval_mode: 'weekly',
      default_period_timings: defaultTimings8,
      updated_at: '2025-06-01T04:00:00Z',
    },
    {
      id: 'ays-2026',
      academic_year_id: year2026Id,
      working_days: [1, 2, 3, 4, 5, 6],
      period_count: 8,
      week_start_day: 1,
      entry_mode: 'daily',
      approval_mode: 'daily',
      default_period_timings: defaultTimings8,
      updated_at: now,
    },
  ];

  const profiles: Profile[] = [
    {
      id: 'prof-admin-1',
      role: 'admin',
      full_name: 'Dr. Abdul Rahiman K',
      username: 'kkhmoffcourse',
      email: 'admin@kkhmcollege.edu.in',
      phone: '+91 98470 10101',
      password_sandbox: '1111',
      is_active: true,
      created_at: '2024-06-01T04:00:00Z',
      updated_at: now,
    },
    {
      id: 'prof-mentor-1',
      role: 'mentor',
      full_name: 'Usthad Muhammed Rashid P',
      username: 'mentor1',
      email: 'rashid.mentor@kkhmcollege.edu.in',
      phone: '+91 98470 20201',
      password_sandbox: 'Mentor@2026',
      is_active: true,
      last_login_at: now,
      created_at: '2024-06-01T04:00:00Z',
      updated_at: now,
    },
    {
      id: 'prof-mentor-2',
      role: 'mentor',
      full_name: 'Prof. Basheer Ahmed M',
      username: 'mentor2',
      email: 'basheer.mentor@kkhmcollege.edu.in',
      phone: '+91 98470 20202',
      password_sandbox: 'Mentor@2026',
      is_active: true,
      last_login_at: now,
      created_at: '2024-06-01T04:00:00Z',
      updated_at: now,
    },
    {
      id: 'prof-mentor-3',
      role: 'mentor',
      full_name: 'Usthad Salmanul Faris T',
      username: 'mentor3',
      email: 'salman.mentor@kkhmcollege.edu.in',
      phone: '+91 98470 20203',
      password_sandbox: 'Mentor@2026',
      is_active: true,
      created_at: '2025-06-01T04:00:00Z',
      updated_at: now,
    },
    {
      id: 'prof-stu-1',
      role: 'student',
      full_name: 'Muhammed Ashiq K',
      username: 'student1',
      email: 'ashiq.2401@kkhmcollege.edu.in',
      phone: '+91 97450 30101',
      password_sandbox: 'Student@2026',
      is_active: true,
      last_login_at: now,
      created_at: '2024-06-01T04:00:00Z',
      updated_at: now,
    },
    {
      id: 'prof-stu-2',
      role: 'student',
      full_name: 'Sayyid Ameen Thangal',
      username: 'student2',
      email: 'ameen.2402@kkhmcollege.edu.in',
      phone: '+91 97450 30102',
      password_sandbox: 'Student@2026',
      is_active: true,
      created_at: '2024-06-01T04:00:00Z',
      updated_at: now,
    },
    {
      id: 'prof-stu-3',
      role: 'student',
      full_name: 'Fadhil Rahman V P',
      username: 'student3',
      email: 'fadhil.2501@kkhmcollege.edu.in',
      phone: '+91 97450 30103',
      password_sandbox: 'Student@2026',
      is_active: true,
      created_at: '2025-06-01T04:00:00Z',
      updated_at: now,
    },
    {
      id: 'prof-stu-4',
      role: 'student',
      full_name: 'Hisham Abdullah C',
      username: 'student4',
      email: 'hisham.2502@kkhmcollege.edu.in',
      phone: '+91 97450 30104',
      password_sandbox: 'Student@2026',
      is_active: true,
      created_at: '2025-06-01T04:00:00Z',
      updated_at: now,
    },
    {
      id: 'prof-stu-5',
      role: 'student',
      full_name: 'Nihal Shareef M',
      username: 'student5',
      email: 'nihal.2601@kkhmcollege.edu.in',
      phone: '+91 97450 30105',
      password_sandbox: 'Student@2026',
      is_active: true,
      created_at: '2026-06-01T04:00:00Z',
      updated_at: now,
    },
    {
      id: 'prof-stu-6',
      role: 'student',
      full_name: 'Shamil Irfan K P',
      username: 'student6',
      email: 'shamil.2602@kkhmcollege.edu.in',
      phone: '+91 97450 30106',
      password_sandbox: 'Student@2026',
      is_active: true,
      created_at: '2026-06-01T04:00:00Z',
      updated_at: now,
    },
  ];

  const mentors: Mentor[] = [
    {
      id: 'm-1',
      profile_id: 'prof-mentor-1',
      employee_code: 'KKHM-M001',
      designation: 'Senior Faculty & Academic Mentor',
      department: 'Islamic Studies & Arabic',
      created_at: '2024-06-01T04:00:00Z',
      updated_at: now,
    },
    {
      id: 'm-2',
      profile_id: 'prof-mentor-2',
      employee_code: 'KKHM-M002',
      designation: 'Assistant Professor & Mentor',
      department: 'English & Humanities',
      created_at: '2024-06-01T04:00:00Z',
      updated_at: now,
    },
    {
      id: 'm-3',
      profile_id: 'prof-mentor-3',
      employee_code: 'KKHM-M003',
      designation: 'Faculty Mentor',
      department: 'Off-Course Skill & Library',
      created_at: '2025-06-01T04:00:00Z',
      updated_at: now,
    },
  ];

  const students: Student[] = [
    {
      id: 's-1',
      profile_id: 'prof-stu-1',
      admission_number: 'KKHM2401',
      batch_name: 'Degree 3rd Year (BA Arabic & Islamic)',
      guardian_phone: '+91 98471 11221',
      created_at: '2024-06-01T04:00:00Z',
      updated_at: now,
    },
    {
      id: 's-2',
      profile_id: 'prof-stu-2',
      admission_number: 'KKHM2402',
      batch_name: 'Degree 3rd Year (BA Arabic & Islamic)',
      guardian_phone: '+91 98471 11222',
      created_at: '2024-06-01T04:00:00Z',
      updated_at: now,
    },
    {
      id: 's-3',
      profile_id: 'prof-stu-3',
      admission_number: 'KKHM2501',
      batch_name: 'Degree 2nd Year (BA English & Arts)',
      guardian_phone: '+91 98471 11223',
      created_at: '2025-06-01T04:00:00Z',
      updated_at: now,
    },
    {
      id: 's-4',
      profile_id: 'prof-stu-4',
      admission_number: 'KKHM2502',
      batch_name: 'Degree 2nd Year (BA English & Arts)',
      guardian_phone: '+91 98471 11224',
      created_at: '2025-06-01T04:00:00Z',
      updated_at: now,
    },
    {
      id: 's-5',
      profile_id: 'prof-stu-5',
      admission_number: 'KKHM2601',
      batch_name: 'Degree 1st Year (Foundation Stream)',
      guardian_phone: '+91 98471 11225',
      created_at: '2026-06-01T04:00:00Z',
      updated_at: now,
    },
    {
      id: 's-6',
      profile_id: 'prof-stu-6',
      admission_number: 'KKHM2602',
      batch_name: 'Degree 1st Year (Foundation Stream)',
      guardian_phone: '+91 98471 11226',
      created_at: '2026-06-01T04:00:00Z',
      updated_at: now,
    },
  ];

  const student_academic_enrollments: StudentAcademicEnrollment[] = [
    // 2024-25
    { id: 'enr-1-24', student_id: 's-1', academic_year_id: year2024Id, class_batch: 'Degree 1st Year', status: 'completed', enrolled_at: '2024-06-03', created_at: '2024-06-03T04:00:00Z' },
    { id: 'enr-2-24', student_id: 's-2', academic_year_id: year2024Id, class_batch: 'Degree 1st Year', status: 'completed', enrolled_at: '2024-06-03', created_at: '2024-06-03T04:00:00Z' },
    // 2025-26
    { id: 'enr-1-25', student_id: 's-1', academic_year_id: year2025Id, class_batch: 'Degree 2nd Year', status: 'completed', enrolled_at: '2025-06-02', created_at: '2025-06-02T04:00:00Z' },
    { id: 'enr-2-25', student_id: 's-2', academic_year_id: year2025Id, class_batch: 'Degree 2nd Year', status: 'completed', enrolled_at: '2025-06-02', created_at: '2025-06-02T04:00:00Z' },
    { id: 'enr-3-25', student_id: 's-3', academic_year_id: year2025Id, class_batch: 'Degree 1st Year', status: 'completed', enrolled_at: '2025-06-02', created_at: '2025-06-02T04:00:00Z' },
    { id: 'enr-4-25', student_id: 's-4', academic_year_id: year2025Id, class_batch: 'Degree 1st Year', status: 'completed', enrolled_at: '2025-06-02', created_at: '2025-06-02T04:00:00Z' },
    // 2026-27 (Active)
    { id: 'enr-1-26', student_id: 's-1', academic_year_id: year2026Id, class_batch: 'Degree 3rd Year (BA Arabic & Islamic)', status: 'active', enrolled_at: '2026-06-01', created_at: '2026-06-01T04:00:00Z' },
    { id: 'enr-2-26', student_id: 's-2', academic_year_id: year2026Id, class_batch: 'Degree 3rd Year (BA Arabic & Islamic)', status: 'active', enrolled_at: '2026-06-01', created_at: '2026-06-01T04:00:00Z' },
    { id: 'enr-3-26', student_id: 's-3', academic_year_id: year2026Id, class_batch: 'Degree 2nd Year (BA English & Arts)', status: 'active', enrolled_at: '2026-06-01', created_at: '2026-06-01T04:00:00Z' },
    { id: 'enr-4-26', student_id: 's-4', academic_year_id: year2026Id, class_batch: 'Degree 2nd Year (BA English & Arts)', status: 'active', enrolled_at: '2026-06-01', created_at: '2026-06-01T04:00:00Z' },
    { id: 'enr-5-26', student_id: 's-5', academic_year_id: year2026Id, class_batch: 'Degree 1st Year (Foundation Stream)', status: 'active', enrolled_at: '2026-06-01', created_at: '2026-06-01T04:00:00Z' },
    { id: 'enr-6-26', student_id: 's-6', academic_year_id: year2026Id, class_batch: 'Degree 1st Year (Foundation Stream)', status: 'active', enrolled_at: '2026-06-01', created_at: '2026-06-01T04:00:00Z' },
  ];

  // Historical mentor assignments preserved per year (student s-1 had mentor m-2 in 2024-25, m-1 in 2025-26 and 2026-27)
  const mentor_assignments: MentorAssignment[] = [
    { id: 'ma-24-1', student_id: 's-1', mentor_id: 'm-2', academic_year_id: year2024Id, assigned_date: '2024-06-03', ended_date: '2025-03-31', is_active: true, created_at: '2024-06-03T04:00:00Z' },
    { id: 'ma-24-2', student_id: 's-2', mentor_id: 'm-1', academic_year_id: year2024Id, assigned_date: '2024-06-03', ended_date: '2025-03-31', is_active: true, created_at: '2024-06-03T04:00:00Z' },
    { id: 'ma-25-1', student_id: 's-1', mentor_id: 'm-1', academic_year_id: year2025Id, assigned_date: '2025-06-02', ended_date: '2026-03-31', is_active: true, created_at: '2025-06-02T04:00:00Z' },
    { id: 'ma-25-2', student_id: 's-2', mentor_id: 'm-1', academic_year_id: year2025Id, assigned_date: '2025-06-02', ended_date: '2026-03-31', is_active: true, created_at: '2025-06-02T04:00:00Z' },
    { id: 'ma-25-3', student_id: 's-3', mentor_id: 'm-2', academic_year_id: year2025Id, assigned_date: '2025-06-02', ended_date: '2026-03-31', is_active: true, created_at: '2025-06-02T04:00:00Z' },
    { id: 'ma-25-4', student_id: 's-4', mentor_id: 'm-3', academic_year_id: year2025Id, assigned_date: '2025-06-02', ended_date: '2026-03-31', is_active: true, created_at: '2025-06-02T04:00:00Z' },
    // 2026-27 active assignments
    { id: 'ma-26-1', student_id: 's-1', mentor_id: 'm-1', academic_year_id: year2026Id, assigned_date: '2026-06-01', is_active: true, created_at: '2026-06-01T04:00:00Z' },
    { id: 'ma-26-2', student_id: 's-2', mentor_id: 'm-1', academic_year_id: year2026Id, assigned_date: '2026-06-01', is_active: true, created_at: '2026-06-01T04:00:00Z' },
    { id: 'ma-26-3', student_id: 's-3', mentor_id: 'm-2', academic_year_id: year2026Id, assigned_date: '2026-06-01', is_active: true, created_at: '2026-06-01T04:00:00Z' },
    { id: 'ma-26-4', student_id: 's-4', mentor_id: 'm-2', academic_year_id: year2026Id, assigned_date: '2026-06-01', is_active: true, created_at: '2026-06-01T04:00:00Z' },
    { id: 'ma-26-5', student_id: 's-5', mentor_id: 'm-3', academic_year_id: year2026Id, assigned_date: '2026-06-01', is_active: true, created_at: '2026-06-01T04:00:00Z' },
    { id: 'ma-26-6', student_id: 's-6', mentor_id: 'm-3', academic_year_id: year2026Id, assigned_date: '2026-06-01', is_active: true, created_at: '2026-06-01T04:00:00Z' },
  ];

  const semesters: Semester[] = [
    { id: 'sem-24-1', academic_year_id: year2024Id, name: 'Semester 1 (2024-25)', start_date: '2024-06-03', end_date: '2024-10-31', status: 'closed', created_at: '2024-06-01T04:00:00Z' },
    { id: 'sem-24-2', academic_year_id: year2024Id, name: 'Semester 2 (2024-25)', start_date: '2024-11-01', end_date: '2025-03-31', status: 'closed', created_at: '2024-06-01T04:00:00Z' },
    { id: 'sem-25-1', academic_year_id: year2025Id, name: 'Semester 3 (2025-26)', start_date: '2025-06-02', end_date: '2025-10-31', status: 'closed', created_at: '2025-06-01T04:00:00Z' },
    { id: 'sem-25-2', academic_year_id: year2025Id, name: 'Semester 4 (2025-26)', start_date: '2025-11-01', end_date: '2026-03-31', status: 'closed', created_at: '2025-06-01T04:00:00Z' },
    { id: 'sem-26-1', academic_year_id: year2026Id, name: 'Semester 5 (Odd Term)', start_date: '2026-06-01', end_date: '2026-10-31', status: 'closed', created_at: '2026-05-20T04:00:00Z' },
    { id: 'sem-26-2', academic_year_id: year2026Id, name: 'Semester 6 (Even Term)', start_date: '2026-11-01', end_date: '2027-03-31', status: 'active', created_at: '2026-05-20T04:00:00Z' },
  ];

  const subjects: Subject[] = [
    { id: 'sub-eng', code: 'ENG101', name: 'English Communication', category: 'Language', is_active: true, created_at: '2024-06-01T04:00:00Z' },
    { id: 'sub-arb', code: 'ARB102', name: 'Arabic Literature & Grammar', category: 'Islamic & Arabic', is_active: true, created_at: '2024-06-01T04:00:00Z' },
    { id: 'sub-fgh', code: 'ISL201', name: 'Fiqh & Usool Study Circle', category: 'Islamic & Arabic', is_active: true, created_at: '2024-06-01T04:00:00Z' },
    { id: 'sub-lib', code: 'LIB105', name: 'Library & Research Reading', category: 'Off-Course', is_active: true, created_at: '2024-06-01T04:00:00Z' },
    { id: 'sub-skl', code: 'SKL108', name: 'Skill Development & Writing', category: 'Off-Course', is_active: true, created_at: '2024-06-01T04:00:00Z' },
    { id: 'sub-csc', code: 'CSC110', name: 'Computer Science & Digital Tools', category: 'Elective', is_active: true, created_at: '2024-06-01T04:00:00Z' },
    { id: 'sub-mal', code: 'MAL103', name: 'Malayalam Literary Forum (മലയാള സാഹിത്യം)', category: 'Language', is_active: true, created_at: '2024-06-01T04:00:00Z' },
    { id: 'sub-soc', code: 'SOC104', name: 'Social Studies & Community Outreach', category: 'Humanities', is_active: true, created_at: '2024-06-01T04:00:00Z' },
  ];

  const semester_subjects: SemesterSubject[] = [];
  for (const sem of semesters) {
    for (const sub of subjects) {
      semester_subjects.push({ id: `ss-${sem.id}-${sub.id}`, semester_id: sem.id, subject_id: sub.id });
    }
  }

  const student_subject_selections: StudentSubjectSelection[] = [
    // Historical 2024-25 selections for student 1
    { id: 'sel-s1-24-eng', student_id: 's-1', academic_year_id: year2024Id, semester_id: 'sem-24-1', subject_id: 'sub-eng', selection_status: 'selected', updated_at: '2024-06-10T04:00:00Z' },
    { id: 'sel-s1-24-arb', student_id: 's-1', academic_year_id: year2024Id, semester_id: 'sem-24-1', subject_id: 'sub-arb', selection_status: 'selected', updated_at: '2024-06-10T04:00:00Z' },
    { id: 'sel-s1-24-csc', student_id: 's-1', academic_year_id: year2024Id, semester_id: 'sem-24-1', subject_id: 'sub-csc', selection_status: 'not_selected', updated_at: '2024-06-10T04:00:00Z' },
    { id: 'sel-s1-24-soc', student_id: 's-1', academic_year_id: year2024Id, semester_id: 'sem-24-1', subject_id: 'sub-soc', selection_status: 'selected', updated_at: '2024-06-10T04:00:00Z' },
    // Historical 2025-26 selections for student 1
    { id: 'sel-s1-25-eng', student_id: 's-1', academic_year_id: year2025Id, semester_id: 'sem-25-2', subject_id: 'sub-eng', selection_status: 'selected', updated_at: '2025-11-05T04:00:00Z' },
    { id: 'sel-s1-25-arb', student_id: 's-1', academic_year_id: year2025Id, semester_id: 'sem-25-2', subject_id: 'sub-arb', selection_status: 'selected', updated_at: '2025-11-05T04:00:00Z' },
    { id: 'sel-s1-25-fgh', student_id: 's-1', academic_year_id: year2025Id, semester_id: 'sem-25-2', subject_id: 'sub-fgh', selection_status: 'selected', updated_at: '2025-11-05T04:00:00Z' },
    { id: 'sel-s1-25-csc', student_id: 's-1', academic_year_id: year2025Id, semester_id: 'sem-25-2', subject_id: 'sub-csc', selection_status: 'selected', updated_at: '2025-11-05T04:00:00Z' },
    { id: 'sel-s1-25-soc', student_id: 's-1', academic_year_id: year2025Id, semester_id: 'sem-25-2', subject_id: 'sub-soc', selection_status: 'not_selected', updated_at: '2025-11-05T04:00:00Z' },
    // Active 2026-27 Semester 6 selections for all students
    ...students.flatMap((st, idx) =>
      subjects.map((sub, sIdx) => ({
        id: `sel-${st.id}-26-${sub.id}`,
        student_id: st.id,
        academic_year_id: year2026Id,
        semester_id: 'sem-26-2',
        subject_id: sub.id,
        selection_status: ((idx + sIdx) % 4 === 2 ? 'not_selected' : 'selected') as 'selected' | 'not_selected',
        updated_at: now,
      }))
    ),
  ];

  // Timetable Templates
  const timetable_templates: TimetableTemplate[] = [
    {
      id: 'tt-26-main',
      academic_year_id: year2026Id,
      name: 'Standard 8-Period Off-Course Schedule (2026-27)',
      description: '6 working days (Mon–Sat) with 8 daily periods covering Languages, Islamic Studies, Library & Skill Development.',
      is_published: true,
      revision: 2,
      published_at: '2026-06-01T05:00:00Z',
      created_at: '2026-05-25T05:00:00Z',
      updated_at: now,
    },
    {
      id: 'tt-25-main',
      academic_year_id: year2025Id,
      name: 'Academic Year 2025-26 Schedule',
      description: 'Archived timetable for 2025-26.',
      is_published: true,
      revision: 1,
      published_at: '2025-06-02T05:00:00Z',
      created_at: '2025-06-01T05:00:00Z',
      updated_at: '2025-06-02T05:00:00Z',
    },
  ];

  const weeklyMatrix: string[][] = [
    ['English Communication', 'Arabic Literature & Grammar', 'Library & Research Reading', 'Skill Development & Writing', 'Fiqh & Usool Study Circle', 'Malayalam Literary Forum', 'Computer Science Lab', 'Mentoring & Self-Study'],
    ['Arabic Literature & Grammar', 'Fiqh & Usool Study Circle', 'English Communication', 'Computer Science & Digital Tools', 'Library & Research Reading', 'Social Studies & Outreach', 'Skill Development & Writing', 'Group Debate & Oratory'],
    ['Fiqh & Usool Study Circle', 'English Communication', 'Arabic Literature & Grammar', 'Library & Research Reading', 'Malayalam Literary Forum', 'Skill Development & Writing', 'Social Studies & Outreach', 'Peer Revision Session'],
    ['English Communication', 'Computer Science & Digital Tools', 'Fiqh & Usool Study Circle', 'Arabic Literature & Grammar', 'Skill Development & Writing', 'Library & Research Reading', 'Malayalam Literary Forum', 'Journal & Reflection'],
    ['Arabic Literature & Grammar', 'Malayalam Literary Forum', 'Library & Research Reading', 'Fiqh & Usool Study Circle', 'English Communication', 'Social Studies & Outreach', 'Skill Development & Writing', 'Friday Assembly & Speech'],
    ['Library & Research Reading', 'Skill Development & Writing', 'Computer Science & Digital Tools', 'English Communication', 'Arabic Literature & Grammar', 'Weekly Review Circle', 'Social Studies & Outreach', 'Community Service Project'],
  ];

  const timetable_slots: TimetableSlot[] = [];
  for (const tpl of timetable_templates) {
    for (let day = 1; day <= 6; day++) {
      for (let p = 1; p <= 8; p++) {
        const timing = defaultTimings8[p - 1];
        timetable_slots.push({
          id: `slot-${tpl.id}-${day}-${p}`,
          template_id: tpl.id,
          day_of_week: day,
          period_number: p,
          start_time: timing.start_time,
          end_time: timing.end_time,
          planned_activity: weeklyMatrix[day - 1][p - 1],
        });
      }
    }
  }

  const student_timetable_assignments: StudentTimetableAssignment[] = [
    ...students.map((s) => ({
      id: `tta-26-${s.id}`,
      student_id: s.id,
      academic_year_id: year2026Id,
      template_id: 'tt-26-main',
      effective_start_date: '2026-06-01',
      is_active: true,
      created_at: '2026-06-01T05:00:00Z',
    })),
    {
      id: 'tta-25-s1',
      student_id: 's-1',
      academic_year_id: year2025Id,
      template_id: 'tt-25-main',
      effective_start_date: '2025-06-02',
      effective_end_date: '2026-03-31',
      is_active: true,
      created_at: '2025-06-02T05:00:00Z',
    },
  ];

  const academic_calendar_exceptions: AcademicCalendarException[] = [
    {
      id: 'cal-1',
      academic_year_id: year2026Id,
      exception_date: '2026-08-15',
      exception_type: 'holiday',
      title: 'Independence Day Holiday',
      notes: 'Full-day institutional holiday. Excluded from expected reporting.',
      created_by: 'prof-admin-1',
      created_at: '2026-06-05T05:00:00Z',
    },
    {
      id: 'cal-2',
      academic_year_id: year2026Id,
      exception_date: '2026-11-01',
      exception_type: 'holiday',
      title: 'Kerala Piravi Commemoration Holiday',
      notes: 'College closed for state formation day.',
      created_by: 'prof-admin-1',
      created_at: '2026-10-15T05:00:00Z',
    },
    {
      id: 'cal-3',
      academic_year_id: year2026Id,
      exception_date: d5,
      exception_type: 'period_cancellation',
      period_number: 8,
      title: 'General College Assembly (Period 8 Cancelled)',
      notes: 'Authorized period cancellation — not counted as missing activity.',
      created_by: 'prof-admin-1',
      created_at: now,
    },
  ];

  const report_submissions: ReportSubmission[] = [];
  const period_activity_entries: PeriodActivityEntry[] = [];
  const report_review_history: ReportReviewHistory[] = [];

  const sampleActivities = [
    'Completed spoken English comprehension worksheet and vocabulary drills.',
    'അറബി വ്യാകരണ അധ്യായം 4 പഠിക്കുകയും ഉദാഹരണങ്ങൾ എഴുതുകയും ചെയ്തു.',
    'Read two chapters from reference texts in the central library and prepared summary notes.',
    'Drafted structured essay outline and participated in peer editing workshop.',
    'Attended Fiqh study circle discussion on contemporary transactions and recorded key rulings.',
    'മലയാള സാഹിത്യ സംവാദത്തിൽ പങ്കെടുക്കുകയും ലേഖനക്കുറിപ്പ് തയ്യാറാക്കുകയും ചെയ്തു.',
    'Practiced spreadsheet formulas and document formatting in the computer lab.',
    'Reviewed daily reflections and prepared study goals for the upcoming week.',
  ];

  // Helper to seed a full daily submission
  const addDailySubmission = (
    subId: string,
    studentId: string,
    yearId: string,
    semId: string,
    mentorId: string,
    dateStr: string,
    status: ReportSubmission['status'],
    periodStatuses: ('pending' | 'approved' | 'returned')[]
  ) => {
    const dow = getDayOfWeekISO(dateStr);
    const dayRow = weeklyMatrix[Math.min(5, Math.max(0, dow - 1))];
    report_submissions.push({
      id: subId,
      student_id: studentId,
      academic_year_id: yearId,
      semester_id: semId,
      mentor_id: mentorId,
      unit_key: dateStr,
      start_date: dateStr,
      end_date: dateStr,
      entry_mode_snapshot: 'daily',
      approval_mode_snapshot: 'daily',
      status,
      submitted_at: status === 'draft' ? undefined : `${dateStr}T12:15:00Z`,
      approved_at: status === 'approved' ? `${dateStr}T13:45:00Z` : undefined,
      created_at: `${dateStr}T06:00:00Z`,
      updated_at: `${dateStr}T13:45:00Z`,
    });

    for (let p = 1; p <= 8; p++) {
      const pStatus = periodStatuses[p - 1] || 'pending';
      const entryId = `pe-${subId}-${p}`;
      const comment =
        pStatus === 'returned'
          ? 'Please include the specific book title and pages studied during this period (വായിച്ച പുസ്തകത്തിന്റെ പേരും പേജ് നമ്പറും ചേർക്കുക).'
          : pStatus === 'approved'
            ? 'Verified and well documented.'
            : undefined;
      period_activity_entries.push({
        id: entryId,
        submission_id: subId,
        student_id: studentId,
        academic_year_id: yearId,
        activity_date: dateStr,
        period_number: p,
        planned_activity_snapshot: dayRow[p - 1],
        actual_activity: sampleActivities[p - 1],
        activity_status: 'completed',
        optional_notes: p === 3 ? 'Library Book Reg #412' : '',
        approval_status: pStatus,
        mentor_comment: comment,
        reviewed_by: pStatus !== 'pending' ? (mentorId === 'm-1' ? 'prof-mentor-1' : mentorId === 'm-2' ? 'prof-mentor-2' : 'prof-mentor-3') : undefined,
        reviewed_at: pStatus !== 'pending' ? `${dateStr}T13:40:00Z` : undefined,
        created_at: `${dateStr}T06:00:00Z`,
        updated_at: `${dateStr}T13:40:00Z`,
      });

      if (pStatus !== 'pending') {
        report_review_history.push({
          id: `rh-${entryId}-1`,
          submission_id: subId,
          period_entry_id: entryId,
          actor_profile_id: mentorId === 'm-1' ? 'prof-mentor-1' : mentorId === 'm-2' ? 'prof-mentor-2' : 'prof-mentor-3',
          actor_name:
            mentorId === 'm-1'
              ? 'Usthad Muhammed Rashid P'
              : mentorId === 'm-2'
                ? 'Prof. Basheer Ahmed M'
                : 'Usthad Salmanul Faris T',
          action: pStatus,
          comment,
          activity_snapshot: sampleActivities[p - 1],
          created_at: `${dateStr}T13:40:00Z`,
        });
      }
    }
  };

  // Historical closed years (2024-25 & 2025-26) for Student 1
  addDailySubmission('sub-hist-24-1', 's-1', year2024Id, 'sem-24-2', 'm-2', '2025-02-10', 'approved', Array(8).fill('approved'));
  addDailySubmission('sub-hist-25-1', 's-1', year2025Id, 'sem-25-2', 'm-1', '2026-01-19', 'approved', Array(8).fill('approved'));

  // Active 2026-27 realistic records
  // Student 1 (Mentor 1): d1 Approved, d2 Approved, d3 Approved, d4 Returned (Period 3 needs correction!)
  addDailySubmission('sub-s1-d1', 's-1', year2026Id, 'sem-26-2', 'm-1', d1, 'approved', Array(8).fill('approved'));
  addDailySubmission('sub-s1-d2', 's-1', year2026Id, 'sem-26-2', 'm-1', d2, 'approved', Array(8).fill('approved'));
  addDailySubmission('sub-s1-d3', 's-1', year2026Id, 'sem-26-2', 'm-1', d3, 'approved', Array(8).fill('approved'));
  addDailySubmission('sub-s1-d4', 's-1', year2026Id, 'sem-26-2', 'm-1', d4, 'returned', [
    'approved', 'approved', 'returned', 'approved', 'approved', 'approved', 'pending', 'pending',
  ]);

  // Student 2 (Mentor 1): d1 Approved, d2 Approved, d3 Pending Review
  addDailySubmission('sub-s2-d1', 's-2', year2026Id, 'sem-26-2', 'm-1', d1, 'approved', Array(8).fill('approved'));
  addDailySubmission('sub-s2-d2', 's-2', year2026Id, 'sem-26-2', 'm-1', d2, 'approved', Array(8).fill('approved'));
  addDailySubmission('sub-s2-d3', 's-2', year2026Id, 'sem-26-2', 'm-1', d3, 'pending_review', Array(8).fill('pending'));

  // Student 3 (Mentor 2): d1 Approved, d2 Partially Reviewed
  addDailySubmission('sub-s3-d1', 's-3', year2026Id, 'sem-26-2', 'm-2', d1, 'approved', Array(8).fill('approved'));
  addDailySubmission('sub-s3-d2', 's-3', year2026Id, 'sem-26-2', 'm-2', d2, 'partially_reviewed', [
    'approved', 'approved', 'approved', 'approved', 'pending', 'pending', 'pending', 'pending',
  ]);

  // Student 4 (Mentor 2): d1 Approved, d2 Pending Review
  addDailySubmission('sub-s4-d1', 's-4', year2026Id, 'sem-26-2', 'm-2', d1, 'approved', Array(8).fill('approved'));
  addDailySubmission('sub-s4-d2', 's-4', year2026Id, 'sem-26-2', 'm-2', d2, 'pending_review', Array(8).fill('pending'));

  // Student 5 (Mentor 3): d1 Approved, d2 Draft (not yet submitted)
  addDailySubmission('sub-s5-d1', 's-5', year2026Id, 'sem-26-2', 'm-3', d1, 'approved', Array(8).fill('approved'));
  addDailySubmission('sub-s5-d2', 's-5', year2026Id, 'sem-26-2', 'm-3', d2, 'draft', Array(8).fill('pending'));

  // Student 6 (Mentor 3): No reports yet in 2026-27 (appears in Missing Reports!)

  const notifications: NotificationItem[] = [
    {
      id: 'notif-1',
      recipient_profile_id: 'prof-stu-1',
      academic_year_id: year2026Id,
      title: 'Period 3 Returned for Correction',
      message: `Usthad Muhammed Rashid P returned Period 3 (${d4}) for correction. Please add book title and page numbers.`,
      category: 'report_returned',
      link_target: 'reporting',
      reference_id: 'sub-s1-d4',
      is_read: false,
      created_at: now,
    },
    {
      id: 'notif-2',
      recipient_profile_id: 'prof-mentor-1',
      academic_year_id: year2026Id,
      title: 'New Report Pending Review',
      message: `Sayyid Ameen Thangal submitted activity report for ${d3} (8 periods awaiting approval).`,
      category: 'report_submitted',
      link_target: 'pending-approvals',
      reference_id: 'sub-s2-d3',
      is_read: false,
      created_at: now,
    },
    {
      id: 'notif-3',
      recipient_profile_id: 'prof-mentor-2',
      academic_year_id: year2026Id,
      title: 'Pending Period Approvals',
      message: `Fadhil Rahman V P and Hisham Abdullah C have 12 periods awaiting review.`,
      category: 'report_submitted',
      link_target: 'pending-approvals',
      reference_id: 'sub-s3-d2',
      is_read: false,
      created_at: now,
    },
    {
      id: 'notif-4',
      recipient_profile_id: 'prof-admin-1',
      academic_year_id: year2026Id,
      title: 'Pending Mentor Approvals Alert',
      message: `22 submitted periods across 3 mentors are currently awaiting verification for 2026-27.`,
      category: 'system_alert',
      link_target: 'reports',
      is_read: false,
      created_at: now,
    },
  ];

  const audit_logs: AuditLog[] = [
    {
      id: 'aud-1',
      actor_profile_id: 'prof-admin-1',
      actor_name: 'Dr. Abdul Rahiman K',
      actor_role: 'admin',
      action: 'ACADEMIC_YEAR_CREATED',
      record_type: 'academic_year',
      record_id: year2026Id,
      details: { name: '2026-27', status: 'open' },
      created_at: '2026-05-20T04:00:00Z',
    },
    {
      id: 'aud-2',
      actor_profile_id: 'prof-admin-1',
      actor_name: 'Dr. Abdul Rahiman K',
      actor_role: 'admin',
      action: 'TIMETABLE_PUBLISHED',
      record_type: 'timetable_template',
      record_id: 'tt-26-main',
      details: { name: 'Standard 8-Period Off-Course Schedule (2026-27)', revision: 2 },
      created_at: '2026-06-01T05:00:00Z',
    },
    {
      id: 'aud-3',
      actor_profile_id: 'prof-mentor-1',
      actor_name: 'Usthad Muhammed Rashid P',
      actor_role: 'mentor',
      action: 'PERIOD_RETURNED',
      record_type: 'period_activity_entry',
      record_id: 'pe-sub-s1-d4-3',
      details: { student: 'Muhammed Ashiq K', date: d4, period: 3 },
      created_at: now,
    },
  ];

  return {
    profiles,
    students,
    mentors,
    academic_years,
    app_settings: {
      id: 1,
      institution_name: 'KKHM Islamic & Arts College',
      application_name: 'KKHM Off-Course Activity Management System',
      timezone: 'Asia/Kolkata',
      default_language: 'en',
      selected_academic_year_id: year2026Id,
      in_app_notifications_enabled: true,
      reminder_hour: 17,
      session_timeout_hours: 168,
      updated_at: now,
    },
    academic_year_settings,
    student_academic_enrollments,
    mentor_assignments,
    semesters,
    subjects,
    semester_subjects,
    student_subject_selections,
    timetable_templates,
    timetable_slots,
    student_timetable_assignments,
    timetable_overrides: [],
    academic_calendar_exceptions,
    report_submissions,
    period_activity_entries,
    report_review_history,
    notifications,
    audit_logs,
  };
}
