import React, { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Printer } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  addDays,
  countExpectedPeriodsInRange,
  formatDisplayDate,
  getTodayIST,
  getWeekStart,
} from '../../lib/dateUtils';
import { downloadCsv, downloadExcel, triggerPrintReport } from '../../lib/exportUtils';
import { PageHeader, StatusLabel } from '../ui/CommonUI';

type ReportTab = 'weekly' | 'monthly' | 'semester' | 'students' | 'mentors' | 'detailed';

export const AdminReportsModule: React.FC = () => {
  const { db, activeYear, activeYearSettings, notify } = useApp();
  const [tab, setTab] = useState<ReportTab>('weekly');

  const [yearIdFilter, setYearIdFilter] = useState<string>('');
  const [semesterFilter, setSemesterFilter] = useState('all');
  const [batchFilter, setBatchFilter] = useState('all');
  const [mentorFilter, setMentorFilter] = useState('all');
  const [studentFilter, setStudentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState('all');

  const effectiveYearId = yearIdFilter || activeYear?.id || '';

  const reportData = useMemo(() => {
    if (!db || !effectiveYearId) return null;
    const year = db.academic_years.find((y) => y.id === effectiveYearId);
    const ys = db.academic_year_settings.find((s) => s.academic_year_id === effectiveYearId) || activeYearSettings;
    if (!year) return null;

    const enrollments = db.student_academic_enrollments.filter((e) => e.academic_year_id === effectiveYearId);
    const enrolledStudents = enrollments
      .map((e) => {
        const stu = db.students.find((s) => s.id === e.student_id);
        const prof = db.profiles.find((p) => p.id === stu?.profile_id);
        const ma = db.mentor_assignments.find(
          (m) => m.student_id === e.student_id && m.academic_year_id === effectiveYearId && m.is_active
        );
        return {
          studentId: e.student_id,
          fullName: prof?.full_name || 'Unknown',
          admission: stu?.admission_number || '—',
          batch: e.class_batch,
          mentorId: ma?.mentor_id || '',
        };
      })
      .filter((st) => {
        if (batchFilter !== 'all' && st.batch !== batchFilter) return false;
        if (mentorFilter !== 'all' && st.mentorId !== mentorFilter) return false;
        if (studentFilter !== 'all' && st.studentId !== studentFilter) return false;
        return true;
      });

    const allowedStudentIds = new Set(enrolledStudents.map((s) => s.studentId));
    const yearSubs = db.report_submissions.filter((s) => {
      if (s.academic_year_id !== effectiveYearId) return false;
      if (!allowedStudentIds.has(s.student_id)) return false;
      if (semesterFilter !== 'all' && s.semester_id !== semesterFilter) return false;
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      return true;
    });

    const submittedSubIds = new Set(
      yearSubs.filter((s) => s.status !== 'draft' && s.status !== 'not_started').map((s) => s.id)
    );

    const allEntries = db.period_activity_entries.filter((pe) => {
      if (pe.academic_year_id !== effectiveYearId) return false;
      if (!allowedStudentIds.has(pe.student_id)) return false;
      if (pe.activity_status === 'cancelled') return false;
      if (!submittedSubIds.has(pe.submission_id)) return false;
      if (monthFilter !== 'all' && !pe.activity_date.startsWith(monthFilter)) return false;
      return true;
    });

    const today = getTodayIST();
    const windowEnd = today < year.end_date ? today : year.end_date;
    const weekStart = getWeekStart(windowEnd, ys?.week_start_day || 1);
    const weekEnd = addDays(weekStart, 6);

    // 1. Weekly Overview
    const weekMap = new Map<string, { weekStart: string; expected: number; submitted: number; approved: number; pending: number; returned: number }>();
    const recordedWeeks = new Set<string>([weekStart]);
    allEntries.forEach((pe) => recordedWeeks.add(getWeekStart(pe.activity_date, ys?.week_start_day || 1)));
    Array.from(recordedWeeks)
      .sort()
      .reverse()
      .forEach((ws) => {
        const we = addDays(ws, 6);
        let expected = 0;
        for (const st of enrolledStudents) {
          expected += countExpectedPeriodsInRange({
            startDate: ws,
            endDate: we,
            studentId: st.studentId,
            settings: ys,
            exceptions: db.academic_calendar_exceptions,
          });
        }
        const entries = allEntries.filter((e) => e.activity_date >= ws && e.activity_date <= we);
        weekMap.set(ws, {
          weekStart: ws,
          expected,
          submitted: entries.length,
          approved: entries.filter((e) => e.approval_status === 'approved').length,
          pending: entries.filter((e) => e.approval_status === 'pending').length,
          returned: entries.filter((e) => e.approval_status === 'returned').length,
        });
      });

    // 2. Monthly Overview
    const monthMap = new Map<string, { month: string; submitted: number; approved: number; pending: number; returned: number }>();
    for (const pe of allEntries) {
      const m = pe.activity_date.slice(0, 7);
      const row = monthMap.get(m) || { month: m, submitted: 0, approved: 0, pending: 0, returned: 0 };
      row.submitted++;
      if (pe.approval_status === 'approved') row.approved++;
      if (pe.approval_status === 'pending') row.pending++;
      if (pe.approval_status === 'returned') row.returned++;
      monthMap.set(m, row);
    }

    // 3. Semester Overview
    const semesters = db.semesters
      .filter((s) => s.academic_year_id === effectiveYearId)
      .map((sem) => {
        const semSubIds = new Set(
          yearSubs.filter((r) => r.semester_id === sem.id && submittedSubIds.has(r.id)).map((r) => r.id)
        );
        const entries = allEntries.filter((e) => semSubIds.has(e.submission_id));
        return {
          id: sem.id,
          name: sem.name,
          status: sem.status,
          submitted: entries.length,
          approved: entries.filter((e) => e.approval_status === 'approved').length,
          pending: entries.filter((e) => e.approval_status === 'pending').length,
          returned: entries.filter((e) => e.approval_status === 'returned').length,
        };
      });

    // 4. Student Reports
    const studentRows = enrolledStudents.map((st) => {
      const expected = countExpectedPeriodsInRange({
        startDate: weekStart,
        endDate: weekEnd,
        studentId: st.studentId,
        settings: ys,
        exceptions: db.academic_calendar_exceptions,
      });
      const entries = allEntries.filter((e) => e.student_id === st.studentId);
      const approved = entries.filter((e) => e.approval_status === 'approved').length;
      const pending = entries.filter((e) => e.approval_status === 'pending').length;
      const returned = entries.filter((e) => e.approval_status === 'returned').length;
      const missing = Math.max(0, expected - entries.length);
      const completion = expected > 0 ? Math.min(100, Math.round((approved / expected) * 100)) : 0;
      return {
        ...st,
        expected,
        submitted: entries.length,
        approved,
        pending,
        returned,
        missing,
        completion,
      };
    });

    // 5. Mentor Reports
    const mentorRows = db.mentors
      .filter((m) => mentorFilter === 'all' || m.id === mentorFilter)
      .map((m) => {
        const prof = db.profiles.find((p) => p.id === m.profile_id);
        const assignedIds = new Set(
          db.mentor_assignments
            .filter((ma) => ma.mentor_id === m.id && ma.academic_year_id === effectiveYearId && ma.is_active)
            .map((ma) => ma.student_id)
        );
        const entries = allEntries.filter((e) => assignedIds.has(e.student_id));
        const approved = entries.filter((e) => e.approval_status === 'approved').length;
        const pending = entries.filter((e) => e.approval_status === 'pending').length;
        const returned = entries.filter((e) => e.approval_status === 'returned').length;
        return {
          mentorId: m.id,
          name: prof?.full_name || m.employee_code,
          code: m.employee_code,
          assignedStudents: assignedIds.size,
          submitted: entries.length,
          approved,
          pending,
          returned,
        };
      });

    const monthsAvailable = Array.from(new Set(allEntries.map((e) => e.activity_date.slice(0, 7)))).sort().reverse();

    return {
      year,
      weeklyRows: Array.from(weekMap.values()),
      monthlyRows: Array.from(monthMap.values()).sort((a, b) => b.month.localeCompare(a.month)),
      semesterRows: semesters,
      studentRows,
      mentorRows,
      detailedEntries: [...allEntries].sort((a, b) => b.activity_date.localeCompare(a.activity_date) || a.period_number - b.period_number),
      monthsAvailable,
    };
  }, [db, effectiveYearId, activeYearSettings, semesterFilter, batchFilter, mentorFilter, studentFilter, statusFilter, monthFilter]);

  if (!db || !reportData) return null;

  const getStudentName = (sid: string) => {
    const stu = db.students.find((s) => s.id === sid);
    return db.profiles.find((p) => p.id === stu?.profile_id)?.full_name || 'Unknown';
  };

  const buildExportPayload = () => {
    if (tab === 'weekly') {
      return {
        title: `Weekly Overview (${reportData.year.name})`,
        headers: ['Week Starting', 'Expected Periods', 'Submitted', 'Approved', 'Pending', 'Returned', 'Missing'],
        rows: reportData.weeklyRows.map((w) => [
          w.weekStart,
          w.expected,
          w.submitted,
          w.approved,
          w.pending,
          w.returned,
          Math.max(0, w.expected - w.submitted),
        ]),
      };
    }
    if (tab === 'monthly') {
      return {
        title: `Monthly Overview (${reportData.year.name})`,
        headers: ['Month', 'Submitted', 'Approved', 'Pending', 'Returned'],
        rows: reportData.monthlyRows.map((m) => [m.month, m.submitted, m.approved, m.pending, m.returned]),
      };
    }
    if (tab === 'semester') {
      return {
        title: `Semester Overview (${reportData.year.name})`,
        headers: ['Semester', 'Status', 'Submitted', 'Approved', 'Pending', 'Returned'],
        rows: reportData.semesterRows.map((s) => [s.name, s.status, s.submitted, s.approved, s.pending, s.returned]),
      };
    }
    if (tab === 'students') {
      return {
        title: `Student Reports (${reportData.year.name})`,
        headers: ['Student', 'Admission No', 'Batch', 'Expected (Current Week)', 'Submitted', 'Approved', 'Pending', 'Returned', 'Missing', 'Completion %'],
        rows: reportData.studentRows.map((s) => [
          s.fullName,
          s.admission,
          s.batch,
          s.expected,
          s.submitted,
          s.approved,
          s.pending,
          s.returned,
          s.missing,
          `${s.completion}%`,
        ]),
      };
    }
    if (tab === 'mentors') {
      return {
        title: `Mentor Reports (${reportData.year.name})`,
        headers: ['Mentor', 'Employee Code', 'Assigned Students', 'Submitted Periods', 'Approved', 'Pending', 'Returned'],
        rows: reportData.mentorRows.map((m) => [
          m.name,
          m.code,
          m.assignedStudents,
          m.submitted,
          m.approved,
          m.pending,
          m.returned,
        ]),
      };
    }
    return {
      title: `Detailed Activity Report (${reportData.year.name})`,
      headers: ['Date', 'Period', 'Student', 'Planned Activity', 'Actual Activity', 'Activity Status', 'Approval Status', 'Mentor Comment'],
      rows: reportData.detailedEntries.map((e) => [
        e.activity_date,
        `P${e.period_number}`,
        getStudentName(e.student_id),
        e.planned_activity_snapshot,
        e.actual_activity,
        e.activity_status,
        e.approval_status,
        e.mentor_comment || '',
      ]),
    };
  };

  const handleExportCsv = () => {
    const p = buildExportPayload();
    downloadCsv(`kkhm-${tab}-report-${reportData.year.name}.csv`, p.headers, p.rows);
    notify('success', `Exported ${p.title} as UTF-8 CSV.`);
  };

  const handleExportExcel = () => {
    const p = buildExportPayload();
    downloadExcel(`kkhm-${tab}-report-${reportData.year.name}.xls`, p.title, p.headers, p.rows);
    notify('success', `Exported ${p.title} as Excel (.xls).`);
  };

  const batches = Array.from(new Set(db.students.map((s) => s.batch_name)));

  return (
    <div>
      <PageHeader
        title="Reports & Institutional Analytics"
        subtitle="Expected totals automatically exclude non-working days, holidays, and cancelled periods. Drafts are never counted as Submitted, and Submitted periods are never counted as Approved."
        actions={
          <div className="flex flex-wrap items-center gap-2 no-print">
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
            </button>
            <button
              type="button"
              onClick={triggerPrintReport}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1E3A5F] px-3 py-2 text-xs font-semibold text-white hover:bg-[#162C49] cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5" /> Print / PDF
            </button>
          </div>
        }
      />

      {/* Navigation Tabs */}
      <div className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-200/70 p-1 mb-5 no-print">
        {(
          [
            ['weekly', 'Weekly Overview'],
            ['monthly', 'Monthly Overview'],
            ['semester', 'Semester Overview'],
            ['students', 'Student Reports'],
            ['mentors', 'Mentor Reports'],
            ['detailed', 'Detailed Activity Reports'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap ${
              tab === key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mb-5 no-print">
        <select
          value={effectiveYearId}
          onChange={(e) => setYearIdFilter(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs"
        >
          {db.academic_years.map((y) => (
            <option key={y.id} value={y.id}>Year: {y.name}</option>
          ))}
        </select>
        <select
          value={semesterFilter}
          onChange={(e) => setSemesterFilter(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs"
        >
          <option value="all">All Semesters</option>
          {db.semesters
            .filter((s) => s.academic_year_id === effectiveYearId)
            .map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
        </select>
        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs"
        >
          <option value="all">All Months</option>
          {reportData.monthsAvailable.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <select
          value={batchFilter}
          onChange={(e) => setBatchFilter(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs"
        >
          <option value="all">All Batches</option>
          {batches.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
        <select
          value={mentorFilter}
          onChange={(e) => setMentorFilter(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs"
        >
          <option value="all">All Mentors</option>
          {db.mentors.map((m) => {
            const p = db.profiles.find((x) => x.id === m.profile_id);
            return <option key={m.id} value={m.id}>{p?.full_name}</option>;
          })}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs"
        >
          <option value="all">All Statuses</option>
          <option value="approved">Approved</option>
          <option value="pending_review">Pending Review</option>
          <option value="partially_reviewed">Partially Reviewed</option>
          <option value="returned">Returned</option>
        </select>
      </div>

      {/* Report Tables */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          {tab === 'weekly' && (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">Week Starting</th>
                  <th className="px-4 py-3 font-semibold text-right">Expected Periods</th>
                  <th className="px-4 py-3 font-semibold text-right">Submitted</th>
                  <th className="px-4 py-3 font-semibold text-right">Approved</th>
                  <th className="px-4 py-3 font-semibold text-right">Pending</th>
                  <th className="px-4 py-3 font-semibold text-right">Returned</th>
                  <th className="px-4 py-3 font-semibold text-right">Missing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reportData.weeklyRows.map((w) => (
                  <tr key={w.weekStart} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono font-semibold">{formatDisplayDate(w.weekStart)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{w.expected}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{w.submitted}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700 font-semibold">{w.approved}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-amber-700">{w.pending}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-red-700">{w.returned}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600">{Math.max(0, w.expected - w.submitted)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'monthly' && (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">Month</th>
                  <th className="px-4 py-3 font-semibold text-right">Submitted Periods</th>
                  <th className="px-4 py-3 font-semibold text-right">Approved</th>
                  <th className="px-4 py-3 font-semibold text-right">Pending</th>
                  <th className="px-4 py-3 font-semibold text-right">Returned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reportData.monthlyRows.map((m) => (
                  <tr key={m.month} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono font-semibold">{m.month}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{m.submitted}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700 font-semibold">{m.approved}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-amber-700">{m.pending}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-red-700">{m.returned}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'semester' && (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">Semester</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Submitted</th>
                  <th className="px-4 py-3 font-semibold text-right">Approved</th>
                  <th className="px-4 py-3 font-semibold text-right">Pending</th>
                  <th className="px-4 py-3 font-semibold text-right">Returned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reportData.semesterRows.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-semibold text-slate-900">{s.name}</td>
                    <td className="px-4 py-3"><StatusLabel status={s.status} /></td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{s.submitted}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700 font-semibold">{s.approved}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-amber-700">{s.pending}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-red-700">{s.returned}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'students' && (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">Student</th>
                  <th className="px-4 py-3 font-semibold text-right">Expected (Wk)</th>
                  <th className="px-4 py-3 font-semibold text-right">Submitted</th>
                  <th className="px-4 py-3 font-semibold text-right">Approved</th>
                  <th className="px-4 py-3 font-semibold text-right">Pending</th>
                  <th className="px-4 py-3 font-semibold text-right">Returned</th>
                  <th className="px-4 py-3 font-semibold text-right">Missing</th>
                  <th className="px-4 py-3 font-semibold text-right">Completion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reportData.studentRows.map((st) => (
                  <tr key={st.studentId} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{st.fullName}</div>
                      <div className="text-[11px] font-mono text-slate-500">{st.admission} · {st.batch}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{st.expected}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{st.submitted}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700 font-semibold">{st.approved}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-amber-700">{st.pending}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-red-700">{st.returned}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600">{st.missing}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-[#1E3A5F]">{st.completion}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'mentors' && (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">Mentor</th>
                  <th className="px-4 py-3 font-semibold text-right">Assigned Students</th>
                  <th className="px-4 py-3 font-semibold text-right">Submitted</th>
                  <th className="px-4 py-3 font-semibold text-right">Approved</th>
                  <th className="px-4 py-3 font-semibold text-right">Pending</th>
                  <th className="px-4 py-3 font-semibold text-right">Returned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reportData.mentorRows.map((m) => (
                  <tr key={m.mentorId} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{m.name}</div>
                      <div className="text-[11px] font-mono text-slate-500">{m.code}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{m.assignedStudents}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{m.submitted}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700 font-semibold">{m.approved}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-amber-700 font-semibold">{m.pending}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-red-700">{m.returned}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'detailed' && (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">Date &amp; Period</th>
                  <th className="px-4 py-3 font-semibold">Student</th>
                  <th className="px-4 py-3 font-semibold">Planned Snapshot</th>
                  <th className="px-4 py-3 font-semibold">Actual Activity</th>
                  <th className="px-4 py-3 font-semibold">Approval Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reportData.detailedEntries.slice(0, 80).map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/70 align-top">
                    <td className="px-4 py-3 font-mono whitespace-nowrap">
                      {e.activity_date} · P{e.period_number}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">
                      {getStudentName(e.student_id)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{e.planned_activity_snapshot}</td>
                    <td className="px-4 py-3 text-slate-800 max-w-md">
                      <div>{e.actual_activity}</div>
                      {e.mentor_comment && (
                        <div className="mt-1 text-[11px] text-slate-500">
                          Mentor note: {e.mentor_comment}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3"><StatusLabel status={e.approval_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
