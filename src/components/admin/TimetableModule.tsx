import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  Plus,
  Save,
  Search,
  Send,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { DAY_NAMES, getDefaultPeriodTimings, getTodayIST } from '../../lib/dateUtils';
import {
  ACADEMIC_STAGE_META,
  getClassStudentOptions,
  inferSemesterStage,
  isStagePerStudentTick,
} from '../../lib/timetableUtils';
import { dataService } from '../../services/dataService';
import type { AcademicStage, TimetableSlot, TimetableTemplate } from '../../types/domain';
import { EmptyState, Modal, PageHeader, StatusLabel } from '../ui/CommonUI';

interface EditableGridCell {
  activity: string;
  start: string;
  end: string;
  is_off_course: boolean;
  off_course_student_ids: string[];
}

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
  const [grid, setGrid] = useState<Record<string, EditableGridCell>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Student highlight from coverage strip (click a student to highlight their Off-Course cells)
  const [highlightedStudentId, setHighlightedStudentId] = useState<string | null>(null);

  // Aliya / PG Period Student Picker modal state
  const [pickerCell, setPickerCell] = useState<{ day: number; period: number } | null>(null);
  const [pickerStudentIds, setPickerStudentIds] = useState<string[]>([]);
  const [pickerActivityNote, setPickerActivityNote] = useState('');
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerShowAllYear, setPickerShowAllYear] = useState(false);
  const [copySourceKey, setCopySourceKey] = useState('');

  // Create template modal
  const [createOpen, setCreateOpen] = useState(false);
  const [newTplSemesterId, setNewTplSemesterId] = useState('');
  const [newTplStage, setNewTplStage] = useState<AcademicStage>('thamheediyya');
  const [newTplName, setNewTplName] = useState('');
  const [newTplDesc, setNewTplDesc] = useState('');

  // Assign modal
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignStudentIds, setAssignStudentIds] = useState<string[]>([]);
  const [effectiveStart, setEffectiveStart] = useState(getTodayIST());

  const activeTemplate = yearTemplates.find((t) => t.id === effectiveTemplateId);
  const activeTemplateSemester = yearSemesters.find((s) => s.id === activeTemplate?.semester_id);
  const activeStage: AcademicStage = inferSemesterStage(activeTemplateSemester, activeTemplate);
  const perStudentMode = isStagePerStudentTick(activeStage);
  const stageMeta = ACADEMIC_STAGE_META[activeStage];

  useEffect(() => {
    if (!db || !effectiveTemplateId) return;
    const slots = db.timetable_slots.filter((s) => s.template_id === effectiveTemplateId);
    const next: Record<string, EditableGridCell> = {};
    for (const day of workingDays) {
      for (let p = 1; p <= periodCount; p++) {
        const found = slots.find((s) => s.day_of_week === day && s.period_number === p);
        const timing = periodTimings[p - 1] || { start_time: '09:00', end_time: '09:45' };
        const studentIds = Array.isArray(found?.off_course_student_ids)
          ? found!.off_course_student_ids!
          : [];
        const isOffCourse =
          typeof found?.is_off_course === 'boolean'
            ? found.is_off_course
            : studentIds.length > 0;
        next[`${day}-${p}`] = {
          activity: found?.planned_activity || '',
          start: found?.start_time || timing.start_time,
          end: found?.end_time || timing.end_time,
          is_off_course: isOffCourse,
          off_course_student_ids: studentIds,
        };
      }
    }
    setGrid(next);
    setIsDirty(false);
    setHighlightedStudentId(null);
  }, [db, effectiveTemplateId, periodCount, workingDays.join(',')]);

  // All student IDs currently ticked anywhere in the draft grid
  const tickedIdsInGrid = useMemo(() => {
    const ids = new Set<string>();
    Object.values(grid).forEach((cell) => {
      cell.off_course_student_ids.forEach((id) => ids.add(id));
    });
    return ids;
  }, [grid]);

  // All enrolled students in the active academic year, tagged with whether they match this semester
  const allYearStudentOptions = useMemo(() => {
    if (!db || !activeYear) return [];
    return getClassStudentOptions(
      db,
      activeYear.id,
      activeTemplateSemester,
      activeTemplate,
      tickedIdsInGrid
    );
  }, [db, activeYear, activeTemplateSemester, activeTemplate, tickedIdsInGrid]);

  const classStudents = useMemo(() => {
    const matched = allYearStudentOptions.filter((opt) => opt.isSemesterMatch);
    return matched.length > 0 ? matched : allYearStudentOptions;
  }, [allYearStudentOptions]);

  const studentNameById = useMemo(() => {
    const map = new Map<string, string>();
    allYearStudentOptions.forEach((opt) => {
      map.set(opt.student.id, opt.profile.full_name);
    });
    return map;
  }, [allYearStudentOptions]);

  // Weekly Off-Course period counts per student from the live grid
  const weeklyCountByStudent = useMemo(() => {
    const counts = new Map<string, number>();
    const totalThamheediyyaSlots = Object.values(grid).filter((c) => c.is_off_course).length;

    for (const opt of classStudents) {
      if (!perStudentMode) {
        counts.set(opt.student.id, totalThamheediyyaSlots);
      } else {
        let count = 0;
        for (const cell of Object.values(grid)) {
          if (cell.off_course_student_ids.includes(opt.student.id)) {
            count += 1;
          }
        }
        counts.set(opt.student.id, count);
      }
    }
    return counts;
  }, [grid, classStudents, perStudentMode]);

  const totalMarkedPeriods = useMemo(() => {
    return Object.values(grid).filter((cell) =>
      perStudentMode ? cell.off_course_student_ids.length > 0 : cell.is_off_course
    ).length;
  }, [grid, perStudentMode]);

  // Populated Aliya/PG period cells available for one-click "Copy students from..."
  const copyablePeriodOptions = useMemo(() => {
    if (!perStudentMode) return [];
    const list: { key: string; label: string; count: number; studentIds: string[] }[] = [];
    for (const day of workingDays) {
      for (let p = 1; p <= periodCount; p++) {
        const key = `${day}-${p}`;
        if (pickerCell && pickerCell.day === day && pickerCell.period === p) continue;
        const cell = grid[key];
        if (cell && cell.off_course_student_ids.length > 0) {
          const noteSuffix = cell.activity.trim() ? ` · ${cell.activity.trim()}` : '';
          list.push({
            key,
            label: `${DAY_NAMES[day]?.short} P${p} (${cell.off_course_student_ids.length} students${noteSuffix})`,
            count: cell.off_course_student_ids.length,
            studentIds: cell.off_course_student_ids,
          });
        }
      }
    }
    return list;
  }, [grid, workingDays, periodCount, perStudentMode, pickerCell]);

  if (!db || !session || !activeYear) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#1E3A5F] border-t-transparent" />
        <p className="mt-3 text-sm text-slate-500">Loading timetable management...</p>
      </div>
    );
  }

  const handleOpenCreateModal = () => {
    const defaultSemId =
      selectedSemesterTab !== 'all' ? selectedSemesterTab : yearSemesters[0]?.id || '';
    setNewTplSemesterId(defaultSemId);
    const targetSem = yearSemesters.find((s) => s.id === defaultSemId);
    setNewTplStage(inferSemesterStage(targetSem));
    setNewTplName(targetSem ? `${targetSem.name} Schedule` : 'Weekly Schedule');
    setNewTplDesc(targetSem ? `Weekly timetable schedule for ${targetSem.name}` : '');
    setCreateOpen(true);
  };

  const handleToggleThamheediyyaCell = (day: number, period: number) => {
    if (activeYear.status === 'closed') return;
    const key = `${day}-${period}`;
    setGrid((prev) => {
      const current = prev[key] || {
        activity: '',
        start: periodTimings[period - 1]?.start_time || '09:00',
        end: periodTimings[period - 1]?.end_time || '09:45',
        is_off_course: false,
        off_course_student_ids: [],
      };
      const nextOffCourse = !current.is_off_course;
      return {
        ...prev,
        [key]: {
          ...current,
          is_off_course: nextOffCourse,
          activity: nextOffCourse
            ? current.activity.trim() && current.activity.trim().toLowerCase() !== 'regular class'
              ? current.activity
              : 'Off-Course'
            : '',
        },
      };
    });
    setIsDirty(true);
  };

  const handleOpenStudentPicker = (day: number, period: number) => {
    if (activeYear.status === 'closed') return;
    const key = `${day}-${period}`;
    const cell = grid[key];
    setPickerCell({ day, period });
    setPickerStudentIds(cell?.off_course_student_ids ? [...cell.off_course_student_ids] : []);
    setPickerActivityNote(
      cell?.activity &&
        cell.activity.trim().toLowerCase() !== 'off-course' &&
        cell.activity.trim().toLowerCase() !== 'regular class'
        ? cell.activity
        : ''
    );
    setPickerSearch('');
    setPickerShowAllYear(classStudents.length === 0);
    setCopySourceKey('');
  };

  const handleApplyStudentPicker = () => {
    if (!pickerCell) return;
    const key = `${pickerCell.day}-${pickerCell.period}`;
    const uniqueIds = Array.from(new Set(pickerStudentIds));
    const timing = periodTimings[pickerCell.period - 1] || {
      start_time: '09:00',
      end_time: '09:45',
    };
    setGrid((prev) => {
      const current = prev[key] || {
        activity: '',
        start: timing.start_time,
        end: timing.end_time,
        is_off_course: false,
        off_course_student_ids: [],
      };
      return {
        ...prev,
        [key]: {
          ...current,
          activity: pickerActivityNote.trim(),
          is_off_course: uniqueIds.length > 0,
          off_course_student_ids: uniqueIds,
        },
      };
    });
    setIsDirty(true);
    setPickerCell(null);
  };

  const handleCopyFromPeriod = () => {
    if (!copySourceKey) return;
    const source = copyablePeriodOptions.find((o) => o.key === copySourceKey);
    if (!source) return;
    setPickerStudentIds([...source.studentIds]);
    notify('info', `Copied ${source.count} student(s) from ${source.label.split(' (')[0]}.`);
  };

  const handleChangeStage = async (nextStage: AcademicStage) => {
    if (!activeTemplate || activeYear.status === 'closed') return;
    try {
      await dataService.updateTemplateStage(session.profile, activeTemplate.id, nextStage);
      await refresh();
      notify('success', `Stage updated to ${ACADEMIC_STAGE_META[nextStage].display}.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to update stage.');
    }
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
          const studentIds = perStudentMode ? cell?.off_course_student_ids || [] : [];
          const isOffCourse = perStudentMode
            ? studentIds.length > 0
            : Boolean(cell?.is_off_course);
          const cleanLabel = cell?.activity?.trim() || (isOffCourse ? 'Off-Course' : 'Regular Class');

          slots.push({
            template_id: effectiveTemplateId,
            day_of_week: day,
            period_number: p,
            start_time: cell?.start || timing.start_time,
            end_time: cell?.end || timing.end_time,
            planned_activity: cleanLabel,
            is_off_course: isOffCourse,
            off_course_student_ids: studentIds,
          });
        }
      }
      await dataService.saveTimetableSlots(session.profile, effectiveTemplateId, slots, publish);
      await refresh();
      setIsDirty(false);
      notify(
        'success',
        publish
          ? 'Timetable published! Students will now see only their scheduled Off-Course periods.'
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
        academic_stage: newTplStage,
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
      notify('success', 'New semester timetable created successfully.');
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

  // Filtered students inside Aliya/PG picker modal
  const pickerSourceList = pickerShowAllYear ? allYearStudentOptions : classStudents;
  const pickerFilteredStudents = pickerSourceList.filter((opt) => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      opt.profile.full_name.toLowerCase().includes(q) ||
      opt.student.admission_number.toLowerCase().includes(q) ||
      opt.subjectsLabel.toLowerCase().includes(q) ||
      (opt.student.semester_text || '').toLowerCase().includes(q)
    );
  });

  const zeroPeriodStudentsCount = perStudentMode
    ? classStudents.filter((opt) => (weeklyCountByStudent.get(opt.student.id) || 0) === 0).length
    : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Weekly Timetable Management"
        subtitle={`Stage-aware Off-Course scheduling (${workingDays.length} working days × ${periodCount} periods). Students see only their scheduled Off-Course periods for reporting.`}
        actions={
          <>
            <button
              type="button"
              disabled={activeYear.status === 'closed'}
              onClick={handleOpenCreateModal}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
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
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0D9488] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0F766E] disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
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
          <BookOpen className="h-3.5 w-3.5 text-slate-400" /> Semester:
        </span>
        <button
          type="button"
          onClick={() => setSelectedSemesterTab('all')}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            selectedSemesterTab === 'all'
              ? 'bg-[#1E3A5F] text-white'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          All Timetables ({yearTemplates.length})
        </button>
        {yearSemesters.map((sem) => {
          const count = yearTemplates.filter((t) => t.semester_id === sem.id).length;
          const isSelected = selectedSemesterTab === sem.id;
          const semStage = inferSemesterStage(sem);
          return (
            <button
              key={sem.id}
              type="button"
              onClick={() => setSelectedSemesterTab(sem.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                isSelected
                  ? 'bg-[#1E3A5F] text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <span>{sem.name}</span>
              <span className={`text-[10px] ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>
                · {ACADEMIC_STAGE_META[semStage].label} ({count})
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
          description="Create a weekly timetable for this semester. Thamheediyya classes use class-wide Off-Course toggles, while Aliya and PG classes use per-period student tick selection."
          action={
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="rounded-lg bg-[#1E3A5F] px-4 py-2 text-xs font-semibold text-white cursor-pointer"
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
          {/* Template Selector, Stage Mode Switch & Publish Toolbar */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                    Timetable:
                  </label>
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
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                    Stage:
                  </label>
                  <select
                    disabled={activeYear.status === 'closed'}
                    value={activeStage}
                    onChange={(e) => handleChangeStage(e.target.value as AcademicStage)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-[#1E3A5F] cursor-pointer disabled:opacity-60"
                  >
                    <option value="thamheediyya">Thamheediyya (തംഹീദിയ്യ)</option>
                    <option value="aliya">Aliya (ആലിയ)</option>
                    <option value="pg">PG (പി.ജി)</option>
                  </select>
                </div>

                {activeTemplate && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <StatusLabel status={activeTemplate.is_published ? 'published' : 'draft'} />
                    {isDirty && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-amber-700">Unsaved changes</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={saving || activeYear.status === 'closed'}
                  onClick={() => handleSaveGrid(false)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Save className="h-3.5 w-3.5" /> Save Draft
                </button>
                <button
                  type="button"
                  disabled={saving || activeYear.status === 'closed'}
                  onClick={() => handleSaveGrid(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1E3A5F] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#162C49] disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
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

            {/* Stage Rule Explanation Strip */}
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="text-slate-600">
                <span className="font-semibold text-slate-900">{stageMeta.display}</span>
                <span className="mx-2 text-slate-300" aria-hidden="true">·</span>
                <span>{stageMeta.adminHint}</span>
              </div>
              <div className="font-mono tabular-nums text-slate-600 shrink-0">
                <strong className="text-[#0D9488]">{totalMarkedPeriods}</strong> Off-Course slots/week
                <span className="mx-1.5 text-slate-300">·</span>
                <span>{classStudents.length} students in class</span>
              </div>
            </div>
          </div>

          {/* Active Student Highlight Notice */}
          {highlightedStudentId && (
            <div className="rounded-lg border border-[#1E3A5F]/25 bg-slate-50 px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
              <div className="text-slate-800">
                Highlighting weekly Off-Course periods for{' '}
                <strong className="text-[#1E3A5F]">
                  {studentNameById.get(highlightedStudentId) || 'Selected Student'}
                </strong>{' '}
                <span className="font-mono tabular-nums text-slate-500">
                  ({weeklyCountByStudent.get(highlightedStudentId) || 0} periods/week)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setHighlightedStudentId(null)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" /> Clear Highlight
              </button>
            </div>
          )}

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
                        <th
                          key={p}
                          className="px-3 py-2.5 font-semibold min-w-[165px] border-r border-slate-200 last:border-r-0"
                        >
                          <div>Period {p}</div>
                          <div className="text-[10px] font-mono tabular-nums font-normal text-slate-500">
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
                      <td className="px-3 py-3 font-semibold text-slate-900 bg-slate-50/70 sticky left-0 z-10 border-r border-slate-200">
                        <div>{DAY_NAMES[day]?.full}</div>
                        <div className="text-[11px] font-normal text-slate-500">
                          {DAY_NAMES[day]?.ml}
                        </div>
                      </td>
                      {Array.from({ length: periodCount }, (_, idx) => {
                        const p = idx + 1;
                        const key = `${day}-${p}`;
                        const cell = grid[key] || {
                          activity: '',
                          start: '09:00',
                          end: '09:45',
                          is_off_course: false,
                          off_course_student_ids: [],
                        };

                        // MODE A: Thamheediyya (Class-wide Off-Course toggle)
                        if (!perStudentMode) {
                          const isHighlighted = Boolean(highlightedStudentId && cell.is_off_course);
                          return (
                            <td
                              key={p}
                              className="p-2 border-r border-slate-100 last:border-r-0 align-top"
                            >
                              <div
                                className={`rounded-lg border transition-colors p-2.5 space-y-2 ${
                                  cell.is_off_course
                                    ? isHighlighted
                                      ? 'border-[#1E3A5F] bg-teal-50 ring-2 ring-[#1E3A5F]/20'
                                      : 'border-[#0D9488] bg-teal-50/60'
                                    : 'border-slate-200 bg-white hover:bg-slate-50'
                                }`}
                              >
                                <button
                                  type="button"
                                  disabled={activeYear.status === 'closed'}
                                  onClick={() => handleToggleThamheediyyaCell(day, p)}
                                  className="w-full flex items-center justify-between gap-2 text-left cursor-pointer disabled:cursor-not-allowed"
                                >
                                  <span
                                    className={`text-xs font-semibold ${
                                      cell.is_off_course ? 'text-teal-900' : 'text-slate-500'
                                    }`}
                                  >
                                    {cell.is_off_course ? 'Off-Course' : 'Regular Class'}
                                  </span>
                                  <span
                                    className={`h-5 w-5 rounded flex items-center justify-center shrink-0 border transition-colors ${
                                      cell.is_off_course
                                        ? 'bg-[#0D9488] border-[#0D9488] text-white'
                                        : 'border-slate-300 bg-white text-transparent'
                                    }`}
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </span>
                                </button>

                                {cell.is_off_course ? (
                                  <input
                                    type="text"
                                    disabled={activeYear.status === 'closed'}
                                    value={cell.activity}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setGrid((prev) => ({
                                        ...prev,
                                        [key]: { ...cell, activity: val },
                                      }));
                                      setIsDirty(true);
                                    }}
                                    placeholder="Off-Course (Urdu)"
                                    className="w-full rounded border border-teal-200 bg-white px-2 py-1 text-[11px] text-slate-800 focus:border-[#0D9488] focus:outline-none"
                                  />
                                ) : (
                                  <div className="text-[11px] text-slate-400">
                                    Click to mark Off-Course
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        }

                        // MODE B: Aliya / PG (Click any cell -> Tick Off-Course students)
                        const tickedIds = cell.off_course_student_ids;
                        const hasStudents = tickedIds.length > 0;
                        const studentPreviewNames = tickedIds
                          .slice(0, 2)
                          .map((id) => studentNameById.get(id) || 'Student');
                        const extraCount = Math.max(0, tickedIds.length - 2);
                        const isHighlighted = Boolean(
                          highlightedStudentId && tickedIds.includes(highlightedStudentId)
                        );
                        const isDimmed = Boolean(
                          highlightedStudentId && !tickedIds.includes(highlightedStudentId)
                        );

                        return (
                          <td
                            key={p}
                            className="p-2 border-r border-slate-100 last:border-r-0 align-top"
                          >
                            <button
                              type="button"
                              disabled={activeYear.status === 'closed'}
                              onClick={() => handleOpenStudentPicker(day, p)}
                              className={`w-full min-h-[76px] rounded-lg border p-2.5 text-left transition-colors cursor-pointer disabled:cursor-not-allowed flex flex-col justify-between gap-1.5 ${
                                isHighlighted
                                  ? 'border-[#1E3A5F] bg-teal-50 ring-2 ring-[#1E3A5F]/25'
                                  : hasStudents
                                    ? 'border-[#0D9488]/60 bg-teal-50/50 hover:bg-teal-50'
                                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                              } ${isDimmed ? 'opacity-45' : ''}`}
                            >
                              <div className="flex items-center justify-between gap-1.5 w-full">
                                <span
                                  className={`text-xs font-semibold truncate ${
                                    hasStudents ? 'text-teal-900' : 'text-slate-500'
                                  }`}
                                >
                                  {hasStudents ? 'Off-Course' : 'Regular Class'}
                                </span>
                                {hasStudents && (
                                  <span className="font-mono tabular-nums text-[11px] font-semibold text-[#0D9488] shrink-0">
                                    {tickedIds.length}
                                  </span>
                                )}
                              </div>

                              {cell.activity.trim() &&
                                cell.activity.trim().toLowerCase() !== 'off-course' &&
                                cell.activity.trim().toLowerCase() !== 'regular class' && (
                                  <div className="text-[11px] text-slate-600 truncate">
                                    {cell.activity.trim()}
                                  </div>
                                )}

                              {hasStudents ? (
                                <div className="text-[11px] text-slate-700 leading-snug">
                                  <div className="truncate">{studentPreviewNames.join(', ')}</div>
                                  {extraCount > 0 && (
                                    <div className="font-mono tabular-nums text-[10px] text-slate-500">
                                      +{extraCount} more student{extraCount > 1 ? 's' : ''}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="text-[11px] text-slate-400">
                                  Click to tick students
                                </div>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Class Weekly Off-Course Coverage Strip */}
          {classStudents.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70">
                <div className="text-xs">
                  <span className="font-semibold text-slate-900">
                    Class Weekly Off-Course Coverage ({activeTemplateSemester?.name || activeTemplate?.name})
                  </span>
                  <span className="mx-2 text-slate-300" aria-hidden="true">·</span>
                  <span className="text-slate-500">
                    Click any student to highlight their Off-Course periods in the grid above
                  </span>
                </div>
                {zeroPeriodStudentsCount > 0 && (
                  <div className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span className="font-mono tabular-nums">{zeroPeriodStudentsCount}</span> student
                    {zeroPeriodStudentsCount > 1 ? 's have' : ' has'} 0 periods assigned
                  </div>
                )}
              </div>

              <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {classStudents.map((opt) => {
                  const cnt = weeklyCountByStudent.get(opt.student.id) || 0;
                  const isActiveHighlight = highlightedStudentId === opt.student.id;
                  return (
                    <button
                      key={opt.student.id}
                      type="button"
                      onClick={() =>
                        setHighlightedStudentId((prev) =>
                          prev === opt.student.id ? null : opt.student.id
                        )
                      }
                      className={`w-full px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-left text-xs transition-colors cursor-pointer ${
                        isActiveHighlight ? 'bg-teal-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <span className="font-semibold text-slate-900">{opt.profile.full_name}</span>
                        <span className="font-mono tabular-nums text-[11px] text-slate-500">
                          {opt.student.admission_number}
                        </span>
                        {opt.subjectsLabel && (
                          <>
                            <span className="text-slate-300" aria-hidden="true">·</span>
                            <span className="text-teal-800 truncate">{opt.subjectsLabel}</span>
                          </>
                        )}
                      </div>
                      <div
                        className={`font-mono tabular-nums text-xs font-semibold shrink-0 ${
                          cnt === 0 ? 'text-amber-700' : 'text-[#0D9488]'
                        }`}
                      >
                        {cnt} period{cnt === 1 ? '' : 's'}/week
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0" />
            <span>
              Click <strong>Publish Timetable</strong> after marking Off-Course slots. Students in{' '}
              <strong>{activeTemplateSemester?.name || 'this semester'}</strong> will see only their
              active Off-Course periods in daily and weekly reporting; regular class periods are hidden automatically.
            </span>
          </div>
        </div>
      )}

      {/* Aliya / PG Period Student Picker Modal */}
      <Modal
        open={Boolean(pickerCell)}
        title={
          pickerCell
            ? `${DAY_NAMES[pickerCell.day]?.full} (${DAY_NAMES[pickerCell.day]?.ml}) · Period ${pickerCell.period}`
            : 'Assign Off-Course Students'
        }
        subtitle={
          pickerCell
            ? `${periodTimings[pickerCell.period - 1]?.start_time || ''} – ${
                periodTimings[pickerCell.period - 1]?.end_time || ''
              } · Tick every student who takes Off-Course during this period`
            : undefined
        }
        onClose={() => setPickerCell(null)}
        maxWidth="lg"
      >
        <div className="space-y-4">
          {/* Optional Regular Class Reference & Copy From Another Period */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Regular Class Subject Note (Optional)
              </label>
              <input
                type="text"
                value={pickerActivityNote}
                onChange={(e) => setPickerActivityNote(e.target.value)}
                placeholder="e.g. Fiqh, Arabic, History (Admin reference)"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-[#1E3A5F] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Copy Ticked Students from Another Period
              </label>
              <div className="mt-1 flex items-center gap-1.5">
                <select
                  value={copySourceKey}
                  onChange={(e) => setCopySourceKey(e.target.value)}
                  disabled={copyablePeriodOptions.length === 0}
                  className="flex-1 min-w-0 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-800 disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="">
                    {copyablePeriodOptions.length === 0
                      ? 'No other periods assigned yet'
                      : '-- Choose period to copy --'}
                  </option>
                  {copyablePeriodOptions.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!copySourceKey}
                  onClick={handleCopyFromPeriod}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer shrink-0"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy
                </button>
              </div>
            </div>
          </div>

          {/* Search & Scope Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder="Search student name, admission no., or subject..."
                className="w-full rounded-lg border border-slate-300 pl-8 pr-3 py-1.5 text-xs focus:border-[#1E3A5F] focus:outline-none"
              />
            </div>

            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setPickerShowAllYear(false)}
                className={`rounded-md px-2.5 py-1 font-medium cursor-pointer whitespace-nowrap ${
                  !pickerShowAllYear
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Class ({classStudents.length})
              </button>
              <button
                type="button"
                onClick={() => setPickerShowAllYear(true)}
                className={`rounded-md px-2.5 py-1 font-medium cursor-pointer whitespace-nowrap ${
                  pickerShowAllYear
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Year ({allYearStudentOptions.length})
              </button>
            </div>
          </div>

          {/* Quick Selection Actions */}
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono tabular-nums text-slate-600">
              <strong className="text-[#0D9488]">{pickerStudentIds.length}</strong> student
              {pickerStudentIds.length === 1 ? '' : 's'} ticked for Off-Course
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  const visibleIds = pickerFilteredStudents.map((o) => o.student.id);
                  setPickerStudentIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
                }}
                className="font-semibold text-[#1E3A5F] hover:underline cursor-pointer"
              >
                Tick All Shown
              </button>
              <button
                type="button"
                onClick={() => setPickerStudentIds([])}
                className="font-semibold text-slate-500 hover:text-red-600 cursor-pointer"
              >
                Clear Period
              </button>
            </div>
          </div>

          {/* Student Checklist */}
          <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
            {pickerFilteredStudents.map((opt) => {
              const checked = pickerStudentIds.includes(opt.student.id);
              const existingWeekly = weeklyCountByStudent.get(opt.student.id) || 0;
              return (
                <label
                  key={opt.student.id}
                  className={`flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs cursor-pointer transition-colors ${
                    checked ? 'bg-teal-50/60' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setPickerStudentIds((prev) =>
                          prev.includes(opt.student.id)
                            ? prev.filter((id) => id !== opt.student.id)
                            : [...prev, opt.student.id]
                        )
                      }
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#0D9488] focus:ring-[#0D9488]"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-slate-900">
                          {opt.profile.full_name}
                        </span>
                        <span className="font-mono tabular-nums text-[11px] text-slate-500">
                          ({opt.student.admission_number})
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {opt.subjectsLabel ? (
                          <span className="text-teal-800 font-medium">{opt.subjectsLabel}</span>
                        ) : (
                          <span>No Off-Course subject set</span>
                        )}
                        {opt.student.semester_text && (
                          <>
                            <span className="mx-1.5 text-slate-300">·</span>
                            <span>{opt.student.semester_text}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className="font-mono tabular-nums text-[11px] text-slate-500 shrink-0">
                    {existingWeekly} p/wk
                  </span>
                </label>
              );
            })}
            {!pickerFilteredStudents.length && (
              <div className="p-8 text-center text-xs text-slate-500">
                No students match your filter. Try switching to <strong>All Year</strong> above or
                enroll students in this semester.
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setPickerCell(null)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApplyStudentPicker}
              className="rounded-lg bg-[#1E3A5F] px-4 py-2 text-xs font-semibold text-white hover:bg-[#162C49] cursor-pointer"
            >
              Apply to Period ({pickerStudentIds.length})
            </button>
          </div>
        </div>
      </Modal>

      {/* Create Semester Timetable Modal */}
      <Modal
        open={createOpen}
        title="Add Semester Timetable"
        subtitle="Create a stage-aware weekly timetable for a specific semester or class."
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
                  setNewTplStage(inferSemesterStage(targetSem));
                  setNewTplName(`${targetSem.name} Schedule`);
                  setNewTplDesc(`Weekly timetable schedule for ${targetSem.name}`);
                }
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
            >
              <option value="">-- Choose a Semester --</option>
              {yearSemesters.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {ACADEMIC_STAGE_META[inferSemesterStage(s)].display} ({s.status})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Academic Stage *</label>
            <select
              value={newTplStage}
              onChange={(e) => setNewTplStage(e.target.value as AcademicStage)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
            >
              <option value="thamheediyya">
                Thamheediyya (തംഹീദിയ്യ) — Class-wide Off-Course (Urdu only)
              </option>
              <option value="aliya">
                Aliya (ആലിയ) — Tick Off-Course students per period
              </option>
              <option value="pg">
                PG (പി.ജി) — Tick Off-Course students per period
              </option>
            </select>
            <p className="mt-1 text-[11px] text-slate-500">
              {ACADEMIC_STAGE_META[newTplStage].shortRule}
            </p>
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
              className="rounded-lg bg-[#1E3A5F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#162C49] cursor-pointer"
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
                      const matched = allYearStudentOptions
                        .filter((opt) => opt.isSemesterMatch)
                        .map((o) => o.student.id);
                      setAssignStudentIds(matched);
                    }}
                    className="rounded border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-[#1E3A5F] hover:bg-slate-100 cursor-pointer"
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
                      checked ? 'bg-teal-50/40' : ''
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
                      <span className="text-[11px] font-medium text-slate-500">
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
              className="rounded-lg bg-[#1E3A5F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#162C49] cursor-pointer"
            >
              Assign Timetable
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
