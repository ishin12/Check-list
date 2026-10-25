import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getProofUrl } from '@/services/media/proofUrls';
import type { TaskProof } from '@/domain/models/ops';

interface Props {
  proof: TaskProof;
  title: string;
  /** Retake route; omit when the current user may not replace this proof. */
  replaceTo?: string;
  onClose: () => void;
}

/** Full-screen, accessible viewer for a single proof photo or video. */
export function ProofViewer({ proof, title, replaceTo, onClose }: Props) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void getProofUrl(proof.storagePath).then((u) => {
      if (cancelled) return;
      if (u) setUrl(u); else setFailed(true);
    });
    return () => { cancelled = true; };
  }, [proof.storagePath]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key === 'Tab' && rootRef.current) {
      // Keep keyboard focus inside the dialog.
      const items = Array.from(rootRef.current.querySelectorAll<HTMLElement>('button, a[href]'));
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  return (
    <div
      ref={rootRef}
      className="viewer"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onKeyDown={onKeyDown}
    >
      <div className="viewer__bar">
        <span className="viewer__title">{title}</span>
        <button ref={closeRef} type="button" className="icon-btn viewer__close" onClick={onClose} aria-label={t('photo.close', 'Close') ?? 'Close'}>
          ✕
        </button>
      </div>
      <div className="viewer__stage" onClick={onClose}>
        {failed ? (
          <p className="viewer__msg" role="alert">{t('photo.viewFailed', 'This file could not be loaded.')}</p>
        ) : !url ? (
          <p className="viewer__msg" role="status">{t('common.loading', 'Loading…')}</p>
        ) : proof.mime.startsWith('video/') ? (
          <video src={url} controls autoPlay playsInline className="viewer__media" onClick={(e) => e.stopPropagation()} />
        ) : (
          <img src={url} alt={title} className="viewer__media" onClick={(e) => e.stopPropagation()} />
        )}
      </div>
      {replaceTo ? (
        <div className="viewer__actions">
          <Link to={replaceTo} className="btn btn--primary btn--lg btn--block">
            {t('photo.replace', 'Replace')}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
