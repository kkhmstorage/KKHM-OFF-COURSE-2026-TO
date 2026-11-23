import type {
  AcademicCalendarException,
  AcademicStage,
  AcademicYear,
  AcademicYearSettings,
  PeriodTiming,
  ReportSubmission,
  TimetableOverride,
  TimetableSlot,
} from '../types/domain';
import {
  formatOffCourseSlotLabel,
  isSlotOffCourseForStudent,
  templateUsesStageOffCourseConfig,
} from './timetableUtils';

export const DAY_NAMES: Record<number, { full: string; short: string; ml: string }> = {
  1: { full: 'Monday', short: 'Mon', ml: 'തിങ്കൾ' },
  2: { full: 'Tuesday', short: 'Tue', ml: 'ചൊവ്വ' },
  3: { full: 'Wednesday', short: 'Wed', ml: 'ബുധൻ' },
  4: { full: 'Thursday', short: 'Thu', ml: 'വ്യാഴം' },
  5: { full: 'Friday', short: 'Fri', ml: 'വെള്ളി' },
  6: { full: 'Saturday', short: 'Sat', ml: 'ശനി' },
  7: { full: 'Sunday', short: 'Sun', ml: 'ഞായർ' },
};

export function getTodayIST(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

export function parseISODate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISODate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(dateStr: string, days: number): string {
  const dt = parseISODate(dateStr);
  dt.setUTCDate(dt.getUTCDate() + days);
  return toISODate(dt);
}

/** ISO day of week: 1 = Monday ... 7 = Sunday */
export function getDayOfWeekISO(dateStr: string): number {
  const jsDay = parseISODate(dateStr).getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

export function getWeekStart(dateStr: string, weekStartDay = 1): string {
  const iso = getDayOfWeekISO(dateStr);
  const diff = (iso - weekStartDay + 7) % 7;
  return addDays(dateStr, -diff);
}

export function getWeekDates(weekStartStr: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStartStr, i));
}

export function formatDisplayDate(dateStr?: string): string {
  if (!dateStr) return '—';
  const dt = parseISODate(dateStr);
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(dt);
}

export function formatDateWithDay(dateStr: string): string {
  const day = DAY_NAMES[getDayOfWeekISO(dateStr)]?.short || '';
  return `${day}, ${formatDisplayDate(dateStr)}`;
}

export function formatDateTimeIST(iso?: string): string {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(dt);
}

export function getDefaultPeriodTimings(periodCount: number): PeriodTiming[] {
  const timings: PeriodTiming[] = [];
  let hour = 9;
  let minute = 0;
  for (let p = 1; p <= periodCount; p++) {
    const startH = String(hour).padStart(2, '0');
    const startM = String(minute).padStart(2, '0');
    minute += 45;
    if (minute >= 60) {
      hour += Math.floor(minute / 60);
      minute = minute % 60;
    }
    const endH = String(hour).padStart(2, '0');
    const endM = String(minute).padStart(2, '0');
    timings.push({ period_number: p, start_time: `${startH}:${startM}`, end_time: `${endH}:${endM}` });
    if (p === 2) minute += 15; // morning break
    if (p === 4) minute += 45; // lunch break
    if (minute >= 60) {
      hour += Math.floor(minute / 60);
      minute = minute % 60;
    }
  }
  return timings;
}

export interface DayWorkingStatus {
  isWorking: boolean;
  reason?: string;
  exception?: AcademicCalendarException;
}

export function getDayWorkingStatus(
  dateStr: string,
  settings: AcademicYearSettings | undefined,
  exceptions: AcademicCalendarException[]
): DayWorkingStatus {
  const yearId = settings?.academic_year_id;
  const dateExceptions = exceptions.filter(
    (e) => e.exception_date === dateStr && (!yearId || e.academic_year_id === yearId)
  );

  const specialWorking = dateExceptions.find((e) => e.exception_type === 'special_working_day');
  if (specialWorking) {
    return { isWorking: true, reason: specialWorking.title, exception: specialWorking };
  }

  const holiday = dateExceptions.find(
    (e) => e.exception_type === 'holiday' || e.exception_type === 'weekly_off'
  );
  if (holiday) {
    return { isWorking: false, reason: holiday.title, exception: holiday };
  }

  const workingDays = settings?.working_days || [1, 2, 3, 4, 5, 6];
  const dow = getDayOfWeekISO(dateStr);
  if (!workingDays.includes(dow)) {
    return { isWorking: false, reason: `Weekly Off (${DAY_NAMES[dow]?.full})` };
  }

  return { isWorking: true };
}

export interface EffectivePeriodSlot {
  period_number: number;
  start_time: string;
  end_time: string;
  planned_activity: string;
  subject_id?: string;
  is_off_course: boolean;
  is_cancelled: boolean;
  cancellation_reason?: string;
}

export interface EffectiveSlotOptions {
  stage?: AcademicStage;
  onlyOffCourse?: boolean;
  studentSubjectLabel?: string;
}

