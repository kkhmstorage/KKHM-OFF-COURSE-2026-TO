import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Clock,
  Eye,
  MessageSquareWarning,
  RotateCcw,
  Search,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  DAY_NAMES,
  formatDateTimeIST,
  formatDateWithDay,
  formatDisplayDate,
  getTodayIST,
} from '../../lib/dateUtils';
import { dataService } from '../../services/dataService';
import { getStudentSubjects } from '../../lib/studentUtils';
import { EmptyState, Modal, PageHeader, StatCard, StatusLabel } from '../ui/CommonUI';

function useMentorScope() {
  const { db, session, activeYear } = useApp();
  return useMemo(() => {
    if (!db || !session?.mentor || !activeYear) {
      return {
        assignedStudents: [],
        assignedStudentIds: new Set<string>(),
        submissions: [],
        entries: [],
      };
    }
    const mentorId = session.mentor.id;
    const yearId = activeYear.id;
    const assignments = db.mentor_assignments.filter(
      (ma) => ma.mentor_id === mentorId && ma.academic_year_id === yearId && ma.is_active
    );
    const assignedStudentIds = new Set(assignments.map((a) => a.student_id));
    const assignedStudents = assignments
      .map((a) => {
        const stu = db.students.find((s) => s.id === a.student_id);
        const prof = db.profiles.find((p) => p.id === stu?.profile_id);
        const enr = db.student_academic_enrollments.find(
          (e) => e.student_id === a.student_id && e.academic_year_id === yearId
        );
        const subjects = stu ? getStudentSubjects(db, stu.id, yearId) : [];
        return stu && prof
          ? {
              student: stu,
              profile: prof,
              batch: enr?.class_batch || stu.batch_name,
              subjects,
              subjectsLabel: subjects.map((s) => s.name).join(', '),
              assignment: a,
            }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));

    const submissions = db.report_submissions
      .filter((s) => s.academic_year_id === yearId && assignedStudentIds.has(s.student_id))
      .sort((a, b) => b.start_date.localeCompare(a.start_date));

    const entries = db.period_activity_entries.filter(
      (pe) => pe.academic_year_id === yearId && assignedStudentIds.has(pe.student_id)
    );

    return { assignedStudents, assignedStudentIds, submissions, entries };
  }, [db, session, activeYear]);
}

