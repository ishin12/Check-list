import { openDB, type IDBPDatabase } from 'idb';
import { getSupabase } from '@/services/supabase/client';

interface QueuedItem {
  id: string;
  taskId: string;
  kind: 'start' | 'finish';
  mime: string;
  capturedAt: string;
  blob: Blob;
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

export async function enqueueProof(item: Omit<QueuedItem, 'id'>): Promise<string> {
  const id = crypto.randomUUID();
  const conn = await db();
  await conn.put(STORE, { id, ...item });
  void flushQueue();
  return id;
}

export async function pendingCount(): Promise<number> {
  const conn = await db();
  return conn.count(STORE);
}

let flushing = false;
export async function flushQueue(): Promise<void> {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    const conn = await db();
    const items = await conn.getAll(STORE);
    for (const it of items as QueuedItem[]) {
      try {
        await uploadOne(it);
        await conn.delete(STORE, it.id);
      } catch {
        // Leave in queue and retry on next call.
      }
    }
  } finally {
    flushing = false;
  }
}

async function uploadOne(it: QueuedItem): Promise<void> {
  const sb = getSupabase();
  const ext = it.mime.split('/')[1]?.split(';')[0] ?? 'bin';
  const path = `${it.taskId}/${it.kind}-${it.id}.${ext}`;
  const { error: upErr } = await sb.storage.from('proofs').upload(path, it.blob, {
    contentType: it.mime,
    upsert: false,
  });
  if (upErr) throw upErr;
  const { error: dbErr } = await sb.from('task_proofs').insert({
    task_id: it.taskId,
    kind: it.kind,
    storage_path: path,
    mime: it.mime,
    captured_at: it.capturedAt,
  });
  if (dbErr) throw dbErr;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flushQueue());
}
