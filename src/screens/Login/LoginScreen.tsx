import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { useAuth } from '@/app/providers/AuthContext';

export function LoginScreen() {
  const { t } = useTranslation();
  const { user, signInWithEmail, configured } = useAuth();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

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
          <div className="hero__title">{t('auth.welcome', 'Welcome back')}</div>
          <div className="hero__desc">
            {t('auth.magicLinkHint', 'Enter your email — we’ll send a one-tap sign-in link.')}
          </div>
        </div>

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
