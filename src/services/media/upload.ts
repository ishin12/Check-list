import { getSupabase, isDemoMode } from '@/services/supabase/client';
import { MediaError, mapUploadError, type RawUploadFailure } from './mediaErrors';

export type ProgressFn = (fraction: number) => void;

/** `${taskId}/${kind}-${uuid}.${ext}` — the first segment is what storage policies key on. */
export function proofPath(taskId: string, kind: 'start' | 'finish', id: string, ext: string): string {
  return `${taskId}/${kind}-${id}.${ext}`;
}

/** Builds a failure description from an HTTP error response body (JSON or text). */
export function failureFromResponse(status: number, body: string): RawUploadFailure {
  try {
    const j = JSON.parse(body) as { message?: string; error?: string; statusCode?: string | number };
    return { status: Number(j.statusCode) || status, message: j.message, error: j.error };
  } catch {
    return { status, message: body };
  }
}

function offline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Uploads a proof file to the private `proofs` bucket, reporting progress.
 * Throws MediaError. Real mode uploads straight to a signed upload URL with
 * XHR (fetch cannot report upload progress); demo mode writes to the mock
 * store and simulates progress.
 */
export async function uploadProof(args: { path: string; blob: Blob; mime: string; onProgress?: ProgressFn }): Promise<void> {
  const { path, blob, mime, onProgress } = args;
  if (isDemoMode()) {
    for (const f of [0.2, 0.5, 0.8]) {
      onProgress?.(f);
      await new Promise((r) => setTimeout(r, 40));
    }
    const { error } = await getSupabase().storage.from('proofs').upload(path, blob, { contentType: mime, upsert: false });
    if (error) throw new MediaError(mapUploadError({ message: error.message }));
    onProgress?.(1);
    return;
  }

  if (offline()) throw new MediaError('offline');
  const sb = getSupabase();
  const { data, error } = await sb.storage.from('proofs').createSignedUploadUrl(path);
  if (error || !data) {
    const e = error as unknown as { status?: number; statusCode?: string; message?: string } | null;
    throw new MediaError(mapUploadError({
      status: e?.status ?? (Number(e?.statusCode) || undefined),
      message: e?.message,
      network: offline(),
    }), e?.message);
  }

  // Mirrors storage-js uploadToSignedUrl for a Blob body: PUT multipart/form-data
  // with `cacheControl` and the file under an empty field name, plus x-upsert.
  const form = new FormData();
  form.append('cacheControl', '3600');
  form.append('', new File([blob], 'proof', { type: mime }));
  const headers: Record<string, string> = { 'x-upsert': 'false' };
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (anon) headers.apikey = anon;
  const { data: sess } = await sb.auth.getSession();
  headers.Authorization = `Bearer ${sess.session?.access_token ?? anon ?? ''}`;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', data.signedUrl);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.timeout = 180_000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { onProgress?.(1); resolve(); return; }
      const f = failureFromResponse(xhr.status, xhr.responseText);
      reject(new MediaError(mapUploadError(f), f.message));
    };
    xhr.onerror = () => reject(new MediaError('offline'));
    xhr.ontimeout = () => reject(new MediaError('offline'));
    xhr.onabort = () => reject(new MediaError('offline'));
    xhr.send(form);
  });
}
