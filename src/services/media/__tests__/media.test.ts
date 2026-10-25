import { describe, expect, it, vi } from 'vitest';
import {
  extForMime, resolveMime, shouldSkipReencode, targetSize, validateMedia,
  MAX_IMAGE_INPUT_BYTES, MAX_VIDEO_INPUT_BYTES,
} from '../imageCompress';
import { MediaError, mapUploadError } from '../mediaErrors';
import { saveProofOnline, type SaveProofDeps } from '../saveProof';
import { failureFromResponse, proofPath } from '../upload';

const MB = 1024 * 1024;

describe('validateMedia', () => {
  it('accepts allowed images and videos', () => {
    expect(validateMedia({ type: 'image/jpeg', size: 3 * MB })).toMatchObject({ ok: true, isVideo: false });
    expect(validateMedia({ type: 'video/quicktime', size: 40 * MB })).toMatchObject({ ok: true, isVideo: true });
  });
  it('rejects other types', () => {
    expect(validateMedia({ type: 'application/pdf', size: 10, name: 'a.pdf' })).toEqual({ ok: false, code: 'wrongType' });
    expect(validateMedia({ type: 'image/gif', size: 10 })).toEqual({ ok: false, code: 'wrongType' });
  });
  it('enforces 25 MB images and 50 MB videos', () => {
    expect(validateMedia({ type: 'image/png', size: MAX_IMAGE_INPUT_BYTES })).toMatchObject({ ok: true });
    expect(validateMedia({ type: 'image/png', size: MAX_IMAGE_INPUT_BYTES + 1 })).toEqual({ ok: false, code: 'tooLarge' });
    expect(validateMedia({ type: 'video/mp4', size: MAX_VIDEO_INPUT_BYTES })).toMatchObject({ ok: true });
    expect(validateMedia({ type: 'video/mp4', size: MAX_VIDEO_INPUT_BYTES + 1 })).toEqual({ ok: false, code: 'tooLarge' });
  });
  it('falls back to the extension when the picker gives no type (iPhone HEIC)', () => {
    expect(resolveMime({ type: '', name: 'IMG_1.HEIC' })).toBe('image/heic');
    expect(validateMedia({ type: '', name: 'IMG_1.HEIC', size: 2 * MB })).toMatchObject({ ok: true, mime: 'image/heic' });
    expect(validateMedia({ type: 'application/octet-stream', name: 'x.bin', size: 5 })).toEqual({ ok: false, code: 'wrongType' });
  });
});

