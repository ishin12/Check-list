import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { useAuth } from '@/app/providers/AuthContext';
import { isDemoMode } from '@/services/supabase/client';
import { features } from '@/config/features';
import { Icon } from '@/components/Icon';
import { BrandMark } from './BrandMark';
import '@/styles/screens/first-impression.css';

interface DemoProfile { id: string; full_name: string; email: string; role: 'manager' | 'supervisor' | 'finance' | 'worker' | 'client' }

const ROLE_BLURB: Record<DemoProfile['role'], string> = {
  manager:    'Projects, checklists, workers, reports — plus finance in the demo',
  supervisor: 'Start visits, pick the crew, record work and photos',
  finance:    'Labor reports, Excel export, month close',
  worker:     'Older task list · capture proof · submit',
  client:     'Read-only portal — visits & approved proof',
};

export function LoginScreen() {
  const { t } = useTranslation();
  const { user, signInWithEmail, signInWithPassword, configured } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [demoProfiles, setDemoProfiles] = useState<DemoProfile[]>([]);
  const demo = isDemoMode();

  useEffect(() => {
    if (!demo) return;
    const profiles = (window.__demo?.listProfiles() ?? []) as DemoProfile[];
    setDemoProfiles(features.legacyTasks ? profiles : profiles.filter((x) => x.role !== 'client' && x.role !== 'worker'));
  }, [demo]);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStatus('sending');
    setError(null);
    try {
      if (demo) {
        // Demo: magic-link path signs you in immediately.
        await signInWithEmail(email.trim());
        setStatus('sent');
      } else {
        // Production: email + password.
        await signInWithPassword(email.trim(), password);
        setStatus('idle');
      }
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function signInDemo(profile: DemoProfile) {
    setStatus('sending');
    setError(null);
    try {
      await signInWithEmail(profile.email);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const pickerShown = demo && demoProfiles.length > 0;

  return (
    <div className="app-shell auth-page">
      {demo ? <AppHeader title="" /> : null}
      <main className="app-main">
        {!configured ? (
          <div className="banner banner--error" role="alert">
            {t('auth.notConfigured', 'Supabase is not configured. See .env.example.')}
          </div>
        ) : null}
        <div className="hero hero--brand">
          <div className="hero__brand-row">
            <BrandMark size={48} />
            <div className="hero__brand-name">{t('app.name', 'Ghsoon Najd')}</div>
          </div>
          <h1 className="hero__title">{t('auth.welcome', 'Welcome back')}</h1>
          <p className="hero__desc">
            {demo
              ? t('demo.loginHint', 'Demo mode — pick an account below to see exactly what they see.')
              : t('auth.magicLinkHint', 'Enter your email — we’ll send a one-tap sign-in link.')}
          </p>
        </div>

        {pickerShown ? (
          <section className="stack auth-demo">
            <h2 className="section-title">{t('demo.accountsTitle', 'Demo accounts')}</h2>
            <div className="stack">
              {demoProfiles.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="card card--tap demo-account"
                  onClick={() => signInDemo(p)}
                  disabled={status === 'sending'}
                >
                  <div className={`demo-account__role demo-account__role--${p.role}`}>
                    {t(`demo.role.${p.role}`, p.role)}
                  </div>
                  <div className="demo-account__body">
                    <div className="card__title">{p.full_name}</div>
                    <div className="card__meta">{t(`demo.blurb.${p.role}`, ROLE_BLURB[p.role])}</div>
                  </div>
                  <span className="demo-account__arrow"><Icon name="forward" /></span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <form className="stack auth-form" onSubmit={onSubmit}>
          {pickerShown ? <p className="hint">{t('demo.orEmail', 'Or sign in with email below:')}</p> : null}
          <div className="field">
            <label className="field__label" htmlFor="email">{t('auth.email', 'Email')}</label>
            <input
              id="email"
              className="input input--ltr"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={status === 'sending' || !configured}
            />
          </div>
          {!demo ? (
            <div className="field">
              <label className="field__label" htmlFor="password">{t('auth.password', 'Password')}</label>
              <input
                id="password"
                className="input input--ltr"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={status === 'sending' || !configured}
              />
            </div>
          ) : null}
          {/* With the demo account list on screen, picking an account is the primary action. */}
          <button
            className={`btn btn--block btn--lg${pickerShown ? '' : ' btn--primary'}`}
            type="submit"
            disabled={!email || (!demo && !password) || status === 'sending' || !configured}
          >
            {status === 'sending'
              ? t('auth.sending', 'Signing in…')
              : demo ? t('auth.sendLink', 'Send magic link') : t('auth.signIn', 'Sign in')}
          </button>

          {status === 'sent' ? (
            <div className="banner banner--success">
              {t('auth.linkSent', 'Check your email and tap the link to continue.')}
            </div>
          ) : null}
          {status === 'error' && error ? (
            <div className="banner banner--error" role="alert">{error}</div>
          ) : null}
        </form>
      </main>
    </div>
  );
}
