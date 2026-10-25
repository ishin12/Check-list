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

import { createNextOccurrence, createTask, getTask, updateTaskLocation } from '@/services/data/tasks';
import { getSupabase } from '@/services/supabase/client';

describe('mock backend: task location', () => {
  beforeAll(async () => {
    await getSupabase().auth.getSession(); // seeds the demo data
    await (window as unknown as { __demo: { setActiveUser(id: string): Promise<void> } }).__demo.setActiveUser('u-mgr');
  });

  it('seeds a located demo task and leaves others empty', async () => {
    const seeded = await getTask('k-1');
    expect(seeded?.locationLat).toBe(24.7136);
    expect(seeded?.locationLng).toBe(46.6753);
    const plain = await getTask('k-8');
    expect(plain?.locationUrl).toBeUndefined();
    expect(plain?.locationLat).toBeUndefined();
  });

  it('round-trips create, update, clear and copies to the next visit', async () => {
    const t = await createTask({
      title: 'Located', clientId: 'c-1', workerIds: ['u-wa'], scheduledAt: new Date().toISOString(),
      recurrence: 'weekly', location: { locationUrl: 'https://maps.app.goo.gl/x', locationLat: 1.5, locationLng: 2.5 },
    });
    expect(t.locationLat).toBe(1.5);
    const next = await createNextOccurrence(t);
    expect(next?.locationUrl).toBe('https://maps.app.goo.gl/x');
    expect(next?.locationLng).toBe(2.5);

    await updateTaskLocation(t.id, { locationUrl: null, locationLat: 3, locationLng: 4 });
    expect((await getTask(t.id))?.locationLat).toBe(3);
    await updateTaskLocation(t.id, null);
    const cleared = await getTask(t.id);
    expect(cleared?.locationLat).toBeUndefined();
    expect(cleared?.locationUrl).toBeUndefined();
  });
});
