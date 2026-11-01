import type { TaskLocation } from '@/domain/location';
import { getSupabase } from '@/services/supabase/client';

type ClientLocationRow = { location_url: string | null; location_lat: number | null; location_lng: number | null };

function locationColumns(location: TaskLocation | null) {
  return {
    location_url: location?.locationUrl ?? null,
    location_lat: location?.locationLat ?? null,
    location_lng: location?.locationLng ?? null,
  };
}

/** Client's default site location. Jobs retain their own location snapshot. */
export async function getClientLocation(clientId: string): Promise<TaskLocation | null> {
  const { data, error } = await getSupabase()
    .from('clients').select('location_url, location_lat, location_lng').eq('id', clientId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as ClientLocationRow;
  if (!row.location_url && row.location_lat == null && row.location_lng == null) return null;
  return { locationUrl: row.location_url, locationLat: row.location_lat, locationLng: row.location_lng };
}

export async function updateClientLocation(clientId: string, location: TaskLocation | null): Promise<void> {
  const { error } = await getSupabase().from('clients').update(locationColumns(location)).eq('id', clientId);
  if (error) throw error;
}

/** Only called after the manager explicitly chooses to update existing jobs. */
export async function applyClientLocationToTasks(clientId: string, location: TaskLocation | null): Promise<void> {
  const { error } = await getSupabase().from('tasks').update(locationColumns(location)).eq('client_id', clientId);
  if (error) throw error;
}
