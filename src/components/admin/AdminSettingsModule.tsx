import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Cloud,
  Database,
  Download,
  HardDrive,
  KeyRound,
  RefreshCw,
  Save,
  Shield,
  Sliders,
  Upload,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { DAY_NAMES, getDefaultPeriodTimings } from '../../lib/dateUtils';
import { dataService } from '../../services/dataService';
import type { Profile, WorkflowMode } from '../../types/domain';
import { Modal, PageHeader, StatusLabel } from '../ui/CommonUI';

type SettingsTab = 'general' | 'academic' | 'reporting' | 'notifications' | 'security';

export const AdminSettingsModule: React.FC = () => {
  const {
    db,
    session,
    activeYear,
    activeYearSettings,
    isProductionSupabase,
    refresh,
    notify,
    confirmAction,
  } = useApp();
  const [tab, setTab] = useState<SettingsTab>('reporting');

  // General
  const [institutionName, setInstitutionName] = useState('');
  const [applicationName, setApplicationName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [defaultLanguage, setDefaultLanguage] = useState<'en' | 'ml'>('en');

  // Notifications & Session
  const [inAppNotifs, setInAppNotifs] = useState(true);
  const [reminderHour, setReminderHour] = useState(17);
  const [sessionTimeoutHours, setSessionTimeoutHours] = useState(168);

  // Academic & Reporting Settings (per active year)
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [periodCount, setPeriodCount] = useState(8);
  const [weekStartDay, setWeekStartDay] = useState(1);
  const [entryMode, setEntryMode] = useState<WorkflowMode>('daily');
  const [approvalMode, setApprovalMode] = useState<WorkflowMode>('daily');

  // Credential Edit Modal
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [credUsername, setCredUsername] = useState('');
  const [credPassword, setCredPassword] = useState('');
  const [credActive, setCredActive] = useState(true);
  const [credSaving, setCredSaving] = useState(false);

  // Database Backup & Restore State
  const restoreFileInputRef = useRef<HTMLInputElement | null>(null);
  const [restoring, setRestoring] = useState(false);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!db) return;
    setInstitutionName(db.app_settings.institution_name);
    setApplicationName(db.app_settings.application_name);
    setLogoUrl(db.app_settings.logo_url || '');
    setTimezone(db.app_settings.timezone);
    setDefaultLanguage(db.app_settings.default_language);
    setInAppNotifs(db.app_settings.in_app_notifications_enabled);
    setReminderHour(db.app_settings.reminder_hour);
    setSessionTimeoutHours(db.app_settings.session_timeout_hours);
  }, [db]);

  useEffect(() => {
    if (!activeYearSettings) return;
    setWorkingDays(activeYearSettings.working_days);
    setPeriodCount(activeYearSettings.period_count);
    setWeekStartDay(activeYearSettings.week_start_day);
    setEntryMode(activeYearSettings.entry_mode);
    setApprovalMode(activeYearSettings.approval_mode);
  }, [activeYearSettings]);

  if (!db || !session || !activeYear || !activeYearSettings) return null;

  const activeDraftOrPendingCount = db.report_submissions.filter(
    (r) =>
      r.academic_year_id === activeYear.id &&
      (r.status === 'draft' || r.status === 'pending_review' || r.status === 'partially_reviewed' || r.status === 'returned')
  ).length;

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await dataService.updateAppSettings(session.profile, {
        institution_name: institutionName.trim(),
        application_name: applicationName.trim(),
        logo_url: logoUrl.trim() || undefined,
        timezone,
        default_language: defaultLanguage,
        in_app_notifications_enabled: inAppNotifs,
        reminder_hour: reminderHour,
        session_timeout_hours: sessionTimeoutHours,
      });
      await refresh();
      notify('success', 'Institutional settings saved.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const commitAcademicAndWorkflowSettings = async () => {
    setSaving(true);
    try {
      await dataService.updateAcademicYearSettings(session.profile, activeYear.id, {
        working_days: [...workingDays].sort((a, b) => a - b),
        period_count: periodCount,
        week_start_day: weekStartDay,
        entry_mode: entryMode,
        approval_mode: approvalMode,
        default_period_timings: getDefaultPeriodTimings(periodCount),
      });
      await refresh();
      notify(
        'success',
        `Saved ${activeYear.name} configuration (${entryMode} entry / ${approvalMode} approval). Existing submitted reports retain their original mode snapshots.`
      );
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to save workflow settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWorkflow = (e: React.FormEvent) => {
    e.preventDefault();
    const modeChanged =
      entryMode !== activeYearSettings.entry_mode ||
      approvalMode !== activeYearSettings.approval_mode;

    if (modeChanged && activeDraftOrPendingCount > 0) {
      confirmAction({
        title: 'Confirm Reporting Workflow Mode Change',
        description: `There are currently ${activeDraftOrPendingCount} draft, pending, or returned report(s) in ${activeYear.name}. Existing submitted reports will safely preserve their original entry and approval mode snapshots; the new setting (${entryMode} entry + ${approvalMode} approval) will apply to new reporting units.`,
        confirmLabel: 'Apply New Workflow Mode',
        tone: 'primary',
        onConfirm: commitAcademicAndWorkflowSettings,
      });
    } else {
      void commitAcademicAndWorkflowSettings();
    }
  };

  const toggleWorkingDay = (day: number) => {
    setWorkingDays((prev) => {
      if (prev.includes(day)) {
        if (prev.length === 1) return prev;
        return prev.filter((d) => d !== day);
      }
      return [...prev, day].sort((a, b) => a - b);
    });
  };

  const openCredentialEditor = (profile: Profile) => {
    setEditingProfile(profile);
    setCredUsername(profile.username);
    setCredPassword('');
    setCredActive(profile.is_active);
  };

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfile) return;
    setCredSaving(true);
    try {
      await dataService.updateUserCredentials(
        session.profile,
        editingProfile.id,
        credUsername,
        credPassword || undefined,
        credActive
      );
      await refresh();
      notify('success', `Login credentials updated for ${editingProfile.full_name} (@${credUsername}).`);
      setEditingProfile(null);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to update credentials.');
    } finally {
      setCredSaving(false);
    }
  };

  const handleExportBackup = () => {
    const jsonStr = dataService.exportDatabaseBackup();
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `kkhm-ams-database-backup-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify('success', 'Complete database backup (.json) downloaded safely.');
  };

  const handleRestoreFilePicked = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      confirmAction({
        title: 'Restore Database from Backup File?',
        description: `This will restore records from "${file.name}". All student records, login credentials, reports, and settings will be restored from the backup file.`,
        confirmLabel: 'Restore Database',
        tone: 'danger',
        onConfirm: async () => {
          setRestoring(true);
          try {
            dataService.importDatabaseBackup(session.profile, text);
            await refresh();
            notify('success', 'Database restored successfully from backup file.');
          } catch (err) {
            notify('error', err instanceof Error ? err.message : 'Failed to restore database.');
          } finally {
            setRestoring(false);
          }
        },
      });
    } catch {
      notify('error', 'Could not read backup file.');
    }
  };

  const handleResetDatabase = () => {
    confirmAction({
      title: 'Reset Database to Factory Defaults?',
      description:
        'This will reset all data back to the default seed. Any custom students or reports added will be wiped unless you downloaded a backup first.',
      confirmLabel: 'Reset Database',
      tone: 'danger',
      onConfirm: async () => {
        dataService.resetDatabaseToDefault(session.profile);
        await refresh();
        notify('success', 'Database reset to initial default state.');
      },
    });
  };

  const workflowDescription: Record<string, string> = {
    'daily-daily':
      'Daily Entry + Daily Approval: Students log each day separately and submit daily. Next scheduled working day unlocks only after the mentor approves every required period of the previous day.',
    'daily-weekly':
      'Daily Entry + Weekly Approval: Students record and save drafts day-by-day, collected into one weekly submission unit. Mentor verifies periods individually; next week unlocks after full week approval.',
    'weekly-daily':
      'Weekly Entry + Daily Approval: Students view the full week on one screen, while each day remains an independent daily approval unit. Sequential daily locking prevents skipping ahead before prior day approval.',
    'weekly-weekly':
      'Weekly Entry + Weekly Approval: Students see and record all working days of the week in one interface and submit the completed week. Mentor approves periods individually; next week unlocks after full week approval.',
  };

  return (
    <div>
      <PageHeader
        title="System Settings & Credential Control"
        subtitle="Configure institutional details, working days, independent Daily/Weekly entry & approval modes, and manage Admin/Mentor/Student usernames & passwords."
      />

      <div className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-200/70 p-1 mb-6">
        {(
          [
            ['reporting', 'Reporting Modes'],
            ['security', 'Security & Database'],
            ['academic', 'Academic Schedule'],
            ['general', 'General'],
            ['notifications', 'Notifications'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap ${
              tab === key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab: Reporting Modes (Independent Entry & Approval Modes) */}
      {tab === 'reporting' && (
        <form onSubmit={handleSaveWorkflow} className="rounded-xl border border-slate-200 bg-white p-6 space-y-6 max-w-3xl">
          <div className="flex items-start gap-3">
            <Sliders className="h-5 w-5 text-[#1E3A5F] shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Daily / Weekly Entry &amp; Mentor Approval Modes ({activeYear.name})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Student Entry Mode and Mentor Approval Mode operate independently. All four combinations are enforced by the backend sequential locking engine.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="text-xs font-semibold text-slate-900 mb-2">1. Student Entry Mode</div>
              <p className="text-[11px] text-slate-500 mb-3">
                Controls how students view and enter their period-wise activities.
              </p>
              <div className="space-y-2">
                {(['daily', 'weekly'] as const).map((mode) => (
                  <label
                    key={mode}
                    className={`flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer ${
                      entryMode === mode ? 'border-[#1E3A5F] bg-[#1E3A5F]/[0.04]' : 'border-slate-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="entryMode"
                      checked={entryMode === mode}
                      onChange={() => setEntryMode(mode)}
                      className="mt-0.5 text-[#1E3A5F]"
                    />
                    <div>
                      <div className="text-xs font-semibold text-slate-900 capitalize">{mode} Entry</div>
                      <div className="text-[11px] text-slate-500">
                        {mode === 'daily'
                          ? 'One working day displayed per screen'
                          : 'Entire working week displayed in one view'}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-4">
              <div className="text-xs font-semibold text-slate-900 mb-2">2. Mentor Approval Mode</div>
              <p className="text-[11px] text-slate-500 mb-3">
                Controls the submission unit boundary &amp; sequential unlocking rule.
              </p>
              <div className="space-y-2">
                {(['daily', 'weekly'] as const).map((mode) => (
                  <label
                    key={mode}
                    className={`flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer ${
                      approvalMode === mode ? 'border-[#0D9488] bg-[#0D9488]/[0.05]' : 'border-slate-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="approvalMode"
                      checked={approvalMode === mode}
                      onChange={() => setApprovalMode(mode)}
                      className="mt-0.5 text-[#0D9488]"
                    />
                    <div>
                      <div className="text-xs font-semibold text-slate-900 capitalize">{mode} Approval</div>
                      <div className="text-[11px] text-slate-500">
                        {mode === 'daily'
                          ? 'One approval unit per scheduled day'
                          : 'One approval unit per scheduled week'}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 leading-relaxed">
            <strong className="text-slate-900">Active Workflow Behavior: </strong>
            {workflowDescription[`${entryMode}-${approvalMode}`]}
          </div>

          {activeDraftOrPendingCount > 0 && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-700" />
              <span>
                {activeDraftOrPendingCount} active draft or pending report(s) exist in {activeYear.name}.
                Changing modes will preserve existing report snapshots and apply new rules to future reporting units.
              </span>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving || activeYear.status === 'closed'}
              className="inline-flex items-center gap-2 rounded-lg bg-[#1E3A5F] px-4 py-2 text-xs font-semibold text-white hover:bg-[#162C49] disabled:opacity-50 cursor-pointer"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Saving...' : 'Save Reporting Settings'}
            </button>
          </div>
        </form>
      )}

      {/* Tab: Security & User Credentials Control */}
      {tab === 'security' && (
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-[#1E3A5F]" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Centralized Username &amp; Password Control (Admin, Mentors, Students)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Admin controls all login usernames, password resets, and account statuses across the single unified login portal.
                  </p>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Full Name</th>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3 font-semibold">Login Username</th>
                    <th className="px-4 py-3 font-semibold">Email</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold text-right">Manage Credentials</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {db.profiles.map((prof) => (
                    <tr key={prof.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-semibold text-slate-900">{prof.full_name}</td>
                      <td className="px-4 py-3 capitalize font-medium text-[#1E3A5F]">{prof.role}</td>
                      <td className="px-4 py-3 font-mono text-slate-700">@{prof.username}</td>
                      <td className="px-4 py-3 text-slate-600">{prof.email}</td>
                      <td className="px-4 py-3">
                        <StatusLabel status={prof.is_active ? 'active' : 'inactive'} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openCredentialEditor(prof)}
                          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#1E3A5F] hover:bg-slate-50 cursor-pointer"
                        >
                          Edit Username / Password
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Database Mode, Backup & Disaster Recovery Card */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <Database className="h-5 w-5 text-[#1E3A5F]" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Database Management &amp; Data Protection (ഡാറ്റാ സംരക്ഷണം)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Cloud database connectivity status, full system backups, and instant disaster recovery
                  </p>
                </div>
              </div>

              <div>
                {isProductionSupabase ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 border border-emerald-200">
                    <Cloud className="h-3.5 w-3.5 text-emerald-600" />
                    Cloud PostgreSQL Connected (Supabase)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 border border-amber-200">
                    <HardDrive className="h-3.5 w-3.5 text-amber-600" />
                    Local Browser Store (LocalStorage)
                  </span>
                )}
              </div>
            </div>

            {/* Explanation Alert */}
            <div className={`rounded-xl border p-4 text-xs leading-relaxed ${
              isProductionSupabase
                ? 'border-emerald-200 bg-emerald-50/50 text-emerald-950'
                : 'border-amber-200 bg-amber-50/60 text-amber-950'
            }`}>
              {isProductionSupabase ? (
                <div>
                  <strong className="font-bold">🟢 Cloud Database Active: </strong>
                  Your portal is connected to live <strong>Supabase PostgreSQL</strong> with Row Level Security (RLS). All student academic records, credentials, reports, and timetable data are securely stored in the cloud. Changes made from any computer or mobile phone are instantly synced in real time.
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div>
                    <strong className="font-bold">🟡 Local Browser Store Mode (ഡാറ്റ നഷ്ടപ്പെടാതിരിക്കാൻ ശ്രദ്ധിക്കുക): </strong>
                    ഇപ്പോൾ ആപ്ലിക്കേഷനിലുള്ള എല്ലാ വിവരങ്ങളും (വിദ്യാർത്ഥികൾ, ലോഗിൻ വിവരങ്ങൾ, റിപ്പോർട്ടുകൾ) ഈ ബ്രൗസറിന്റെ സുരക്ഷിതമായ ലോക്കൽ സ്റ്റോറേജിലാണ് സൂക്ഷിച്ചിരിക്കുന്നത്. പേജ് റീഫ്രഷ് ചെയ്താലും ലോഗൗട്ട് ചെയ്താലും ഡാറ്റ നിലനിൽക്കും.
                  </div>
                  <div className="text-[11px] text-amber-900/80">
                    <strong>ശ്രദ്ധിക്കുക:</strong> ബ്രൗസർ ക്യാഷ് ക്ലിയർ ചെയ്യുകയോ മറ്റൊരു ഫോണിൽ നിന്നോ കമ്പ്യൂട്ടറിൽ നിന്നോ തുറക്കുകയോ ചെയ്യുമ്പോൾ ഈ ഡാറ്റ നഷ്ടപ്പെടാതിരിക്കാൻ താഴെയുള്ള <strong>"Download Full Database Backup (JSON)"</strong> ബട്ടൺ ഉപയോഗിച്ച് ബാക്കപ്പ് ഫയൽ ഡൗൺലോഡ് ചെയ്തു വെക്കാവുന്നതാണ്. സ്ഥിരമായി ക്ലൗഡിൽ സൂക്ഷിക്കാൻ സൗജന്യ <strong>Supabase</strong> ഡാറ്റാബേസ് കണക്റ്റ് ചെയ്യുക.
                  </div>
                </div>
              )}
            </div>

            {/* Backup & Disaster Recovery Actions */}
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-2.5">
                Instant Backup &amp; Restore Tools (ബാക്കപ്പ് &amp; റീസ്റ്റോർ)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Download Backup */}
                <div className="rounded-lg border border-slate-200 p-3.5 flex flex-col justify-between gap-3 bg-slate-50/50">
                  <div>
                    <div className="flex items-center gap-2 font-semibold text-xs text-slate-900">
                      <Download className="h-4 w-4 text-[#0D9488]" />
                      <span>Download Full Backup</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500 leading-normal">
                      Export all students, CIC form details, passwords, mentors, and reports as a single <code className="font-mono">.json</code> backup file.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportBackup}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#0D9488] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0F766E] transition-colors cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" /> Download Backup (.json)
                  </button>
                </div>

                {/* Restore Backup */}
                <div className="rounded-lg border border-slate-200 p-3.5 flex flex-col justify-between gap-3 bg-slate-50/50">
                  <div>
                    <div className="flex items-center gap-2 font-semibold text-xs text-slate-900">
                      <Upload className="h-4 w-4 text-[#1E3A5F]" />
                      <span>Restore from Backup</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500 leading-normal">
                      Upload a previously downloaded <code className="font-mono">.json</code> backup file to instantly restore all student data and credentials.
                    </p>
                  </div>
                  <input
                    ref={restoreFileInputRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={(e) => {
                      void handleRestoreFilePicked(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    disabled={restoring}
                    onClick={() => restoreFileInputRef.current?.click()}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#1E3A5F] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#162C49] disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    <Upload className="h-3.5 w-3.5" /> {restoring ? 'Restoring...' : 'Restore from Backup (.json)'}
                  </button>
                </div>

                {/* Reset to Factory Defaults */}
                <div className="rounded-lg border border-slate-200 p-3.5 flex flex-col justify-between gap-3 bg-slate-50/50">
                  <div>
                    <div className="flex items-center gap-2 font-semibold text-xs text-red-900">
                      <RefreshCw className="h-4 w-4 text-red-600" />
                      <span>Reset to Initial Seed</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500 leading-normal">
                      Reverts the local database to default institutional seed data. Please ensure you have downloaded a backup first.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetDatabase}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-300 bg-white px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Reset to Default Seed
                  </button>
                </div>
              </div>
            </div>

            {/* Cloud Database Connection Steps (Supabase Guide) */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#1E3A5F]">
                <Shield className="h-4 w-4 text-[#1E3A5F]" />
                <span>How to Connect 100% Free Supabase Cloud Database (സ്ഥിരമായ ഡാറ്റാബേസ് കണക്റ്റ് ചെയ്യാൻ)</span>
              </div>
              <ol className="list-decimal list-inside text-xs text-slate-700 space-y-1.5 leading-relaxed">
                <li>
                  <a
                    href="https://supabase.com"
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-[#1E3A5F] underline"
                  >
                    supabase.com
                  </a>
                  -ൽ സൗജന്യമായി ഒരു അക്കൗണ്ട് തുടങ്ങി പുതിയൊരു പ്രൊജക്റ്റ് ഉണ്ടാക്കുക (Region: <strong>Mumbai / India</strong> തിരഞ്ഞെടുക്കാം).
                </li>
                <li>
                  Supabase Dashboard-ലെ <strong>SQL Editor</strong> തുറന്ന് പ്രൊജക്റ്റിലുള്ള മൈഗ്രേഷൻ സ്ക്രിപ്റ്റുകൾ റൺ ചെയ്യുക:
                  <div className="mt-1 font-mono text-[11px] text-slate-600 bg-white border border-slate-200 rounded p-2">
                    1. supabase/migrations/001_schema.sql (22 കോർ ടേബിളുകൾ)<br />
                    2. supabase/migrations/002_rls_and_rpcs.sql (ലോഗിൻ RPC &amp; സുരക്ഷ)<br />
                    3. supabase/migrations/003_seed_and_rls_tests.sql (അഡ്മിൻ സീഡ്)<br />
                    4. supabase/migrations/004_cic_student_fields.sql (CIC ഫോം ഫീൽഡുകൾ)
                  </div>
                </li>
                <li>
                  Supabase <strong>Project Settings -&gt; API</strong>-ൽ നിന്ന് <strong>Project URL</strong> ഉം <strong>anon key</strong> യും കോപ്പി ചെയ്യുക.
                </li>
                <li>
                  നിങ്ങളുടെ GitHub റെപ്പോസിറ്ററിയിൽ (<code className="font-mono">Settings -&gt; Secrets and variables -&gt; Actions</code>) ചെന്ന് 2 സീക്രട്ടുകൾ ആഡ് ചെയ്യുക:
                  <div className="mt-1 font-mono text-[11px] text-slate-600 bg-white border border-slate-200 rounded p-2">
                    VITE_SUPABASE_URL = നിങ്ങളുടെ Supabase Project URL<br />
                    VITE_SUPABASE_ANON_KEY = നിങ്ങളുടെ Supabase Anon Key
                  </div>
                </li>
                <li>
                  ഇത്രയും ചെയ്താൽ GitHub Actions തനിയെ റൺ ആയി ആപ്ലിക്കേഷൻ ലൈവ് ക്ലൗഡ് ഡാറ്റാബേസുമായി കണക്റ്റാവും. അതിനു ശേഷം ഏത് ഡിവൈസിൽ നിന്നും ഡാറ്റ എപ്പോഴും ലഭ്യമാകും!
                </li>
              </ol>
            </div>
          </section>
        </div>
      )}

      {/* Tab: Academic Schedule */}
      {tab === 'academic' && (
        <form onSubmit={handleSaveWorkflow} className="rounded-xl border border-slate-200 bg-white p-6 space-y-5 max-w-2xl">
          <h2 className="text-sm font-semibold text-slate-900">
            Working Days &amp; Period Structure ({activeYear.name})
          </h2>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Configured Working Days ({workingDays.length} days/week)
            </label>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                const selected = workingDays.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleWorkingDay(d)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold cursor-pointer ${
                      selected
                        ? 'border-[#1E3A5F] bg-[#1E3A5F] text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {selected && <Check className="h-3.5 w-3.5" />}
                    {DAY_NAMES[d].short}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Periods per Working Day</label>
              <input
                type="number"
                min={1}
                max={14}
                value={periodCount}
                onChange={(e) => setPeriodCount(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Week Start Day</label>
              <select
                value={weekStartDay}
                onChange={(e) => setWeekStartDay(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {[1, 6, 7].map((d) => (
                  <option key={d} value={d}>{DAY_NAMES[d].full}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving || activeYear.status === 'closed'}
              className="rounded-lg bg-[#1E3A5F] px-4 py-2 text-xs font-semibold text-white hover:bg-[#162C49] cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save Academic Schedule'}
            </button>
          </div>
        </form>
      )}

      {/* Tab: General */}
      {tab === 'general' && (
        <form onSubmit={handleSaveGeneral} className="rounded-xl border border-slate-200 bg-white p-6 space-y-4 max-w-2xl">
          <h2 className="text-sm font-semibold text-slate-900">Institutional Identity &amp; Locale</h2>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Institution Name</label>
            <input
              type="text"
              required
              value={institutionName}
              onChange={(e) => setInstitutionName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Application Name</label>
            <input
              type="text"
              required
              value={applicationName}
              onChange={(e) => setApplicationName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">College Logo URL (Optional)</label>
            <input
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="Leave blank to use default KKHM institutional emblem"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Timezone</label>
              <input
                type="text"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Default UI Language</label>
              <select
                value={defaultLanguage}
                onChange={(e) => setDefaultLanguage(e.target.value as 'en' | 'ml')}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="en">English (with Malayalam support)</option>
                <option value="ml">Malayalam / English Bilingual</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button type="submit" disabled={saving} className="rounded-lg bg-[#1E3A5F] px-4 py-2 text-xs font-semibold text-white cursor-pointer">
              Save General Settings
            </button>
          </div>
        </form>
      )}

      {/* Tab: Notifications */}
      {tab === 'notifications' && (
        <form onSubmit={handleSaveGeneral} className="rounded-xl border border-slate-200 bg-white p-6 space-y-4 max-w-2xl">
          <h2 className="text-sm font-semibold text-slate-900">Notifications &amp; Session Policy</h2>
          <label className="flex items-center gap-3 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={inAppNotifs}
              onChange={(e) => setInAppNotifs(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-[#1E3A5F]"
            />
            <span>Enable in-app notifications for submissions, approvals, returns, and unlocks</span>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Daily Reminder Hour (IST, 0–23)</label>
              <input
                type="number"
                min={0}
                max={23}
                value={reminderHour}
                onChange={(e) => setReminderHour(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Session Timeout (Hours)</label>
              <input
                type="number"
                min={1}
                max={720}
                value={sessionTimeoutHours}
                onChange={(e) => setSessionTimeoutHours(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button type="submit" disabled={saving} className="rounded-lg bg-[#1E3A5F] px-4 py-2 text-xs font-semibold text-white cursor-pointer">
              Save Notification Settings
            </button>
          </div>
        </form>
      )}

      {/* Credential Control Modal */}
      <Modal
        open={Boolean(editingProfile)}
        title={editingProfile ? `Manage Credentials: ${editingProfile.full_name}` : 'Manage Credentials'}
        subtitle={editingProfile ? `Role: ${editingProfile.role.toUpperCase()} · ${editingProfile.email}` : undefined}
        onClose={() => setEditingProfile(null)}
        maxWidth="sm"
      >
        <form onSubmit={handleSaveCredentials} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Login Username *</label>
            <input
              type="text"
              required
              value={credUsername}
              onChange={(e) => setCredUsername(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-[#1E3A5F] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">
              New Password (leave blank to keep current password)
            </label>
            <input
              type="text"
              value={credPassword}
              onChange={(e) => setCredPassword(e.target.value)}
              placeholder="Min 6 characters"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-[#1E3A5F] focus:outline-none"
            />
          </div>
          {editingProfile?.id !== session.profile.id && (
            <label className="flex items-center gap-2.5 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={credActive}
                onChange={(e) => setCredActive(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-[#1E3A5F]"
              />
              <span>Account Active (can sign in to the portal)</span>
            </label>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setEditingProfile(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={credSaving} className="rounded-lg bg-[#1E3A5F] px-4 py-2 text-sm font-semibold text-white cursor-pointer">
              {credSaving ? 'Updating...' : 'Update Credentials'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
