import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useLanguage } from '@/app/providers/LanguageContext';
import { useTranslation } from 'react-i18next';
import { getSupabase } from '@/services/supabase/client';
import { SignaturePadCanvas, type SignaturePadHandle } from '@/components/SignaturePadCanvas';
import { formatDate } from '@/lib/datetime';
import { Icon } from '@/components/Icon';
import { VisitWhen } from './VisitWhen';
import { BrandMark } from '@/screens/Login/BrandMark';
import '@/styles/screens/first-impression.css';

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
  const { language } = useLanguage();
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
        <Brand />
        <h1 className="sign-title">{t('sign.invalidTitle', 'This link is no longer active')}</h1>
        <p className="sign-body">{t('sign.invalidBody', 'It may have expired or already been signed. Thank you.')}</p>
      </Centered>
    );
  }
  if (state.kind === 'done') {
    return (
      <Centered>
        <Brand />
        <div className="sign-check"><Icon name="check" /></div>
        <h1 className="sign-title">{t('sign.thanksTitle', 'Thank you!')}</h1>
        <p className="sign-body">{t('sign.thanksBody', 'Your signature has been recorded.')}</p>
      </Centered>
    );
  }

  const { task } = state;
  return (
    <div className="sign-page">
      <main className="sign-card">
        <Brand />
        <h1 className="sign-title">{t('sign.heading', 'Please review and sign')}</h1>
        <dl className="sign-summary">
          <Row label={t('sign.visit', 'Visit')} value={task.task_title} />
          <Row label={t('sign.client', 'Client')} value={task.client_name} />
          {task.worker_name ? <Row label={t('sign.worker', 'Technician')} value={task.worker_name} /> : null}
          <Row label={t('sign.date', 'Date')} value={<VisitWhen iso={task.scheduled_at} language={language} />} />
        </dl>

        <div className="sign-pad-head">
          <span className="field__label">{t('sign.signHere', 'Sign below')}</span>
          <button type="button" className="btn btn--text btn--sm" disabled={empty || submitting} onClick={() => padRef.current?.clear()}>
            {t('common.clear', 'Clear')}
          </button>
        </div>
        <SignaturePadCanvas
          ref={padRef}
          placeholder={t('signature.tapToSign', 'Sign here') ?? ''}
          onEmptyChange={setEmpty}
        />
        <button className="btn btn--primary btn--block btn--lg sign-confirm" disabled={empty || submitting} onClick={submit}>
          {submitting ? t('sign.submitting', 'Submitting…') : t('sign.confirm', 'Confirm signature')}
        </button>
        <p className="hint sign-note">
          {t('sign.expiresOn', 'This link expires on {{date}}', { date: formatDate(task.expires_at, language) })}
        </p>
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="sign-row">
      <dt className="sign-row__label">{label}</dt>
      <dd className="sign-row__value"><bdi>{value}</bdi></dd>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="sign-page"><main className="sign-card sign-card--state">{children}</main></div>;
}

function Brand() {
  const { t } = useTranslation();
  return (
    <div className="sign-head"><BrandMark size={32} /><span>{t('app.name', 'Ghsoon Najd')}</span></div>
  );
}
