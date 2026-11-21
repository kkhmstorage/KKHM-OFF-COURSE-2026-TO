import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { dataService } from '../services/dataService';
import { setSupabaseSessionToken } from '../lib/supabase';
import type {
  AcademicYear,
  AcademicYearSettings,
  AuthSession,
  DatabaseSnapshot,
} from '../types/domain';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

export interface ConfirmState {
  title: string;
  description: string;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  onConfirm: () => Promise<void> | void;
}

interface AppContextValue {
  session: AuthSession | null;
  db: DatabaseSnapshot | null;
  loading: boolean;
  isProductionSupabase: boolean;
  activeYear: AcademicYear | undefined;
  activeYearSettings: AcademicYearSettings | undefined;
  activeRoute: string;
  routePayload: Record<string, string>;
  navigate: (route: string, payload?: Record<string, string>) => void;
  login: (identifier: string, password: string, remember?: boolean) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  notify: (type: ToastMessage['type'], text: string) => void;
  confirmAction: (cfg: ConfirmState) => void;
  toasts: ToastMessage[];
  dismissToast: (id: string) => void;
  confirmState: ConfirmState | null;
  closeConfirm: () => void;
  requiresAdminCredentialSetup: boolean;
  dismissAdminCredentialSetup: () => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

const SESSION_KEY = 'kkhm_ams_session_v1';

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [db, setDb] = useState<DatabaseSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeRoute, setActiveRoute] = useState<string>('dashboard');
  const [routePayload, setRoutePayload] = useState<Record<string, string>>({});
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [requiresAdminCredentialSetup, setRequiresAdminCredentialSetup] = useState(false);

  const notify = useCallback((type: ToastMessage['type'], text: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const snap = await dataService.fetchSnapshot();
      setDb(snap);
      // Keep session profile synced with latest DB state
      setSession((curr) => {
        if (!curr) return null;
        const freshProfile = snap.profiles.find((p) => p.id === curr.profile.id);
        if (!freshProfile || !freshProfile.is_active) {
          return null;
        }
        const freshStudent = snap.students.find((s) => s.profile_id === freshProfile.id);
        const freshMentor = snap.mentors.find((m) => m.profile_id === freshProfile.id);
        return {
          ...curr,
          profile: freshProfile,
          student: freshStudent,
          mentor: freshMentor,
        };
      });
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to load institutional records.');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    // Restore remembered session if present (sandbox or supabase token)
    try {
      const saved = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as AuthSession;
        if (parsed?.profile?.id) {
          if (parsed.token) {
            setSupabaseSessionToken(parsed.token);
          }
          setSession(parsed);
        }
      }
    } catch {
      // Ignore malformed storage
    }
    void refresh();
  }, [refresh]);

  const navigate = useCallback((route: string, payload?: Record<string, string>) => {
    setActiveRoute(route);
    setRoutePayload(payload || {});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const login = useCallback(
    async (identifier: string, password: string, remember = true) => {
      const authSession = await dataService.login(identifier, password);
      setSession(authSession);
      setActiveRoute('dashboard');
      setRoutePayload({});
      if (authSession.profile.role === 'admin' && password === '1111') {
        setRequiresAdminCredentialSetup(true);
      } else {
        setRequiresAdminCredentialSetup(false);
      }
      try {
        const serialized = JSON.stringify({
          token: authSession.token,
          profile: { ...authSession.profile, password_sandbox: undefined },
          student: authSession.student,
          mentor: authSession.mentor,
        });
        if (remember) {
          localStorage.setItem(SESSION_KEY, serialized);
        } else {
          sessionStorage.setItem(SESSION_KEY, serialized);
        }
      } catch {
        // Storage unavailable
      }
      await refresh();
      notify('success', `Welcome back, ${authSession.profile.full_name}.`);
    },
    [notify, refresh]
  );

  const logout = useCallback(() => {
    dataService.logout();
    setSession(null);
    setRequiresAdminCredentialSetup(false);
    setActiveRoute('dashboard');
    setRoutePayload({});
    try {
      localStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // Ignore
    }
    notify('info', 'You have been signed out safely.');
  }, [notify]);

  const activeYear = useMemo(() => {
    if (!db) return undefined;
    return (
      db.academic_years.find((y) => y.id === db.app_settings.selected_academic_year_id) ||
      db.academic_years[0]
    );
  }, [db]);

  const activeYearSettings = useMemo(() => {
    if (!db || !activeYear) return undefined;
    return db.academic_year_settings.find((s) => s.academic_year_id === activeYear.id);
  }, [db, activeYear]);

  const confirmAction = useCallback((cfg: ConfirmState) => {
    setConfirmState(cfg);
  }, []);

  const closeConfirm = useCallback(() => {
    setConfirmState(null);
  }, []);

  const dismissAdminCredentialSetup = useCallback(() => {
    setRequiresAdminCredentialSetup(false);
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      session,
      db,
      loading,
      isProductionSupabase: dataService.isProductionSupabase(),
      activeYear,
      activeYearSettings,
      activeRoute,
      routePayload,
      navigate,
      login,
      logout,
      refresh,
      notify,
      confirmAction,
      toasts,
      dismissToast,
      confirmState,
      closeConfirm,
      requiresAdminCredentialSetup,
      dismissAdminCredentialSetup,
    }),
    [
      session,
      db,
      loading,
      activeYear,
      activeYearSettings,
      activeRoute,
      routePayload,
      navigate,
      login,
      logout,
      refresh,
      notify,
      confirmAction,
      toasts,
      dismissToast,
      confirmState,
      closeConfirm,
      requiresAdminCredentialSetup,
      dismissAdminCredentialSetup,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
