import type {
  AcademicStage,
  DatabaseSnapshot,
  Profile,
  Semester,
  Student,
  StudentAcademicEnrollment,
  StudentOffCourseSelection,
  TimetableSlot,
  TimetableTemplate,
} from '../types/domain';
import { formatStudentSubjects } from './studentUtils';

export const ACADEMIC_STAGE_META: Record<
  AcademicStage,
  {
    label: string;
    ml: string;
    display: string;
    shortRule: string;
    adminHint: string;
  }
> = {
  thamheediyya: {
    label: 'Thamheediyya',
    ml: 'തംഹീദിയ്യ',
    display: 'Thamheediyya (തംഹീദിയ്യ)',
    shortRule: 'Urdu exemption · Click period to select Off-Course students',
    adminHint:
      'Thamheediyya (തംഹീദിയ്യ): Click any period (e.g. Urdu period) to view the class Off-Course student list and tick the students taking Off-Course in that period.',
  },
  aliya: {
    label: 'Aliya',
    ml: 'ആലിയ',
    display: 'Aliya (ആലിയ)',
    shortRule: 'Any 1 subject exempted · Click period to tick Off-Course students',
    adminHint:
      'Aliya (ആലിയ): Click any period cell to view all Off-Course students in this class and tick who replaces that general period with Off-Course.',
  },
  pg: {
    label: 'PG',
    ml: 'പി.ജി',
    display: 'PG (പി.ജി)',
    shortRule: 'Any 1 subject exempted · Click period to tick Off-Course students',
    adminHint:
      'PG (പി.ജി): Click any period cell to view all Off-Course students in this class and tick who replaces that general period with Off-Course.',
  },
};

export function isValidAcademicStage(value: unknown): value is AcademicStage {
  return value === 'thamheediyya' || value === 'aliya' || value === 'pg';
}

export function isStagePerStudentTick(stage: AcademicStage): boolean {
  return stage === 'aliya' || stage === 'pg';
}

export function inferSemesterStage(
  semester?: Pick<Semester, 'name' | 'academic_stage'> | null,
  template?: Pick<TimetableTemplate, 'name' | 'academic_stage'> | null
): AcademicStage {
  if (isValidAcademicStage(semester?.academic_stage)) {
    return semester.academic_stage;
  }
  if (isValidAcademicStage(template?.academic_stage)) {
    return template.academic_stage;
  }
  const combined = `${semester?.name || ''} ${template?.name || ''}`.toLowerCase();
  if (
    combined.includes('pg') ||
    combined.includes('post graduate') ||
    combined.includes('post-graduate') ||
    combined.includes('പി.ജി') ||
    combined.includes('പിജി')
  ) {
    return 'pg';
  }
  if (
    combined.includes('aliya') ||
    combined.includes('ആലിയ') ||
    /\b(?:sem(?:ester)?\s*[-#:]?\s*)?(?:5|6|7|8|9|10)\b/.test(combined)
  ) {
    return 'aliya';
  }
  return 'thamheediyya';
}

// ============================================================================
// Zero-Downtime Supabase Fallback Metadata Codecs
// Used transparently if live Supabase tables haven't run the optional ALTER SQL
// ============================================================================

const SLOT_META_REGEX = /\s*\[\[KKHM_OC:(\{[\s\S]*?\})\]\]\s*$/;
const STAGE_META_REGEX = /\s*\[\[KKHM_STAGE:(thamheediyya|aliya|pg)\]\]\s*/g;
const LOCAL_SEMESTER_STAGE_CACHE_KEY = 'kkhm_ams_semester_stage_cache_v1';

export function readLocalSemesterStageMap(): Record<string, AcademicStage> {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_SEMESTER_STAGE_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const clean: Record<string, AcademicStage> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (isValidAcademicStage(v)) clean[k] = v;
    }
    return clean;
  } catch {
    return {};
  }
}

