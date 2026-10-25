import { beforeAll, describe, expect, it, vi } from 'vitest';

// Minimal in-memory stand-in for the `idb` API surface mockClient uses.
vi.mock('idb', () => {
  const stores = new Map<string, Map<unknown, unknown>>();
  const store = (n: string) => {
    if (!stores.has(n)) stores.set(n, new Map());
    return stores.get(n)!;
  };
  const conn = {
    objectStoreNames: { contains: () => true },
    getAll: async (n: string) => [...store(n).values()],
    getAllKeys: async (n: string) => [...store(n).keys()],
    get: async (n: string, k: unknown) => store(n).get(k),
    put: async (n: string, v: unknown, k?: unknown) => {
      store(n).set(k ?? (v as { id: unknown }).id, v);
    },
    delete: async (n: string, k: unknown) => { store(n).delete(k); },
    clear: async (n: string) => { store(n).clear(); },
    transaction: (n: string) => ({
      store: {
        clear: async () => { store(n).clear(); },
        put: async (v: { id: unknown }) => { store(n).set(v.id, v); },
      },
      done: Promise.resolve(),
    }),
  };
  return { openDB: async () => conn };
});

import { createTask, getTask, listTasks, setTaskWorkers } from '@/services/data/tasks';
import { getSupabase } from '@/services/supabase/client';

async function notificationsFor(userId: string, taskId: string) {
  const { data } = await getSupabase().from('notifications').select('*').eq('user_id', userId);
  return (data as Array<{ kind: string; payload: { task_id?: string } }>)
    .filter((n) => n.kind === 'task.assigned' && n.payload.task_id === taskId);
}

describe('mock backend: multiple workers per task', () => {
  beforeAll(async () => {
    await getSupabase().auth.getSession(); // seeds the demo data
    await (window as unknown as { __demo: { setActiveUser(id: string): Promise<void> } }).__demo.setActiveUser('u-mgr');
  });

  const setUser = (id: string) =>
    (window as unknown as { __demo: { setActiveUser(id: string): Promise<void> } }).__demo.setActiveUser(id);

  it('seeds a task_workers row per task and loads workerIds with tasks', async () => {
    const k2 = await getTask('k-2');
    expect(k2?.assignedWorkerId).toBe('u-wa');
    expect(k2?.workerIds).toEqual(['u-wa', 'u-wb']);
    const k1 = await getTask('k-1');
    expect(k1?.workerIds).toEqual(['u-wa']);
  });

  it('workerId filter returns every task the worker is on, not only as lead', async () => {
    const mine = await listTasks({ workerId: 'u-wb' });
    expect(mine.map((t) => t.id)).toContain('k-2');
    expect(mine.every((t) => t.workerIds.includes('u-wb'))).toBe(true);
  });

  it('set_task_workers adds workers, notifies the newcomer once, and is idempotent', async () => {
    await setTaskWorkers('k-1', ['u-wa', 'u-wb']);
    expect((await getTask('k-1'))?.workerIds).toEqual(['u-wa', 'u-wb']);
    expect(await notificationsFor('u-wb', 'k-1')).toHaveLength(1);
    await setTaskWorkers('k-1', ['u-wa', 'u-wb']);
    expect(await notificationsFor('u-wb', 'k-1')).toHaveLength(1);
  });

  it('moves the lead when the lead is removed, still notifying the new lead once', async () => {
    await setTaskWorkers('k-8', ['u-wb']);
    const t = await getTask('k-8');
    expect(t?.assignedWorkerId).toBe('u-wb');
    expect(t?.workerIds).toEqual(['u-wb']);
    expect(await notificationsFor('u-wb', 'k-8')).toHaveLength(1);
  });

  it('rejects an empty list, non-workers and non-managers', async () => {
    await expect(setTaskWorkers('k-1', [])).rejects.toBeTruthy();
    await expect(setTaskWorkers('k-1', ['u-cli'])).rejects.toBeTruthy();
    await setUser('u-wb');
    await expect(setTaskWorkers('k-1', ['u-wb'])).rejects.toBeTruthy();
    const { error } = await getSupabase().from('tasks').update({ assigned_worker_id: 'u-wb' }).eq('id', 'k-1');
    expect(error).toBeTruthy();
    await setUser('u-mgr');
  });

  it('createTask with several workers sets the lead and the full list', async () => {
    const task = await createTask({
      title: 'Two-person job', clientId: 'c-1', workerIds: ['u-wb', 'u-wa'],
      scheduledAt: new Date().toISOString(),
    });
    expect(task.assignedWorkerId).toBe('u-wb');
    expect((await getTask(task.id))?.workerIds).toEqual(['u-wb', 'u-wa']);
    expect(await notificationsFor('u-wb', task.id)).toHaveLength(1);
    expect(await notificationsFor('u-wa', task.id)).toHaveLength(1);
  });

  it('get_signing_task lists every worker name', async () => {
    const { data } = await getSupabase().rpc('get_signing_task', {
      p_token: 'demoSignToken000000000000000000000000a1',
    });
    expect((data as Array<{ worker_name: string }>)[0].worker_name).toBe('Ahmed');
    await setTaskWorkers('k-4', ['u-wa', 'u-wb']);
    const again = await getSupabase().rpc('get_signing_task', {
      p_token: 'demoSignToken000000000000000000000000a1',
    });
    expect((again.data as Array<{ worker_name: string }>)[0].worker_name).toBe('Ahmed, Sara');
  });
});
