/** User-facing categories for anything that can go wrong saving a proof. */
export type MediaErrorCode =
  | 'tooLarge'   // file over the size limit
  | 'wrongType'  // not an accepted photo/video type
  | 'decode'     // image could not be read (e.g. HEIC in a browser that cannot decode it)
  | 'offline'    // no network / request failed to reach the server
  | 'permission' // 401/403 or RLS rejection
  | 'exists'     // object already uploaded (409); safe to treat as done when retrying
  | 'other';     // bucket missing, server error, anything else

export class MediaError extends Error {
  readonly code: MediaErrorCode;
  constructor(code: MediaErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'MediaError';
    this.code = code;
  }
}

/** i18n key (under the "photo" namespace) and English fallback per category. */
export const MEDIA_ERROR_TEXT: Record<MediaErrorCode, { key: string; fallback: string }> = {
  tooLarge: { key: 'photo.error.tooLarge', fallback: 'This file is too large. Photos can be up to 25 MB and videos up to 50 MB.' },
  wrongType: { key: 'photo.error.wrongType', fallback: 'This file type is not supported. Use a photo (JPEG, PNG, WebP, HEIC) or a video (MP4, MOV, WebM).' },
  decode: { key: 'photo.error.decode', fallback: 'We could not read this photo. Please retake it with the camera.' },
  offline: { key: 'photo.error.offline', fallback: 'No connection. Check your internet and try again.' },
  permission: { key: 'photo.error.permission', fallback: 'You do not have permission to upload this. Ask your manager.' },
  exists: { key: 'photo.error.exists', fallback: 'This file was already uploaded.' },
  other: { key: 'photo.error.other', fallback: 'The upload failed. Please try again.' },
};

export interface RawUploadFailure {
  /** HTTP status when the server answered. 0/undefined when it never did. */
  status?: number;
  message?: string;
  /** Server-provided error name, e.g. "Duplicate". */
  error?: string;
  /** True if the request errored before any response (or navigator is offline). */
  network?: boolean;
}

/** Maps an HTTP/storage failure to one of the user-facing categories. */
export function mapUploadError(f: RawUploadFailure): MediaErrorCode {
  const msg = `${f.error ?? ''} ${f.message ?? ''}`.toLowerCase();
  const status = f.status ?? 0;
  // No HTTP status means the request never completed.
  if (!status && (f.network || msg.includes('failed to fetch') || msg.includes('network') || msg.trim() === '')) return 'offline';
  if (status === 413 || msg.includes('exceeded the maximum allowed size') || msg.includes('payload too large')) return 'tooLarge';
  if (status === 415 || msg.includes('mime type') || msg.includes('invalid_mime')) return 'wrongType';
  if (status === 409 || msg.includes('already exists') || msg.includes('duplicate')) return 'exists';
  if (status === 401 || status === 403 || msg.includes('row-level security') || msg.includes('unauthorized') || msg.includes('not authorized')) return 'permission';
  return 'other';
}
