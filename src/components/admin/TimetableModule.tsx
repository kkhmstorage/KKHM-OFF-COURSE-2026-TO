import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Plus, Save, Send, Users } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { DAY_NAMES, getDefaultPeriodTimings, getTodayIST } from '../../lib/dateUtils';
import { dataService } from '../../services/dataService';
import type { TimetableSlot } from '../../types/domain';
import { EmptyState, Modal, PageHeader, StatusLabel } from '../ui/CommonUI';

export const TimetableModule: React.FC = () => {
  const { db, session, activeYear, activeYearSettings, refresh, notify } = useApp();

  const yearTemplates = useMemo(
    () =>
      db && activeYear
        ? db.timetable_templates.filter((t) => t.academic_year_id === activeYear.id)
        : [],
    [db, activeYear]
  );

  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const effectiveTemplateId =
    selectedTemplateId && yearTemplates.some((t) => t.id === selectedTemplateId)
      ? selectedTemplateId
      : yearTemplates[0]?.id || '';

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

  if (!db || !session || !activeYear) return null;

  const activeTemplate = yearTemplates.find((t) => t.id === effectiveTemplateId);

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
          ? 'Timetable published! Future dates updated; past submitted report snapshots preserved.'
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
        name: newTplName,
        description: newTplDesc,
      });
      await refresh();
      setSelectedTemplateId(id);
      setCreateOpen(false);
      setNewTplName('');
      setNewTplDesc('');
      notify('success', 'New timetable template created.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to create template.');
    }
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
    <div>
      <PageHeader
        title="Weekly Timetable Management"
        subtitle={`Configure reusable templates (${workingDays.length} working days × ${periodCount} periods), publish revisions without overwriting historical report snapshots, and assign to students.`}
        actions={
          <>
            <button
              type="button"
              disabled={activeYear.status === 'closed'}
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> New Template
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
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0D9488] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0F766E] disabled:opacity-50 cursor-pointer"
              >
                <Users className="h-3.5 w-3.5" /> Assign to Students ({assignedCount})
              </button>
            )}
          </>
        }
      />

      {!yearTemplates.length ? (
        <EmptyState
          title={`No Timetable Templates in ${activeYear.name}`}
          description="Create your first weekly timetable template to assign off-course schedules to students."
          action={
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded-lg bg-[#1E3A5F] px-4 py-2 text-xs font-semibold text-white cursor-pointer"
            >
              Create Template
            </button>
          }
        />
      ) : (
        <div className="space-y-4">
          {/* Template Selector & Publish Toolbar */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs font-semibold text-slate-700">Template:</label>
              <select
                value={effectiveTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900"
              >
                {yearTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} (Rev {t.revision})
                  </option>
                ))}
              </select>
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
                <Save className="h-3.5 w-3.5" /> Save Changes
              </button>
              <button
                type="button"
                disabled={saving || activeYear.status === 'closed'}
                onClick={() => handleSaveGrid(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#1E3A5F] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#162C49] disabled:opacity-50 cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" /> Publish Timetable
              </button>
            </div>
          </div>

          {/* Interactive Days x Periods Matrix */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
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
                        <th key={p} className="px-3 py-2.5 font-semibold min-w-[170px] border-r border-slate-200 last:border-r-0">
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
                              placeholder="Subject or activity..."
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
                  <option key={sub.id} value={sub.name} />
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
              Changes apply to future dates only. Existing submitted student reports always keep
              their original <code className="font-mono">planned_activity_snapshot</code>.
            </span>
          </div>
        </div>
      )}

      {/* Create Template Modal */}
      <Modal open={createOpen} title="Create Timetable Template" onClose={() => setCreateOpen(false)} maxWidth="sm">
        <form onSubmit={handleCreateTemplate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Template Name *</label>
            <input
              type="text"
              required
              value={newTplName}
              onChange={(e) => setNewTplName(e.target.value)}
              placeholder="e.g. BA English 2nd Year Schedule"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Description</label>
            <textarea
              rows={2}
              value={newTplDesc}
              onChange={(e) => setNewTplDesc(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCreateOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm cursor-pointer">Cancel</button>
            <button type="submit" className="rounded-lg bg-[#1E3A5F] px-4 py-2 text-sm font-semibold text-white cursor-pointer">Create Template</button>
          </div>
        </form>
      </Modal>

      {/* Assign Timetable Modal */}
      <Modal
        open={assignOpen}
        title="Assign Timetable to Students"
        subtitle={activeTemplate?.name}
        onClose={() => setAssignOpen(false)}
      >
        <form onSubmit={handleAssignTemplate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Effective Start Date</label>
            <input
              type="date"
              required
              value={effectiveStart}
              onChange={(e) => setEffectiveStart(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Select Students ({assignStudentIds.length} selected)
              </label>
              <button
                type="button"
                onClick={() =>
                  setAssignStudentIds(
                    assignStudentIds.length === db.students.length
                      ? []
                      : db.students.map((s) => s.id)
                  )
                }
                className="text-xs text-[#1E3A5F] hover:underline cursor-pointer"
              >
                Toggle All
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
              {db.students.map((st) => {
                const p = db.profiles.find((x) => x.id === st.profile_id);
                const checked = assignStudentIds.includes(st.id);
                return (
                  <label key={st.id} className="flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer">
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
                    <span className="font-medium text-slate-900">{p?.full_name}</span>
                    <span className="font-mono text-slate-500">({st.admission_number})</span>
                  </label>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAssignOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm cursor-pointer">Cancel</button>
            <button type="submit" className="rounded-lg bg-[#1E3A5F] px-4 py-2 text-sm font-semibold text-white cursor-pointer">Assign Timetable</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
