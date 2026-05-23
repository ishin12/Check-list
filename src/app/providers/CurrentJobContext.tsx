import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Job } from '@/domain/models/types';

interface CurrentJobContextValue {
  job: Job | null;
  setJob: (job: Job | null) => void;
}

const CurrentJobContext = createContext<CurrentJobContextValue | null>(null);

export function CurrentJobProvider({ children }: { children: ReactNode }) {
  const [job, setJob] = useState<Job | null>(null);
  return (
    <CurrentJobContext.Provider value={{ job, setJob }}>
      {children}
    </CurrentJobContext.Provider>
  );
}

export function useCurrentJob(): CurrentJobContextValue {
  const ctx = useContext(CurrentJobContext);
  if (!ctx) {
    throw new Error('useCurrentJob must be used within CurrentJobProvider');
  }
  return ctx;
}
