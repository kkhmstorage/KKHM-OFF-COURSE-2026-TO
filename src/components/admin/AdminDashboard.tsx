import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { countExpectedPeriodsInRange, formatDisplayDate, getTodayIST, addDays } from '../../lib/dateUtils';
import { formatStudentSubjects } from '../../lib/studentUtils';
import { resolveStudentTimetableContext } from '../../lib/timetableUtils';
import { EmptyState, PageHeader, StatCard, StatusLabel } from '../ui/CommonUI';

export const AdminDashboard: React.FC = () => {
  const { db, activeYear, activeYearSettings, navigate } = useApp();

  const metrics = useMemo(() => {
    if (!db || !activeYear) return null;

    const yearId = activeYear.id;
    const enrollments = db.student_academic_enrollments.filter((e) => e.academic_year_id === yearId);
    const enrolledStudentIds = new Set(enrollments.map((e) => e.student_id));
    const totalStudents = enrolledStudentIds.size;

    const activeAssignments = db.mentor_assignments.filter(
      (ma) => ma.academic_year_id === yearId && ma.is_active
    );
    const activeMentorIds = new Set(activeAssignments.map((ma) => ma.mentor_id));
    const totalMentors = Math.max(activeMentorIds.size, db.mentors.length);

    const yearSubmissions = db.report_submissions.filter((s) => s.academic_year_id === yearId);
    const submittedSubIds = new Set(
      yearSubmissions.filter((s) => s.status !== 'draft' && s.status !== 'not_started').map((s) => s.id)
    );

    const yearEntries = db.period_activity_entries.filter(
      (pe) => pe.academic_year_id === yearId && pe.activity_status !== 'cancelled'
    );
    const submittedEntries = yearEntries.filter((pe) => submittedSubIds.has(pe.submission_id));
    const approvedEntries = submittedEntries.filter((pe) => pe.approval_status === 'approved');
    const pendingEntries = submittedEntries.filter((pe) => pe.approval_status === 'pending');
    const returnedEntries = submittedEntries.filter((pe) => pe.approval_status === 'returned');

    // Compute scheduled periods across the most recent 7-day window (or active year's recorded window)
    const today = getTodayIST();
    const endWindow = today < activeYear.end_date ? today : activeYear.end_date;
    const startWindow = addDays(endWindow, -6) < activeYear.start_date ? activeYear.start_date : addDays(endWindow, -6);

    let totalScheduled = 0;
    const studentsMissing: {
      studentId: string;
      name: string;
      admission: string;
      batch: string;
      mentorName: string;
      subjectsLabel: string;
    }[] = [];

    for (const sid of enrolledStudentIds) {
      const ttCtx = resolveStudentTimetableContext(db, sid, yearId);
      const expected = countExpectedPeriodsInRange({
        startDate: startWindow,
        endDate: endWindow,
        studentId: sid,
        settings: activeYearSettings,
        exceptions: db.academic_calendar_exceptions,
        templateSlots: ttCtx.templateSlots,
        stage: ttCtx.stage,
        overrides: db.timetable_overrides,
      });
      totalScheduled += expected;

      const hasAnySubmitted = yearSubmissions.some(
        (s) => s.student_id === sid && s.status !== 'draft' && s.status !== 'not_started'
      );
      if (!hasAnySubmitted) {
        const stu = db.students.find((s) => s.id === sid);
        const prof = db.profiles.find((p) => p.id === stu?.profile_id);
        const ma = activeAssignments.find((a) => a.student_id === sid);
        const m = db.mentors.find((x) => x.id === ma?.mentor_id);
        const mProf = db.profiles.find((p) => p.id === m?.profile_id);
        studentsMissing.push({
          studentId: sid,
          name: prof?.full_name || 'Unknown Student',
          admission: stu?.admission_number || '—',
          batch: stu?.batch_name || '—',
          mentorName: mProf?.full_name || 'Unassigned',
          subjectsLabel: formatStudentSubjects(db, sid, yearId),
        });
      }
    }

    // 1. Weekly Activity Overview (by date for last 6 recorded dates)
    const dateMap = new Map<string, { date: string; submitted: number; approved: number; pending: number; returned: number }>();
    for (const pe of submittedEntries) {
      const row = dateMap.get(pe.activity_date) || {
        date: pe.activity_date.slice(5),
        submitted: 0,
        approved: 0,
        pending: 0,
        returned: 0,
      };
      row.submitted += 1;
      if (pe.approval_status === 'approved') row.approved += 1;
      if (pe.approval_status === 'pending') row.pending += 1;
      if (pe.approval_status === 'returned') row.returned += 1;
      dateMap.set(pe.activity_date, row);
    }
    const weeklyChart = Array.from(dateMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-7)
      .map(([, v]) => v);

    // 2. Monthly Overview
    const monthMap = new Map<string, { month: string; submitted: number; approved: number }>();
    for (const pe of submittedEntries) {
      const key = pe.activity_date.slice(0, 7);
      const row = monthMap.get(key) || { month: key, submitted: 0, approved: 0 };
      row.submitted += 1;
      if (pe.approval_status === 'approved') row.approved += 1;
      monthMap.set(key, row);
    }
    const monthlyChart = Array.from(monthMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, v]) => v);

    // 3. Semester-wise Progress
    const yearSemesters = db.semesters.filter((s) => s.academic_year_id === yearId);
    const semesterChart = yearSemesters.map((sem) => {
      const semSubIds = new Set(
        yearSubmissions
          .filter((s) => s.semester_id === sem.id && s.status !== 'draft')
          .map((s) => s.id)
      );
      const semEntries = submittedEntries.filter((pe) => semSubIds.has(pe.submission_id));
      return {
        name: sem.name.replace(/\s*\(.*?\)/, ''),
        submitted: semEntries.length,
        approved: semEntries.filter((pe) => pe.approval_status === 'approved').length,
      };
    });

    // 4. Submitted vs Approved Pie
    const statusPie = [
      { name: 'Approved', value: approvedEntries.length, color: '#16A34A' },
      { name: 'Pending Review', value: pendingEntries.length, color: '#D97706' },
      { name: 'Returned', value: returnedEntries.length, color: '#DC2626' },
    ];

    // 5. Mentor-wise Review Summary
    const mentorSummary = db.mentors.map((m) => {
      const mProf = db.profiles.find((p) => p.id === m.profile_id);
      const assignedIds = new Set(
        activeAssignments.filter((ma) => ma.mentor_id === m.id).map((ma) => ma.student_id)
      );
      const mEntries = submittedEntries.filter((pe) => assignedIds.has(pe.student_id));
      return {
        mentorId: m.id,
        name: mProf?.full_name || m.employee_code,
        shortName: (mProf?.full_name || m.employee_code).split(' ').slice(0, 2).join(' '),
        assignedStudents: assignedIds.size,
        approved: mEntries.filter((e) => e.approval_status === 'approved').length,
        pending: mEntries.filter((e) => e.approval_status === 'pending').length,
        returned: mEntries.filter((e) => e.approval_status === 'returned').length,
      };
    });

    // 6. Student Reporting Completion Chart
    const studentCompletion = Array.from(enrolledStudentIds).map((sid) => {
      const stu = db.students.find((s) => s.id === sid);
      const prof = db.profiles.find((p) => p.id === stu?.profile_id);
      const sEntries = submittedEntries.filter((pe) => pe.student_id === sid);
      const ttCtx = resolveStudentTimetableContext(db, sid, yearId);
      const expected = Math.max(
        1,
        countExpectedPeriodsInRange({
          startDate: startWindow,
          endDate: endWindow,
          studentId: sid,
          settings: activeYearSettings,
          exceptions: db.academic_calendar_exceptions,
          templateSlots: ttCtx.templateSlots,
          stage: ttCtx.stage,
          overrides: db.timetable_overrides,
        })
      );
      const approvedCnt = sEntries.filter((pe) => pe.approval_status === 'approved').length;
      return {
        name: (prof?.full_name || stu?.admission_number || sid).split(' ')[0],
        completion: Math.min(100, Math.round((approvedCnt / expected) * 100)),
        submitted: sEntries.length,
        approved: approvedCnt,
      };
    });

    const recentSubmissions = [...yearSubmissions]
      .filter((s) => s.status !== 'draft' && s.status !== 'not_started')
      .sort((a, b) => (b.submitted_at || b.updated_at).localeCompare(a.submitted_at || a.updated_at))
      .slice(0, 6);

    const pendingSubmissions = yearSubmissions.filter(
      (s) => s.status === 'pending_review' || s.status === 'partially_reviewed'
    );
    const returnedSubmissions = yearSubmissions.filter((s) => s.status === 'returned');

    return {
      totalStudents,
      totalMentors,
      totalScheduled,
      totalSubmitted: submittedEntries.length,
      totalApproved: approvedEntries.length,
      totalPending: pendingEntries.length,
      totalReturned: returnedEntries.length,
      studentsMissing,
      weeklyChart,
      monthlyChart,
      semesterChart,
      statusPie,
      mentorSummary,
      studentCompletion,
      recentSubmissions,
      pendingSubmissions,
      returnedSubmissions,
    };
  }, [db, activeYear, activeYearSettings]);

  if (!db || !activeYear || !metrics) {
    return (
      <EmptyState
        title="No Academic Year Selected"
        description="Create an academic year to start monitoring student off-course activities."
        action={
          <button
            type="button"
            onClick={() => navigate('academic-years')}
            className="rounded-lg bg-[#1E3A5F] px-4 py-2 text-sm font-medium text-white cursor-pointer"
          >
            Manage Academic Years
          </button>
        }
      />
    );
  }

  const getStudentName = (sid: string) => {
    const stu = db.students.find((s) => s.id === sid);
    return db.profiles.find((p) => p.id === stu?.profile_id)?.full_name || 'Unknown';
  };
  const getMentorName = (mid?: string) => {
    if (!mid) return 'Unassigned';
    const m = db.mentors.find((x) => x.id === mid);
    return db.profiles.find((p) => p.id === m?.profile_id)?.full_name || 'Unassigned';
  };

  return (
    <div>
      <PageHeader
        title="Institutional Overview"
        subtitle={`Academic Year ${activeYear.name} · Entry Mode: ${
          activeYearSettings?.entry_mode === 'weekly' ? 'Weekly' : 'Daily'
        } · Approval Mode: ${
          activeYearSettings?.approval_mode === 'weekly' ? 'Weekly' : 'Daily'
        }`}
        actions={
          <>
            <button
              type="button"
              onClick={() => navigate('reports')}
              className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              Open Full Analytics
            </button>
            <button
              type="button"
              onClick={() => navigate('students')}
              className="rounded-lg bg-[#1E3A5F] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#162C49] cursor-pointer whitespace-nowrap"
            >
              Manage Students
            </button>
          </>
        }
      />

      {/* 8 Summary Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Enrolled Students"
          value={metrics.totalStudents}
          helper={`Active in ${activeYear.name}`}
          onClick={() => navigate('students')}
        />
        <StatCard
          label="Total Faculty Mentors"
          value={metrics.totalMentors}
          helper="Verified institutional mentors"
          onClick={() => navigate('mentors')}
        />
        <StatCard
          label="Scheduled Periods (7d Window)"
          value={metrics.totalScheduled}
          helper="Excludes holidays & cancellations"
          tone="teal"
          onClick={() => navigate('timetable')}
        />
        <StatCard
          label="Total Submitted Periods"
          value={metrics.totalSubmitted}
          helper="Drafts excluded from total"
          onClick={() => navigate('reports')}
        />
        <StatCard
          label="Approved Periods"
          value={metrics.totalApproved}
          helper="Verified by assigned mentors"
          tone="success"
          onClick={() => navigate('reports')}
        />
        <StatCard
          label="Pending Review Periods"
          value={metrics.totalPending}
          helper="Awaiting mentor verification"
          tone="warning"
          onClick={() => navigate('reports')}
        />
        <StatCard
          label="Returned Periods"
          value={metrics.totalReturned}
          helper="Sent back for student correction"
          tone="danger"
          onClick={() => navigate('reports')}
        />
        <StatCard
          label="Students with Missing Reports"
          value={metrics.studentsMissing.length}
          helper="No submitted periods in year"
          tone={metrics.studentsMissing.length > 0 ? 'danger' : 'success'}
          onClick={() => navigate('reports')}
        />
      </div>

      {/* 6 Analytical Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* 1. Weekly Activity Overview */}
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Weekly Activity Overview</h2>
          <p className="text-xs text-slate-500 mt-0.5">Daily submitted vs approved periods</p>
          <div className="h-60 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.weeklyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="submitted" name="Submitted" fill="#1E3A5F" radius={[4, 4, 0, 0]} />
                <Bar dataKey="approved" name="Approved" fill="#0D9488" radius={[4, 4, 0, 0]} />
                <Bar dataKey="returned" name="Returned" fill="#DC2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* 2. Submitted vs Approved Breakdown */}
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Submitted vs Approved Breakdown</h2>
          <p className="text-xs text-slate-500 mt-0.5">Live period review status distribution</p>
          <div className="h-60 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={metrics.statusPie}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={84}
                  paddingAngle={3}
                >
                  {metrics.statusPie.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* 3. Monthly Activity Overview */}
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Monthly Activity Overview</h2>
          <p className="text-xs text-slate-500 mt-0.5">Month-by-month submission and approval trend</p>
          <div className="h-60 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metrics.monthlyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="submitted" name="Submitted" stroke="#1E3A5F" strokeWidth={2} />
                <Line type="monotone" dataKey="approved" name="Approved" stroke="#16A34A" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* 4. Semester-wise Progress */}
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Semester-wise Progress</h2>
          <p className="text-xs text-slate-500 mt-0.5">Submitted and approved periods per semester</p>
          <div className="h-60 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.semesterChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="submitted" name="Submitted" fill="#1E3A5F" radius={[4, 4, 0, 0]} />
                <Bar dataKey="approved" name="Approved" fill="#16A34A" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* 5. Mentor-wise Review Summary */}
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Mentor-wise Review Summary</h2>
          <p className="text-xs text-slate-500 mt-0.5">Approved, pending, and returned periods per mentor</p>
          <div className="h-60 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.mentorSummary}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="shortName" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="approved" name="Approved" stackId="a" fill="#16A34A" />
                <Bar dataKey="pending" name="Pending" stackId="a" fill="#D97706" />
                <Bar dataKey="returned" name="Returned" stackId="a" fill="#DC2626" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* 6. Student Reporting Completion */}
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Student Reporting Completion (%)</h2>
          <p className="text-xs text-slate-500 mt-0.5">Approved periods vs scheduled periods in recent window</p>
          <div className="h-60 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.studentCompletion}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <Tooltip />
                <Bar dataKey="completion" name="Completion %" fill="#0D9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* 5 Operational Tables */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Recently Submitted Reports */}
        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">Recently Submitted Reports</h2>
            <button
              type="button"
              onClick={() => navigate('reports')}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#1E3A5F] hover:underline cursor-pointer"
            >
              View All <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Student</th>
                  <th className="px-4 py-2.5 font-semibold">Reporting Unit</th>
                  <th className="px-4 py-2.5 font-semibold">Mentor</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {metrics.recentSubmissions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-medium text-slate-900">{getStudentName(sub.student_id)}</td>
                    <td className="px-4 py-3 font-mono text-slate-600">
                      {sub.approval_mode_snapshot === 'weekly'
                        ? `Week ${formatDisplayDate(sub.start_date)}`
                        : formatDisplayDate(sub.start_date)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{getMentorName(sub.mentor_id)}</td>
                    <td className="px-4 py-3"><StatusLabel status={sub.status} /></td>
                  </tr>
                ))}
                {!metrics.recentSubmissions.length && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      No submitted reports recorded for {activeYear.name} yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Mentor-wise Pending Approvals */}
        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">Mentor-wise Pending Approvals</h2>
            <button
              type="button"
              onClick={() => navigate('mentors')}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#1E3A5F] hover:underline cursor-pointer"
            >
              Mentors <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Mentor</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Students</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Pending</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Approved</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Returned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {metrics.mentorSummary.map((m) => (
                  <tr key={m.mentorId} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-medium text-slate-900">{m.name}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{m.assignedStudents}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-amber-700">
                      {m.pending}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700">
                      {m.approved}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-red-700">
                      {m.returned}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Students with Missing Reports */}
        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">Students with Missing Reports</h2>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {metrics.studentsMissing.length} student(s)
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Student</th>
                  <th className="px-4 py-2.5 font-semibold">Admission No.</th>
                  <th className="px-4 py-2.5 font-semibold">Assigned Mentor</th>
                  <th className="px-4 py-2.5 font-semibold">Subject</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {metrics.studentsMissing.map((s) => (
                  <tr key={s.studentId} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-medium text-slate-900">{s.name}</td>
                    <td className="px-4 py-3 font-mono text-slate-600">{s.admission}</td>
                    <td className="px-4 py-3 text-slate-600">{s.mentorName}</td>
                    <td className="px-4 py-3">
                      {s.subjectsLabel ? (
                        <span className="font-medium text-teal-800">{s.subjectsLabel}</span>
                      ) : (
                        <span className="text-slate-400">Not assigned</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!metrics.studentsMissing.length && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-emerald-700">
                      All enrolled students have submitted reports in {activeYear.name}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Pending & Returned Queue */}
        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">Pending &amp; Returned Submissions</h2>
            <button
              type="button"
              onClick={() => navigate('reports')}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#1E3A5F] hover:underline cursor-pointer"
            >
              Inspect <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Student</th>
                  <th className="px-4 py-2.5 font-semibold">Mentor</th>
                  <th className="px-4 py-2.5 font-semibold">Subject</th>
                  <th className="px-4 py-2.5 font-semibold">Date / Week</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...metrics.returnedSubmissions, ...metrics.pendingSubmissions].slice(0, 6).map((sub) => {
                  const subSubjects = formatStudentSubjects(db, sub.student_id, activeYear.id);
                  return (
                    <tr key={sub.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-medium text-slate-900">{getStudentName(sub.student_id)}</td>
                      <td className="px-4 py-3 text-slate-600">{getMentorName(sub.mentor_id)}</td>
                      <td className="px-4 py-3">
                        {subSubjects ? (
                          <span className="font-medium text-teal-800">{subSubjects}</span>
                        ) : (
                          <span className="text-slate-400">Not assigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600">{formatDisplayDate(sub.start_date)}</td>
                      <td className="px-4 py-3"><StatusLabel status={sub.status} /></td>
                    </tr>
                  );
                })}
                {metrics.returnedSubmissions.length + metrics.pendingSubmissions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No pending or returned submissions.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};
