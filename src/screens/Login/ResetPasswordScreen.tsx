import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { useAuth } from '@/app/providers/AuthContext';

export function ResetPasswordScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { loading, user, updatePassword } = useAuth();
  const [pw, setPw] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updatePassword(pw);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <div className="app-shell">
      <AppHeader title={t('auth.resetTitle', 'Set a new password')} />
      <main className="app-main">
        {loading ? (
          <p className="hint">{t('auth.signingIn', 'Signing you in…')}</p>
        ) : !user ? (
          <div className="stack">
            <div className="banner banner--error">
              {t('auth.resetInvalid', 'This reset link is invalid or has expired. Request a new one from the sign-in page.')}
            </div>
            <Link className="btn btn--block" to="/login">{t('auth.backToSignIn', 'Back to sign in')}</Link>
          </div>
        ) : (
          <form className="stack" onSubmit={onSubmit}>
            <div className="field">
              <label className="field__label" htmlFor="new-password">{t('auth.newPassword', 'New password')}</label>
              <input
                id="new-password"
                className="input"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                disabled={saving}
              />
            </div>
            <button className="btn btn--primary btn--block btn--lg" type="submit" disabled={pw.length < 8 || saving}>
              {t('auth.savePassword', 'Save password')}
            </button>
            {error ? <div className="banner banner--error">{error}</div> : null}
          </form>
        )}
      </main>
    </div>
  );
}