export const MentorDashboard: React.FC = () => {
  const { activeYear, navigate } = useApp();
  const { assignedStudents, submissions, entries } = useMentorScope();
  const today = getTodayIST();

  if (!activeYear) return null;

  if (!assignedStudents.length) {
    return (
      <div>
        <PageHeader title="Mentor Dashboard" subtitle={`Academic Year ${activeYear.name}`} />
        <EmptyState
          title={`No Assigned Students in ${activeYear.name}`}
          description="You do not have any students assigned to you for the selected academic year. Contact the Administrator if mentor assignments are pending."
        />
      </div>
    );
  }

  const submittedTodayCount = new Set(
    submissions
      .filter(
        (s) =>
          s.status !== 'draft' &&
          s.status !== 'not_started' &&
          s.start_date <= today &&
          s.end_date >= today
      )
      .map((s) => s.student_id)
  ).size;

  const pendingSubs = submissions.filter(
    (s) => s.status === 'pending_review' || s.status === 'partially_reviewed'
  );
  const approvedSubs = submissions.filter((s) => s.status === 'approved');
  const returnedSubs = submissions.filter((s) => s.status === 'returned');
  const yetToSubmitCount = Math.max(0, assignedStudents.length - submittedTodayCount);

  return (
    <div>
      <PageHeader
        title="Mentor Verification Dashboard"
        subtitle={`Academic Year ${activeYear.name} · Monitoring ${assignedStudents.length} assigned student(s)`}
        actions={
          <button
            type="button"
            onClick={() => navigate('pending-approvals')}
            className="rounded-lg bg-[#1E3A5F] px-4 py-2 text-xs font-semibold text-white hover:bg-[#162C49] cursor-pointer"
          >
            Review Pending ({pendingSubs.length})
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Total Assigned Students"
          value={assignedStudents.length}
          helper={`Active in ${activeYear.name}`}
          onClick={() => navigate('my-students')}
        />
        <StatCard
          label="Submitted Today"
          value={submittedTodayCount}
          helper={`Date: ${formatDisplayDate(today)}`}
          tone="teal"
        />
        <StatCard
          label="Pending Approvals"
          value={pendingSubs.length}
          helper="Reports awaiting period verification"
          tone="warning"
          onClick={() => navigate('pending-approvals')}
        />
        <StatCard
          label="Approved Reports"
          value={approvedSubs.length}
          helper="Fully verified reporting units"
          tone="success"
          onClick={() => navigate('approved-reports')}
        />
        <StatCard
          label="Returned Reports"
          value={returnedSubs.length}
          helper="Waiting on student corrections"
          tone="danger"
          onClick={() => navigate('returned-reports')}
        />
        <StatCard
          label="Students Yet to Submit Today"
          value={yetToSubmitCount}
          helper="Assigned students without today's submission"
        />
      </div>

      {/* Quick Pending Review Queue */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Action Required — Pending Period Reviews</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Open any submission to inspect and approve or return individual periods.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Student</th>
                <th className="px-4 py-2.5 font-semibold">Reporting Unit</th>
                <th className="px-4 py-2.5 font-semibold">Pending / Total Periods</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold text-right">Review</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pendingSubs.map((sub) => {
                const st = assignedStudents.find((a) => a.student.id === sub.student_id);
                const subEntries = entries.filter(
                  (e) => e.submission_id === sub.id && e.activity_status !== 'cancelled'
                );
                const pendCnt = subEntries.filter((e) => e.approval_status === 'pending').length;
                return (
                  <tr key={sub.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{st?.profile.full_name}</div>
                      <div className="text-[11px] text-slate-500">
                        <span className="font-mono">{st?.student.admission_number}</span>
                        {st?.subjectsLabel ? (
                          <span className="text-teal-700 font-medium"> · {st.subjectsLabel}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-700">
                      {sub.approval_mode_snapshot === 'weekly'
                        ? `Week of ${formatDisplayDate(sub.start_date)}`
                        : formatDateWithDay(sub.start_date)}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-amber-700 font-semibold">
                      {pendCnt} / {subEntries.length} pending
                    </td>
                    <td className="px-4 py-3"><StatusLabel status={sub.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => navigate('pending-approvals', { submissionId: sub.id })}
                        className="rounded-md bg-[#1E3A5F] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#162C49] cursor-pointer"
                      >
                        Review Periods
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!pendingSubs.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-emerald-700">
                    All submitted reports from your assigned students have been reviewed.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export const MentorStudentsView: React.FC = () => {
  const { db, activeYear, navigate } = useApp();
  const { assignedStudents, submissions, entries } = useMentorScope();
  const [search, setSearch] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<
    'overview' | 'timetable' | 'today' | 'weekly' | 'history' | 'progress'
  >('overview');

  if (!db || !activeYear) return null;

  const today = getTodayIST();
  const filtered = assignedStudents.filter((item) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      item.profile.full_name.toLowerCase().includes(q) ||
      item.student.admission_number.toLowerCase().includes(q) ||
      item.batch.toLowerCase().includes(q) ||
      item.subjectsLabel.toLowerCase().includes(q)
    );
  });

  const detailItem = assignedStudents.find((a) => a.student.id === selectedStudentId);

  if (detailItem) {
    const stSubs = submissions.filter((s) => s.student_id === detailItem.student.id);
    const stEntries = entries.filter(
      (e) => e.student_id === detailItem.student.id && e.activity_status !== 'cancelled'
    );
    const approvedCnt = stEntries.filter((e) => e.approval_status === 'approved').length;
    const pendingCnt = stEntries.filter((e) => e.approval_status === 'pending').length;
    const returnedCnt = stEntries.filter((e) => e.approval_status === 'returned').length;

    const ttAssign = db.student_timetable_assignments.find(
      (a) =>
        a.student_id === detailItem.student.id &&
        a.academic_year_id === activeYear.id &&
        a.is_active
    );
    const ttSlots = ttAssign
      ? db.timetable_slots.filter((s) => s.template_id === ttAssign.template_id)
      : [];

    return (
      <div>
        <button
          type="button"
          onClick={() => setSelectedStudentId(null)}
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#1E3A5F] hover:underline cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to My Students
        </button>

        <PageHeader
          title={detailItem.profile.full_name}
          subtitle={`${detailItem.student.admission_number} · ${detailItem.batch}${
            detailItem.subjectsLabel ? ` · Subject: ${detailItem.subjectsLabel}` : ''
          } · Academic Year ${activeYear.name}`}
        />

        <div className="inline-flex flex-wrap gap-1 rounded-lg bg-slate-200/70 p-1 mb-6">
          {(
            [
              ['overview', 'Overview'],
              ['timetable', 'Timetable'],
              ['today', "Today's Reports"],
              ['weekly', 'Weekly Reports'],
              ['history', 'Activity History'],
              ['progress', 'Progress Summary'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setDetailTab(k)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                detailTab === k ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {detailTab === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard label="Approved Periods" value={approvedCnt} tone="success" />
              <StatCard label="Pending Review Periods" value={pendingCnt} tone="warning" />
              <StatCard label="Returned Periods" value={returnedCnt} tone="danger" />
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-xs font-semibold text-slate-900 mb-2">
                Selected Subject(s) — {activeYear.name}
              </div>
              {detailItem.subjects.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {detailItem.subjects.map((sub) => (
                    <div key={sub.id} className="py-2 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-semibold text-teal-800">{sub.name}</span>
                        <span className="ml-2 font-mono text-[11px] text-slate-500">{sub.code}</span>
                      </div>
                      <span className="text-[11px] text-slate-500">{sub.category}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  No subject selected yet for this student in {activeYear.name}.
                </p>
              )}
            </div>
          </div>
        )}

        {detailTab === 'timetable' && (
          <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
            {!ttSlots.length ? (
              <div className="p-8 text-center text-xs text-slate-500">No timetable assigned yet.</div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Day</th>
                    {Array.from({ length: 8 }, (_, i) => (
                      <th key={i} className="px-3 py-2.5 font-semibold">P{i + 1}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[1, 2, 3, 4, 5, 6].map((d) => (
                    <tr key={d}>
                      <td className="px-3 py-2.5 font-semibold">{DAY_NAMES[d].short}</td>
                      {Array.from({ length: 8 }, (_, i) => {
                        const sl = ttSlots.find((s) => s.day_of_week === d && s.period_number === i + 1);
                        return <td key={i} className="px-3 py-2.5 text-slate-600">{sl?.planned_activity || '—'}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {(detailTab === 'today' || detailTab === 'weekly' || detailTab === 'history') && (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">Reporting Unit</th>
                  <th className="px-4 py-3 font-semibold">Mode</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stSubs
                  .filter((s) =>
                    detailTab === 'today'
                      ? s.start_date <= today && s.end_date >= today
                      : detailTab === 'weekly'
                        ? s.approval_mode_snapshot === 'weekly' || stSubs.length > 0
                        : true
                  )
                  .map((sub) => (
                    <tr key={sub.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono font-medium">
                        {sub.approval_mode_snapshot === 'weekly'
                          ? `Week of ${formatDisplayDate(sub.start_date)}`
                          : formatDateWithDay(sub.start_date)}
                      </td>
                      <td className="px-4 py-3 capitalize text-slate-600">
                        {sub.entry_mode_snapshot} / {sub.approval_mode_snapshot}
                      </td>
                      <td className="px-4 py-3"><StatusLabel status={sub.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => navigate('pending-approvals', { submissionId: sub.id })}
                          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#1E3A5F] hover:bg-slate-50 cursor-pointer"
                        >
                          Inspect Periods
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {detailTab === 'progress' && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">Verification Progress</h3>
            <div className="text-xs text-slate-600">
              Total Logged Periods: <strong className="font-mono">{stEntries.length}</strong> · Approved:{' '}
              <strong className="font-mono text-emerald-700">{approvedCnt}</strong> · Pending:{' '}
              <strong className="font-mono text-amber-700">{pendingCnt}</strong> · Returned:{' '}
              <strong className="font-mono text-red-700">{returnedCnt}</strong>
            </div>
            <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-emerald-600"
                style={{
                  width: `${stEntries.length ? Math.round((approvedCnt / stEntries.length) * 100) : 0}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="My Assigned Students"
        subtitle={`Strictly scoped to students assigned to you for Academic Year ${activeYear.name}.`}
      />

      <div className="mb-4 max-w-sm relative">
        <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search student name, subject, admission no, batch..."
          className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-xs"
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold">Student Name</th>
                <th className="px-4 py-3 font-semibold">Subject</th>
                <th className="px-4 py-3 font-semibold">Admission No.</th>
                <th className="px-4 py-3 font-semibold">Class / Batch</th>
                <th className="px-4 py-3 font-semibold">Latest Report Status</th>
                <th className="px-4 py-3 font-semibold text-right">Pending Periods</th>
                <th className="px-4 py-3 font-semibold text-right">Approved Periods</th>
                <th className="px-4 py-3 font-semibold text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((item) => {
                const stSubs = submissions.filter((s) => s.student_id === item.student.id);
                const latestSub = stSubs[0];
                const stEntries = entries.filter(
                  (e) => e.student_id === item.student.id && e.activity_status !== 'cancelled'
                );
                const pend = stEntries.filter((e) => e.approval_status === 'pending').length;
                const appr = stEntries.filter((e) => e.approval_status === 'approved').length;
                return (
                  <tr key={item.student.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-semibold text-slate-900">{item.profile.full_name}</td>
                    <td className="px-4 py-3">
                      {item.subjectsLabel ? (
                        <span className="font-medium text-teal-800">{item.subjectsLabel}</span>
                      ) : (
                        <span className="text-slate-400">Not assigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-700">{item.student.admission_number}</td>
                    <td className="px-4 py-3 text-slate-600">{item.batch}</td>
                    <td className="px-4 py-3">
                      <StatusLabel status={latestSub?.status || 'not_started'} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-amber-700 font-semibold">
                      {pend}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700 font-semibold">
                      {appr}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedStudentId(item.student.id);
                          setDetailTab('overview');
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#1E3A5F] hover:bg-slate-50 cursor-pointer"
                      >
                        <Eye className="h-3.5 w-3.5" /> View
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                    No assigned students matched your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export const MentorReviewModule: React.FC<{
  filterMode: 'pending' | 'approved' | 'returned' | 'all';
}> = ({ filterMode }) => {
  const { db, session, activeYear, routePayload, refresh, notify, confirmAction } = useApp();
  const { assignedStudents, submissions, entries } = useMentorScope();

  const [activeSubmissionId, setActiveSubmissionId] = useState<string | null>(
    routePayload.submissionId || null
  );
  const [returningEntryId, setReturningEntryId] = useState<string | null>(null);
  const [returnComment, setReturnComment] = useState('');
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null);

  if (!db || !session || !activeYear) return null;

  const filteredSubmissions = submissions.filter((s) => {
    if (s.status === 'draft' || s.status === 'not_started') return false;
    if (filterMode === 'pending') {
      return s.status === 'pending_review' || s.status === 'partially_reviewed' || s.status === 'submitted';
    }
    if (filterMode === 'approved') return s.status === 'approved';
    if (filterMode === 'returned') return s.status === 'returned';
    return true;
  });

  const activeSub = submissions.find((s) => s.id === activeSubmissionId);

  const handleApprovePeriod = async (entryId: string) => {
    setBusyEntryId(entryId);
    try {
      await dataService.reviewPeriodEntry(session.profile, entryId, 'approved', 'Approved by mentor.');
      await refresh();
      notify('success', 'Period approved.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to approve period.');
    } finally {
      setBusyEntryId(null);
    }
  };

  const handleConfirmReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returningEntryId || !returnComment.trim()) return;
    setBusyEntryId(returningEntryId);
    try {
      await dataService.reviewPeriodEntry(session.profile, returningEntryId, 'returned', returnComment);
      await refresh();
      setReturningEntryId(null);
      setReturnComment('');
      notify('info', 'Period returned to student with correction comment.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to return period.');
    } finally {
      setBusyEntryId(null);
    }
  };

  if (activeSub) {
    const stInfo = assignedStudents.find((a) => a.student.id === activeSub.student_id);
    const subEntries = entries
      .filter((e) => e.submission_id === activeSub.id)
      .sort((a, b) => a.activity_date.localeCompare(b.activity_date) || a.period_number - b.period_number);

    const pendingRequiredCount = subEntries.filter(
      (e) => e.activity_status !== 'cancelled' && e.approval_status === 'pending'
    ).length;

    return (
      <div>
        <button
          type="button"
          onClick={() => setActiveSubmissionId(null)}
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#1E3A5F] hover:underline cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Reports List
        </button>

        <PageHeader
          title={`${stInfo?.profile.full_name || 'Student'} — ${
            activeSub.approval_mode_snapshot === 'weekly'
              ? `Week of ${formatDisplayDate(activeSub.start_date)}`
              : formatDateWithDay(activeSub.start_date)
          }`}
          subtitle={`Admission: ${stInfo?.student.admission_number || '—'}${
            stInfo?.subjectsLabel ? ` · Subject: ${stInfo.subjectsLabel}` : ''
          } · Mode: ${
            activeSub.entry_mode_snapshot
          } entry / ${activeSub.approval_mode_snapshot} approval · Student text is immutable during review.`}
          actions={
            <div className="flex items-center gap-3">
              <StatusLabel status={activeSub.status} />
              {pendingRequiredCount > 0 && activeYear.status === 'open' && (
                <button
                  type="button"
                  onClick={() =>
                    confirmAction({
                      title: `Approve All ${pendingRequiredCount} Pending Period(s)?`,
                      description:
                        'Confirm you have inspected every pending period below. Returned periods will not be affected.',
                      confirmLabel: 'Approve Pending Periods',
                      onConfirm: async () => {
                        const count = await dataService.bulkApprovePendingPeriods(
                          session.profile,
                          activeSub.id
                        );
                        await refresh();
                        notify('success', `Approved ${count} pending period(s).`);
                      },
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 cursor-pointer"
                >
                  <CheckCheck className="h-4 w-4" /> Approve All Pending ({pendingRequiredCount})
                </button>
              )}
            </div>
          }
        />

        <div className="space-y-3">
          {subEntries.map((entry) => {
            const reviewer = entry.reviewed_by
              ? db.profiles.find((p) => p.id === entry.reviewed_by)
              : undefined;
            const history = db.report_review_history.filter((h) => h.period_entry_id === entry.id);
            const isCancelled = entry.activity_status === 'cancelled';

            return (
              <article
                key={entry.id}
                className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-semibold text-[#1E3A5F]">
                        {formatDateWithDay(entry.activity_date)} · Period {entry.period_number}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="font-semibold text-slate-900">
                        {entry.planned_activity_snapshot}
                      </span>
                      <span className="text-slate-300">·</span>
                      <StatusLabel status={entry.activity_status} />
                      {!isCancelled && (
                        <>
                          <span className="text-slate-300">·</span>
                          <StatusLabel status={entry.approval_status} />
                        </>
                      )}
                    </div>

                    <div className="mt-3 rounded-lg bg-slate-50 border border-slate-200 p-3.5 text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                      {isCancelled
                        ? 'Period cancelled by College Administrator (not required).'
                        : entry.actual_activity || '(No description entered)'}
                    </div>

                    {entry.optional_notes && (
                      <div className="mt-2 text-xs text-slate-500">
                        <strong>Student Note:</strong> {entry.optional_notes}
                      </div>
                    )}

                    {entry.mentor_comment && (
                      <div className="mt-2.5 text-xs text-slate-600">
                        <strong>Mentor Comment:</strong> {entry.mentor_comment}
                        {reviewer && entry.reviewed_at && (
                          <span className="ml-2 text-slate-400">
                            — {reviewer.full_name} ({formatDateTimeIST(entry.reviewed_at)})
                          </span>
                        )}
                      </div>
                    )}

                    {history.length > 0 && (
                      <details className="mt-3 text-xs text-slate-500">
                        <summary className="cursor-pointer font-medium text-slate-600 hover:text-slate-900">
                          Review History ({history.length})
                        </summary>
                        <ul className="mt-2 space-y-1.5 pl-3 border-l border-slate-200">
                          {history.map((h) => (
                            <li key={h.id}>
                              <span className="font-semibold capitalize text-slate-700">{h.action}</span>{' '}
                              by {h.actor_name} · <span className="font-mono">{formatDateTimeIST(h.created_at)}</span>
                              {h.comment ? ` — "${h.comment}"` : ''}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>

                  {/* Individual Period Actions */}
                  {!isCancelled && activeYear.status === 'open' && (
                    <div className="flex sm:flex-col items-center sm:items-end gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={busyEntryId === entry.id || entry.approval_status === 'approved'}
                        onClick={() => handleApprovePeriod(entry.id)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-45 cursor-pointer min-w-[130px]"
                      >
                        <Check className="h-3.5 w-3.5" />
                        {entry.approval_status === 'approved' ? 'Approved' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        disabled={busyEntryId === entry.id}
                        onClick={() => {
                          setReturningEntryId(entry.id);
                          setReturnComment(entry.mentor_comment || '');
                        }}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-45 cursor-pointer min-w-[130px]"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Return
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        {/* Return for Correction Comment Modal */}
        <Modal
          open={Boolean(returningEntryId)}
          title="Return Period for Student Correction"
          subtitle="A clear correction comment (English or Malayalam) is mandatory."
          onClose={() => setReturningEntryId(null)}
          maxWidth="sm"
        >
          <form onSubmit={handleConfirmReturn} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Correction Comment *
              </label>
              <textarea
                rows={4}
                required
                value={returnComment}
                onChange={(e) => setReturnComment(e.target.value)}
                placeholder="Explain what the student needs to clarify or complete..."
                className="mt-1.5 w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-red-500 focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReturningEntryId(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!returnComment.trim() || Boolean(busyEntryId)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer"
              >
                <MessageSquareWarning className="h-4 w-4" /> Return Period
              </button>
            </div>
          </form>
        </Modal>
      </div>
    );
  }

  const pageTitles = {
    pending: { title: 'Pending Approvals', sub: 'Reports awaiting individual period verification.' },
    approved: { title: 'Approved Reports', sub: 'Fully approved student reporting units.' },
    returned: { title: 'Returned Reports', sub: 'Reports returned to students for correction.' },
    all: { title: 'Activity History', sub: 'Complete review archive for your assigned students.' },
  }[filterMode];

  return (
    <div>
      <PageHeader title={pageTitles.title} subtitle={`${pageTitles.sub} (${activeYear.name})`} />

      {!filteredSubmissions.length ? (
        <EmptyState
          title="No Reports in This View"
          description="Submitted reports from your assigned students matching this filter will appear here."
        />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">Student</th>
                  <th className="px-4 py-3 font-semibold">Reporting Unit</th>
                  <th className="px-4 py-3 font-semibold">Workflow</th>
                  <th className="px-4 py-3 font-semibold">Progress</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSubmissions.map((sub) => {
                  const st = assignedStudents.find((a) => a.student.id === sub.student_id);
                  const subEntries = entries.filter(
                    (e) => e.submission_id === sub.id && e.activity_status !== 'cancelled'
                  );
                  const appr = subEntries.filter((e) => e.approval_status === 'approved').length;
                  const ret = subEntries.filter((e) => e.approval_status === 'returned').length;
                  return (
                    <tr key={sub.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{st?.profile.full_name}</div>
                        <div className="text-[11px] text-slate-500">
                          <span className="font-mono">{st?.student.admission_number}</span>
                          {st?.subjectsLabel ? (
                            <span className="text-teal-700 font-medium"> · {st.subjectsLabel}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700">
                        {sub.approval_mode_snapshot === 'weekly'
                          ? `Week of ${formatDisplayDate(sub.start_date)}`
                          : formatDateWithDay(sub.start_date)}
                      </td>
                      <td className="px-4 py-3 capitalize text-slate-600">
                        {sub.approval_mode_snapshot} approval
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-slate-600">
                        {appr}/{subEntries.length} approved{ret > 0 ? ` · ${ret} returned` : ''}
                      </td>
                      <td className="px-4 py-3"><StatusLabel status={sub.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setActiveSubmissionId(sub.id)}
                          className="inline-flex items-center gap-1 rounded-md bg-[#1E3A5F] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#162C49] cursor-pointer"
                        >
                          <Clock className="h-3.5 w-3.5" /> Review
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
