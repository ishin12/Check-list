import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getProofUrl } from '@/services/media/proofUrls';
import { uploadTaskPhoto } from '@/services/data/fieldOps';
import type { PhotoKind, TaskPhoto } from '@/domain/models/ops';
import { friendlyError } from '@/lib/ruleErrors';

type PhotoLike = Pick<TaskPhoto, 'id' | 'storagePath' | 'mime' | 'kind'>;

export function PhotoThumb({ photo, onOpen }: { photo: PhotoLike; onOpen?: (url: string) => void }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    void getProofUrl(photo.storagePath).then((u) => { if (!live) return; if (u) setUrl(u); else setFailed(true); });
    return () => { live = false; };
  }, [photo.storagePath]);
  return (
    <button type="button" className="thumb" onClick={() => url && onOpen?.(url)} aria-label={t('fo.photo.open', 'Open photo') ?? ''}>
      {failed ? <span className="muted">×</span> : url ? (
        photo.mime.startsWith('video/') ? <video src={url} muted /> : <img src={url} alt="" />
      ) : null}
      {photo.kind ? <span className="thumb__kind">{photo.kind === 'before' ? t('fo.photo.before', 'Before') : t('fo.photo.after', 'After')}</span> : null}
    </button>
  );
}

/** Full-screen viewer for a tapped thumbnail. */
export function PhotoViewer({ url, onClose }: { url: string | null; onClose: () => void }) {
  if (!url) return null;
  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <img src={url} alt="" style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 12 }} />
    </div>
  );
}

interface CaptureProps {
  taskId: string;
  projectId: string;
  visitId?: string;
  kind: PhotoKind;
  onUploaded: () => void;
  disabled?: boolean;
}

/**
 * Opens the phone camera directly (§17) and uploads. On failure the error is
 * shown with a retry, and the picked photo is kept until it is saved (§31).
 */
export function PhotoCapture({ taskId, projectId, visitId, kind, onUploaded, disabled }: CaptureProps) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true); setError(null);
    try {
      await uploadTaskPhoto({ taskId, projectId, visitId, kind, file, mime: file.type || 'image/jpeg' });
      setPending(null);
      onUploaded();
    } catch (e) {
      setPending(file);
      setError(friendlyError(e, t));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
      />
      <button type="button" className="thumb-add" disabled={disabled || busy} onClick={() => input.current?.click()}>
        <span aria-hidden>{busy ? '…' : '＋'}</span>
        <span>{kind === 'before' ? t('fo.photo.before', 'Before') : t('fo.photo.after', 'After')}</span>
      </button>
      {error ? (
        <div className="banner banner--error" style={{ width: '100%' }}>
          <div>{t('fo.photo.notSaved', 'Photo not saved.')} {error}</div>
          {pending ? (
            <button type="button" className="btn btn--ghost" style={{ marginTop: 8 }} disabled={busy} onClick={() => void upload(pending)}>
              {t('fo.retry', 'Retry')}
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