export function writeLocalSemesterStage(semesterId: string, stage: AcademicStage): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const map = readLocalSemesterStageMap();
    map[semesterId] = stage;
    window.localStorage.setItem(LOCAL_SEMESTER_STAGE_CACHE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

export function encodeSlotFallbackActivity(
  label: string,
  isOffCourse: boolean,
  studentIds: string[]
): string {
  const cleanLabel = stripSlotFallbackMarker(label).trim();
  const payload = JSON.stringify({
    o: isOffCourse ? 1 : 0,
    s: studentIds,
  });
  return `${cleanLabel} [[KKHM_OC:${payload}]]`.trim();
}

export function stripSlotFallbackMarker(activity?: string | null): string {
  if (!activity) return '';
  return activity.replace(SLOT_META_REGEX, '').trim();
}

export function hydrateTimetableSlot(raw: TimetableSlot): TimetableSlot {
  const rawActivity = raw.planned_activity || '';
  const match = rawActivity.match(SLOT_META_REGEX);

  let cleanActivity = rawActivity;
  let fallbackOffCourse: boolean | undefined;
  let fallbackStudentIds: string[] | undefined;

  if (match) {
    cleanActivity = rawActivity.replace(SLOT_META_REGEX, '').trim();
    try {
      const parsed = JSON.parse(match[1]) as { o?: number; s?: unknown };
      fallbackOffCourse = parsed.o === 1;
      fallbackStudentIds = Array.isArray(parsed.s)
        ? parsed.s.filter((id): id is string => typeof id === 'string')
        : [];
    } catch {
      // Malformed fallback JSON ignored
    }
  }

  const hasNativeBoolean = typeof raw.is_off_course === 'boolean';
  const hasNativeStudents = Array.isArray(raw.off_course_student_ids);

  const offCourseStudentIds = hasNativeStudents
    ? raw.off_course_student_ids!
    : fallbackStudentIds;

  const isOffCourse = hasNativeBoolean
    ? raw.is_off_course
    : fallbackOffCourse !== undefined
      ? fallbackOffCourse
      : offCourseStudentIds && offCourseStudentIds.length > 0
        ? true
        : undefined;

  return {
    ...raw,
    planned_activity: cleanActivity,
    is_off_course: isOffCourse,
    off_course_student_ids: offCourseStudentIds,
  };
}

export function encodeTemplateStageInDescription(
  description: string | undefined,
  stage: AcademicStage
): string {
  const clean = stripTemplateStageMarker(description);
  return `${clean}${clean ? ' ' : ''}[[KKHM_STAGE:${stage}]]`;
}

export function stripTemplateStageMarker(description?: string | null): string {
  if (!description) return '';
  return description.replace(STAGE_META_REGEX, '').trim();
}

export function extractTemplateStageFromDescription(
  description?: string | null
): AcademicStage | undefined {
  if (!description) return undefined;
  const match = description.match(/\[\[KKHM_STAGE:(thamheediyya|aliya|pg)\]\]/);
  if (match && isValidAcademicStage(match[1])) {
    return match[1];
  }
  return undefined;
}

export function hydrateTimetableTemplate(raw: TimetableTemplate): TimetableTemplate {
  const markerStage = extractTemplateStageFromDescription(raw.description);
  return {
    ...raw,
    academic_stage: isValidAcademicStage(raw.academic_stage)
      ? raw.academic_stage
      : markerStage,
    description: stripTemplateStageMarker(raw.description),
  };
}

// ============================================================================
// Stage-Aware Slot & Student Resolution
// ============================================================================

export function templateUsesStageOffCourseConfig(slots: TimetableSlot[]): boolean {
  return slots.some(
    (s) =>
      typeof s.is_off_course === 'boolean' ||
      (Array.isArray(s.off_course_student_ids) && s.off_course_student_ids.length > 0)
  );
}

/**
 * Determines whether a single weekly timetable slot is an active Off-Course
 * period for the specified student.
 * - If explicit students are ticked on the slot, ONLY those ticked students get Off-Course (works for all stages).
 * - For legacy Thamheediyya class-wide slots (is_off_course = true with no explicit IDs), applies to all class students.
 */
export function isSlotOffCourseForStudent(
  slot: TimetableSlot | undefined,
  studentId: string,
  stage: AcademicStage,
  usesStageConfig: boolean
): boolean {
  if (!slot) return false;
  if (!usesStageConfig) {
    // Legacy template created before stage-aware Off-Course marking:
    // keep previously configured slots active so nothing silently breaks.
    return Boolean(slot.planned_activity?.trim());
  }
  const hasExplicitStudentTicks =
    Array.isArray(slot.off_course_student_ids) && slot.off_course_student_ids.length > 0;
  if (hasExplicitStudentTicks) {
    return slot.off_course_student_ids!.includes(studentId);
  }
  if (!isStagePerStudentTick(stage) && slot.is_off_course) {
    return true;
  }
  return false;
}

/**
 * Returns the student-facing label for an active Off-Course slot.
 * Replaces the general college timetable subject with "Off-Course" + the student's chosen Off-Course subject.
 */
export function formatOffCourseSlotLabel(
  _slot: TimetableSlot | undefined,
  _stage: AcademicStage,
  studentSubjectLabel?: string
): string {
  const cleanSubject = studentSubjectLabel?.trim();
  if (cleanSubject) {
    return `Off-Course — ${cleanSubject}`;
  }
  return 'Off-Course';
}

export function normalizeSemesterMatchKey(value?: string | null): string {
  return (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function doesStudentMatchSemester(
  student: Student,
  enrollment: StudentAcademicEnrollment | undefined,
  semester: Semester | undefined
): boolean {
  if (!semester) return false;
  const semName = semester.name.toLowerCase().trim();
  const semKey = normalizeSemesterMatchKey(semester.name);
  if (!semName) return false;

  const candidates = [student.semester_text, enrollment?.class_batch, student.batch_name]
    .filter((v): v is string => Boolean(v && v.trim()))
    .map((v) => v.toLowerCase().trim());

  for (const cand of candidates) {
    const candKey = normalizeSemesterMatchKey(cand);
    if (
      cand === semName ||
      candKey === semKey ||
      cand.includes(semName) ||
      semName.includes(cand)
    ) {
      return true;
    }
    // Also match numeric semester shorthand like "1" vs "Semester 1" or "S1"
    const semNum = semName.match(/\b(\d+)\b/)?.[1];
    const candNum = cand.match(/^(?:s|sem|semester)?\s*(\d+)$/)?.[1];
    if (semNum && candNum && semNum === candNum) {
      return true;
    }
  }
  return false;
}

export interface ResolvedStudentTimetableContext {
  student?: Student;
  semester?: Semester;
  template?: TimetableTemplate;
  templateSlots: TimetableSlot[];
  stage: AcademicStage;
  usesStageConfig: boolean;
  studentSubjectLabel: string;
  /** slot id -> what this student studies in that period instead of the opted-out subject */
  slotReplacementLabels: Record<string, string>;
}

/**
 * Unified student timetable resolver shared by Student Portal, Mentor Portal,
 * Admin Student Details, Admin Reports/Dashboard, and DataService.
 */
export function resolveStudentTimetableContext(
  db: DatabaseSnapshot,
  studentId: string,
  academicYearId: string
): ResolvedStudentTimetableContext {
  const student = db.students.find((s) => s.id === studentId);
  const enrollment = db.student_academic_enrollments.find(
    (e) => e.student_id === studentId && e.academic_year_id === academicYearId
  );
  const yearSemesters = db.semesters.filter((s) => s.academic_year_id === academicYearId);
  const yearTemplates = db.timetable_templates.filter(
    (t) => t.academic_year_id === academicYearId
  );

  // 1. Match student's semester
  const matchedSemester =
    (student && yearSemesters.find((s) => doesStudentMatchSemester(student, enrollment, s))) ||
    yearSemesters.find((s) => s.status === 'active') ||
    yearSemesters[0];

  // 2. Explicit assignment
  const ttAssign = db.student_timetable_assignments.find(
    (a) =>
      a.student_id === studentId &&
      a.academic_year_id === academicYearId &&
      a.is_active
  );

  // 3. Check if student is explicitly ticked in any Aliya/PG template's slots
  const tickedTemplateIds = new Set(
    db.timetable_slots
      .filter((sl) => sl.off_course_student_ids?.includes(studentId))
      .map((sl) => sl.template_id)
  );
  const tickedTemplate =
    yearTemplates.find((t) => tickedTemplateIds.has(t.id) && t.is_published) ||
    yearTemplates.find((t) => tickedTemplateIds.has(t.id));

  const studentSemText = (student?.semester_text || '').toLowerCase().trim();

  const template =
    (ttAssign && yearTemplates.find((t) => t.id === ttAssign.template_id)) ||
    tickedTemplate ||
    (matchedSemester &&
      yearTemplates.find((t) => t.is_published && t.semester_id === matchedSemester.id)) ||
    (matchedSemester &&
      yearTemplates.find(
        (t) =>
          t.is_published &&
          t.name.toLowerCase().includes(matchedSemester.name.toLowerCase())
      )) ||
    (studentSemText &&
      yearTemplates.find(
        (t) => t.is_published && t.name.toLowerCase().includes(studentSemText)
      )) ||
    (matchedSemester && yearTemplates.find((t) => t.semester_id === matchedSemester.id)) ||
    yearTemplates.find((t) => t.is_published) ||
    yearTemplates[0];

  const linkedSemester =
    (template?.semester_id
      ? yearSemesters.find((s) => s.id === template.semester_id)
      : undefined) || matchedSemester;

  const rawTemplateSlots = template
    ? db.timetable_slots.filter((s) => s.template_id === template.id)
    : [];

  // Per-student substitution: a class period of a subject this student has opted
  // out of becomes an Off-Course period showing the student's replacement subject.
  const selections = (db.student_offcourse_selections || []).filter(
    (sel) =>
      sel.student_id === studentId &&
      sel.status !== 'cancelled' &&
      sel.academic_year_id === academicYearId &&
      (!student?.stage_semester_no || sel.semester_no === student.stage_semester_no)
  );
  const replacementBySubject = new Map<string, string>();
  for (const sel of selections) {
    replacementBySubject.set(sel.opted_out_subject_id, describeReplacement(db, sel));
  }
  const slotReplacementLabels: Record<string, string> = {};
  const templateSlots = rawTemplateSlots.map((sl) => {
    const label = sl.subject_id ? replacementBySubject.get(sl.subject_id) : undefined;
    if (!label) return sl;
    slotReplacementLabels[sl.id] = label;
    const ids = Array.isArray(sl.off_course_student_ids) ? sl.off_course_student_ids : [];
    return {
      ...sl,
      is_off_course: true,
      off_course_student_ids: ids.length && !ids.includes(studentId) ? [...ids, studentId] : ids.length ? ids : [studentId],
    };
  });

  const stage = inferSemesterStage(linkedSemester, template);
  const usesStageConfig = templateUsesStageOffCourseConfig(templateSlots);
  const studentSubjectLabel = selections.length
    ? [...new Set(selections.map((sel) => describeReplacement(db, sel)))].join(', ')
    : formatStudentSubjects(db, studentId, academicYearId);

  return {
    student,
    semester: linkedSemester,
    template,
    templateSlots,
    stage,
    usesStageConfig,
    studentSubjectLabel,
    slotReplacementLabels,
  };
}

function describeReplacement(db: DatabaseSnapshot, sel: StudentOffCourseSelection): string {
  if (sel.replacement_type === 'pool') {
    return (db.offcourse_pool_items || []).find((p) => p.id === sel.pool_item_id)?.topic || 'Off-Course Pool';
  }
  if (sel.replacement_type === 'off_course') {
    return (db.offcourse_proposals || []).find((p) => p.id === sel.proposal_id)?.topic || 'Off Course';
  }
  return db.subjects.find((x) => x.id === sel.interdisciplinary_subject_id)?.name || 'Interdisciplinary';
}

export interface ClassStudentOption {
  student: Student;
  profile: Profile;
  enrollment?: StudentAcademicEnrollment;
  subjectsLabel: string;
  isSemesterMatch: boolean;
}

/**
 * Returns students for a given semester/timetable, flagging which ones belong to the class.
 */
export function getClassStudentOptions(
  db: DatabaseSnapshot,
  academicYearId: string,
  semester?: Semester | null,
  template?: TimetableTemplate | null,
  tickedIdsInTemplate?: Set<string>
): ClassStudentOption[] {
  const assignedStudentIds = new Set(
    template
      ? db.student_timetable_assignments
          .filter(
            (a) =>
              a.template_id === template.id &&
              a.academic_year_id === academicYearId &&
              a.is_active
          )
          .map((a) => a.student_id)
      : []
  );

  const enrollmentsByStudent = new Map(
    db.student_academic_enrollments
      .filter((e) => e.academic_year_id === academicYearId)
      .map((e) => [e.student_id, e])
  );

  const results: ClassStudentOption[] = [];
  for (const student of db.students) {
    const profile = db.profiles.find((p) => p.id === student.profile_id);
    if (!profile) continue;
    const enrollment = enrollmentsByStudent.get(student.id);
    // Include students enrolled in this year (or all if no enrollments exist yet)
    if (enrollmentsByStudent.size > 0 && !enrollment) continue;

    const isMatch =
      !semester ||
      doesStudentMatchSemester(student, enrollment, semester) ||
      assignedStudentIds.has(student.id) ||
      Boolean(tickedIdsInTemplate?.has(student.id));

    results.push({
      student,
      profile,
      enrollment,
      subjectsLabel: formatStudentSubjects(db, student.id, academicYearId),
      isSemesterMatch: isMatch,
    });
  }

  return results.sort((a, b) => a.profile.full_name.localeCompare(b.profile.full_name));
}
