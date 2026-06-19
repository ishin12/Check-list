import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppShell } from '@/components/AppShell';
import { enqueueProof, flushQueue, pendingCount } from '@/services/media/mediaQueue';
import { deleteProofsOfKind, updateTaskStatus, getTask } from '@/services/data/tasks';

export function MediaCaptureScreen() {
  const { t } = useTranslation();
  const { id, kind } = useParams<{ id: string; kind: 'start' | 'finish' }>();
  const [params] = useSearchParams();
  const replace = params.get('replace') === '1';
  // When the camera is opened via the Start/Submit action-bar button, we
  // advance the task status as part of the capture. When it's opened directly
  // from a proof row, we just attach the photo and leave status alone so the
  // worker can press Submit explicitly when they're ready.
  const autoAdvance = params.get('auto') === '1';
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => { void pendingCount().then(setPending); }, []);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function save() {
    if (!file || !id || !kind) return;
    setSaving(true);
    try {
      // Replace mode: drop the old proof of this kind first.
      if (replace) {
        await deleteProofsOfKind(id, kind);
      }
      await enqueueProof({
        taskId: id,
        kind,
        mime: file.type || 'application/octet-stream',
        capturedAt: new Date().toISOString(),
        blob: file,
      });
      // Only auto-advance the status when the camera was opened via the
      // action-bar Start/Submit button — and never on a retake.
      if (autoAdvance && !replace) {
        const now = new Date().toISOString();
        const task = await getTask(id);
        if (task) {
          if (kind === 'start' && task.status === 'not_started') {
            await updateTaskStatus(id, { status: 'in_progress', started_at: now });
          } else if (kind === 'finish' && task.status === 'in_progress') {
            await updateTaskStatus(id, { status: 'submitted', finished_at: now });
          }
        }
      }
      void flushQueue();
      navigate(`/tasks/${id}`, { replace: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell bare>
      <div className="capture">
        <div className="capture__chrome">
          <button type="button" className="icon-btn" onClick={() => navigate(-1)} aria-label="Close">✕</button>
          <span className="capture__label">{kind === 'start' ? t('proof.start', 'Start proof') : t('proof.finish', 'Finish proof')}</span>
          <span style={{ width: 40 }} />
        </div>
        <div className="capture__stage">
          {preview ? (
            file?.type.startsWith('video/') ? (
              <video src={preview} controls className="capture__media" />
            ) : (
              <img src={preview} alt="" className="capture__media" />
            )
          ) : (
            <div className="capture__placeholder">
              <div style={{ fontSize: 56, opacity: 0.6 }}>◉</div>
              <p>{t('proof.tapToCapture', 'Tap the shutter to take a photo or video.')}</p>
            </div>
          )}
        </div>
        <div className="capture__shutter">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            capture="environment"
            onChange={onPick}
            style={{ display: 'none' }}
          />
          {preview ? (
            <button className="btn btn--primary btn--lg btn--block" disabled={saving} onClick={save}>
              {saving ? t('proof.saving', 'Saving…') : t('proof.use', 'Use this')}
            </button>
          ) : (
            <button className="btn capture__shutter-btn" onClick={() => fileRef.current?.click()} aria-label="Capture">
              <span />
            </button>
          )}
        </div>
        {!navigator.onLine ? (
          <div className="banner banner--info" style={{ margin: 16 }}>
            {t('proof.offlineHint', 'Offline — we’ll upload when you’re back online.')}
            {pending > 0 ? ` (${pending} queued)` : null}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
