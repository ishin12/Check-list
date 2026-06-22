import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { useAuth } from '@/app/providers/AuthContext';
import { isDemoMode } from '@/services/supabase/client';

interface DemoProfile { id: string; full_name: string; email: string; role: 'manager' | 'worker' | 'client' }

const ROLE_BLURB: Record<DemoProfile['role'], string> = {
  manager: 'Full access — calendar, approvals, clients, audit',
  worker:  'Sees only own tasks · capture proof · submit',
  client:  'Read-only portal — visits & approved proof',
};

export function LoginScreen() {
  const { t } = useTranslation();
  const { user, signInWithEmail, configured } = useAuth();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [demoProfiles, setDemoProfiles] = useState<DemoProfile[]>([]);
  const demo = isDemoMode();

  useEffect(() => {
    if (!demo) return;
    const profiles = (window.__demo?.listProfiles() ?? []) as DemoProfile[];
    setDemoProfiles(profiles);
  }, [demo]);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStatus('sending');
    setError(null);
    try {
      await signInWithEmail(email.trim());
      setStatus('sent');
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

  return (
    <div className="app-shell">
      <AppHeader title={t('auth.signIn', 'Sign in')} />
      <main className="app-main">
        {!configured ? (
          <div className="banner banner--error">
            {t('auth.notConfigured', 'Supabase is not configured. See .env.example.')}
          </div>
        ) : null}
        <div className="hero hero--brand">
          <div className="hero__brand-row">
            <svg viewBox="0 0 64 64" width="44" height="44" aria-hidden>
              <rect width="64" height="64" rx="12" fill="#003C1B"/>
              <g transform="translate(32 34)" fill="#00C481">
                <path d="M -2 -2 C -16 -4 -22 -16 -14 -24 C -6 -16 -2 -10 -2 -2 Z"/>
                <path d="M 2 -2 C 16 -4 22 -16 14 -24 C 6 -16 2 -10 2 -2 Z"/>
                <rect x="-1.6" y="-3" width="3.2" height="22" rx="1.6"/>
              </g>
              <path d="M 22 56 Q 32 50 42 56" fill="none" stroke="#D7CE6D" strokeWidth="3" strokeLinecap="round"/>
            </svg>
            <div className="hero__brand-name">{t('app.name', 'Ghsoon Najd')}</div>
          </div>
          <div className="hero__title">{t('auth.welcome', 'Welcome back')}</div>
          <div className="hero__desc">
            {demo
              ? t('demo.loginHint', 'Demo mode — pick an account below to see exactly what they see.')
              : t('auth.magicLinkHint', 'Enter your email — we’ll send a one-tap sign-in link.')}
          </div>
        </div>

        {demo && demoProfiles.length > 0 ? (
          <section className="stack">
            <div className="section-title">{t('demo.accountsTitle', 'Demo accounts')}</div>
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
                    {p.role}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="card__title">{p.full_name}</div>
                    <div className="card__meta">{ROLE_BLURB[p.role]}</div>
                  </div>
                  <span className="demo-account__arrow" aria-hidden>→</span>
                </button>
              ))}
            </div>
            <div className="hint" style={{ textAlign: 'center' }}>
              {t('demo.orEmail', 'Or sign in with email below:')}
            </div>
          </section>
        ) : null}

        <form className="stack" onSubmit={onSubmit}>
          <div className="field">
            <label className="field__label" htmlFor="email">{t('auth.email', 'Email')}</label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={status === 'sending' || !configured}
            />
          </div>
          <button
            className="btn btn--primary btn--block btn--lg"
            type="submit"
            disabled={!email || status === 'sending' || !configured}
          >
            {status === 'sending' ? t('auth.sending', 'Sending…') : t('auth.sendLink', 'Send magic link')}
          </button>

          {status === 'sent' ? (
            <div className="banner banner--success">
              {t('auth.linkSent', 'Check your email and tap the link to continue.')}
            </div>
          ) : null}
          {status === 'error' && error ? (
            <div className="banner banner--error">{error}</div>
          ) : null}
        </form>
      </main>
    </div>
  );
}
