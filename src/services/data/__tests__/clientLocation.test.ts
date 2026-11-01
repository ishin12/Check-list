import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('idb', () => {
  const stores = new Map<string, Map<unknown, unknown>>();
  const store = (name: string) => { if (!stores.has(name)) stores.set(name, new Map()); return stores.get(name)!; };
  const db = {
    objectStoreNames: { contains: () => true },
    getAll: async (name: string) => [...store(name).values()],
    getAllKeys: async (name: string) => [...store(name).keys()],
    get: async (name: string, key: unknown) => store(name).get(key),
    put: async (name: string, value: unknown, key?: unknown) => store(name).set(key ?? (value as { id: unknown }).id, value),
    delete: async (name: string, key: unknown) => store(name).delete(key),
    clear: async (name: string) => store(name).clear(),
    transaction: (name: string) => ({ store: { clear: async () => store(name).clear(), put: async (value: { id: unknown }) => store(name).set(value.id, value) }, done: Promise.resolve() }),
  };
  return { openDB: async () => db };
});

import { getSupabase } from '@/services/supabase/client';
import { applyClientLocationToTasks, getClientLocation, updateClientDetails, updateClientLocation } from '../clients';
import { getTask } from '../tasks';

describe('client location', () => {
  beforeAll(async () => {
    await getSupabase().auth.getSession();
    await (window as unknown as { __demo: { setActiveUser(id: string): Promise<void> } }).__demo.setActiveUser('u-mgr');
  });

  it('saves a client default and updates existing jobs only after explicit apply', async () => {
    const location = { locationUrl: 'https://www.google.com/maps/search/?api=1&query=24.7136,46.6753', locationLat: 24.7136, locationLng: 46.6753 };
    await updateClientLocation('c-1', location);
    expect(await getClientLocation('c-1')).toMatchObject(location);
    expect((await getTask('k-7'))?.locationLat).toBeUndefined();

    await applyClientLocationToTasks('c-1', location);
    expect((await getTask('k-7'))?.locationLat).toBe(24.7136);
    expect((await getTask('k-3'))?.locationLat).toBeUndefined();
  });

  it('updates editable client contact details without changing its saved location', async () => {
    await updateClientDetails('c-1', {
      name: 'Updated client',
      email: 'updated@example.com',
      phone: '+966500000000',
      address: 'Riyadh',
    });

    const { data } = await getSupabase().from('clients').select('*').eq('id', 'c-1').maybeSingle();
    expect(data).toMatchObject({
      name: 'Updated client',
      email: 'updated@example.com',
      phone: '+966500000000',
      address: 'Riyadh',
    });
    expect(data?.location_lat).toBe(24.7136);
  });
});
