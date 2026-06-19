import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { AppShell } from '@/components/AppShell';
import { useLanguage } from '@/app/providers/LanguageContext';
import { useAuth } from '@/app/providers/AuthContext';
import { isDemoMode } from '@/services/supabase/client';

export function SettingsScreen() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const { user, signOut } = useAuth();

  return (
    <AppShell>
      <AppHeader title={t('settings.title')} showBack />
      <main className="app-main">
        {user ? (
          <div className="card">
            <div className="card__title">{user.fullName ?? user.email}</div>
            <div className="card__meta">{user.role}</div>
          </div>
        ) : null}

        <div className="card stack">
          <div>
            <div className="card__title">{t('settings.language')}</div>
            <div className="card__meta">{t('settings.languageDesc')}</div>
          </div>
          <div className="row">
            <button
              type="button"
              className={`btn btn--block ${language === 'en' ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => setLanguage('en')}
            >
              {t('settings.english')}
            </button>
            <button
              type="button"
              className={`btn btn--block ${language === 'ar' ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => setLanguage('ar')}
            >
              {t('settings.arabic')}
            </button>
          </div>
        </div>

        {user?.role === 'manager' ? (
          <div className="stack">
            <Link to="/templates" className="card card--tap"><div className="card__title">{t('nav.templates', 'Templates')}</div></Link>
            <Link to="/users" className="card card--tap"><div className="card__title">{t('users.title', 'Team & clients')}</div></Link>
            <Link to="/audit" className="card card--tap"><div className="card__title">{t('audit.title', 'Audit log')}</div></Link>
          </div>
        ) : null}

        {isDemoMode() ? (
          <div className="card stack">
            <div className="card__title">Demo mode</div>
            <div className="card__meta">
              You're running against in-browser seed data. Switch roles from the “Demo” chip
              in the header. To go live, set <code>VITE_SUPABASE_URL</code>,
              <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env.local</code>, run the SQL
              migration, then set <code>VITE_DEMO_MODE=0</code>.
            </div>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={async () => { await window.__demo?.reset(); location.reload(); }}
            >
              Reset demo data
            </button>
          </div>
        ) : null}

        <div className="card stack">
          <div className="card__title">{t('settings.install')}</div>
          <div className="card__meta">{t('settings.installHint')}</div>
        </div>

        {user ? (
          <button className="btn btn--danger btn--block" onClick={signOut}>
            {t('auth.signOut', 'Sign out')}
          </button>
        ) : null}
      </main>
    </AppShell>
  );
}
