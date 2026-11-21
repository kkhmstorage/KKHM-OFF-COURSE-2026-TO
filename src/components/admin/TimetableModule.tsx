import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, CheckCircle2, Plus, Save, Send, Trash2, Users } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { DAY_NAMES, getDefaultPeriodTimings, getTodayIST } from '../../lib/dateUtils';
import { dataService } from '../../services/dataService';
import type { TimetableSlot, TimetableTemplate } from '../../types/domain';
import { EmptyState, Modal, PageHeader, StatusLabel } from '../ui/CommonUI';

export const TimetableModule: React.FC = () => {
  const { db, session, activeYear, activeYearSettings, refresh, notify, confirmAction } = useApp();

  const yearSemesters = useMemo(
    () => (db && activeYear ? db.semesters.filter((s) => s.academic_year_id === activeYear.id) : []),
    [db, activeYear]
  );

  const yearTemplates = useMemo(
    () =>
      db && activeYear
        ? db.timetable_templates.filter((t) => t.academic_year_id === activeYear.id)
        : [],
    [db, activeYear]
  );

  const [selectedSemesterTab, setSelectedSemesterTab] = useState<string>('all');

  const displayedTemplates = useMemo(() => {
    if (selectedSemesterTab === 'all') return yearTemplates;
    return yearTemplates.filter((t) => t.semester_id === selectedSemesterTab);
  }, [yearTemplates, selectedSemesterTab]);

  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const effectiveTemplateId =
    selectedTemplateId && displayedTemplates.some((t) => t.id === selectedTemplateId)
      ? selectedTemplateId
      : displayedTemplates[0]?.id || yearTemplates[0]?.id || '';

  const workingDays = activeYearSettings?.working_days || [1, 2, 3, 4, 5, 6];
  const periodCount = activeYearSettings?.period_count || 8;
  const periodTimings =
    activeYearSettings?.default_period_timings?.length === periodCount
      ? activeYearSettings.default_period_timings
      : getDefaultPeriodTimings(periodCount);

  // Editable local grid state keyed by `${day}-${period}`
  const [grid, setGrid] = useState<Record<string, { activity: string; start: string; end: string }>>({});
  const [saving, setSaving] = useState(false);

  // Create template modal
  const [createOpen, setCreateOpen] = useState(false);
  const [newTplSemesterId, setNewTplSemesterId] = useState('');
  const [newTplName, setNewTplName] = useState('');
  const [newTplDesc, setNewTplDesc] = useState('');

  // Assign modal
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignStudentIds, setAssignStudentIds] = useState<string[]>([]);
  const [effectiveStart, setEffectiveStart] = useState(getTodayIST());

  useEffect(() => {
    if (!db || !effectiveTemplateId) return;
    const slots = db.timetable_slots.filter((s) => s.template_id === effectiveTemplateId);
    const next: Record<string, { activity: string; start: string; end: string }> = {};
    for (const day of workingDays) {
      for (let p = 1; p <= periodCount; p++) {
        const found = slots.find((s) => s.day_of_week === day && s.period_number === p);
        const timing = periodTimings[p - 1] || { start_time: '09:00', end_time: '09:45' };
        next[`${day}-${p}`] = {
          activity: found?.planned_activity || '',
          start: found?.start_time || timing.start_time,
          end: found?.end_time || timing.end_time,
        };
      }
    }
    setGrid(next);
  }, [db, effectiveTemplateId, periodCount, workingDays.join(',')]);

  if (!db || !session || !activeYear) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#1E3A5F] border-t-transparent" />
        <p className="mt-3 text-sm text-slate-500">Loading timetable management...</p>
      </div>
    );
  }

  const activeTemplate = yearTemplates.find((t) => t.id === effectiveTemplateId);
  const activeTemplateSemester = yearSemesters.find((s) => s.id === activeTemplate?.semester_id);

  const handleOpenCreateModal = () => {
    const defaultSemId =
      selectedSemesterTab !== 'all' ? selectedSemesterTab : yearSemesters[0]?.id || '';
    setNewTplSemesterId(defaultSemId);
    const targetSem = yearSemesters.find((s) => s.id === defaultSemId);
    setNewTplName(targetSem ? `${targetSem.name} Schedule` : 'Weekly Schedule');
    setNewTplDesc(targetSem ? `Weekly timetable schedule for ${targetSem.name}` : '');
    setCreateOpen(true);
  };

  const handleSaveGrid = async (publish: boolean) => {
    if (!effectiveTemplateId) return;
    setSaving(true);
    try {
      const slots: Omit<TimetableSlot, 'id'>[] = [];
      for (const day of workingDays) {
        for (let p = 1; p <= periodCount; p++) {
          const cell = grid[`${day}-${p}`];
          const timing = periodTimings[p - 1] || { start_time: '09:00', end_time: '09:45' };
          slots.push({
            template_id: effectiveTemplateId,
            day_of_week: day,
            period_number: p,
            start_time: cell?.start || timing.start_time,
            end_time: cell?.end || timing.end_time,
            planned_activity: cell?.activity?.trim() || `Off-Course Period ${p}`,
          });
        }
      }
      await dataService.saveTimetableSlots(session.profile, effectiveTemplateId, slots, publish);
      await refresh();
      notify(
        'success',
        publish
          ? 'Timetable published! Students in this semester will automatically receive this schedule.'
          : 'Timetable draft changes saved.'
      );
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to save timetable.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const id = await dataService.createTimetableTemplate(session.profile, {
        academic_year_id: activeYear.id,
        semester_id: newTplSemesterId || undefined,
        name: newTplName,
        description: newTplDesc,
      });
      await refresh();
      if (newTplSemesterId) {
        setSelectedSemesterTab(newTplSemesterId);
      }
      setSelectedTemplateId(id);
      setCreateOpen(false);
      setNewTplName('');
      setNewTplDesc('');
      notify('success', 'New semester timetable template created successfully.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to create template.');
    }
  };

  const handleDeleteTemplate = (tpl: TimetableTemplate) => {
    confirmAction({
      title: `Delete Timetable "${tpl.name}"?`,
      description: `Are you sure you want to permanently delete timetable "${tpl.name}"? All period slot configurations and student assignment links for this timetable will be removed. This action cannot be undone.`,
      confirmLabel: 'Delete Timetable Permanently',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await dataService.deleteTimetableTemplate(session.profile, tpl.id);
          setSelectedTemplateId('');
          await refresh();
          notify('success', `Timetable "${tpl.name}" was deleted permanently.`);
        } catch (err) {
          notify('error', err instanceof Error ? err.message : 'Unable to delete timetable.');
        }
      },
    });
  };

  const handleAssignTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveTemplateId || assignStudentIds.length === 0) {
      notify('error', 'Select at least one student.');
      return;
    }
    try {
      await dataService.assignTimetableToStudents(session.profile, {
        academic_year_id: activeYear.id,
        template_id: effectiveTemplateId,
        student_ids: assignStudentIds,
        effective_start_date: effectiveStart,
      });
      await refresh();
      setAssignOpen(false);
      setAssignStudentIds([]);
      notify('success', `Assigned timetable to ${assignStudentIds.length} student(s).`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to assign timetable.');
    }
  };

  const assignedCount = db.student_timetable_assignments.filter(
    (a) => a.template_id === effectiveTemplateId && a.academic_year_id === activeYear.id && a.is_active
  ).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Weekly Timetable Management"
        subtitle={`Configure separate timetables for each semester (${workingDays.length} working days × ${periodCount} periods). Students in each semester will see their corresponding schedule.`}
        actions={
          <>
            <button
              type="button"
              disabled={activeYear.status === 'closed'}
              onClick={handleOpenCreateModal}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer shadow-sm"
            >
              <Plus className="h-3.5 w-3.5" /> Add Semester Timetable
            </button>
            {activeTemplate && (
              <button
                type="button"
                disabled={activeYear.status === 'closed'}
                onClick={() => {
                  const currentlyAssigned = db.student_timetable_assignments
                    .filter((a) => a.template_id === activeTemplate.id && a.is_active)
                    .map((a) => a.student_id);
                  setAssignStudentIds(currentlyAssigned);
                  setAssignOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0D9488] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0F766E] disabled:opacity-50 cursor-pointer shadow-sm"
              >
                <Users className="h-3.5 w-3.5" /> Assign to Students ({assignedCount})
              </button>
            )}
          </>
        }
      />

      {/* Semester Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-3">
        <span className="text-xs font-semibold text-slate-500 mr-1 flex items-center gap-1">
          <BookOpen className="h-3.5 w-3.5 text-slate-400" /> Filter by Semester:
        </span>
        <button
          type="button"
          onClick={() => setSelectedSemesterTab('all')}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
            selectedSemesterTab === 'all'
              ? 'bg-[#1E3A5F] text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          All Timetables ({yearTemplates.length})
        </button>
        {yearSemesters.map((sem) => {
          const count = yearTemplates.filter((t) => t.semester_id === sem.id).length;
          const isSelected = selectedSemesterTab === sem.id;
          return (
            <button
              key={sem.id}
              type="button"
              onClick={() => setSelectedSemesterTab(sem.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-[#1E3A5F] text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <span>{sem.name}</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {!displayedTemplates.length ? (
        <EmptyState
          title={
            selectedSemesterTab !== 'all'
              ? `No Timetable for ${yearSemesters.find((s) => s.id === selectedSemesterTab)?.name || 'this Semester'}`
              : `No Timetable Templates in ${activeYear.name}`
          }
          description="Create a separate weekly timetable for this semester. All enrolled students in this semester will automatically view this timetable in their portal."
          action={
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="rounded-lg bg-[#1E3A5F] px-4 py-2 text-xs font-semibold text-white cursor-pointer shadow-sm"
            >
              <Plus className="inline mr-1 h-3.5 w-3.5" />
              {selectedSemesterTab !== 'all'
                ? `Create Timetable for ${yearSemesters.find((s) => s.id === selectedSemesterTab)?.name}`
                : 'Create First Timetable'}
            </button>
          }
        />
      ) : (
        <div className="space-y-4">
          {/* Template Selector & Publish Toolbar */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs font-semibold text-slate-700">Active Timetable:</label>
              <select
                value={effectiveTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 cursor-pointer"
              >
                {displayedTemplates.map((t) => {
                  const sem = yearSemesters.find((s) => s.id === t.semester_id);
                  return (
                    <option key={t.id} value={t.id}>
                      {t.name} {sem ? `[${sem.name}]` : ''} (Rev {t.revision})
                    </option>
                  );
                })}
              </select>

              {activeTemplateSemester && (
                <span className="rounded bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                  Semester: {activeTemplateSemester.name}
                </span>
              )}

              {activeTemplate && (
                <StatusLabel status={activeTemplate.is_published ? 'published' : 'draft'} />
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={saving || activeYear.status === 'closed'}
                onClick={() => handleSaveGrid(false)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                <Save className="h-3.5 w-3.5" /> Save Draft
              </button>
              <button
                type="button"
                disabled={saving || activeYear.status === 'closed'}
                onClick={() => handleSaveGrid(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#1E3A5F] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#162C49] disabled:opacity-50 cursor-pointer shadow-sm"
              >
                <Send className="h-3.5 w-3.5" /> Publish Timetable
              </button>
              {activeTemplate && (
                <button
                  type="button"
                  disabled={activeYear.status === 'closed'}
                  onClick={() => handleDeleteTemplate(activeTemplate)}
                  className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50 hover:text-red-700 cursor-pointer transition-colors"
                  title="Delete this Timetable"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Interactive Days x Periods Matrix */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-3 font-semibold sticky left-0 bg-slate-50 z-10 min-w-[110px] border-r border-slate-200">
                      Day
                    </th>
                    {Array.from({ length: periodCount }, (_, idx) => {
                      const p = idx + 1;
                      const t = periodTimings[idx];
                      return (
                        <th
                          key={p}
                          className="px-3 py-2.5 font-semibold min-w-[170px] border-r border-slate-200 last:border-r-0"
                        >
                          <div>Period {p}</div>
                          <div className="text-[10px] font-mono font-normal text-slate-500">
                            {t?.start_time} – {t?.end_time}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {workingDays.map((day) => (
                    <tr key={day}>
                      <td className="px-3 py-3 font-semibold text-slate-900 bg-slate-50/50 sticky left-0 z-10 border-r border-slate-200">
                        <div>{DAY_NAMES[day]?.full}</div>
                        <div className="text-[11px] font-normal text-slate-500">{DAY_NAMES[day]?.ml}</div>
                      </td>
                      {Array.from({ length: periodCount }, (_, idx) => {
                        const p = idx + 1;
                        const key = `${day}-${p}`;
                        const cell = grid[key] || { activity: '', start: '09:00', end: '09:45' };
                        return (
                          <td key={p} className="p-2 border-r border-slate-100 last:border-r-0 align-top">
                            <input
                              type="text"
                              list="kkhm-subject-suggestions"
                              disabled={activeYear.status === 'closed'}
                              value={cell.activity}
                              onChange={(e) =>
                                setGrid((prev) => ({
                                  ...prev,
                                  [key]: { ...cell, activity: e.target.value },
                                }))
                              }
                              placeholder="Enter subject or off-course..."
                              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-[#1E3A5F] focus:outline-none"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>

              <datalist id="kkhm-subject-suggestions">
                {db.subjects.map((sub) => (
                  <option key={sub.id} value={`${sub.name} (${sub.code})`} />
                ))}
                {db.subjects.map((sub) => (
                  <option key={`pure-${sub.id}`} value={sub.name} />
                ))}
                <option value="Library & Research Reading" />
                <option value="Skill Development & Writing" />
                <option value="Mentoring & Self-Study" />
                <option value="Group Debate & Oratory" />
              </datalist>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0" />
            <span>
              Timetable updates apply to future dates. Students belonging to{' '}
              <strong>{activeTemplateSemester?.name || 'this semester'}</strong> will immediately see
              these periods in their portal for daily activity verification.
            </span>
          </div>
        </div>
      )}

      {/* Create Semester Timetable Modal */}
      <Modal
        open={createOpen}
        title="Add Semester Timetable"
        subtitle="Create a dedicated weekly timetable schedule for a specific semester."
        onClose={() => setCreateOpen(false)}
        maxWidth="md"
      >
        <form onSubmit={handleCreateTemplate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Select Semester *</label>
            <select
              value={newTplSemesterId}
              required
              onChange={(e) => {
                const semId = e.target.value;
                setNewTplSemesterId(semId);
                const targetSem = yearSemesters.find((s) => s.id === semId);
                if (targetSem) {
                  setNewTplName(`${targetSem.name} Schedule`);
                  setNewTplDesc(`Weekly timetable schedule for ${targetSem.name}`);
                }
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
            >
              <option value="">-- Choose a Semester --</option>
              {yearSemesters.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.status})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Timetable Name *</label>
            <input
              type="text"
              required
              value={newTplName}
              onChange={(e) => setNewTplName(e.target.value)}
              placeholder="e.g. Semester 1 Schedule"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Description</label>
            <textarea
              rows={2}
              value={newTplDesc}
              onChange={(e) => setNewTplDesc(e.target.value)}
              placeholder="Optional notes about this semester's schedule..."
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[#1E3A5F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#162C49] cursor-pointer shadow-sm"
            >
              Create Timetable
            </button>
          </div>
        </form>
      </Modal>

      {/* Assign Timetable Modal */}
      <Modal
        open={assignOpen}
        title="Assign Timetable to Students"
        subtitle={`${activeTemplate?.name} ${activeTemplateSemester ? `(${activeTemplateSemester.name})` : ''}`}
        onClose={() => setAssignOpen(false)}
        maxWidth="lg"
      >
        <form onSubmit={handleAssignTemplate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Effective Start Date *</label>
            <input
              type="date"
              required
              value={effectiveStart}
              onChange={(e) => setEffectiveStart(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <label className="text-xs font-semibold text-slate-700">
                Selected Students ({assignStudentIds.length} of {db.students.length})
              </label>

              <div className="flex items-center gap-2">
                {activeTemplate?.semester_id && (
                  <button
                    type="button"
                    onClick={() => {
                      const sem = yearSemesters.find((s) => s.id === activeTemplate.semester_id);
                      const semName = sem?.name.toLowerCase().trim() || '';
                      const matched = db.students
                        .filter((st) => {
                          const stSem = (st.semester_text || '').toLowerCase().trim();
                          return (
                            stSem === semName ||
                            stSem.includes(semName) ||
                            (semName && stSem.replace(/[^a-z0-9]/g, '') === semName.replace(/[^a-z0-9]/g, ''))
                          );
                        })
                        .map((s) => s.id);
                      setAssignStudentIds(matched);
                    }}
                    className="rounded bg-indigo-50 border border-indigo-200 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 cursor-pointer"
                  >
                    Select All {activeTemplateSemester?.name || 'Semester'} Students
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setAssignStudentIds(
                      assignStudentIds.length === db.students.length
                        ? []
                        : db.students.map((s) => s.id)
                    )
                  }
                  className="text-xs text-[#1E3A5F] hover:underline cursor-pointer font-medium"
                >
                  {assignStudentIds.length === db.students.length ? 'Clear All' : 'Select All'}
                </button>
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
              {db.students.map((st) => {
                const p = db.profiles.find((x) => x.id === st.profile_id);
                const checked = assignStudentIds.includes(st.id);
                return (
                  <label
                    key={st.id}
                    className={`flex items-center justify-between gap-2.5 px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer ${
                      checked ? 'bg-indigo-50/40' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setAssignStudentIds((prev) =>
                            prev.includes(st.id) ? prev.filter((id) => id !== st.id) : [...prev, st.id]
                          )
                        }
                        className="h-4 w-4 rounded border-slate-300 text-[#1E3A5F]"
                      />
                      <span className="font-medium text-slate-900 truncate">{p?.full_name}</span>
                      <span className="font-mono text-slate-500">({st.admission_number})</span>
                    </div>
                    {st.semester_text && (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 border border-slate-200">
                        {st.semester_text}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setAssignOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[#1E3A5F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#162C49] cursor-pointer shadow-sm"
            >
              Assign Timetable
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
