import { LocalStorageProvider } from './LocalStorageProvider';
import type { StorageProvider } from './StorageProvider';

let instance: StorageProvider | null = null;

/**
 * Single place that decides which StorageProvider the app uses. To move to a
 * backend later, return an ApiStorageProvider here instead.
 */
export function getStorage(): StorageProvider {
  if (!instance) {
    instance = new LocalStorageProvider();
  }
  return instance;
}

export type { StorageProvider, Settings } from './StorageProvider';
