import type { PreparedMedia } from './imageCompress';
import { MediaError } from './mediaErrors';
import { proofPath, type ProgressFn } from './upload';

export type ProofKind = 'start' | 'finish';

export interface SaveProofDeps {
  upload(args: { path: string; blob: Blob; mime: string; onProgress?: ProgressFn }): Promise<void>;
  insertRow(row: { taskId: string; kind: ProofKind; path: string; mime: string; capturedAt: string }): Promise<void>;
  deleteOthers(taskId: string, kind: ProofKind, keepPath: string): Promise<void>;
  advance(): Promise<void>;
}

export interface SaveProofInput {
  taskId: string;
  kind: ProofKind;
  media: PreparedMedia;
  replace: boolean;
  autoAdvance: boolean;
  /** Set when an earlier attempt already uploaded + recorded the file, so Retry resumes after that step. */
  resumePath?: string;
  newId?: string;
  onProgress?: ProgressFn;
  /** Called as soon as the new proof is stored, before the follow-up steps. */
  onStored?: (path: string) => void;
}

/**
 * The online save order, which must never lose the old proof:
 *   1. upload the new file   (failure: nothing else has happened)
 *   2. insert its task_proofs row
 *   3. retake only: delete the older proofs of that kind (best effort)
 *   4. advance the task status (first capture via the action bar only)
 */
export async function saveProofOnline(deps: SaveProofDeps, input: SaveProofInput): Promise<{ path: string }> {
  let path = input.resumePath;
  if (!path) {
    path = proofPath(input.taskId, input.kind, input.newId ?? crypto.randomUUID(), input.media.ext);
    try {
      await deps.upload({ path, blob: input.media.blob, mime: input.media.mime, onProgress: input.onProgress });
    } catch (e) {
      // A retry that reuses the same path (after the row insert failed) finds the file already there.
      if (!(e instanceof MediaError && e.code === 'exists')) throw e;
    }
    await deps.insertRow({
      taskId: input.taskId, kind: input.kind, path, mime: input.media.mime, capturedAt: new Date().toISOString(),
    });
    input.onStored?.(path);
  }
  if (input.replace) {
    try { await deps.deleteOthers(input.taskId, input.kind, path); } catch { /* the new proof is safe; leftovers are harmless */ }
  }
  if (input.autoAdvance && !input.replace) await deps.advance();
  return { path };
}
