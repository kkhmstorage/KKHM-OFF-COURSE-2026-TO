import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Lock,
  Save,
  Send,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  addDays,
  buildUnitSpecForDate,
  checkSequentialLock,
  DAY_NAMES,
  formatDateTimeIST,
  formatDateWithDay,
  formatDisplayDate,
  getDayWorkingStatus,
  getEffectiveDaySlots,
  getTodayIST,
  getWeekDates,
  getWeekStart,
} from '../../lib/dateUtils';
import { dataService } from '../../services/dataService';
import type { PeriodActivityStatus } from '../../types/domain';
import { EmptyState, PageHeader, StatCard, StatusLabel } from '../ui/CommonUI';

function useStudentScope() {
  const { db, session, activeYear, activeYearSettings } = useApp();
  return useMemo(() => {
    if (!db || !session?.student || !activeYear) return null;
    const student = session.student;
    const yearId = activeYear.id;

    const enrollment = db.student_academic_enrollments.find(
      (e) => e.student_id === student.id && e.academic_year_id === yearId
    );
    const mentorAssign = db.mentor_assignments.find(
      (ma) => ma.student_id === student.id && ma.academic_year_id === yearId && ma.is_active
    );
    const mentor = db.mentors.find((m) => m.id === mentorAssign?.mentor_id);
    const mentorProfile = db.profiles.find((p) => p.id === mentor?.profile_id);

    const activeSemester =
      db.semesters.find((s) => s.academic_year_id === yearId && s.status === 'active') ||
      db.semesters.find((s) => s.academic_year_id === yearId);

    const ttAssign = db.student_timetable_assignments.find(
      (a) => a.student_id === student.id && a.academic_year_id === yearId && a.is_active
    );
    const template = db.timetable_templates.find((t) => t.id === ttAssign?.template_id);
    const templateSlots = ttAssign
      ? db.timetable_slots.filter((s) => s.template_id === ttAssign.template_id)
      : [];

    const submissions = db.report_submissions
      .filter((s) => s.student_id === student.id && s.academic_year_id === yearId)
      .sort((a, b) => b.start_date.localeCompare(a.start_date));

    const entries = db.period_activity_entries.filter(
      (pe) => pe.student_id === student.id && pe.academic_year_id === yearId
    );

    return {
      student,
      enrollment,
      mentorProfile,
      activeSemester,
      template,
      templateSlots,
      submissions,
      entries,
      yearSettings: activeYearSettings,
    };
  }, [db, session, activeYear, activeYearSettings]);
}

