import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const SUPABASE_URL = metaEnv?.VITE_SUPABASE_URL?.trim() || '';
const SUPABASE_ANON_KEY = metaEnv?.VITE_SUPABASE_ANON_KEY?.trim() || '';

export const isSupabaseConfigured = (): boolean => {
  return Boolean(
    SUPABASE_URL &&
      SUPABASE_ANON_KEY &&
      SUPABASE_URL.startsWith('https://') &&
      !SUPABASE_URL.includes('your-project-ref')
  );
};

let activeSessionToken: string | null = null;
let cachedClient: SupabaseClient | null = null;

export const setSupabaseSessionToken = (token: string | null): void => {
  activeSessionToken = token;
  cachedClient = null;
};

export const getSupabaseClient = (): SupabaseClient | null => {
  if (!isSupabaseConfigured()) return null;
  if (!cachedClient) {
    cachedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: activeSessionToken ? { 'x-kkhm-session': activeSessionToken } : {},
      },
    });
  }
  return cachedClient;
};

export const getDatabaseMode = (): 'supabase' | 'sandbox' => {
  return isSupabaseConfigured() ? 'supabase' : 'sandbox';
};
