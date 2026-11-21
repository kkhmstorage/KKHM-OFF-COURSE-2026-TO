import React, { useState } from 'react';
import { Check, Lock, Plus, Trash2, Unlock } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { formatDisplayDate } from '../../lib/dateUtils';
import { dataService } from '../../services/dataService';
import type { AcademicYear, WorkflowMode } from '../../types/domain';
import { Modal, PageHeader, StatusLabel } from '../ui/CommonUI';

export const AcademicYearsModule: React.FC = () => {
  const { db, session, activeYear, refresh, notify, confirmAction } = useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [name, setName] = useState('2027-28');
  const [startDate, setStartDate] = useState('2027-06-01');
  const [endDate, setEndDate] = useState('2028-03-31');
  const [status, setStatus] = useState<'open' | 'closed'>('open');
  const [description, setDescription] = useState('');
  const [periodCount, setPeriodCount] = useState(8);
  const [entryMode, setEntryMode] = useState<WorkflowMode>('daily');
  const [approvalMode, setApprovalMode] = useState<WorkflowMode>('daily');

  if (!db || !session) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      await dataService.createAcademicYear(session.profile, {
        name,
        start_date: startDate,
        end_date: endDate,
        status,
        description,
        period_count: periodCount,
        entry_mode: entryMode,
        approval_mode: approvalMode,
      });
      await refresh();
      notify('success', `Academic year "${name}" created. Previous year records remain preserved.`);
      setModalOpen(false);
      setDescription('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to create academic year.');
    } finally {
      setSaving(false);
    }
  };

  const handleSwitchActive = async (yearId: string, yearName: string) => {
    try {
      await dataService.setSelectedAcademicYear(session.profile, yearId);
      await refresh();
      notify('success', `Active institutional academic year switched to ${yearName}.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to switch academic year.');
    }
  };

  const handleToggleStatus = (yearId: string, yearName: string, currentStatus: 'open' | 'closed') => {
    const nextStatus = currentStatus === 'open' ? 'closed' : 'open';
    confirmAction({
      title: nextStatus === 'closed' ? `Close Academic Year ${yearName}?` : `Reopen Academic Year ${yearName}?`,
      description:
        nextStatus === 'closed'
          ? 'Closing this academic year will make all student reports, timetables, and subject histories strictly read-only. Students will no longer be able to submit or edit reports for this year.'
          : 'Reopening this academic year will allow authorized reporting and timetable updates again.',
      confirmLabel: nextStatus === 'closed' ? 'Close Year' : 'Reopen Year',
      tone: nextStatus === 'closed' ? 'danger' : 'primary',
      onConfirm: async () => {
        await dataService.toggleAcademicYearStatus(session.profile, yearId, nextStatus);
        await refresh();
        notify('success', `Academic year ${yearName} is now ${nextStatus}.`);
      },
    });
  };

  const handleDeleteAcademicYear = (year: AcademicYear) => {
    if (activeYear?.id === year.id) {
      notify('error', 'Cannot delete the currently active academic year. Switch to another active year first.');
      return;
    }
    confirmAction({
      title: `Delete Academic Year "${year.name}"?`,
      description: `Are you sure you want to permanently delete academic year "${year.name}"? All associated settings, enrollments, reports, and timetables for this year will be permanently deleted. This action cannot be undone.`,
      confirmLabel: 'Delete Academic Year',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await dataService.deleteAcademicYear(session.profile, year.id);
          await refresh();
          notify('success', `Academic year "${year.name}" was permanently deleted.`);
        } catch (err) {
          notify('error', err instanceof Error ? err.message : 'Unable to delete academic year.');
        }
      },
    });
  };

  return (
    <div>
      <PageHeader
        title="Academic Year Management"
        subtitle="Manage open and archived academic years. Switching the institutional year updates data context across Admin, Mentor, and Student portals without altering historical records."
        actions={
          <button
            type="button"
            onClick={() => {
              setFormError(null);
              setModalOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-[#1E3A5F] px-4 py-2 text-xs font-semibold text-white hover:bg-[#162C49] cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Create Academic Year
          </button>
        }
      />

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold">Academic Year</th>
                <th className="px-4 py-3 font-semibold">Duration</th>
                <th className="px-4 py-3 font-semibold">Workflow Rules</th>
                <th className="px-4 py-3 font-semibold text-right">Enrollments</th>
                <th className="px-4 py-3 font-semibold text-right">Reports</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {db.academic_years.map((y) => {
                const isSelected = activeYear?.id === y.id;
                const ys = db.academic_year_settings.find((s) => s.academic_year_id === y.id);
                const enrCount = db.student_academic_enrollments.filter((e) => e.academic_year_id === y.id).length;
                const subCount = db.report_submissions.filter((r) => r.academic_year_id === y.id).length;
                return (
                  <tr key={y.id} className={isSelected ? 'bg-[#1E3A5F]/[0.03]' : 'hover:bg-slate-50/70'}>
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-slate-900 flex items-center gap-2">
                        <span>{y.name}</span>
                        {isSelected && (
                          <span className="text-[11px] font-semibold text-teal-700">· Active Context</span>
                        )}
                      </div>
                      {y.description && <div className="text-xs text-slate-500 mt-0.5">{y.description}</div>}
                    </td>
                    <td className="px-4 py-3.5 text-xs font-mono text-slate-600 whitespace-nowrap">
                      {formatDisplayDate(y.start_date)} – {formatDisplayDate(y.end_date)}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-600">
                      {ys ? (
                        <span>
                          {ys.working_days.length}d · {ys.period_count}p · Entry:{' '}
                          <strong className="capitalize">{ys.entry_mode}</strong> / Approval:{' '}
                          <strong className="capitalize">{ys.approval_mode}</strong>
                        </span>
                      ) : (
                        'Default (6d · 8p)'
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-xs tabular-nums text-slate-700">
                      {enrCount}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-xs tabular-nums text-slate-700">
                      {subCount}
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusLabel status={y.status} />
                    </td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        {!isSelected && (
                          <button
                            type="button"
                            onClick={() => handleSwitchActive(y.id, y.name)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-[#1E3A5F] hover:bg-slate-50 cursor-pointer"
                          >
                            <Check className="h-3.5 w-3.5" />
                            Set Active
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(y.id, y.name, y.status)}
                          className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium cursor-pointer ${
                            y.status === 'open'
                              ? 'border-red-200 text-red-700 hover:bg-red-50'
                              : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                          }`}
                        >
                          {y.status === 'open' ? (
                            <>
                              <Lock className="h-3.5 w-3.5" /> Close
                            </>
                          ) : (
                            <>
                              <Unlock className="h-3.5 w-3.5" /> Reopen
                            </>
                          )}
                        </button>
                        {!isSelected && (
                          <button
                            type="button"
                            onClick={() => handleDeleteAcademicYear(y)}
                            className="rounded-md border border-red-200 p-1.5 text-red-600 hover:bg-red-50 hover:text-red-700 cursor-pointer"
                            title={`Delete ${y.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={modalOpen}
        title="Create New Academic Year"
        subtitle="Creates a fresh year context without deleting or copying previous year activity reports."
        onClose={() => setModalOpen(false)}
      >
        {formError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
            {formError}
          </div>
        )}
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Academic Year Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. 2027-28"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#1E3A5F] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'open' | 'closed')}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#1E3A5F] focus:outline-none"
              >
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Start Date *</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#1E3A5F] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">End Date *</label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#1E3A5F] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Periods / Day</label>
              <input
                type="number"
                min={1}
                max={14}
                value={periodCount}
                onChange={(e) => setPeriodCount(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#1E3A5F] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Entry Mode</label>
              <select
                value={entryMode}
                onChange={(e) => setEntryMode(e.target.value as WorkflowMode)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#1E3A5F] focus:outline-none"
              >
                <option value="daily">Daily Entry</option>
                <option value="weekly">Weekly Entry</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Approval Mode</label>
              <select
                value={approvalMode}
                onChange={(e) => setApprovalMode(e.target.value as WorkflowMode)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#1E3A5F] focus:outline-none"
              >
                <option value="daily">Daily Approval</option>
                <option value="weekly">Weekly Approval</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Description (Optional)</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Academic schedule notes..."
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#1E3A5F] focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#1E3A5F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#162C49] disabled:opacity-60 cursor-pointer"
            >
              {saving ? 'Creating...' : 'Create Year'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
