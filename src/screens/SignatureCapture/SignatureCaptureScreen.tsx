import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppHeader } from '@/components/AppHeader';
import {
  SignaturePadCanvas,
  type SignaturePadHandle,
} from '@/components/SignaturePadCanvas';
import { useCurrentJob } from '@/app/providers/CurrentJobContext';
import { setSignature } from '@/domain/job/job';
import { nowIso } from '@/lib/datetime';

export function SignatureCaptureScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { job, setJob } = useCurrentJob();
  const padRef = useRef<SignaturePadHandle>(null);
  const [empty, setEmpty] = useState(true);
  const [signerName, setSignerName] = useState(job?.signature?.signerName ?? '');

  useEffect(() => {
    if (!job) navigate('/', { replace: true });
  }, [job, navigate]);

  if (!job) return null;

  const confirm = () => {
    if (!padRef.current || padRef.current.isEmpty()) return;
    const dataUrl = padRef.current.toDataUrl();
    const updated = setSignature(job, {
      dataUrl,
      signedAt: nowIso(),
      signerName: signerName.trim() || undefined,
    });
    setJob(updated);
    navigate('/report');
  };

  return (
    <div className="app-shell">
      <AppHeader title={t('signature.title')} showBack />
      <main className="app-main">
        <p className="hint">{t('signature.instruction')}</p>

        <div className="field">
          <label className="field__label">{t('signature.signerName')}</label>
          <input
            className="input"
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
          />
        </div>

        <SignaturePadCanvas
          ref={padRef}
          placeholder={t('signature.tapToSign')}
          onEmptyChange={setEmpty}
        />

        <button
          type="button"
          className="btn btn--ghost btn--block"
          onClick={() => padRef.current?.clear()}
        >
          {t('signature.clear')}
        </button>

        {empty ? <div className="hint">{t('signature.empty')}</div> : null}
      </main>

      <div className="action-bar">
        <button
          type="button"
          className="btn btn--primary btn--block btn--lg"
          disabled={empty}
          onClick={confirm}
        >
          {t('signature.confirm')}
        </button>
      </div>
    </div>
  );
}