export function getEffectiveDaySlots(
  dateStr: string,
  studentId: string,
  templateSlots: TimetableSlot[],
  overrides: TimetableOverride[],
  calendarExceptions: AcademicCalendarException[],
  settings: AcademicYearSettings | undefined,
  options?: EffectiveSlotOptions
): EffectivePeriodSlot[] {
  const dow = getDayOfWeekISO(dateStr);
  const periodCount = settings?.period_count || 8;
  const defaultTimings =
    settings?.default_period_timings?.length
      ? settings.default_period_timings
      : getDefaultPeriodTimings(periodCount);

  const stage: AcademicStage = options?.stage || 'thamheediyya';
  const usesStageConfig = templateUsesStageOffCourseConfig(templateSlots);
  const onlyOffCourse = Boolean(options?.onlyOffCourse);

  const result: EffectivePeriodSlot[] = [];

  for (let p = 1; p <= periodCount; p++) {
    const slot = templateSlots.find((s) => s.day_of_week === dow && s.period_number === p);
    const timing = defaultTimings.find((t) => t.period_number === p) || {
      period_number: p,
      start_time: slot?.start_time || '09:00',
      end_time: slot?.end_time || '09:45',
    };

    const override = overrides.find(
      (o) =>
        o.override_date === dateStr &&
        o.period_number === p &&
        (!o.student_id || o.student_id === studentId)
    );

    const isOffCourse =
      Boolean(override) || isSlotOffCourseForStudent(slot, studentId, stage, usesStageConfig);

    if (onlyOffCourse && !isOffCourse) {
      continue;
    }

    const cancelException = calendarExceptions.find(
      (e) =>
        e.exception_date === dateStr &&
        e.exception_type === 'period_cancellation' &&
        e.period_number === p &&
        (!e.student_id || e.student_id === studentId)
    );

    const plannedActivity =
      override?.planned_activity ||
      (isOffCourse && usesStageConfig
        ? formatOffCourseSlotLabel(slot, stage, options?.studentSubjectLabel)
        : slot?.planned_activity || `Off-Course Period ${p}`);

    result.push({
      period_number: p,
      start_time: slot?.start_time || timing.start_time,
      end_time: slot?.end_time || timing.end_time,
      planned_activity: plannedActivity,
      subject_id: slot?.subject_id,
      is_off_course: isOffCourse,
      is_cancelled: Boolean(cancelException),
      cancellation_reason: cancelException?.title,
    });
  }

  return result;
}

export interface ReportingUnitSpec {
  unit_key: string;
  start_date: string;
  end_date: string;
  working_dates: string[];
  approval_mode: 'daily' | 'weekly';
}

export function buildUnitSpecForDate(
  dateStr: string,
  approvalMode: 'daily' | 'weekly',
  settings: AcademicYearSettings | undefined,
  exceptions: AcademicCalendarException[]
): ReportingUnitSpec {
  if (approvalMode === 'daily') {
    const status = getDayWorkingStatus(dateStr, settings, exceptions);
    return {
      unit_key: dateStr,
      start_date: dateStr,
      end_date: dateStr,
      working_dates: status.isWorking ? [dateStr] : [],
      approval_mode: 'daily',
    };
  }

  const weekStart = getWeekStart(dateStr, settings?.week_start_day || 1);
  const weekDates = getWeekDates(weekStart);
  const workingDates = weekDates.filter(
    (d) => getDayWorkingStatus(d, settings, exceptions).isWorking
  );
  return {
    unit_key: `WEEK-${weekStart}`,
    start_date: weekStart,
    end_date: weekDates[6],
    working_dates: workingDates,
    approval_mode: 'weekly',
  };
}

/**
 * Sequential locking check:
 * Finds the immediately preceding scheduled reporting unit (skipping weekends,
 * full-day holidays, and days with all periods cancelled).
 * First reporting unit of the academic year (or first unit since tracking start)
 * does NOT require a prior approval.
 */
