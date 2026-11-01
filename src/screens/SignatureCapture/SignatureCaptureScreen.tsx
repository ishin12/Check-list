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
import '@/styles/screens/first-impression.css';

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
        <div className="stack">
          <p className="sigcap-instruction">{t('signature.instruction')}</p>
          <div className="field">
            <label className="field__label" htmlFor="signer-name">{t('signature.signerName')}</label>
            <input
              id="signer-name"
              className="input"
              autoComplete="name"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
            />
          </div>
        </div>

        <div className="sigcap-pad">
          <SignaturePadCanvas
            ref={padRef}
            placeholder={t('signature.tapToSign')}
            onEmptyChange={setEmpty}
          />
          <div className="sigcap-tools">
            {empty ? <div className="hint">{t('signature.empty')}</div> : null}
            <button
              type="button"
              className="btn btn--text btn--sm"
              disabled={empty}
              onClick={() => padRef.current?.clear()}
            >
              {t('signature.clear')}
            </button>
          </div>
        </div>
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
