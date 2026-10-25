import { openDB, type IDBPDatabase } from 'idb';
import { deleteOtherProofsOfKind, insertProofRow } from '@/services/data/tasks';
import { extForMime } from './imageCompress';
import { MediaError, type MediaErrorCode } from './mediaErrors';
import { proofPath, uploadProof } from './upload';

interface QueuedItem {
  id: string;
  taskId: string;
  kind: 'start' | 'finish';
  mime: string;
  capturedAt: string;
  blob: Blob;
  /** Retake: remove older proofs of this kind once this one is stored. */
  replace?: boolean;
  attempts?: number;
  lastError?: MediaErrorCode;
  lastErrorMessage?: string;
  lastAttemptAt?: string;
}

/** What the UI needs to know about a queued item (no blob). */
export interface QueuedSummary {
  id: string;
  taskId: string;
  kind: 'start' | 'finish';
  attempts: number;
  lastError?: MediaErrorCode;
  lastErrorMessage?: string;
  /** True while an upload attempt is in flight. */
  uploading: boolean;
}

const DB_NAME = 'checklist-media';
const STORE = 'queue';

let dbPromise: Promise<IDBPDatabase> | null = null;
function db() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
}

// --- change notifications ---------------------------------------------------
const listeners = new Set<() => void>();
export function subscribeQueue(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
function notify() { listeners.forEach((cb) => cb()); }

let inFlightId: string | null = null;

export async function enqueueProof(item: Omit<QueuedItem, 'id'>): Promise<string> {
  const id = crypto.randomUUID();
  const conn = await db();
  await conn.put(STORE, { id, ...item });
  notify();
  void flushQueue();
  return id;
}

export async function pendingCount(): Promise<number> {
  const conn = await db();
  return conn.count(STORE);
}

/** Queued (not yet uploaded) items, optionally for a single task. */
export async function listQueued(taskId?: string): Promise<QueuedSummary[]> {
  const conn = await db();
  const all = (await conn.getAll(STORE)) as QueuedItem[];
  return all
    .filter((i) => !taskId || i.taskId === taskId)
    .map((i) => ({
      id: i.id, taskId: i.taskId, kind: i.kind, attempts: i.attempts ?? 0,
      lastError: i.lastError, lastErrorMessage: i.lastErrorMessage, uploading: inFlightId === i.id,
    }));
}

/** Gives up on a queued item (the photo is discarded). */
export async function discardQueued(id: string): Promise<void> {
  const conn = await db();
  await conn.delete(STORE, id);
  notify();
}

let flushing = false;
export async function flushQueue(): Promise<void> {
  if (flushing || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
  flushing = true;
  try {
    const conn = await db();
    const items = (await conn.getAll(STORE)) as QueuedItem[];
    for (const it of items) {
      inFlightId = it.id;
      notify();
      try {
        await uploadOne(it);
        await conn.delete(STORE, it.id);
      } catch (e) {
        // Keep it queued, but remember why so the UI can say so.
        const code: MediaErrorCode = e instanceof MediaError ? e.code : 'other';
        const message = e instanceof Error ? e.message : String(e);
        console.warn('Proof upload failed', it.id, code, message);
        await conn.put(STORE, {
          ...it,
          attempts: (it.attempts ?? 0) + 1,
          lastError: code,
          lastErrorMessage: message,
          lastAttemptAt: new Date().toISOString(),
        });
      } finally {
        inFlightId = null;
        notify();
      }
    }
  } finally {
    flushing = false;
  }
}

async function uploadOne(it: QueuedItem): Promise<void> {
  const path = proofPath(it.taskId, it.kind, it.id, extForMime(it.mime));
  try {
    await uploadProof({ path, blob: it.blob, mime: it.mime });
  } catch (e) {
    // Already uploaded by an earlier attempt whose row insert failed: carry on.
    if (!(e instanceof MediaError && e.code === 'exists')) throw e;
  }
  await insertProofRow({ taskId: it.taskId, kind: it.kind, path, mime: it.mime, capturedAt: it.capturedAt });
  if (it.replace) {
    try { await deleteOtherProofsOfKind(it.taskId, it.kind, path); } catch { /* best effort */ }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flushQueue());
}
