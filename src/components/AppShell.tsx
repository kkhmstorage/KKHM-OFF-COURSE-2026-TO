import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Bell,
  BookOpen,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileClock,
  FileSpreadsheet,
  GraduationCap,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  RotateCcw,
  ScrollText,
  Settings,
  UserCircle2,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { dataService } from '../services/dataService';
import type { UserRole } from '../types/domain';
import { CollegeEmblem } from './ui/CommonUI';
import { PWAInstallButton } from './PWAInstallButton';

interface NavItem {
  id: string;
  label: string;
  icon: React.FC<{ className?: string }>;
  badge?: number;
}

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    session,
    db,
    activeYear,
    activeRoute,
    navigate,
    logout,
    refresh,
    notify,
    isProductionSupabase,
  } = useApp();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [switchingYear, setSwitchingYear] = useState(false);

  const role: UserRole = session?.profile.role || 'student';

  const unreadCount = useMemo(() => {
    if (!db || !session) return 0;
    return db.notifications.filter(
      (n) => n.recipient_profile_id === session.profile.id && !n.is_read
    ).length;
  }, [db, session]);

  const navItems: NavItem[] = useMemo(() => {
    if (role === 'admin') {
      return [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'academic-years', label: 'Academic Years', icon: CalendarDays },
        { id: 'students', label: 'Students', icon: GraduationCap },
        { id: 'mentors', label: 'Mentors', icon: Users },
        { id: 'mentor-assignments', label: 'Mentor Assignments', icon: UserCog },
        { id: 'semesters-subjects', label: 'Semesters & Subjects', icon: BookOpen },
        { id: 'timetable', label: 'Timetable', icon: FileSpreadsheet },
        { id: 'calendar', label: 'Academic Calendar', icon: Calendar },
        { id: 'reports', label: 'Reports & Analytics', icon: BarChart3 },
        { id: 'notifications', label: 'Notifications', icon: Bell, badge: unreadCount },
        { id: 'settings', label: 'Settings', icon: Settings },
        { id: 'audit-logs', label: 'Audit Logs', icon: ScrollText },
      ];
    }
    if (role === 'mentor') {
      return [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'my-students', label: 'My Students', icon: GraduationCap },
        { id: 'pending-approvals', label: 'Pending Approvals', icon: Clock },
        { id: 'approved-reports', label: 'Approved Reports', icon: CheckCircle2 },
        { id: 'returned-reports', label: 'Returned Reports', icon: RotateCcw },
        { id: 'activity-history', label: 'Activity History', icon: FileClock },
        { id: 'notifications', label: 'Notifications', icon: Bell, badge: unreadCount },
        { id: 'profile', label: 'Profile', icon: UserCircle2 },
      ];
    }
    return [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'timetable', label: 'Weekly Timetable', icon: FileSpreadsheet },
      { id: 'reporting', label: 'Activity Reporting', icon: ClipboardCheck },
      { id: 'my-reports', label: 'My Reports', icon: ClipboardList },
      { id: 'academic-history', label: 'Academic History', icon: History },
      { id: 'notifications', label: 'Notifications', icon: Bell, badge: unreadCount },
      { id: 'profile', label: 'Profile', icon: UserCircle2 },
    ];
  }, [role, unreadCount]);

  const currentNavLabel =
    navItems.find((item) => item.id === activeRoute)?.label || 'Dashboard';

  const handleGlobalYearChange = async (yearId: string) => {
    if (!session || session.profile.role !== 'admin') return;
    setSwitchingYear(true);
    try {
      await dataService.setSelectedAcademicYear(session.profile, yearId);
      await refresh();
      const target = db?.academic_years.find((y) => y.id === yearId);
      notify('success', `Institutional Academic Year switched to ${target?.name || ''}.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to switch academic year.');
    } finally {
      setSwitchingYear(false);
    }
  };

  const handleNavClick = (id: string) => {
    navigate(id);
    setMobileMenuOpen(false);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      {/* Sidebar brand */}
      <div className="h-16 px-4 flex items-center justify-between gap-2 border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <CollegeEmblem size="sm" logoUrl={db?.app_settings.logo_url} />
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 truncate leading-tight">KKHM AMS</div>
              <div className="text-[11px] text-slate-500 capitalize truncate">{role} Portal</div>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setSidebarCollapsed((c) => !c)}
          className="hidden lg:inline-flex rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
          aria-label="Close navigation menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Role-scoped menu */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-0.5" aria-label="Primary Navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeRoute === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item.id)}
              title={sidebarCollapsed ? item.label : undefined}
              className={`w-full flex items-center justify-between gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                active
                  ? 'bg-[#1E3A5F] text-white'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon className="h-4 w-4 shrink-0" />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              </span>
              {!sidebarCollapsed && item.badge && item.badge > 0 ? (
                <span
                  className={`font-mono text-[11px] font-semibold tabular-nums ${
                    active ? 'text-teal-200' : 'text-red-600'
                  }`}
                >
                  {item.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {/* Bottom account quick summary */}
      <div className="border-t border-slate-200 p-3 shrink-0">
        {!sidebarCollapsed && !isProductionSupabase && (
          <div className="mb-2.5 rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-2 text-[11px] text-slate-600">
            Preview Sandbox Mode · Configure Supabase in Settings for live PostgreSQL.
          </div>
        )}
        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors cursor-pointer"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && <span>Sign Out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:block shrink-0 sticky top-0 h-screen transition-all duration-150 no-print ${
          sidebarCollapsed ? 'w-[72px]' : 'w-64'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div
            className="fixed inset-0 bg-slate-900/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] h-full z-10">{sidebarContent}</div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100 cursor-pointer"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="hidden sm:inline text-slate-500 truncate max-w-[200px]">
                {db?.app_settings.institution_name || 'KKHM Islamic & Arts College'}
              </span>
              <span className="hidden sm:inline text-slate-300">/</span>
              <span className="font-semibold text-slate-900 truncate">{currentNavLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Institutional Academic Year Selector */}
            {db && activeYear && (
              <div className="flex items-center gap-2">
                <span className="hidden md:inline text-xs text-slate-500 whitespace-nowrap">
                  Academic Year:
                </span>
                {role === 'admin' ? (
                  <select
                    aria-label="Select Institutional Academic Year"
                    value={activeYear.id}
                    disabled={switchingYear}
                    onChange={(e) => handleGlobalYearChange(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-[#1E3A5F] focus:outline-none cursor-pointer"
                  >
                    {db.academic_years.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.name} ({y.status === 'open' ? 'Open' : 'Closed'})
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs font-semibold text-[#1E3A5F] whitespace-nowrap font-mono">
                    {activeYear.name} · {activeYear.status === 'open' ? 'Open' : 'Closed'}
                  </span>
                )}
              </div>
            )}

            <PWAInstallButton />

            {/* Notification Bell */}
            <button
              type="button"
              onClick={() => navigate('notifications')}
              className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
              aria-label={`Notifications (${unreadCount} unread)`}
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-[10px] font-bold text-white flex items-center justify-center tabular-nums">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* User Profile Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <div className="h-7 w-7 rounded-md bg-[#1E3A5F] text-white text-xs font-semibold flex items-center justify-center shrink-0">
                  {session?.profile.full_name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div className="hidden sm:block min-w-0 max-w-[140px]">
                  <div className="text-xs font-semibold text-slate-900 truncate">
                    {session?.profile.full_name}
                  </div>
                  <div className="text-[11px] text-slate-500 capitalize truncate">{role}</div>
                </div>
              </button>

              {profileMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setProfileMenuOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg z-20">
                    <div className="px-3.5 py-2 border-b border-slate-100">
                      <div className="text-xs font-semibold text-slate-900 truncate">
                        {session?.profile.full_name}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        @{session?.profile.username} · {session?.profile.email}
                      </div>
                    </div>
                    {role !== 'admin' && (
                      <button
                        type="button"
                        onClick={() => {
                          setProfileMenuOpen(false);
                          navigate('profile');
                        }}
                        className="w-full text-left px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        My Profile
                      </button>
                    )}
                    {role === 'admin' && (
                      <button
                        type="button"
                        onClick={() => {
                          setProfileMenuOpen(false);
                          navigate('settings');
                        }}
                        className="w-full text-left px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        System Settings &amp; Credentials
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        logout();
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs font-medium text-red-700 hover:bg-red-50 cursor-pointer"
                    >
                      Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Closed Year Read-Only Notice */}
        {activeYear?.status === 'closed' && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-2.5 text-xs text-amber-900 flex items-center justify-between gap-2 no-print">
            <span>
              <strong>Historical View ({activeYear.name}):</strong> This academic year is closed.
              Records are preserved read-only and new student activity submissions are disabled.
            </span>
          </div>
        )}

        {/* Workspace Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto print-container">
          {children}
        </main>
      </div>
    </div>
  );
};
