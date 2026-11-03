import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { AppShell } from '@/components/AppShell';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Chevron } from '@/components/Chevron';
import '@/styles/screens/admin.css';
import { useLanguage } from '@/app/providers/LanguageContext';
import { useAuth } from '@/app/providers/AuthContext';
import { isDemoMode } from '@/services/supabase/client';
import { getAppSettings, saveAppSettings } from '@/services/data/appSettings';
import { features } from '@/config/features';

export function SettingsScreen() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const { user, signOut, updatePassword } = useAuth();

  // Change my password
  const [confirmReset, setConfirmReset] = useState(false);
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

  const isManager = user?.role === 'manager';
  const hasFinance = !!user && (user.role === 'finance' || user.financeAccess === true);

  return (
    <AppShell>
      <AppHeader title={t('settings.title')} showBack />
      <main className="app-main adm-narrow">
        {user ? (
          <div className="card adm-who">
            <div className="adm-who__name">{user.fullName ?? user.email}</div>
            <div className="card__meta">
              {t(`demo.role.${user.role}`, user.role)}
              {user.financeAccess && user.role !== 'finance' ? ` + ${t('fo.role.finance', 'Finance')}` : ''}
            </div>
          </div>
        ) : null}

        {isManager ? (
          <div className="card adm-links">
            <Link to="/employees" className="adm-link"><span>{t('fo.emp.title', 'Workers')}</span><Chevron kind="forward" /></Link>
            <Link to="/clients" className="adm-link"><span>{t('tabs.clients', 'Clients')}</span><Chevron kind="forward" /></Link>
            <Link to="/templates" className="adm-link"><span>{t('fo.config.checklists', 'Checklists & frequencies')}</span><Chevron kind="forward" /></Link>
            <Link to="/config" className="adm-link"><span>{t('fo.config.title', 'Setup')}</span><Chevron kind="forward" /></Link>
            <Link to="/users" className="adm-link"><span>{features.legacyTasks ? t('users.title', 'Team & clients') : t('users.teamTitle', 'Team')}</span><Chevron kind="forward" /></Link>
            <Link to="/audit" className="adm-link"><span>{t('audit.title', 'Audit log')}</span><Chevron kind="forward" /></Link>
            {features.legacyTasks ? (
              <Link to="/today" className="adm-link"><span>{t('fo.home.legacy', 'Open the older task list')}</span><Chevron kind="forward" /></Link>
            ) : null}
          </div>
        ) : null}
        {hasFinance ? (
          <div className="card adm-links">
            <Link to="/month-close" className="adm-link"><span>{t('tabs.monthClose', 'Month close')}</span><Chevron kind="forward" /></Link>
            {!isManager ? (
              <Link to="/audit" className="adm-link"><span>{t('audit.title', 'Audit log')}</span><Chevron kind="forward" /></Link>
            ) : null}
          </div>
        ) : null}

        <div className="card adm-card">
          <div>
            <div className="adm-card__title">{t('settings.language')}</div>
            <div className="adm-card__lede">{t('settings.languageDesc')}</div>
          </div>
          <div className="adm-seg">
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
            <button
              type="button"
              className={`btn btn--block ${language === 'ur' ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => setLanguage('ur')}
              lang="ur"
            >
              اردو
            </button>
          </div>
        </div>

        {/* Change my password (hidden in demo since auth is simulated). */}
        {user && !isDemoMode() ? (
          <div className="card adm-card">
            <div className="adm-card__title">{t('settings.changePassword', 'Change my password')}</div>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              placeholder={t('users.newPassword', 'New password (min 8 chars)') ?? ''}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
            <button className={`btn ${isManager ? 'btn--ghost' : 'btn--primary'}`} disabled={pw.length < 8 || pwSaving} onClick={changePassword}>
              {pwSaving ? t('common.saving', 'Saving…') : t('settings.updatePassword', 'Update password')}
            </button>
            {pwMsg ? <div className={`banner banner--${pwMsg.ok ? 'success' : 'error'}`}>{pwMsg.text}</div> : null}
          </div>
        ) : null}

        {/* Signing window — manager only, and only while WhatsApp signing is on. */}
        {isManager && features.whatsappSigning ? (
          <div className="card adm-card">
            <div>
              <div className="adm-card__title">{t('settings.signingWindow', 'Client signing window')}</div>
              <div className="adm-card__lede">{t('settings.signingWindowDesc', 'How long the client has to sign before the task auto-approves.')}</div>
            </div>
            <div className="adm-fields adm-fields--md-2">
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
            </div>
            <button className="btn btn--primary" disabled={winSaving} onClick={saveWindow}>
              {winSaving ? t('common.saving', 'Saving…') : t('settings.saveWindow', 'Save')}
            </button>
            {winMsg ? <div className="banner banner--success">{winMsg}</div> : null}
          </div>
        ) : null}

        {isDemoMode() ? (
          <div className="card adm-card">
            <div>
              <div className="adm-card__title">{t('demo.modeTitle', 'Demo mode')}</div>
              <div className="adm-card__lede">
                {t('demo.modeBody', 'This is a demo with sample data. Your changes stay in this browser only. Switch between manager, supervisor and finance from the “Demo” chip at the top.')}
              </div>
            </div>
            <button type="button" className="btn btn--ghost" onClick={() => setConfirmReset(true)}>
              {t('demo.reset', 'Reset demo data')}
            </button>
            <ConfirmDialog
              open={confirmReset}
              title={t('demo.resetTitle', 'Reset the demo data?')}
              body={t('demo.resetBody', 'Everything entered in this browser is replaced by the original sample data.')}
              confirmLabel={t('demo.reset', 'Reset demo data')}
              danger
              onConfirm={async () => { setConfirmReset(false); await window.__demo?.reset(); location.reload(); }}
              onCancel={() => setConfirmReset(false)}
            />
          </div>
        ) : null}

        <div className="card adm-card">
          <div>
            <div className="adm-card__title">{t('settings.install')}</div>
            <div className="adm-card__lede">{t('settings.installHint')}</div>
          </div>
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