describe('sizing decisions', () => {
  it('scales the long edge to 1600 and keeps aspect ratio', () => {
    expect(targetSize(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(targetSize(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  });
  it('never upscales', () => {
    expect(targetSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(targetSize(1600, 1200)).toEqual({ width: 1600, height: 1200 });
  });
  it('skips re-encoding only small, in-bounds JPEGs', () => {
    expect(shouldSkipReencode('image/jpeg', 1600, 1200, 1 * MB)).toBe(true);
    expect(shouldSkipReencode('image/jpeg', 1601, 1200, 1 * MB)).toBe(false);
    expect(shouldSkipReencode('image/jpeg', 1200, 900, 2 * MB)).toBe(false);
    expect(shouldSkipReencode('image/png', 800, 600, 100)).toBe(false);
  });
  it('never yields octet-stream extensions', () => {
    expect(extForMime('image/jpeg')).toBe('jpg');
    expect(extForMime('video/quicktime')).toBe('mov');
    expect(extForMime('application/octet-stream')).toBe('jpg');
  });
});

describe('mapUploadError', () => {
  it('maps size, type, permission, duplicates and network', () => {
    expect(mapUploadError({ status: 413 })).toBe('tooLarge');
    expect(mapUploadError({ status: 400, message: 'The object exceeded the maximum allowed size' })).toBe('tooLarge');
    expect(mapUploadError({ status: 415 })).toBe('wrongType');
    expect(mapUploadError({ status: 400, message: 'mime type text/plain is not supported' })).toBe('wrongType');
    expect(mapUploadError({ status: 403, message: 'new row violates row-level security policy' })).toBe('permission');
    expect(mapUploadError({ status: 401 })).toBe('permission');
    expect(mapUploadError({ status: 409, error: 'Duplicate' })).toBe('exists');
    expect(mapUploadError({ network: true })).toBe('offline');
    expect(mapUploadError({ message: 'Failed to fetch' })).toBe('offline');
  });
  it('treats bucket-missing and server errors as other', () => {
    expect(mapUploadError({ status: 404, message: 'Bucket not found' })).toBe('other');
    expect(mapUploadError({ status: 500 })).toBe('other');
  });
  it('parses JSON error bodies', () => {
    expect(failureFromResponse(400, '{"statusCode":"403","error":"Unauthorized","message":"new row violates row-level security policy"}'))
      .toMatchObject({ status: 403, error: 'Unauthorized' });
    expect(failureFromResponse(502, '<html>bad gateway</html>')).toMatchObject({ status: 502 });
  });
});

describe('proofPath', () => {
  it('uses taskId/kind-uuid.ext', () => {
    expect(proofPath('t1', 'start', 'abc', 'jpg')).toBe('t1/start-abc.jpg');
  });
});

describe('saveProofOnline order', () => {
  const media = { blob: new Blob(['x'], { type: 'image/jpeg' }), mime: 'image/jpeg', ext: 'jpg' };
  function deps(log: string[], over: Partial<SaveProofDeps> = {}): SaveProofDeps {
    return {
      upload: vi.fn(async () => { log.push('upload'); }),
      insertRow: vi.fn(async () => { log.push('insert'); }),
      deleteOthers: vi.fn(async () => { log.push('delete'); }),
      advance: vi.fn(async () => { log.push('advance'); }),
      ...over,
    };
  }

  it('uploads, records, then deletes old proofs, then advances', async () => {
    const log: string[] = [];
    await saveProofOnline(deps(log), { taskId: 't', kind: 'finish', media, replace: true, autoAdvance: true, newId: 'n' });
    // advance is skipped on a retake
    expect(log).toEqual(['upload', 'insert', 'delete']);
    const log2: string[] = [];
    await saveProofOnline(deps(log2), { taskId: 't', kind: 'start', media, replace: false, autoAdvance: true, newId: 'n' });
    expect(log2).toEqual(['upload', 'insert', 'advance']);
  });

  it('keeps the old proof and does nothing else when the upload fails', async () => {
    const log: string[] = [];
    const d = deps(log, { upload: vi.fn(async () => { throw new MediaError('permission'); }) });
    await expect(saveProofOnline(d, { taskId: 't', kind: 'start', media, replace: true, autoAdvance: true }))
      .rejects.toMatchObject({ code: 'permission' });
    expect(d.insertRow).not.toHaveBeenCalled();
    expect(d.deleteOthers).not.toHaveBeenCalled();
    expect(d.advance).not.toHaveBeenCalled();
  });

  it('deletes only after the new row is recorded and keeps the new path', async () => {
    const log: string[] = [];
    const d = deps(log, { insertRow: vi.fn(async () => { throw new Error('db down'); }) });
    await expect(saveProofOnline(d, { taskId: 't', kind: 'start', media, replace: true, autoAdvance: false })).rejects.toThrow('db down');
    expect(d.deleteOthers).not.toHaveBeenCalled();

    const ok = deps([]);
    const { path } = await saveProofOnline(ok, { taskId: 't', kind: 'start', media, replace: true, autoAdvance: false, newId: 'n' });
    expect(path).toBe('t/start-n.jpg');
    expect(ok.deleteOthers).toHaveBeenCalledWith('t', 'start', path);
  });

  it('a failing cleanup does not fail the save', async () => {
    const d = deps([], { deleteOthers: vi.fn(async () => { throw new Error('x'); }) });
    await expect(saveProofOnline(d, { taskId: 't', kind: 'start', media, replace: true, autoAdvance: false })).resolves.toBeTruthy();
  });

  it('retry after a half-finished save resumes without re-uploading', async () => {
    const log: string[] = [];
    const d = deps(log);
    await saveProofOnline(d, { taskId: 't', kind: 'start', media, replace: false, autoAdvance: true, resumePath: 't/start-n.jpg' });
    expect(log).toEqual(['advance']);
  });

  it('tolerates an already-existing object when retrying with the same path', async () => {
    const d = deps([], { upload: vi.fn(async () => { throw new MediaError('exists'); }) });
    await saveProofOnline(d, { taskId: 't', kind: 'start', media, replace: false, autoAdvance: false, newId: 'n' });
    expect(d.insertRow).toHaveBeenCalled();
  });
});
