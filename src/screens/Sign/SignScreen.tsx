import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getSupabase } from '@/services/supabase/client';
import { SignaturePadCanvas, type SignaturePadHandle } from '@/components/SignaturePadCanvas';

interface SigningTask {
  task_title: string;
  client_name: string;
  worker_name: string;
  scheduled_at: string;
  expires_at: string;
}

type State =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'ready'; task: SigningTask }
  | { kind: 'done' };

/**
 * Public, unauthenticated signing page reached from the WhatsApp link at
 * /sign/:token. Reads + writes go through security-definer RPCs so no login is
 * required and RLS isn't bypassed beyond those two narrow functions.
 */
export function SignScreen() {
  const { token } = useParams<{ token: string }>();
  const { t } = useTranslation();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [submitting, setSubmitting] = useState(false);
  const [empty, setEmpty] = useState(true);
  const padRef = useRef<SignaturePadHandle>(null);

  useEffect(() => {
    if (!token) { setState({ kind: 'invalid' }); return; }
    void (async () => {
      const { data, error } = await getSupabase().rpc('get_signing_task', { p_token: token });
      const rows = (data ?? []) as SigningTask[];
      if (error || rows.length === 0) { setState({ kind: 'invalid' }); return; }
      setState({ kind: 'ready', task: rows[0] });
    })();
  }, [token]);

  async function submit() {
    if (!token || padRef.current?.isEmpty()) return;
    setSubmitting(true);
    try {
      const dataUrl = padRef.current?.toDataUrl() ?? '';
      const { data, error } = await getSupabase().rpc('complete_signing', { p_token: token, p_signature: dataUrl });
      if (error || data === false) { setState({ kind: 'invalid' }); return; }
      setState({ kind: 'done' });
    } finally {
      setSubmitting(false);
    }
  }

  if (state.kind === 'loading') {
    return <Centered><p className="hint">{t('common.loading', 'Loading…')}</p></Centered>;
  }
  if (state.kind === 'invalid') {
    return (
      <Centered>
        <div className="sign-brand"><Sprout /><span>{t('app.name', 'Ghsoon Najd')}</span></div>
        <h1 className="sign-title">{t('sign.invalidTitle', 'This link is no longer active')}</h1>
        <p className="hint">{t('sign.invalidBody', 'It may have expired or already been signed. Thank you.')}</p>
      </Centered>
    );
  }
  if (state.kind === 'done') {
    return (
      <Centered>
        <div className="sign-brand"><Sprout /><span>{t('app.name', 'Ghsoon Najd')}</span></div>
        <div className="sign-check" aria-hidden>✓</div>
        <h1 className="sign-title">{t('sign.thanksTitle', 'Thank you!')}</h1>
        <p className="hint">{t('sign.thanksBody', 'Your signature has been recorded.')}</p>
      </Centered>
    );
  }

  const { task } = state;
  return (
    <div className="sign-page">
      <div className="sign-card">
        <div className="sign-brand"><Sprout /><span>{t('app.name', 'Ghsoon Najd')}</span></div>
        <h1 className="sign-title">{t('sign.heading', 'Please review and sign')}</h1>
        <div className="sign-summary">
          <Row label={t('sign.visit', 'Visit')} value={task.task_title} />
          <Row label={t('sign.client', 'Client')} value={task.client_name} />
          {task.worker_name ? <Row label={t('sign.worker', 'Technician')} value={task.worker_name} /> : null}
          <Row label={t('sign.date', 'Date')} value={new Date(task.scheduled_at).toLocaleString()} />
        </div>

        <label className="field__label" style={{ marginTop: 12 }}>{t('sign.signHere', 'Sign below')}</label>
        <SignaturePadCanvas
          ref={padRef}
          placeholder={t('signature.tapToSign', 'Sign here') ?? ''}
          onEmptyChange={setEmpty}
        />
        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <button className="btn btn--ghost" onClick={() => padRef.current?.clear()}>{t('common.clear', 'Clear')}</button>
          <button className="btn btn--primary btn--block" disabled={empty || submitting} onClick={submit}>
            {submitting ? t('sign.submitting', 'Submitting…') : t('sign.confirm', 'Confirm signature')}
          </button>
        </div>
        <p className="hint" style={{ marginTop: 10, textAlign: 'center' }}>
          {t('sign.expiresOn', 'This link expires on {{date}}', { date: new Date(task.expires_at).toLocaleDateString() })}
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="sign-row">
      <span className="sign-row__label">{label}</span>
      <span className="sign-row__value">{value}</span>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="sign-page"><div className="sign-card sign-card--center">{children}</div></div>;
}

function Sprout() {
  return (
    <svg viewBox="0 0 64 64" width="32" height="32" aria-hidden>
      <rect width="64" height="64" rx="10" fill="#003C1B" />
      <g transform="translate(32 34)" fill="#00C481">
        <path d="M -2 -2 C -16 -4 -22 -16 -14 -24 C -6 -16 -2 -10 -2 -2 Z" />
        <path d="M 2 -2 C 16 -4 22 -16 14 -24 C 6 -16 2 -10 2 -2 Z" />
        <rect x="-1.6" y="-3" width="3.2" height="22" rx="1.6" />
      </g>
    </svg>
  );
}
