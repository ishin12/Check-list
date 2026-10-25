import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppShell } from '@/components/AppShell';
import { enqueueProof, pendingCount } from '@/services/media/mediaQueue';
import {
  deleteOtherProofsOfKind, getTask, insertProofRow, updateTaskStatus,
} from '@/services/data/tasks';
import { ACCEPT_ATTR, prepareMedia, validateMedia, type PreparedMedia } from '@/services/media/imageCompress';
import { MEDIA_ERROR_TEXT, MediaError, type MediaErrorCode } from '@/services/media/mediaErrors';
import { saveProofOnline } from '@/services/media/saveProof';
import { uploadProof } from '@/services/media/upload';
import { Icon } from '@/components/Icon';

type Kind = 'start' | 'finish';

/** Moves the task forward when the camera was opened from the Start/Submit button. */
async function advanceTask(id: string, kind: Kind): Promise<void> {
  const now = new Date().toISOString();
  const task = await getTask(id);
  if (!task) return;
  if (kind === 'start' && task.status === 'not_started') {
    await updateTaskStatus(id, { status: 'in_progress', started_at: now });
  } else if (kind === 'finish' && task.status === 'in_progress') {
    await updateTaskStatus(id, { status: 'submitted', finished_at: now });
  }
}

export function MediaCaptureScreen() {
  const { t } = useTranslation();
  const { id, kind } = useParams<{ id: string; kind: Kind }>();
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
  // Re-render when connectivity changes so the offline hint stays accurate.
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(0);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<MediaErrorCode | null>(null);
  const [savedOffline, setSavedOffline] = useState(false);
  // Kept across Retry so a half-finished save resumes instead of duplicating.
  const prepared = useRef<PreparedMedia | null>(null);
  const attemptId = useRef<string>(crypto.randomUUID());
  const storedPath = useRef<string | undefined>(undefined);

  useEffect(() => { void pendingCount().then(setPending); }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    prepared.current = null;
    storedPath.current = undefined;
    attemptId.current = crypto.randomUUID();
    const v = validateMedia(f);
    if (!v.ok) {
      setFile(null);
      setPreview(null);
      setError(v.code);
      return;
    }
    setError(null);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function save() {
    if (!file || !id || !kind) return;
    setSaving(true);
    setError(null);
    setProgress(null);
    try {
      if (!prepared.current) prepared.current = await prepareMedia(file);
      const media = prepared.current;

      if (!navigator.onLine) {
        // Offline: keep it on the phone; the queue uploads it when we are back online.
        await enqueueProof({
          taskId: id,
          kind,
          mime: media.mime,
          capturedAt: new Date().toISOString(),
          blob: media.blob,
          replace,
        });
        if (autoAdvance && !replace) await advanceTask(id, kind);
        setPending(await pendingCount());
        setSavedOffline(true);
        return;
      }

      setProgress(0);
      await saveProofOnline(
        {
          upload: uploadProof,
          insertRow: insertProofRow,
          deleteOthers: deleteOtherProofsOfKind,
          advance: () => advanceTask(id, kind),
        },
        {
          taskId: id,
          kind,
          media,
          replace,
          autoAdvance,
          newId: attemptId.current,
          resumePath: storedPath.current,
          onProgress: setProgress,
          onStored: (p) => { storedPath.current = p; },
        },
      );
      navigate(`/tasks/${id}`, { replace: true });
    } catch (e) {
      console.warn('Saving proof failed', e);
      setError(e instanceof MediaError ? e.code : 'other');
    } finally {
      setSaving(false);
    }
  }

  const errorText = error ? t(MEDIA_ERROR_TEXT[error].key, MEDIA_ERROR_TEXT[error].fallback) : null;
  const pct = progress === null ? 0 : Math.round(progress * 100);

  return (
    <AppShell bare>
      <div className="capture">
        <div className="capture__chrome">
          <button type="button" className="icon-btn" onClick={() => navigate(-1)} aria-label={t('photo.close', 'Close') ?? 'Close'}><Icon name="close" /></button>
          <span className="capture__label">{kind === 'start' ? t('proof.start', 'Start proof') : t('proof.finish', 'Finish proof')}</span>
          <span className="capture__spacer" />
        </div>
        <div className="capture__stage">
          {savedOffline ? (
            <div className="capture__placeholder" role="status">
              <div className="capture__big-icon"><Icon name="check-circle" /></div>
              <p>{t('photo.savedOffline', 'Saved on this phone. It will upload automatically when you are back online.')}</p>
            </div>
          ) : preview ? (
            file?.type.startsWith('video/') ? (
              <video src={preview} controls className="capture__media" />
            ) : (
              <img src={preview} alt="" className="capture__media" />
            )
          ) : (
            <div className="capture__placeholder">
              <div className="capture__big-icon"><Icon name="camera" /></div>
              <p>{t('proof.tapToCapture', 'Tap the shutter to take a photo or video.')}</p>
            </div>
          )}
        </div>
        <div className="capture__shutter">
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT_ATTR}
            capture="environment"
            onChange={onPick}
            className="capture__input"
          />
          {savedOffline ? (
            <button className="btn btn--primary btn--lg btn--block" onClick={() => navigate(`/tasks/${id}`, { replace: true })}>
              {t('photo.continue', 'Continue')}
            </button>
          ) : preview ? (
            <div className="capture__actions">
              {saving && progress !== null ? (
                <div
                  className="upload-progress"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pct}
                  aria-label={t('photo.uploading', 'Uploading…') ?? 'Uploading'}
                >
                  <div className="upload-progress__bar" style={{ inlineSize: `${pct}%` }} />
                  <span className="upload-progress__label">{t('photo.uploading', 'Uploading…')} {pct}%</span>
                </div>
              ) : null}
              <button className="btn btn--primary btn--lg btn--block" disabled={saving} onClick={save}>
                {saving
                  ? (progress === null ? t('proof.saving', 'Saving…') : t('photo.uploading', 'Uploading…'))
                  : error ? t('photo.retry', 'Retry') : t('proof.use', 'Use this')}
              </button>
              {!saving ? (
                <button className="btn btn--ghost btn--block capture__retake" onClick={() => fileRef.current?.click()}>
                  {t('photo.chooseAnother', 'Take another')}
                </button>
              ) : null}
            </div>
          ) : (
            <button className="btn capture__shutter-btn" onClick={() => fileRef.current?.click()} aria-label={t('photo.capture', 'Capture') ?? 'Capture'}>
              <span />
            </button>
          )}
        </div>
        {errorText ? (
          <div className="banner banner--error capture__banner" role="alert">
            {errorText}
            {error === 'decode' || error === 'wrongType' || error === 'tooLarge' ? (
              <button className="btn btn--ghost capture__banner-btn" onClick={() => fileRef.current?.click()}>
                {t('photo.retake', 'Retake')}
              </button>
            ) : null}
          </div>
        ) : null}
        {!online && !savedOffline ? (
          <div className="banner banner--info capture__banner">
            {t('photo.offlineHint', 'You are offline. The photo will be saved on this phone and uploaded when you are back online.')}
            {pending > 0 ? ` (${t('photo.queued', { count: pending, defaultValue: '{{count}} waiting' })})` : null}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
