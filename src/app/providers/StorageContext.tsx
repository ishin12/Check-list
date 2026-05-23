import { createContext, useContext, type ReactNode } from 'react';
import { getStorage } from '@/services/storage';
import type { StorageProvider } from '@/services/storage';

const StorageContext = createContext<StorageProvider | null>(null);

export function StorageProviderContext({ children }: { children: ReactNode }) {
  return (
    <StorageContext.Provider value={getStorage()}>
      {children}
    </StorageContext.Provider>
  );
}

export function useStorage(): StorageProvider {
  const ctx = useContext(StorageContext);
  if (!ctx) {
    throw new Error('useStorage must be used within StorageProviderContext');
  }
  return ctx;
}
