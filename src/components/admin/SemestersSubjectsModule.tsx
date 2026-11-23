import React, { useMemo, useState } from 'react';
import { BookOpen, CheckSquare, Plus, Square, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { formatDisplayDate } from '../../lib/dateUtils';
import { ACADEMIC_STAGE_META, inferSemesterStage } from '../../lib/timetableUtils';
import { dataService } from '../../services/dataService';
import type { AcademicStage, SemesterStatus, Subject, Semester } from '../../types/domain';
import { EmptyState, Modal, PageHeader, StatusLabel } from '../ui/CommonUI';

export const SemestersSubjectsModule: React.FC = () => {
  const { db, session, activeYear, refresh, notify, confirmAction } = useApp();
  const [tab, setTab] = useState<'semesters' | 'subjects' | 'mapping' | 'selections'>('semesters');

  // Semester form
  const [semModal, setSemModal] = useState(false);
  const [semName, setSemName] = useState('');
  const [semStage, setSemStage] = useState<AcademicStage>('thamheediyya');
  const [semStart, setSemStart] = useState('');
  const [semEnd, setSemEnd] = useState('');
  const [semStatus, setSemStatus] = useState<SemesterStatus>('active');

  // Subject form
  const [subModal, setSubModal] = useState(false);
  const [subCode, setSubCode] = useState('');
  const [subName, setSubName] = useState('');
  const [subCategory, setSubCategory] = useState('Off-Course');

  // Mapping & Selection state
  const yearSemesters = useMemo(
    () => (db && activeYear ? db.semesters.filter((s) => s.academic_year_id === activeYear.id) : []),
    [db, activeYear]
  );
  const [selectedSemId, setSelectedSemId] = useState('');
  const effectiveSemId = selectedSemId && yearSemesters.some((s) => s.id === selectedSemId)
    ? selectedSemId
    : yearSemesters[0]?.id || '';

  const [selectedStudentId, setSelectedStudentId] = useState('');

  if (!db || !session || !activeYear) return null;

  const enrolledStudents = db.students.filter((st) =>
    db.student_academic_enrollments.some(
      (e) => e.student_id === st.id && e.academic_year_id === activeYear.id
    )
  );
  const effectiveStudentId =
    selectedStudentId && enrolledStudents.some((s) => s.id === selectedStudentId)
      ? selectedStudentId
      : enrolledStudents[0]?.id || '';

  const mappedSubjectIds = new Set(
    db.semester_subjects
      .filter((ss) => ss.semester_id === effectiveSemId)
      .map((ss) => ss.subject_id)
  );

  const handleCreateSemester = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await dataService.createSemester(session.profile, {
        academic_year_id: activeYear.id,
        name: semName,
        academic_stage: semStage,
        start_date: semStart,
        end_date: semEnd,
        status: semStatus,
      });
      await refresh();
      notify(
        'success',
        `Semester "${semName}" (${ACADEMIC_STAGE_META[semStage].label}) created under ${activeYear.name}.`
      );
      setSemModal(false);
      setSemName('');
      setSemStage('thamheediyya');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to create semester.');
    }
  };

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await dataService.createSubject(session.profile, {
        code: subCode,
        name: subName,
        category: subCategory,
        is_active: true,
      });
      await refresh();
      notify('success', `Subject "${subName}" added to master list.`);
      setSubModal(false);
      setSubCode('');
      setSubName('');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to create subject.');
    }
  };

  const handleToggleMapping = async (subjectId: string, currentlyIncluded: boolean) => {
    if (!effectiveSemId) return;
    try {
      await dataService.toggleSemesterSubject(
        session.profile,
        effectiveSemId,
        subjectId,
        !currentlyIncluded
      );
      await refresh();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to update mapping.');
    }
  };

  const handleSetSelection = async (subjectId: string, status: 'selected' | 'not_selected') => {
    if (!effectiveSemId || !effectiveStudentId) return;
    try {
      await dataService.setStudentSubjectSelection(session.profile, {
        student_id: effectiveStudentId,
        academic_year_id: activeYear.id,
        semester_id: effectiveSemId,
        subject_id: subjectId,
        selection_status: status,
      });
      await refresh();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to update selection.');
    }
  };

  const handleDeleteSubject = (subject: Subject) => {
    confirmAction({
      title: `Delete Subject "${subject.name}"?`,
      description: `Are you sure you want to permanently delete subject "${subject.name}" (${subject.code})? It will be removed from all semester offerings and student subject selections. This action cannot be undone.`,
      confirmLabel: 'Delete Subject',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await dataService.deleteSubject(session.profile, subject.id);
          await refresh();
          notify('success', `Subject "${subject.name}" was deleted permanently.`);
        } catch (err) {
          notify('error', err instanceof Error ? err.message : 'Unable to delete subject.');
        }
      },
    });
  };

  const handleDeleteSemester = (semester: Semester) => {
    confirmAction({
      title: `Delete Semester "${semester.name}"?`,
      description: `Are you sure you want to delete semester "${semester.name}"? All subject mappings associated with this semester will be removed. This action cannot be undone.`,
      confirmLabel: 'Delete Semester',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await dataService.deleteSemester(session.profile, semester.id);
          await refresh();
          notify('success', `Semester "${semester.name}" was deleted.`);
        } catch (err) {
          notify('error', err instanceof Error ? err.message : 'Unable to delete semester.');
        }
      },
    });
  };

  return (
    <div>
      <PageHeader
        title="Semesters & Subjects"
        subtitle={`Configure semesters, master subjects (English & Malayalam), semester offerings, and explicit Selected / Not Selected student subject histories for ${activeYear.name}.`}
        actions={
          <>
            <button
              type="button"
              onClick={() => setSubModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> Add Subject
            </button>
            <button
              type="button"
              disabled={activeYear.status === 'closed'}
              onClick={() => {
                setSemStart(activeYear.start_date);
                setSemEnd(activeYear.end_date);
                setSemModal(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1E3A5F] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#162C49] disabled:opacity-50 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> Add Semester
            </button>
          </>
        }
      />

      {/* Sub-navigation Tabs */}
      <div className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-200/70 p-1 mb-6">
        {(
          [
            ['semesters', 'Semesters'],
            ['subjects', 'Master Subjects'],
            ['mapping', 'Semester Subject Mapping'],
            ['selections', 'Student Subject Selection'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              tab === key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab 1: Semesters */}
      {tab === 'semesters' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold">Semester / Class Name</th>
                <th className="px-4 py-3 font-semibold">Academic Stage (ഘട്ടം)</th>
                <th className="px-4 py-3 font-semibold">Date Range</th>
                <th className="px-4 py-3 font-semibold text-right">Mapped Subjects</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {yearSemesters.map((sem) => {
                const count = db.semester_subjects.filter((ss) => ss.semester_id === sem.id).length;
                const stage = inferSemesterStage(sem);
                return (
                  <tr key={sem.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-semibold text-slate-900">{sem.name}</td>
                    <td className="px-4 py-3">
                      <select
                        disabled={activeYear.status === 'closed'}
                        value={stage}
                        onChange={async (e) => {
                          const nextStage = e.target.value as AcademicStage;
                          try {
                            await dataService.updateSemesterStage(
                              session.profile,
                              sem.id,
                              nextStage
                            );
                            await refresh();
                            notify(
                              'success',
                              `Set ${sem.name} stage to ${ACADEMIC_STAGE_META[nextStage].display}.`
                            );
                          } catch (err) {
                            notify(
                              'error',
                              err instanceof Error ? err.message : 'Unable to update stage.'
                            );
                          }
                        }}
                        className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800"
                      >
                        <option value="thamheediyya">Thamheediyya (തംഹീദിയ്യ)</option>
                        <option value="aliya">Aliya (ആലിയ)</option>
                        <option value="pg">PG (പി.ജി)</option>
                      </select>
                      <div className="text-[11px] text-slate-500 mt-1">
                        {ACADEMIC_STAGE_META[stage].shortRule}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-600">
                      {formatDisplayDate(sem.start_date)} – {formatDisplayDate(sem.end_date)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{count}</td>
                    <td className="px-4 py-3"><StatusLabel status={sem.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <select
                          disabled={activeYear.status === 'closed'}
                          value={sem.status}
                          onChange={async (e) => {
                            await dataService.updateSemesterStatus(
                              session.profile,
                              sem.id,
                              e.target.value as SemesterStatus
                            );
                            await refresh();
                            notify('success', `Updated ${sem.name} status.`);
                          }}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                        >
                          <option value="upcoming">Upcoming</option>
                          <option value="active">Active</option>
                          <option value="closed">Closed</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => handleDeleteSemester(sem)}
                          className="rounded-md border border-red-200 p-1.5 text-red-600 hover:bg-red-50 hover:text-red-700 cursor-pointer"
                          title={`Delete ${sem.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!yearSemesters.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    No semesters defined for {activeYear.name}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: Master Subjects */}
      {tab === 'subjects' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold">Subject Code</th>
                <th className="px-4 py-3 font-semibold">Subject Name</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {db.subjects.map((sub) => (
                <tr key={sub.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-mono font-semibold text-[#1E3A5F]">{sub.code}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{sub.name}</td>
                  <td className="px-4 py-3 text-slate-600">{sub.category}</td>
                  <td className="px-4 py-3"><StatusLabel status={sub.is_active ? 'active' : 'inactive'} /></td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleDeleteSubject(sub)}
                      className="rounded-md border border-red-200 p-1.5 text-red-600 hover:bg-red-50 hover:text-red-700 cursor-pointer"
                      title={`Delete ${sub.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 3: Semester-Subject Mapping */}
      {tab === 'mapping' && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          {!yearSemesters.length ? (
            <EmptyState title="Create a Semester First" description="Add a semester under this academic year to map subjects." />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-4 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-[#1E3A5F]" />
                  <label className="text-xs font-semibold text-slate-700">Select Semester:</label>
                  <select
                    value={effectiveSemId}
                    onChange={(e) => setSelectedSemId(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium"
                  >
                    {yearSemesters.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <span className="text-xs text-slate-500 font-mono">
                  {mappedSubjectIds.size} of {db.subjects.length} subjects offered
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {db.subjects.map((sub) => {
                  const included = mappedSubjectIds.has(sub.id);
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      disabled={activeYear.status === 'closed'}
                      onClick={() => handleToggleMapping(sub.id, included)}
                      className={`flex items-start gap-3 rounded-lg border p-3.5 text-left transition-colors cursor-pointer ${
                        included
                          ? 'border-[#1E3A5F] bg-[#1E3A5F]/[0.04]'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      {included ? (
                        <CheckSquare className="h-4 w-4 text-[#1E3A5F] shrink-0 mt-0.5" />
                      ) : (
                        <Square className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900">{sub.name}</div>
                        <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                          {sub.code} · {sub.category}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab 4: Student Subject Selection (Explicit Selected / Not Selected) */}
      {tab === 'selections' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center gap-4 bg-slate-50/70">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-700">Semester:</label>
              <select
                value={effectiveSemId}
                onChange={(e) => setSelectedSemId(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
              >
                {yearSemesters.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-700">Student:</label>
              <select
                value={effectiveStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
              >
                {enrolledStudents.map((st) => {
                  const p = db.profiles.find((x) => x.id === st.profile_id);
                  return (
                    <option key={st.id} value={st.id}>
                      {p?.full_name} ({st.admission_number})
                    </option>
                  );
                })}
              </select>
            </div>
            {(() => {
              const currentSem = yearSemesters.find((s) => s.id === effectiveSemId);
              if (!currentSem) return null;
              const stage = inferSemesterStage(currentSem);
              return (
                <div className="ml-auto text-xs text-slate-600">
                  <strong className="text-[#1E3A5F]">{ACADEMIC_STAGE_META[stage].display}</strong>
                  <span className="mx-1.5 text-slate-300">·</span>
                  <span>{ACADEMIC_STAGE_META[stage].shortRule}</span>
                </div>
              );
            })()}
          </div>

          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold">Subject Code</th>
                <th className="px-4 py-3 font-semibold">Subject Name</th>
                <th className="px-4 py-3 font-semibold">Recorded Status</th>
                <th className="px-4 py-3 font-semibold text-right">Mark Selection</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {db.subjects
                .filter((sub) => mappedSubjectIds.has(sub.id))
                .map((sub) => {
                  const rec = db.student_subject_selections.find(
                    (s) =>
                      s.student_id === effectiveStudentId &&
                      s.semester_id === effectiveSemId &&
                      s.subject_id === sub.id
                  );
                  const currentStatus = rec?.selection_status || 'not_selected';
                  return (
                    <tr key={sub.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono text-slate-600">{sub.code}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{sub.name}</td>
                      <td className="px-4 py-3"><StatusLabel status={currentStatus} /></td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                          <button
                            type="button"
                            disabled={activeYear.status === 'closed'}
                            onClick={() => handleSetSelection(sub.id, 'selected')}
                            className={`rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer ${
                              currentStatus === 'selected'
                                ? 'bg-emerald-600 text-white'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Selected
                          </button>
                          <button
                            type="button"
                            disabled={activeYear.status === 'closed'}
                            onClick={() => handleSetSelection(sub.id, 'not_selected')}
                            className={`rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer ${
                              currentStatus === 'not_selected'
                                ? 'bg-slate-700 text-white'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Not Selected
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Semester Modal */}
      <Modal open={semModal} title="Add Semester" onClose={() => setSemModal(false)} maxWidth="sm">
        <form onSubmit={handleCreateSemester} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Semester Name *</label>
            <input
              type="text"
              required
              value={semName}
              onChange={(e) => {
                const val = e.target.value;
                setSemName(val);
                setSemStage(inferSemesterStage({ name: val }));
              }}
              placeholder="e.g. Semester 1 (Thamheediyya) or Aliya Sem 5"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Academic Stage (ഘട്ടം) *
            </label>
            <select
              value={semStage}
              onChange={(e) => setSemStage(e.target.value as AcademicStage)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="thamheediyya">
                Thamheediyya (തംഹീദിയ്യ) — Urdu exemption only
              </option>
              <option value="aliya">
                Aliya (ആലിയ) — Any 1 subject exempted per student
              </option>
              <option value="pg">
                PG (പി.ജി) — Any 1 subject exempted per student
              </option>
            </select>
            <p className="mt-1 text-[11px] text-slate-500">
              {ACADEMIC_STAGE_META[semStage].shortRule}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Start Date *</label>
              <input
                type="date"
                required
                value={semStart}
                onChange={(e) => setSemStart(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">End Date *</label>
              <input
                type="date"
                required
                value={semEnd}
                onChange={(e) => setSemEnd(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Status</label>
            <select
              value={semStatus}
              onChange={(e) => setSemStatus(e.target.value as SemesterStatus)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="upcoming">Upcoming</option>
              <option value="active">Active</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setSemModal(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm cursor-pointer">Cancel</button>
            <button type="submit" className="rounded-lg bg-[#1E3A5F] px-4 py-2 text-sm font-semibold text-white cursor-pointer">Save Semester</button>
          </div>
        </form>
      </Modal>

      {/* Add Subject Modal */}
      <Modal open={subModal} title="Add Master Subject" onClose={() => setSubModal(false)} maxWidth="sm">
        <form onSubmit={handleCreateSubject} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Subject Code *</label>
            <input
              type="text"
              required
              value={subCode}
              onChange={(e) => setSubCode(e.target.value)}
              placeholder="e.g. ARB205"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Subject Name (English / മലയാളം) *</label>
            <input
              type="text"
              required
              value={subName}
              onChange={(e) => setSubName(e.target.value)}
              placeholder="e.g. Spoken Arabic & Oratory"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Category</label>
            <select
              value={subCategory}
              onChange={(e) => setSubCategory(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="Off-Course">Off-Course</option>
              <option value="Language">Language</option>
              <option value="Islamic & Arabic">Islamic &amp; Arabic</option>
              <option value="Humanities">Humanities</option>
              <option value="Elective">Elective</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setSubModal(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm cursor-pointer">Cancel</button>
            <button type="submit" className="rounded-lg bg-[#1E3A5F] px-4 py-2 text-sm font-semibold text-white cursor-pointer">Save Subject</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
