import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { AppProvider, useApp } from './context/AppContext';
import { dataService } from './services/dataService';
import { LoginPage } from './components/LoginPage';
import { AppShell } from './components/AppShell';
import { CollegeEmblem, ConfirmDialog, Modal, ToastContainer } from './components/ui/CommonUI';
import { OfflineIndicator } from './components/PWAInstallButton';

// Admin modules
import { AdminDashboard } from './components/admin/AdminDashboard';
import { AcademicYearsModule } from './components/admin/AcademicYearsModule';
import { StudentsModule } from './components/admin/StudentsModule';
import { MentorsModule, MentorAssignmentsModule } from './components/admin/MentorsModule';
import { SemestersSubjectsModule } from './components/admin/SemestersSubjectsModule';
import { TimetableModule } from './components/admin/TimetableModule';
import { AcademicCalendarModule } from './components/admin/AcademicCalendarModule';
import { AdminReportsModule } from './components/admin/AdminReportsModule';
import { AdminSettingsModule } from './components/admin/AdminSettingsModule';
import { AuditLogsModule } from './components/admin/AuditLogsModule';

// Mentor modules
import {
  MentorDashboard,
  MentorStudentsView,
  MentorReviewModule,
} from './components/mentor/MentorPortal';

// Student modules
import {
  StudentDashboard,
  StudentTimetableView,
  StudentActivityReporting,
  StudentMyReportsView,
  StudentAcademicHistoryView,
} from './components/student/StudentPortal';

// Shared modules
import {
  NotificationsModule,
  UserProfileModule,
} from './components/shared/NotificationsAndProfile';

const FirstLoginAdminCredentialModal: React.FC = () => {
  const {
    session,
    requiresAdminCredentialSetup,
    dismissAdminCredentialSetup,
    refresh,
    notify,
  } = useApp();

  const [newUsername, setNewUsername] = useState(session?.profile.username || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (requiresAdminCredentialSetup && session) {
      setNewUsername(session.profile.username);
      setNewPassword('');
      setConfirmPassword('');
      setError(null);
    }
  }, [requiresAdminCredentialSetup, session]);

  if (!session || session.profile.role !== 'admin' || !requiresAdminCredentialSetup) {
    return null;
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanUsername = newUsername.trim();
    if (!cleanUsername) {
      setError('Username is required.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Please choose a permanent password of at least 6 characters.');
      return;
    }
    if (newPassword === '1111') {
      setError('Please choose a new password different from the temporary password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      await dataService.updateUserCredentials(
        session.profile,
        session.profile.id,
        cleanUsername,
        newPassword
      );
      await refresh();
      dismissAdminCredentialSetup();
      notify('success', `Administrator credentials updated. Username is now "${cleanUsername}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update administrator credentials.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={true}
      title="Update Temporary Admin Credentials"
      subtitle="You signed in with the temporary initial password. Set your permanent Administrator username and password now."
      onClose={dismissAdminCredentialSetup}
      maxWidth="md"
    >
      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 flex items-start gap-2.5">
        <KeyRound className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
        <span>
          Temporary credentials (<code className="font-mono font-semibold">kkhmoffcourse</code> /{' '}
          <code className="font-mono font-semibold">1111</code>) should be replaced immediately on
          first login. You can also update credentials anytime under{' '}
          <strong>Settings → Security &amp; Credentials</strong>.
        </span>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
          {error}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700">
            Admin Username *
          </label>
          <input
            type="text"
            required
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            placeholder="Enter new or preferred admin username"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-[#1E3A5F] focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700">
            New Password * (min 6 characters)
          </label>
          <div className="mt-1 relative">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter a strong permanent password"
              className="w-full rounded-lg border border-slate-300 px-3 pr-10 py-2 text-sm font-mono focus:border-[#1E3A5F] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:bg-slate-100 cursor-pointer"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700">
            Confirm New Password *
          </label>
          <input
            type={showPassword ? 'text' : 'password'}
            required
            minLength={6}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your new password"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-[#1E3A5F] focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={dismissAdminCredentialSetup}
            className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            Later in Settings
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[#1E3A5F] px-4 py-2 text-xs font-semibold text-white hover:bg-[#162C49] disabled:opacity-60 cursor-pointer"
          >
            {saving ? 'Updating...' : 'Save Permanent Credentials'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const AppRouter: React.FC = () => {
  const {
    session,
    db,
    loading,
    activeRoute,
    toasts,
    dismissToast,
    confirmState,
    closeConfirm,
  } = useApp();

  const renderRoleView = () => {
    if (!session) return null;
    const role = session.profile.role;

    if (role === 'admin') {
      switch (activeRoute) {
        case 'dashboard':
          return <AdminDashboard />;
        case 'academic-years':
          return <AcademicYearsModule />;
        case 'students':
          return <StudentsModule />;
        case 'mentors':
          return <MentorsModule />;
        case 'mentor-assignments':
          return <MentorAssignmentsModule />;
        case 'semesters-subjects':
          return <SemestersSubjectsModule />;
        case 'timetable':
          return <TimetableModule />;
        case 'calendar':
          return <AcademicCalendarModule />;
        case 'reports':
          return <AdminReportsModule />;
        case 'notifications':
          return <NotificationsModule />;
        case 'settings':
          return <AdminSettingsModule />;
        case 'audit-logs':
          return <AuditLogsModule />;
        default:
          return <AdminDashboard />;
      }
    }

    if (role === 'mentor') {
      switch (activeRoute) {
        case 'dashboard':
          return <MentorDashboard />;
        case 'my-students':
          return <MentorStudentsView />;
        case 'pending-approvals':
          return <MentorReviewModule key="pending" filterMode="pending" />;
        case 'approved-reports':
          return <MentorReviewModule key="approved" filterMode="approved" />;
        case 'returned-reports':
          return <MentorReviewModule key="returned" filterMode="returned" />;
        case 'activity-history':
          return <MentorReviewModule key="all" filterMode="all" />;
        case 'notifications':
          return <NotificationsModule />;
        case 'profile':
          return <UserProfileModule />;
        default:
          return <MentorDashboard />;
      }
    }

    // Student portal
    switch (activeRoute) {
      case 'dashboard':
        return <StudentDashboard />;
      case 'timetable':
        return <StudentTimetableView />;
      case 'reporting':
        return <StudentActivityReporting />;
      case 'my-reports':
        return <StudentMyReportsView />;
      case 'academic-history':
        return <StudentAcademicHistoryView />;
      case 'notifications':
        return <NotificationsModule />;
      case 'profile':
        return <UserProfileModule />;
      default:
        return <StudentDashboard />;
    }
  };

  if (loading && !db) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <CollegeEmblem size="lg" />
        <p className="mt-4 text-sm font-semibold text-slate-900">
          KKHM Off-Course Activity Management System
        </p>
        <p className="mt-1 text-xs text-slate-500">Loading institutional workspace...</p>
      </div>
    );
  }

  return (
    <>
      {!session ? (
        <LoginPage />
      ) : (
        <AppShell>{renderRoleView()}</AppShell>
      )}
      <FirstLoginAdminCredentialModal />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <ConfirmDialog state={confirmState} onClose={closeConfirm} />
      <OfflineIndicator />
    </>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AppRouter />
    </AppProvider>
  );
}
