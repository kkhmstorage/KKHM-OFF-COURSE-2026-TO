import React, { useState } from 'react';
import { Calendar, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { formatDateWithDay, getTodayIST } from '../../lib/dateUtils';
import { dataService } from '../../services/dataService';
import type { CalendarExceptionType } from '../../types/domain';
import { PageHeader } from '../ui/CommonUI';

export const AcademicCalendarModule: React.FC = () => {
  const { db, session, activeYear, activeYearSettings, refresh, notify, confirmAction } = useApp();

  const [exceptionDate, setExceptionDate] = useState(getTodayIST());
  const [exceptionType, setExceptionType] = useState<CalendarExceptionType>('holiday');
  const [periodNumber, setPeriodNumber] = useState<number>(1);
  const [studentId, setStudentId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  if (!db || !session || !activeYear) return null;

  const yearExceptions = db.academic_calendar_exceptions
    .filter((e) => e.academic_year_id === activeYear.id)
    .sort((a, b) => b.exception_date.localeCompare(a.exception_date));

  const periodCount = activeYearSettings?.period_count || 8;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await dataService.createCalendarException(session.profile, {
        academic_year_id: activeYear.id,
        exception_date: exceptionDate,
        exception_type: exceptionType,
        period_number: exceptionType === 'period_cancellation' ? periodNumber : undefined,
        student_id: exceptionType === 'period_cancellation' && studentId ? studentId : undefined,
        title,
        notes,
      });
      await refresh();
      setTitle('');
      setNotes('');
      notify('success', 'Academic calendar exception recorded and applied to reporting calculations.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to save calendar exception.');
    } finally {
      setSaving(false);
    }
  };

  const typeLabel: Record<CalendarExceptionType, string> = {
    holiday: 'College Holiday (Full Day)',
    weekly_off: 'Weekly Off Override',
    special_working_day: 'Special Working Day',
    period_cancellation: 'Period Cancellation',
  };

  return (
    <div>
      <PageHeader
        title="Academic Calendar & Holidays"
        subtitle={`Define holidays, special working days, and authorized period cancellations for ${activeYear.name}. Full-day holidays and cancelled periods are automatically excluded from expected reporting totals.`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-4">
            <Calendar className="h-4 w-4 text-[#1E3A5F]" />
            <span>Add Calendar Exception</span>
          </div>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Date *</label>
              <input
                type="date"
                required
                value={exceptionDate}
                onChange={(e) => setExceptionDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Exception Type *</label>
              <select
                value={exceptionType}
                onChange={(e) => setExceptionType(e.target.value as CalendarExceptionType)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
              >
                <option value="holiday">College Holiday (Full Day)</option>
                <option value="weekly_off">Weekly Off Override</option>
                <option value="special_working_day">Special Working Day</option>
                <option value="period_cancellation">Individual Period Cancellation</option>
              </select>
            </div>

            {exceptionType === 'period_cancellation' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Period Number</label>
                  <select
                    value={periodNumber}
                    onChange={(e) => setPeriodNumber(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                  >
                    {Array.from({ length: periodCount }, (_, i) => (
                      <option key={i + 1} value={i + 1}>Period {i + 1}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Applies To</label>
                  <select
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                  >
                    <option value="">All Students</option>
                    {db.students.map((st) => {
                      const p = db.profiles.find((x) => x.id === st.profile_id);
                      return <option key={st.id} value={st.id}>{p?.full_name}</option>;
                    })}
                  </select>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700">Title / Reason *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Eid Holiday / Special College Seminar"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Notes</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={saving || activeYear.status === 'closed'}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#1E3A5F] py-2.5 text-xs font-semibold text-white hover:bg-[#162C49] disabled:opacity-50 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              {saving ? 'Recording...' : 'Add Calendar Exception'}
            </button>
          </form>
        </section>

        <section className="lg:col-span-7 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">
              Recorded Calendar Exceptions ({activeYear.name})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Date</th>
                  <th className="px-4 py-2.5 font-semibold">Type</th>
                  <th className="px-4 py-2.5 font-semibold">Title &amp; Scope</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Remove</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {yearExceptions.map((exc) => (
                  <tr key={exc.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono whitespace-nowrap text-slate-700">
                      {formatDateWithDay(exc.exception_date)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {typeLabel[exc.exception_type]}
                      {exc.period_number ? ` · P${exc.period_number}` : ''}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{exc.title}</div>
                      {exc.notes && <div className="text-[11px] text-slate-500 mt-0.5">{exc.notes}</div>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={activeYear.status === 'closed'}
                        onClick={() =>
                          confirmAction({
                            title: 'Remove Calendar Exception?',
                            description: `Removing "${exc.title}" will recalculate expected reporting periods for ${exc.exception_date}.`,
                            confirmLabel: 'Remove',
                            tone: 'danger',
                            onConfirm: async () => {
                              await dataService.deleteCalendarException(session.profile, exc.id);
                              await refresh();
                              notify('success', 'Calendar exception removed.');
                            },
                          })
                        }
                        className="rounded-md border border-slate-200 p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-40 cursor-pointer"
                        aria-label="Delete calendar exception"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {!yearExceptions.length && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                      No calendar exceptions recorded for {activeYear.name}.
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
