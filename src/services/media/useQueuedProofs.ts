import { useEffect, useState } from 'react';
import { listQueued, subscribeQueue, type QueuedSummary } from './mediaQueue';

/** Live list of not-yet-uploaded proofs for a task. */
export function useQueuedProofs(taskId: string | undefined): QueuedSummary[] {
  const [items, setItems] = useState<QueuedSummary[]>([]);
  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    const refresh = () => { void listQueued(taskId).then((l) => { if (!cancelled) setItems(l); }); };
    refresh();
    const unsub = subscribeQueue(refresh);
    return () => { cancelled = true; unsub(); };
  }, [taskId]);
  return items;
}