export const StudentDashboard: React.FC = () => {
  const { db, session, activeYear, navigate } = useApp();
  const scope = useStudentScope();
  const today = getTodayIST();

  if (!db || !session || !activeYear || !scope) return null;

  if (!scope.enrollment) {
    return (
      <div>
        <PageHeader title="Student Dashboard" subtitle={`Academic Year ${activeYear.name}`} />
        <EmptyState
          title={`Not Enrolled in ${activeYear.name}`}
          description="You do not have an academic enrollment in the currently selected academic year. Use Academic History to browse your enrolled years."
          action={
            <button
              type="button"
              onClick={() => navigate('academic-history')}
              className="rounded-lg bg-[#1E3A5F] px-4 py-2 text-xs font-semibold text-white cursor-pointer"
            >
              View Academic History
            </button>
          }
        />
      </div>
    );
  }

  const todayStatus = getDayWorkingStatus(today, scope.yearSettings, db.academic_calendar_exceptions);
  const todaySlots = todayStatus.isWorking
    ? getEffectiveDaySlots(
        today,
        scope.student.id,
        scope.templateSlots,
        db.timetable_overrides,
        db.academic_calendar_exceptions,
        scope.yearSettings
      )
    : [];

  const returnedEntries = scope.entries.filter((e) => e.approval_status === 'returned');
  const approvedEntries = scope.entries.filter((e) => e.approval_status === 'approved');
  const pendingEntries = scope.entries.filter(
    (e) => e.approval_status === 'pending' && e.activity_status !== 'cancelled'
  );
  const returnedSub = scope.submissions.find((s) => s.status === 'returned');

  return (
    <div>
      <PageHeader
        title={`Welcome, ${session.profile.full_name}`}
        subtitle={`Admission: ${scope.student.admission_number} · ${scope.enrollment.class_batch} · Mentor: ${
          scope.mentorProfile?.full_name || 'Unassigned'
        } · ${scope.activeSemester?.name || activeYear.name}`}
        actions={
          <button
            type="button"
            onClick={() =>
              navigate(
                'reporting',
                returnedSub ? { date: returnedSub.start_date } : { date: today }
              )
            }
            className="rounded-lg bg-[#1E3A5F] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#162C49] cursor-pointer"
          >
            {returnedSub ? 'Fix Returned Period' : 'Record Activities'}
          </button>
        }
      />

      {returnedSub && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs text-red-900">
            <AlertCircle className="h-4 w-4 text-red-700 shrink-0 mt-0.5" />
            <div>
              <strong>Action Required:</strong> Your mentor returned {returnedEntries.length} period(s) in{' '}
              <span className="font-mono">{returnedSub.unit_key}</span> for correction. Please revise and resubmit to unlock upcoming reporting days.
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('reporting', { date: returnedSub.start_date })}
            className="rounded-lg bg-red-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-700 shrink-0 cursor-pointer"
          >
            Open Returned Report
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Today's Date (IST)"
          value={formatDisplayDate(today)}
          helper={todayStatus.isWorking ? `${todaySlots.filter((s) => !s.is_cancelled).length} scheduled periods` : todayStatus.reason}
        />
        <StatCard
          label="Approved Periods"
          value={approvedEntries.length}
          helper={`Verified in ${activeYear.name}`}
          tone="success"
        />
        <StatCard
          label="Pending Review"
          value={pendingEntries.length}
          helper="Waiting for mentor check"
          tone="warning"
        />
        <StatCard
          label="Returned for Correction"
          value={returnedEntries.length}
          helper="Needs your revision"
          tone={returnedEntries.length > 0 ? 'danger' : 'default'}
          onClick={returnedSub ? () => navigate('reporting', { date: returnedSub.start_date }) : undefined}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Today's Timetable */}
        <section className="lg:col-span-7 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Today&apos;s Scheduled Timetable</h2>
              <p className="text-xs text-slate-500 mt-0.5">{formatDateWithDay(today)}</p>
            </div>
            <button
              type="button"
              onClick={() => navigate('reporting', { date: today })}
              className="text-xs font-semibold text-[#1E3A5F] hover:underline cursor-pointer"
            >
              Open Reporting Form
            </button>
          </div>

          {!todayStatus.isWorking ? (
            <div className="p-8 text-center text-xs text-slate-600">
              <strong>Non-Working Day:</strong> {todayStatus.reason}. No activity report is required today.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {todaySlots.map((slot) => (
                <div key={slot.period_number} className="px-5 py-3 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono font-semibold text-[#1E3A5F] w-14 shrink-0">
                      Period {slot.period_number}
                    </span>
                    <div className="min-w-0">
                      <div className={`font-medium truncate ${slot.is_cancelled ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                        {slot.planned_activity}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500">
                        {slot.start_time} – {slot.end_time}
                        {slot.is_cancelled ? ` · Cancelled: ${slot.cancellation_reason}` : ''}
                      </div>
                    </div>
                  </div>
                  {slot.is_cancelled && <StatusLabel status="cancelled" />}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent Reports */}
        <section className="lg:col-span-5 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Recent Submissions</h2>
            <button
              type="button"
              onClick={() => navigate('my-reports')}
              className="text-xs font-semibold text-[#1E3A5F] hover:underline cursor-pointer"
            >
              View All
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {scope.submissions.slice(0, 6).map((sub) => (
              <div key={sub.id} className="px-5 py-3 flex items-center justify-between gap-3 text-xs">
                <div>
                  <div className="font-mono font-semibold text-slate-900">
                    {sub.approval_mode_snapshot === 'weekly'
                      ? `Week of ${formatDisplayDate(sub.start_date)}`
                      : formatDateWithDay(sub.start_date)}
                  </div>
                  <div className="text-[11px] text-slate-500 capitalize">
                    {sub.entry_mode_snapshot} entry · {sub.approval_mode_snapshot} approval
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <StatusLabel status={sub.status} />
                  <button
                    type="button"
                    onClick={() => navigate('reporting', { date: sub.start_date })}
                    className="text-xs font-semibold text-[#1E3A5F] hover:underline cursor-pointer"
                  >
                    Open
                  </button>
                </div>
              </div>
            ))}
            {!scope.submissions.length && (
              <div className="p-8 text-center text-xs text-slate-500">
                No reports started in {activeYear.name} yet.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export const StudentTimetableView: React.FC = () => {
  const { db, activeYear } = useApp();
  const scope = useStudentScope();
  if (!db || !activeYear || !scope) return null;

  const workingDays = scope.yearSettings?.working_days || [1, 2, 3, 4, 5, 6];
  const periodCount = scope.yearSettings?.period_count || 8;
  const upcomingExceptions = db.academic_calendar_exceptions
    .filter((e) => e.academic_year_id === activeYear.id)
    .slice(0, 6);

  return (
    <div>
      <PageHeader
        title="My Weekly Timetable"
        subtitle={
          scope.template
            ? `${scope.template.name} (Revision ${scope.template.revision}) · ${activeYear.name}`
            : `Academic Year ${activeYear.name}`
        }
      />

      {!scope.templateSlots.length ? (
        <EmptyState
          title="No Timetable Assigned"
          description="Your administrator has not assigned a weekly timetable for this academic year yet."
        />
      ) : (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-3 font-semibold min-w-[110px]">Day</th>
                  {Array.from({ length: periodCount }, (_, idx) => (
                    <th key={idx} className="px-3 py-3 font-semibold min-w-[140px]">
                      Period {idx + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {workingDays.map((day) => (
                  <tr key={day} className="hover:bg-slate-50/70">
                    <td className="px-3 py-3 font-semibold text-slate-900">
                      <div>{DAY_NAMES[day]?.full}</div>
                      <div className="text-[11px] font-normal text-slate-500">{DAY_NAMES[day]?.ml}</div>
                    </td>
                    {Array.from({ length: periodCount }, (_, idx) => {
                      const sl = scope.templateSlots.find(
                        (s) => s.day_of_week === day && s.period_number === idx + 1
                      );
                      return (
                        <td key={idx} className="px-3 py-3 align-top">
                          <div className="font-medium text-slate-800">{sl?.planned_activity || '—'}</div>
                          {sl && (
                            <div className="text-[10px] font-mono text-slate-500 mt-0.5">
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

          {upcomingExceptions.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-900 mb-3">
                College Holidays &amp; Cancelled Periods ({activeYear.name})
              </h2>
              <div className="divide-y divide-slate-100 text-xs">
                {upcomingExceptions.map((exc) => (
                  <div key={exc.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-mono font-semibold text-[#1E3A5F]">
                        {formatDateWithDay(exc.exception_date)}
                      </span>
                      <span className="mx-2 text-slate-300">·</span>
                      <span className="font-medium text-slate-900">{exc.title}</span>
                    </div>
                    <span className="text-slate-500 capitalize">
                      {exc.exception_type.replace(/_/g, ' ')}
                      {exc.period_number ? ` (Period ${exc.period_number})` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};

interface DraftPeriodForm {
  actual_activity: string;
  activity_status: PeriodActivityStatus;
  optional_notes: string;
}

export const StudentActivityReporting: React.FC = () => {
  const { db, session, activeYear, routePayload, refresh, notify } = useApp();
  const scope = useStudentScope();

  const [selectedDate, setSelectedDate] = useState<string>(routePayload.date || getTodayIST());
  const [formMap, setFormMap] = useState<Record<string, DraftPeriodForm>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (routePayload.date) {
      setSelectedDate(routePayload.date);
    }
  }, [routePayload.date]);

  const entryMode = scope?.yearSettings?.entry_mode || 'daily';
  const approvalMode = scope?.yearSettings?.approval_mode || 'daily';
  const weekStart = getWeekStart(selectedDate, scope?.yearSettings?.week_start_day || 1);
  const weekDates = getWeekDates(weekStart);

  // Determine existing submission covering selectedDate to preserve historical mode snapshots!
  const existingSubForDate = useMemo(() => {
    if (!scope) return undefined;
    return scope.submissions.find(
      (s) => s.start_date <= selectedDate && s.end_date >= selectedDate
    );
  }, [scope, selectedDate]);

  const effectiveApprovalMode = existingSubForDate?.approval_mode_snapshot || approvalMode;
  const effectiveEntryMode = existingSubForDate?.entry_mode_snapshot || entryMode;

  const workingDatesInWeek = useMemo(() => {
    if (!db || !scope) return [];
    return weekDates.filter(
      (d) => getDayWorkingStatus(d, scope.yearSettings, db.academic_calendar_exceptions).isWorking
    );
  }, [db, scope, weekDates.join(',')]);

  // Dates displayed for editing right now (all working days in week if Weekly Entry + Weekly Approval, else selectedDate)
  const visibleDates = useMemo(() => {
    if (effectiveEntryMode === 'weekly' && effectiveApprovalMode === 'weekly') {
      return workingDatesInWeek;
    }
    return [selectedDate];
  }, [effectiveEntryMode, effectiveApprovalMode, workingDatesInWeek, selectedDate]);

  // Hydrate form inputs from persisted backend period entries
  useEffect(() => {
    if (!db || !scope) return;
    const next: Record<string, DraftPeriodForm> = {};
    for (const d of visibleDates) {
      const slots = getEffectiveDaySlots(
        d,
        scope.student.id,
        scope.templateSlots,
        db.timetable_overrides,
        db.academic_calendar_exceptions,
        scope.yearSettings
      );
      for (const sl of slots) {
        const key = `${d}__${sl.period_number}`;
        const existing = scope.entries.find(
          (pe) => pe.activity_date === d && pe.period_number === sl.period_number
        );
        next[key] = {
          actual_activity: existing?.actual_activity || '',
          activity_status: sl.is_cancelled
            ? 'cancelled'
            : existing?.activity_status || 'completed',
          optional_notes: existing?.optional_notes || '',
        };
      }
    }
    setFormMap(next);
  }, [db, scope, visibleDates.join(',')]);

  if (!db || !session || !activeYear || !scope) return null;

  if (!scope.enrollment) {
    return (
      <EmptyState
        title={`Not Enrolled in ${activeYear.name}`}
        description="Activity reporting is available only for academic years in which you are enrolled."
      />
    );
  }

  const unitSpec = buildUnitSpecForDate(
    selectedDate,
    effectiveApprovalMode,
    scope.yearSettings,
    db.academic_calendar_exceptions
  );

  const lockState = checkSequentialLock({
    targetUnit: unitSpec,
    studentId: scope.student.id,
    academicYear: activeYear,
    settings: scope.yearSettings,
    exceptions: db.academic_calendar_exceptions,
    existingSubmissions: scope.submissions,
  });

  const dayWorkStatus = getDayWorkingStatus(
    selectedDate,
    scope.yearSettings,
    db.academic_calendar_exceptions
  );

  const isReadOnlyUnit =
    lockState.isLocked ||
    activeYear.status === 'closed' ||
    existingSubForDate?.status === 'approved';

  const handleSaveOrSubmit = async (submit: boolean) => {
    setSaving(true);
    try {
      const entriesPayload: {
        activity_date: string;
        period_number: number;
        planned_activity_snapshot: string;
        actual_activity: string;
        activity_status: PeriodActivityStatus;
        optional_notes?: string;
      }[] = [];

      for (const d of visibleDates) {
        const st = getDayWorkingStatus(d, scope.yearSettings, db.academic_calendar_exceptions);
        if (!st.isWorking) continue;
        const slots = getEffectiveDaySlots(
          d,
          scope.student.id,
          scope.templateSlots,
          db.timetable_overrides,
          db.academic_calendar_exceptions,
          scope.yearSettings
        );
        for (const sl of slots) {
          const key = `${d}__${sl.period_number}`;
          const f = formMap[key];
          entriesPayload.push({
            activity_date: d,
            period_number: sl.period_number,
            planned_activity_snapshot: sl.planned_activity,
            actual_activity: sl.is_cancelled ? '' : f?.actual_activity || '',
            activity_status: sl.is_cancelled ? 'cancelled' : f?.activity_status || 'completed',
            optional_notes: f?.optional_notes || '',
          });
        }
      }

      await dataService.saveAndOptionallySubmitPeriods(session.profile, {
        student_id: scope.student.id,
        academic_year_id: activeYear.id,
        anchor_date: selectedDate,
        entries: entriesPayload,
        submit,
      });
      await refresh();
      notify(
        'success',
        submit
          ? effectiveApprovalMode === 'weekly'
            ? 'Weekly activity report submitted for mentor approval.'
            : 'Daily activity report submitted for mentor approval.'
          : 'Draft saved securely.'
      );
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to save activity report.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Activity Reporting"
        subtitle={`Active Workflow: ${
          effectiveEntryMode === 'weekly' ? 'Weekly Entry' : 'Daily Entry'
        } + ${
          effectiveApprovalMode === 'weekly' ? 'Weekly Approval' : 'Daily Approval'
        } · Supports English & മലയാളം`}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setSelectedDate(addDays(selectedDate, effectiveEntryMode === 'weekly' ? -7 : -1))
              }
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 cursor-pointer"
              aria-label="Previous date or week"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono font-semibold text-slate-900"
            />
            <button
              type="button"
              onClick={() =>
                setSelectedDate(addDays(selectedDate, effectiveEntryMode === 'weekly' ? 7 : 1))
              }
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 cursor-pointer"
              aria-label="Next date or week"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        }
      />

      {/* Weekly Navigation Strip (Shown in Weekly Entry Mode OR Weekly Approval Mode) */}
      {(effectiveEntryMode === 'weekly' || effectiveApprovalMode === 'weekly') && (
        <div className="mb-5 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5 text-xs">
            <span className="font-semibold text-slate-900">
              Week of {formatDisplayDate(weekStart)} – {formatDisplayDate(weekDates[6])}
            </span>
            <span className="text-slate-500">
              {effectiveApprovalMode === 'daily'
                ? 'Weekly Interface · Independent Daily Approval Units'
                : 'Weekly Approval Unit · Save daily drafts, then submit complete week'}
            </span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-7 gap-1.5">
            {weekDates.map((d) => {
              const st = getDayWorkingStatus(d, scope.yearSettings, db.academic_calendar_exceptions);
              const sub = scope.submissions.find((s) => s.start_date <= d && s.end_date >= d);
              const isSelected = d === selectedDate;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSelectedDate(d)}
                  className={`rounded-lg border px-2 py-2 text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'border-[#1E3A5F] bg-[#1E3A5F] text-white'
                      : !st.isWorking
                        ? 'border-slate-100 bg-slate-50 text-slate-400'
                        : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-[11px] font-semibold">
                    {DAY_NAMES[new Date(`${d}T00:00:00Z`).getUTCDay() || 7]?.short}
                  </div>
                  <div className="text-[11px] font-mono opacity-80">{d.slice(5)}</div>
                  <div className="text-[10px] mt-1 truncate">
                    {!st.isWorking ? 'Off/Hol' : sub ? sub.status.replace('_', ' ') : 'Open'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Sequential Lock Warning */}
      {lockState.isLocked && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Lock className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-950 leading-relaxed">
              <div className="text-sm font-semibold">Reporting Unit Locked</div>
              <p className="mt-1">{lockState.reason}</p>
            </div>
          </div>
          {lockState.blockingUnitKey && (
            <button
              type="button"
              onClick={() =>
                setSelectedDate(lockState.blockingUnitKey!.replace(/^WEEK-/, ''))
              }
              className="rounded-lg bg-amber-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-amber-800 shrink-0 cursor-pointer"
            >
              Go to {lockState.blockingLabel}
            </button>
          )}
        </div>
      )}

      {/* Non-working day / Holiday Banner (in Daily view) */}
      {visibleDates.length === 1 && !dayWorkStatus.isWorking && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <Calendar className="h-8 w-8 text-slate-400 mx-auto" />
          <h3 className="mt-3 text-sm font-semibold text-slate-900">
            {formatDateWithDay(selectedDate)} — Non-Working Day
          </h3>
          <p className="mt-1 text-xs text-slate-600">
            {dayWorkStatus.reason}. No student activity report is required for this date.
          </p>
        </div>
      )}

      {/* Period-wise Activity Entry Cards */}
      {visibleDates.some(
        (d) => getDayWorkingStatus(d, scope.yearSettings, db.academic_calendar_exceptions).isWorking
      ) && (
        <div className="space-y-6">
          {/* Submission Unit Status Header */}
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs">
              <span className="font-semibold text-slate-900">
                {effectiveApprovalMode === 'weekly'
                  ? `Weekly Unit: ${formatDisplayDate(unitSpec.start_date)} – ${formatDisplayDate(unitSpec.end_date)}`
                  : `Daily Unit: ${formatDateWithDay(selectedDate)}`}
              </span>
              <span className="mx-2 text-slate-300">·</span>
              <StatusLabel status={existingSubForDate?.status || 'not_started'} />
            </div>

            {!isReadOnlyUnit && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSaveOrSubmit(false)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                >
                  <Save className="h-3.5 w-3.5" /> Save Draft
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSaveOrSubmit(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1E3A5F] px-4 py-2 text-xs font-semibold text-white hover:bg-[#162C49] disabled:opacity-50 cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5" />
                  {existingSubForDate?.status === 'returned'
                    ? 'Resubmit Corrected Report'
                    : effectiveApprovalMode === 'weekly'
                      ? 'Submit Weekly Report'
                      : 'Submit Daily Report'}
                </button>
              </div>
            )}
          </div>

          {visibleDates.map((d) => {
            const st = getDayWorkingStatus(d, scope.yearSettings, db.academic_calendar_exceptions);
            if (!st.isWorking) return null;
            const slots = getEffectiveDaySlots(
              d,
              scope.student.id,
              scope.templateSlots,
              db.timetable_overrides,
              db.academic_calendar_exceptions,
              scope.yearSettings
            );

            return (
              <section key={d} className="space-y-3">
                <h2 className="text-sm font-bold text-slate-900 px-1">
                  {formatDateWithDay(d)}
                </h2>

                {slots.map((slot) => {
                  const key = `${d}__${slot.period_number}`;
                  const persisted = scope.entries.find(
                    (pe) => pe.activity_date === d && pe.period_number === slot.period_number
                  );
                  const formVal = formMap[key] || {
                    actual_activity: '',
                    activity_status: slot.is_cancelled ? 'cancelled' : 'completed',
                    optional_notes: '',
                  };
                  const isApproved = persisted?.approval_status === 'approved';
                  const isReturned = persisted?.approval_status === 'returned';
                  const periodDisabled =
                    isReadOnlyUnit ||
                    slot.is_cancelled ||
                    isApproved ||
                    (existingSubForDate?.status === 'pending_review' && !isReturned) ||
                    (existingSubForDate?.status === 'partially_reviewed' && !isReturned);

                  return (
                    <div
                      key={key}
                      className={`rounded-xl border bg-white p-4 sm:p-5 ${
                        isReturned
                          ? 'border-red-300 bg-red-50/20'
                          : isApproved
                            ? 'border-emerald-200 bg-emerald-50/15'
                            : 'border-slate-200'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-mono font-bold text-[#1E3A5F]">
                              Period {slot.period_number}
                            </span>
                            <span className="text-slate-300">·</span>
                            <span className="font-semibold text-slate-900">
                              {persisted?.planned_activity_snapshot || slot.planned_activity}
                            </span>
                            <span className="font-mono text-[11px] text-slate-500">
                              ({slot.start_time}–{slot.end_time})
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {slot.is_cancelled ? (
                            <StatusLabel status="cancelled" />
                          ) : persisted ? (
                            <StatusLabel status={persisted.approval_status} />
                          ) : (
                            <StatusLabel status="draft" />
                          )}
                        </div>
                      </div>

                      {isReturned && persisted?.mentor_comment && (
                        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-900">
                          <strong>Mentor Correction Note:</strong> {persisted.mentor_comment}
                        </div>
                      )}

                      {slot.is_cancelled ? (
                        <p className="mt-3 text-xs text-slate-500">
                          Cancelled by Administrator: {slot.cancellation_reason}. Not required for submission.
                        </p>
                      ) : (
                        <div className="mt-3 space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                            <div className="sm:col-span-4">
                              <label className="block text-xs font-semibold text-slate-700">
                                Activity Status
                              </label>
                              <select
                                disabled={periodDisabled}
                                value={formVal.activity_status}
                                onChange={(e) =>
                                  setFormMap((prev) => ({
                                    ...prev,
                                    [key]: {
                                      ...formVal,
                                      activity_status: e.target.value as PeriodActivityStatus,
                                    },
                                  }))
                                }
                                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-xs disabled:bg-slate-50 disabled:text-slate-500"
                              >
                                <option value="completed">Completed</option>
                                <option value="no_activity">No Activity – Reason Required</option>
                                <option value="absent">Absent / Unable to Participate – Reason Required</option>
                              </select>
                            </div>
                            <div className="sm:col-span-8">
                              <label className="block text-xs font-semibold text-slate-700">
                                Optional Notes (Book Ref / Lab Task)
                              </label>
                              <input
                                type="text"
                                disabled={periodDisabled}
                                value={formVal.optional_notes}
                                onChange={(e) =>
                                  setFormMap((prev) => ({
                                    ...prev,
                                    [key]: { ...formVal, optional_notes: e.target.value },
                                  }))
                                }
                                placeholder="Optional reference notes..."
                                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-xs disabled:bg-slate-50"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700">
                              {formVal.activity_status === 'completed'
                                ? 'Actual Activity Description (English or മലയാളം) *'
                                : 'Reason Required (English or മലയാളം) *'}
                            </label>
                            <textarea
                              rows={3}
                              disabled={periodDisabled}
                              value={formVal.actual_activity}
                              onChange={(e) =>
                                setFormMap((prev) => ({
                                  ...prev,
                                  [key]: { ...formVal, actual_activity: e.target.value },
                                }))
                              }
                              placeholder="Record what you actually studied or completed during this period..."
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 leading-relaxed focus:border-[#1E3A5F] focus:outline-none disabled:bg-slate-50 disabled:text-slate-600"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            );
          })}

          {!isReadOnlyUnit && (
            <div className="flex flex-wrap items-center justify-end gap-3 pt-2 pb-6">
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSaveOrSubmit(false)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <Save className="h-4 w-4" /> Save Draft
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSaveOrSubmit(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#1E3A5F] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#162C49] cursor-pointer"
              >
                <Send className="h-4 w-4" />
                {existingSubForDate?.status === 'returned'
                  ? 'Resubmit Corrected Report'
                  : effectiveApprovalMode === 'weekly'
                    ? 'Submit Weekly Report'
                    : 'Submit Daily Report'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const StudentMyReportsView: React.FC = () => {
  const { activeYear, navigate } = useApp();
  const scope = useStudentScope();
  if (!activeYear || !scope) return null;

  return (
    <div>
      <PageHeader
        title="My Activity Reports"
        subtitle={`All submitted, draft, returned, and approved reports for Academic Year ${activeYear.name}.`}
      />

      {!scope.submissions.length ? (
        <EmptyState
          title="No Reports Recorded Yet"
          description="Open Activity Reporting to start logging your daily or weekly periods."
          action={
            <button
              type="button"
              onClick={() => navigate('reporting')}
              className="rounded-lg bg-[#1E3A5F] px-4 py-2 text-xs font-semibold text-white cursor-pointer"
            >
              Start Activity Reporting
            </button>
          }
        />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold">Reporting Unit</th>
                <th className="px-4 py-3 font-semibold">Workflow Snapshot</th>
                <th className="px-4 py-3 font-semibold">Approved / Total</th>
                <th className="px-4 py-3 font-semibold">Submitted At</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {scope.submissions.map((sub) => {
                const subEntries = scope.entries.filter(
                  (e) => e.submission_id === sub.id && e.activity_status !== 'cancelled'
                );
                const appr = subEntries.filter((e) => e.approval_status === 'approved').length;
                return (
                  <tr key={sub.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono font-semibold text-slate-900">
                      {sub.approval_mode_snapshot === 'weekly'
                        ? `Week of ${formatDisplayDate(sub.start_date)}`
                        : formatDateWithDay(sub.start_date)}
                    </td>
                    <td className="px-4 py-3 capitalize text-slate-600">
                      {sub.entry_mode_snapshot} / {sub.approval_mode_snapshot}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-700">
                      {appr} / {subEntries.length}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-500">
                      {formatDateTimeIST(sub.submitted_at)}
                    </td>
                    <td className="px-4 py-3"><StatusLabel status={sub.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => navigate('reporting', { date: sub.start_date })}
                        className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#1E3A5F] hover:bg-slate-50 cursor-pointer"
                      >
                        {sub.status === 'returned' ? 'Edit & Resubmit' : 'View'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export const StudentAcademicHistoryView: React.FC = () => {
  const { db, session } = useApp();
  const [selectedYearId, setSelectedYearId] = useState<string>('');

  if (!db || !session?.student) return null;
  const studentId = session.student.id;

  const years = db.academic_years;
  const effectiveYearId = selectedYearId || years[0]?.id || '';
  const year = years.find((y) => y.id === effectiveYearId);

  const enrollment = db.student_academic_enrollments.find(
    (e) => e.student_id === studentId && e.academic_year_id === effectiveYearId
  );
  const mentorAssign = db.mentor_assignments.find(
    (ma) => ma.student_id === studentId && ma.academic_year_id === effectiveYearId && ma.is_active
  );
  const mentor = db.mentors.find((m) => m.id === mentorAssign?.mentor_id);
  const mentorProfile = db.profiles.find((p) => p.id === mentor?.profile_id);

  const yearSemesters = db.semesters.filter((s) => s.academic_year_id === effectiveYearId);
  const selections = db.student_subject_selections.filter(
    (sel) => sel.student_id === studentId && sel.academic_year_id === effectiveYearId
  );
  const yearSubs = db.report_submissions.filter(
    (s) => s.student_id === studentId && s.academic_year_id === effectiveYearId
  );
  const yearEntries = db.period_activity_entries.filter(
    (pe) => pe.student_id === studentId && pe.academic_year_id === effectiveYearId
  );

  return (
    <div>
      <PageHeader
        title="Academic History (Read-Only Archive)"
        subtitle="Inspect your enrollment, assigned mentor, semester subject selections (Selected & Not Selected), and verified activity reports across all academic years."
      />

      <div className="flex flex-wrap gap-2 mb-6">
        {years.map((y) => (
          <button
            key={y.id}
            type="button"
            onClick={() => setSelectedYearId(y.id)}
            className={`rounded-lg border px-4 py-2 text-xs font-semibold cursor-pointer ${
              effectiveYearId === y.id
                ? 'border-[#1E3A5F] bg-[#1E3A5F] text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {y.name} ({y.status === 'open' ? 'Open' : 'Archived'})
          </button>
        ))}
      </div>

      {!enrollment ? (
        <EmptyState
          title={`No Enrollment Record in ${year?.name}`}
          description="You were not enrolled at KKHM Islamic & Arts College during this academic year."
        />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Enrollment Class / Batch" value={enrollment.class_batch} helper={`Enrolled: ${formatDisplayDate(enrollment.enrolled_at)}`} />
            <StatCard label="Assigned Mentor" value={mentorProfile?.full_name || 'Unassigned'} helper={year?.name} />
            <StatCard
              label="Verified Periods"
              value={yearEntries.filter((e) => e.approval_status === 'approved').length}
              helper={`Across ${yearSubs.length} report(s)`}
              tone="success"
            />
          </div>

          {/* Semester-wise Subject Selection History */}
          <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">
                Semester Subject Selection History ({year?.name})
              </h2>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Semester</th>
                  <th className="px-4 py-2.5 font-semibold">Subject</th>
                  <th className="px-4 py-2.5 font-semibold">Selection Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selections.map((sel) => {
                  const sem = yearSemesters.find((s) => s.id === sel.semester_id);
                  const sub = db.subjects.find((s) => s.id === sel.subject_id);
                  return (
                    <tr key={sel.id}>
                      <td className="px-4 py-2.5 font-medium text-slate-700">{sem?.name || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-900">
                        <span className="font-mono text-slate-500 mr-2">{sub?.code}</span>
                        {sub?.name}
                      </td>
                      <td className="px-4 py-2.5"><StatusLabel status={sel.selection_status} /></td>
                    </tr>
                  );
                })}
                {!selections.length && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                      No subject selections recorded for {year?.name}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          {/* Historical Activity Reports */}
          <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">
                Archived Activity Entries ({year?.name})
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Date &amp; Period</th>
                    <th className="px-4 py-2.5 font-semibold">Planned Snapshot</th>
                    <th className="px-4 py-2.5 font-semibold">Recorded Activity</th>
                    <th className="px-4 py-2.5 font-semibold">Mentor Comment</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {yearEntries.slice(0, 40).map((pe) => (
                    <tr key={pe.id} className="align-top">
                      <td className="px-4 py-3 font-mono whitespace-nowrap">
                        {pe.activity_date} · P{pe.period_number}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{pe.planned_activity_snapshot}</td>
                      <td className="px-4 py-3 text-slate-800 max-w-md">{pe.actual_activity}</td>
                      <td className="px-4 py-3 text-slate-600">{pe.mentor_comment || '—'}</td>
                      <td className="px-4 py-3"><StatusLabel status={pe.approval_status} /></td>
                    </tr>
                  ))}
                  {!yearEntries.length && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                        No historical activity entries recorded for {year?.name}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
