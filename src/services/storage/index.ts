import { LocalStorageProvider } from './LocalStorageProvider';
import { SupabaseStorageProvider } from './SupabaseStorageProvider';
import { hasSupabaseConfig } from '@/services/supabase/client';
import type { StorageProvider } from './StorageProvider';

let instance: StorageProvider | null = null;

/**
 * Returns the live StorageProvider. Uses Supabase when env vars are set
 * (production / configured dev), otherwise falls back to localStorage so the
 * app still runs unconfigured.
 */
export function getStorage(): StorageProvider {
  if (!instance) {
    instance = hasSupabaseConfig() ? new SupabaseStorageProvider() : new LocalStorageProvider();
  }
  return instance;
}

export type { StorageProvider, Settings } from './StorageProvider';
