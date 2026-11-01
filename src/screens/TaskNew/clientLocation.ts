import type { TaskLocation } from '@/domain/location';

export interface ClientLocationOption {
  id: string;
  location?: TaskLocation | null;
}

/** A new job starts with the selected client's saved site location. */
export function clientLocationForSelection<T extends ClientLocationOption>(clients: T[], clientId: string): TaskLocation | null {
  return clients.find((client) => client.id === clientId)?.location ?? null;
}
