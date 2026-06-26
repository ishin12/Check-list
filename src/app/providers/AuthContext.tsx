import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getSupabase, hasSupabaseConfig } from '@/services/supabase/client';
import type { AppUser, Role } from '@/domain/models/ops';

interface AuthState {
  loading: boolean;
  user: AppUser | null;
  configured: boolean;
  /** Magic-link sign-in (demo + optional). */
  signInWithEmail: (email: string) => Promise<void>;
  /** Email + password sign-in (production). */
  signInWithPassword: (email: string, password: string) => Promise<void>;
  /** Change the signed-in user's own password. */
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = hasSupabaseConfig();
  const [loading, setLoading] = useState(configured);
  const [user, setUser] = useState<AppUser | null>(null);

  const loadProfile = useCallback(async (userId: string, email: string | null): Promise<AppUser | null> => {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('profiles')
      .select('id, role, full_name, email, phone, client_id, active')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) {
      // Profile row may not exist yet on first login; expose a minimal user with no role.
      return {
        id: userId,
        role: 'worker',
        email: email ?? undefined,
        active: false,
      };
    }
    return {
      id: data.id,
      role: data.role as Role,
      fullName: data.full_name ?? undefined,
      email: data.email ?? undefined,
      phone: data.phone ?? undefined,
      clientId: data.client_id ?? undefined,
      active: data.active,
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!configured) {
      setLoading(false);
      return;
    }
    const sb = getSupabase();
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.user) {
      setUser(null);
      setLoading(false);
      return;
    }
    const profile = await loadProfile(session.user.id, session.user.email ?? null);
    setUser(profile);
    setLoading(false);
  }, [configured, loadProfile]);

  useEffect(() => {
    void refresh();
    if (!configured) return;
    const sb = getSupabase();
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setUser(null);
        return;
      }
      void loadProfile(session.user.id, session.user.email ?? null).then(setUser);
    });
    return () => sub.subscription.unsubscribe();
  }, [configured, loadProfile, refresh]);

  const signInWithEmail = useCallback(async (email: string) => {
    const sb = getSupabase();
    const base = `${location.origin}${import.meta.env.BASE_URL}`.replace(/\/$/, '');
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${base}/auth/callback` },
    });
    if (error) throw error;
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const sb = getSupabase();
    const { error } = await (sb.auth as unknown as {
      signInWithPassword: (a: { email: string; password: string }) => Promise<{ error: { message: string } | null }>;
    }).signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const sb = getSupabase();
    const { error } = await (sb.auth as unknown as {
      updateUser: (a: { password: string }) => Promise<{ error: { message: string } | null }>;
    }).updateUser({ password });
    if (error) throw new Error(error.message);
  }, []);

  const signOut = useCallback(async () => {
    const sb = getSupabase();
    await sb.auth.signOut();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ loading, user, configured, signInWithEmail, signInWithPassword, updatePassword, signOut, refresh }),
    [loading, user, configured, signInWithEmail, signInWithPassword, updatePassword, signOut, refresh],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
