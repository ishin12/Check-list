import { getSupabase } from '@/services/supabase/client';
import { isDemoMode } from '@/services/supabase/client';

/**
 * Invoke a Supabase Edge Function with the caller's JWT. In demo mode the
 * mock client intercepts these by name and simulates the server behaviour.
 */
export async function invokeFunction<T = unknown>(
  name: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; data?: T; error?: string }> {
  const sb = getSupabase();
  // The mock client implements .functions.invoke for demo mode.
  const anyClient = sb as unknown as {
    functions?: { invoke: (n: string, opts: { body: unknown }) => Promise<{ data: unknown; error: { message: string } | null }> };
  };
  if (!anyClient.functions) {
    return { ok: false, error: 'functions API unavailable' };
  }
  try {
    const { data, error } = await anyClient.functions.invoke(name, { body });
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export { isDemoMode };
