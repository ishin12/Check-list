import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getMockClient } from './mockClient';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const demoFlag = import.meta.env.VITE_DEMO_MODE;

/** Demo mode runs against an in-browser fake backend (see mockClient.ts). */
export function isDemoMode(): boolean {
  if (demoFlag === '0' || demoFlag === 'false') return false;
  if (demoFlag === '1' || demoFlag === 'true') return true;
  // No explicit flag: fall back to demo whenever Supabase isn't configured.
  return !url || !anonKey;
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (isDemoMode()) {
    // The mock is shape-compatible with the subset of SupabaseClient we use.
    return getMockClient() as unknown as SupabaseClient;
  }
  if (!url || !anonKey) {
    throw new Error(
      'Supabase env vars missing. Copy .env.example to .env.local and fill in ' +
        'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or leave VITE_DEMO_MODE=1).',
    );
  }
  if (!client) {
    client = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}

export function hasSupabaseConfig(): boolean {
  return isDemoMode() || Boolean(url && anonKey);
}
