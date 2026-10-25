import { MediaError } from './mediaErrors';

export const MAX_IMAGE_INPUT_BYTES = 25 * 1024 * 1024;
export const MAX_VIDEO_INPUT_BYTES = 50 * 1024 * 1024;
export const MAX_LONG_EDGE = 1600;
export const JPEG_QUALITY = 0.82;
/** A JPEG that is already this small (and within MAX_LONG_EDGE) is uploaded as is. */
export const SKIP_REENCODE_BYTES = 1.5 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;
export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const;
export const ACCEPT_ATTR = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES].join(',');

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
};
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
};

/** Some pickers (iPhone HEIC, some Android videos) report an empty type; fall back to the extension. */
export function resolveMime(file: { type: string; name?: string }): string {
  const t = (file.type || '').split(';')[0].trim().toLowerCase();
  if (t && t !== 'application/octet-stream') return t === 'image/jpg' ? 'image/jpeg' : t;
  const ext = (file.name ?? '').split('.').pop()?.toLowerCase() ?? '';
  return EXT_TO_MIME[ext] ?? t;
}

/** File extension for a final mime. Never 'octet-stream'. */
export function extForMime(mime: string): string {
  return MIME_TO_EXT[mime.split(';')[0].trim().toLowerCase()] ?? 'jpg';
}

export type Validation =
  | { ok: true; mime: string; isVideo: boolean }
  | { ok: false; code: 'wrongType' | 'tooLarge' };

export function validateMedia(file: { type: string; name?: string; size: number }): Validation {
  const mime = resolveMime(file);
  const isImage = (ALLOWED_IMAGE_TYPES as readonly string[]).includes(mime);
  const isVideo = (ALLOWED_VIDEO_TYPES as readonly string[]).includes(mime);
  if (!isImage && !isVideo) return { ok: false, code: 'wrongType' };
  const limit = isVideo ? MAX_VIDEO_INPUT_BYTES : MAX_IMAGE_INPUT_BYTES;
  if (file.size > limit) return { ok: false, code: 'tooLarge' };
  return { ok: true, mime, isVideo };
}

/** Scales (w, h) down so the long edge is at most `max`; never upscales. */
export function targetSize(w: number, h: number, max = MAX_LONG_EDGE): { width: number; height: number } {
  const long = Math.max(w, h);
  if (long <= max) return { width: w, height: h };
  const s = max / long;
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) };
}

export function shouldSkipReencode(mime: string, w: number, h: number, size: number): boolean {
  return mime === 'image/jpeg' && Math.max(w, h) <= MAX_LONG_EDGE && size <= SKIP_REENCODE_BYTES;
}

export interface PreparedMedia {
  blob: Blob;
  mime: string;
  ext: string;
}

interface Decoded { source: CanvasImageSource; width: number; height: number; close(): void }

async function decode(file: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // fall through to <img>
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new MediaError('decode');
  }
}

/**
 * Validates and, for photos, downsizes + re-encodes to JPEG. Videos pass
 * through unchanged. Throws MediaError (wrongType, tooLarge, decode).
 */
export async function prepareMedia(file: File): Promise<PreparedMedia> {
  const v = validateMedia(file);
  if (!v.ok) throw new MediaError(v.code);
  if (v.isVideo) return { blob: file, mime: v.mime, ext: extForMime(v.mime) };

  const dec = await decode(file);
  try {
    if (shouldSkipReencode(v.mime, dec.width, dec.height, file.size)) {
      return { blob: file, mime: 'image/jpeg', ext: 'jpg' };
    }
    const { width, height } = targetSize(dec.width, dec.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new MediaError('decode');
    ctx.drawImage(dec.source, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', JPEG_QUALITY));
    if (!blob) throw new MediaError('decode');
    return { blob, mime: 'image/jpeg', ext: 'jpg' };
  } finally {
    dec.close();
  }
}
