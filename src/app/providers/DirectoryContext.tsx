import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getSupabase } from '@/services/supabase/client';
import { useAuth } from './AuthContext';
import type { AppUser, Client } from '@/domain/models/ops';

interface DirectoryState {
  workers: Map<string, AppUser>;
  clients: Map<string, Client>;
  ready: boolean;
  refresh: () => Promise<void>;
}

const Ctx = createContext<DirectoryState | null>(null);

export function DirectoryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [workers, setWorkers] = useState<Map<string, AppUser>>(new Map());
  const [clients, setClients] = useState<Map<string, Client>>(new Map());
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const sb = getSupabase();
    const [{ data: ws }, { data: cs }] = await Promise.all([
      sb.from('profiles').select('id, role, full_name, email, phone, client_id, active'),
      sb.from('clients').select('id, name, email, phone, address, created_at, updated_at'),
    ]);
    const workersMap = new Map<string, AppUser>();
    for (const w of (ws ?? []) as Array<{ id: string; role: AppUser['role']; full_name: string | null; email: string | null; phone: string | null; client_id: string | null; active: boolean }>) {
      workersMap.set(w.id, {
        id: w.id, role: w.role,
        fullName: w.full_name ?? undefined,
        email: w.email ?? undefined,
        phone: w.phone ?? undefined,
        clientId: w.client_id ?? undefined,
        active: w.active,
      });
    }
    const clientsMap = new Map<string, Client>();
    for (const c of (cs ?? []) as Array<{ id: string; name: string; email: string | null; phone: string | null; address: string | null; created_at: string; updated_at: string }>) {
      clientsMap.set(c.id, {
        id: c.id, name: c.name,
        email: c.email ?? undefined,
        phone: c.phone ?? undefined,
        address: c.address ?? undefined,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      });
    }
    setWorkers(workersMap);
    setClients(clientsMap);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!user) { setReady(false); return; }
    void refresh();
  }, [user, refresh]);

  const value = useMemo(() => ({ workers, clients, ready, refresh }), [workers, clients, ready, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDirectory(): DirectoryState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDirectory must be used inside <DirectoryProvider>');
  return v;
}

/** O(1) worker display name lookup. Falls back to email, then to '—'. */
export function useWorkerName(id: string | undefined | null): string {
  const { workers } = useDirectory();
  if (!id) return '—';
  const w = workers.get(id);
  return w?.fullName ?? w?.email ?? '—';
}

/** O(1) client display name lookup. Falls back to '—'. */
export function useClientName(id: string | undefined | null): string {
  const { clients } = useDirectory();
  if (!id) return '—';
  return clients.get(id)?.name ?? '—';
}
