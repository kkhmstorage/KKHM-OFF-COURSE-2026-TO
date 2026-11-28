import React from 'react';
import { DAY_NAMES } from '../../lib/dateUtils';
import { isSlotOffCourseForStudent, resolveStudentTimetableContext } from '../../lib/timetableUtils';
import type { DatabaseSnapshot } from '../../types/domain';

/**
 * One student's weekly Off-Course timetable. Periods of a subject the student has
 * opted out of automatically show the student's replacement subject.
 * Used by the student portal and by the admin (single student or whole class print).
 */
export const StudentTimetableGrid: React.FC<{
  db: DatabaseSnapshot;
  studentId: string;
  academicYearId: string;
  workingDays: number[];
  periodCount: number;
  showHeader?: boolean;
}> = ({ db, studentId, academicYearId, workingDays, periodCount, showHeader = false }) => {
  const ctx = resolveStudentTimetableContext(db, studentId, academicYearId);
  const student = db.students.find((s) => s.id === studentId);
  const profile = db.profiles.find((p) => p.id === student?.profile_id);

  return (
    <div className="timetable-sheet break-inside-avoid">
      {showHeader && (
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-sm font-semibold text-slate-900">
            {profile?.full_name || 'Student'}{' '}
            <span className="font-normal text-slate-500">
              · {student?.admission_number} · {student?.batch_name}
            </span>
          </div>
          {ctx.studentSubjectLabel && (
            <div className="text-xs text-teal-800">Off-Course: {ctx.studentSubjectLabel}</div>
          )}
        </div>
      )}
      {!ctx.templateSlots.length ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-4 text-xs text-slate-500">
          ടൈംടേബിൾ നൽകിയിട്ടില്ല.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5 font-semibold min-w-[100px]">Day</th>
                {Array.from({ length: periodCount }, (_, idx) => (
                  <th key={idx} className="px-3 py-2.5 font-semibold min-w-[120px]">
                    Period {idx + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {workingDays.map((day) => (
                <tr key={day}>
                  <td className="px-3 py-2.5 font-semibold text-slate-900">
                    <div>{DAY_NAMES[day]?.full}</div>
                    <div className="text-[11px] font-normal text-slate-500">{DAY_NAMES[day]?.ml}</div>
                  </td>
                  {Array.from({ length: periodCount }, (_, idx) => {
                    const sl = ctx.templateSlots.find((s) => s.day_of_week === day && s.period_number === idx + 1);
                    const off = isSlotOffCourseForStudent(sl, studentId, ctx.stage, ctx.usesStageConfig);
                    if (!off) {
                      return (
                        <td key={idx} className="px-3 py-2.5 align-top text-slate-400">
                          —
                        </td>
                      );
                    }
                    const label =
                      (sl && ctx.slotReplacementLabels[sl.id]) ||
                      (ctx.usesStageConfig
                        ? ctx.studentSubjectLabel
                        : sl?.planned_activity && sl.planned_activity !== 'Off-Course'
                          ? sl.planned_activity
                          : undefined);
                    return (
                      <td key={idx} className="px-3 py-2.5 align-top bg-teal-50/60">
                        <div className="font-semibold text-teal-900">Off-Course</div>
                        {label && <div className="text-[11px] font-medium text-teal-800 mt-0.5 leading-snug">{label}</div>}
                        {sl && (
                          <div className="text-[10px] font-mono tabular-nums text-teal-700/80 mt-0.5">
                            {sl.start_time}–{sl.end_time}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