export function checkSequentialLock(params: {
  targetUnit: ReportingUnitSpec;
  studentId: string;
  academicYear: AcademicYear;
  settings: AcademicYearSettings | undefined;
  exceptions: AcademicCalendarException[];
  existingSubmissions: ReportSubmission[];
  hasReportablePeriodsOnDate?: (dateStr: string) => boolean;
}): { isLocked: boolean; blockingUnitKey?: string; blockingLabel?: string; reason?: string } {
  const {
    targetUnit,
    studentId,
    academicYear,
    settings,
    exceptions,
    existingSubmissions,
    hasReportablePeriodsOnDate,
  } = params;

  if (academicYear.status === 'closed') {
    return {
      isLocked: true,
      reason: `Academic year ${academicYear.name} is closed. Historical records are read-only.`,
    };
  }

  const studentSubs = existingSubmissions
    .filter((s) => s.student_id === studentId && s.academic_year_id === academicYear.id)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  // First check: if there is ANY earlier existing submission not yet approved, lock immediately.
  const earlierUnapproved = studentSubs.find(
    (s) => s.start_date < targetUnit.start_date && s.status !== 'approved'
  );
  if (earlierUnapproved) {
    return {
      isLocked: true,
      blockingUnitKey: earlierUnapproved.unit_key,
      blockingLabel:
        earlierUnapproved.approval_mode_snapshot === 'weekly'
          ? `Week of ${formatDisplayDate(earlierUnapproved.start_date)}`
          : formatDisplayDate(earlierUnapproved.start_date),
      reason: `Previous reporting unit (${
        earlierUnapproved.approval_mode_snapshot === 'weekly'
          ? `Week of ${formatDisplayDate(earlierUnapproved.start_date)}`
          : formatDisplayDate(earlierUnapproved.start_date)
      }) must be fully approved by your mentor before unlocking this unit.`,
    };
  }

  // Second check: if the student already has at least one submission earlier in this year,
  // ensure no intervening scheduled working unit between the last approved unit and targetUnit was skipped.
  if (studentSubs.length > 0) {
    const earliestSubDate = studentSubs[0].start_date;
    if (targetUnit.start_date > earliestSubDate) {
      if (targetUnit.approval_mode === 'daily') {
        let cursor = addDays(targetUnit.start_date, -1);
        let guard = 0;
        while (cursor >= earliestSubDate && guard < 30) {
          guard++;
          const st = getDayWorkingStatus(cursor, settings, exceptions);
          const hasReportable = !hasReportablePeriodsOnDate || hasReportablePeriodsOnDate(cursor);
          if (st.isWorking && hasReportable) {
            // Check whether that previous working day is approved (either as daily unit or part of an approved weekly unit)
            const approvedCover = studentSubs.find(
              (s) => s.status === 'approved' && s.start_date <= cursor && s.end_date >= cursor
            );
            if (!approvedCover) {
              return {
                isLocked: true,
                blockingUnitKey: cursor,
                blockingLabel: formatDisplayDate(cursor),
                reason: `Sequential Daily Approval is active: ${formatDisplayDate(
                  cursor
                )} must be submitted and approved before unlocking ${formatDisplayDate(
                  targetUnit.start_date
                )}.`,
              };
            }
            break;
          }
          cursor = addDays(cursor, -1);
        }
      } else {
        // Weekly approval mode: check previous scheduled week
        let prevWeekStart = addDays(targetUnit.start_date, -7);
        let guard = 0;
        while (prevWeekStart >= getWeekStart(earliestSubDate, settings?.week_start_day || 1) && guard < 12) {
          guard++;
          const prevWeekSpec = buildUnitSpecForDate(prevWeekStart, 'weekly', settings, exceptions);
          const reportableWorkingDates = hasReportablePeriodsOnDate
            ? prevWeekSpec.working_dates.filter((d) => hasReportablePeriodsOnDate(d))
            : prevWeekSpec.working_dates;
          if (reportableWorkingDates.length > 0) {
            const approvedWeek = studentSubs.find(
              (s) =>
                s.status === 'approved' &&
                s.start_date <= prevWeekSpec.end_date &&
                s.end_date >= prevWeekSpec.start_date
            );
            if (!approvedWeek) {
              return {
                isLocked: true,
                blockingUnitKey: prevWeekSpec.unit_key,
                blockingLabel: `Week of ${formatDisplayDate(prevWeekSpec.start_date)}`,
                reason: `Sequential Weekly Approval is active: Week of ${formatDisplayDate(
                  prevWeekSpec.start_date
                )} must be fully approved before unlocking Week of ${formatDisplayDate(
                  targetUnit.start_date
                )}.`,
              };
            }
            break;
          }
          prevWeekStart = addDays(prevWeekStart, -7);
        }
      }
    }
  }

  return { isLocked: false };
}

export function countExpectedPeriodsInRange(params: {
  startDate: string;
  endDate: string;
  studentId: string;
  settings: AcademicYearSettings | undefined;
  exceptions: AcademicCalendarException[];
  templateSlots?: TimetableSlot[];
  stage?: AcademicStage;
  overrides?: TimetableOverride[];
}): number {
  const {
    startDate,
    endDate,
    studentId,
    settings,
    exceptions,
    templateSlots,
    stage,
    overrides = [],
  } = params;
  if (!settings || startDate > endDate) return 0;
  const hasTemplateSlots = Boolean(templateSlots && templateSlots.length > 0);
  let total = 0;
  let cursor = startDate;
  let safety = 0;
  while (cursor <= endDate && safety < 370) {
    safety++;
    const status = getDayWorkingStatus(cursor, settings, exceptions);
    if (status.isWorking) {
      if (hasTemplateSlots && templateSlots) {
        const daySlots = getEffectiveDaySlots(
          cursor,
          studentId,
          templateSlots,
          overrides,
          exceptions,
          settings,
          { stage: stage || 'thamheediyya', onlyOffCourse: true }
        );
        total += daySlots.filter((s) => !s.is_cancelled).length;
      } else {
        const cancelledCount = exceptions.filter(
          (e) =>
            e.academic_year_id === settings.academic_year_id &&
            e.exception_date === cursor &&
            e.exception_type === 'period_cancellation' &&
            (!e.student_id || e.student_id === studentId)
        ).length;
        total += Math.max(0, settings.period_count - cancelledCount);
      }
    }
    cursor = addDays(cursor, 1);
  }
  return total;
}
