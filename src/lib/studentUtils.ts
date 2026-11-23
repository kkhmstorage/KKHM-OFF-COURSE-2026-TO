import type { DatabaseSnapshot, Subject } from '../types/domain';

/**
 * Resolves the active selected subjects for a student within the given academic year.
 * Prefers selections in active semester(s) of that year if present, otherwise returns
 * all unique selected subjects recorded for that academic year.
 */
export function getStudentSubjects(
  db: DatabaseSnapshot,
  studentId: string,
  academicYearId?: string
): Subject[] {
  const yearSemesters = academicYearId
    ? db.semesters.filter((sem) => sem.academic_year_id === academicYearId)
    : db.semesters;

  const activeSemIds = new Set(
    yearSemesters.filter((sem) => sem.status === 'active').map((sem) => sem.id)
  );

  const studentSelections = db.student_subject_selections.filter(
    (sel) =>
      sel.student_id === studentId &&
      sel.selection_status === 'selected' &&
      (!academicYearId || sel.academic_year_id === academicYearId)
  );

  // Prefer active semester selections in the target year when available
  let matchedSelections = studentSelections.filter((sel) => activeSemIds.has(sel.semester_id));
  if (matchedSelections.length === 0) {
    matchedSelections = studentSelections;
  }

  const uniqueSubjectIds = Array.from(new Set(matchedSelections.map((sel) => sel.subject_id)));
  const subjectMap = new Map(db.subjects.map((sub) => [sub.id, sub]));

  return uniqueSubjectIds
    .map((id) => subjectMap.get(id))
    .filter((sub): sub is Subject => Boolean(sub));
}

export function formatStudentSubjects(
  db: DatabaseSnapshot,
  studentId: string,
  academicYearId?: string
): string {
  const subjects = getStudentSubjects(db, studentId, academicYearId);
  if (subjects.length === 0) return '';
  return subjects.map((s) => s.name).join(', ');
}
