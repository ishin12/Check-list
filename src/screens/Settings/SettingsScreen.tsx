import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { AppShell } from '@/components/AppShell';
import { useLanguage } from '@/app/providers/LanguageContext';
import { useAuth } from '@/app/providers/AuthContext';
import { isDemoMode } from '@/services/supabase/client';
import { getAppSettings, saveAppSettings } from '@/services/data/appSettings';

export function SettingsScreen() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const { user, signOut, updatePassword } = useAuth();

  // Change my password
  const [pw, setPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Signing window (manager only)
  const [expiryDays, setExpiryDays] = useState(3);
  const [reminderHours, setReminderHours] = useState(24);
  const [winSaving, setWinSaving] = useState(false);
  const [winMsg, setWinMsg] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role !== 'manager') return;
    void getAppSettings().then((s) => {
      setExpiryDays(s.signingExpiryDays);
      setReminderHours(s.signingReminderHours);
    });
  }, [user?.role]);

  async function changePassword() {
    if (pw.length < 8) return;
    setPwSaving(true); setPwMsg(null);
    try {
      await updatePassword(pw);
      setPwMsg({ ok: true, text: t('settings.passwordChanged', 'Password changed.') });
      setPw('');
    } catch (e) {
      setPwMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setPwSaving(false);
    }
  }

  async function saveWindow() {
    setWinSaving(true); setWinMsg(null);
    try {
      await saveAppSettings({ signingExpiryDays: expiryDays, signingReminderHours: reminderHours });
      setWinMsg(t('settings.windowSaved', 'Saved. Applies to new signing links.'));
    } catch (e) {
      setWinMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setWinSaving(false);
    }
  }

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

        {/* Change my password (hidden in demo since auth is simulated). */}
        {user && !isDemoMode() ? (
          <div className="card stack">
            <div className="card__title">{t('settings.changePassword', 'Change my password')}</div>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              placeholder={t('users.newPassword', 'New password (min 8 chars)') ?? ''}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
            <button className="btn btn--primary" disabled={pw.length < 8 || pwSaving} onClick={changePassword}>
              {pwSaving ? t('common.saving', 'Saving…') : t('settings.updatePassword', 'Update password')}
            </button>
            {pwMsg ? <div className={`banner banner--${pwMsg.ok ? 'success' : 'error'}`}>{pwMsg.text}</div> : null}
          </div>
        ) : null}

        {/* Signing window — manager only. */}
        {user?.role === 'manager' ? (
          <div className="card stack">
            <div>
              <div className="card__title">{t('settings.signingWindow', 'Client signing window')}</div>
              <div className="card__meta">{t('settings.signingWindowDesc', 'How long the client has to sign before the task auto-approves.')}</div>
            </div>
            <div className="field">
              <label className="field__label">{t('settings.expiryDays', 'Days to sign')}</label>
              <input className="input" type="number" min={1} max={30} value={expiryDays}
                onChange={(e) => setExpiryDays(Math.max(1, Number(e.target.value)))} />
            </div>
            <div className="field">
              <label className="field__label">{t('settings.reminderHours', 'Reminder before expiry (hours)')}</label>
              <input className="input" type="number" min={1} max={120} value={reminderHours}
                onChange={(e) => setReminderHours(Math.max(1, Number(e.target.value)))} />
            </div>
            <button className="btn btn--primary" disabled={winSaving} onClick={saveWindow}>
              {winSaving ? t('common.saving', 'Saving…') : t('settings.saveWindow', 'Save')}
            </button>
            {winMsg ? <div className="banner banner--success">{winMsg}</div> : null}
          </div>
        ) : null}

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
