import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '@/components/AppShell';
import { useAuth } from '@/app/providers/AuthContext';
import { features } from '@/config/features';
import { AppHeader } from '@/components/AppHeader';
import { getSupabase } from '@/services/supabase/client';
import { invokeFunction } from '@/services/data/functions';
import { useDirectory } from '@/app/providers/DirectoryContext';
import type { AppUser, Role } from '@/domain/models/ops';
import '@/styles/screens/admin.css';

interface ClientOpt { id: string; name: string }

export function UsersScreen() {
  const { user: me } = useAuth();
  const { t } = useTranslation();
  const directory = useDirectory();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<Role>('supervisor');
  const [financeGrant, setFinanceGrant] = useState(false);
  const [clientId, setClientId] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  // Per-user password reset.
  const [pwTarget, setPwTarget] = useState<AppUser | null>(null);
  const [pwValue, setPwValue] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function setPasswordFor(u: AppUser) {
    setPwTarget(u); setPwValue(''); setPwMsg(null);
  }

  async function savePassword() {
    if (!pwTarget || pwValue.length < 8) return;
    setPwSaving(true); setPwMsg(null);
    try {
      const res = await invokeFunction('set-password', { user_id: pwTarget.id, password: pwValue });
      if (!res.ok) {
        setPwMsg({ ok: false, text: res.error ?? t('users.passwordFailed', 'Couldn’t set password.') });
      } else {
        setPwMsg({ ok: true, text: t('users.passwordSet', 'Password updated.') });
        setPwValue('');
      }
    } finally {
      setPwSaving(false);
    }
  }

  async function load() {
    const sb = getSupabase();
    const [{ data: ps }, { data: cs }] = await Promise.all([
      sb.from('profiles').select('*').order('full_name'),
      sb.from('clients').select('id, name').order('name'),
    ]);
    setUsers((ps ?? []).map((p) => ({
      id: p.id, role: p.role, fullName: p.full_name ?? undefined,
      email: p.email ?? undefined, phone: p.phone ?? undefined,
      clientId: p.client_id ?? undefined, active: p.active, financeAccess: p.finance_access === true,
    })));
    setClients((cs ?? []).map((c) => ({ id: c.id, name: c.name })));
  }

  useEffect(() => { void load(); }, []);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending'); setError(null);
    try {
      const res = await invokeFunction('invite-user', {
        email: email.trim(),
        role,
        full_name: fullName || undefined,
        client_id: role === 'client' ? clientId || undefined : undefined,
        finance_access: role === 'manager' ? financeGrant : undefined,
      });
      if (!res.ok) throw new Error(res.error ?? 'invite failed');
      setStatus('ok');
      setEmail(''); setFullName(''); setClientId('');
      await load();
      await directory.refresh();
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function updateProfile(u: AppUser, patch: Record<string, unknown>) {
    setError(null);
    const { error: err } = await getSupabase().from('profiles').update(patch).eq('id', u.id);
    if (err) { setError(err.message); return; }
    await load();
    await directory.refresh();
  }

  async function toggleActive(u: AppUser) {
    await getSupabase().from('profiles').update({ active: !u.active }).eq('id', u.id);
    await load();
    await directory.refresh();
  }

  return (
    <AppShell>
      <AppHeader title={features.legacyTasks ? t('users.title', 'Team & clients') : t('users.teamTitle', 'Team')} showBack />
      <main className="app-main">
        <form className="card adm-card" onSubmit={invite}>
          <div className="adm-card__title">{t('users.invite', 'Invite someone')}</div>
          <div className="adm-fields adm-fields--md-2">
            <div className="field">
              <label className="field__label">{t('auth.email', 'Email')}</label>
              <input className="input" type="email" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <label className="field__label">{t('users.name', 'Name')}</label>
              <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="field">
              <label className="field__label">{t('users.role', 'Role')}</label>
              <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="supervisor">{t('fo.role.supervisor', 'Supervisor')}</option>
                <option value="manager">{t('fo.role.manager', 'Manager')}</option>
                <option value="finance">{t('fo.role.finance', 'Finance')}</option>
                {features.legacyTasks ? <option value="client">{t('fo.role.client', 'Client')}</option> : null}
                {features.legacyTasks ? <option value="worker">{t('fo.role.worker', 'Worker (older task list)')}</option> : null}
              </select>
            </div>
            {role === 'client' ? (
              <div className="field">
                <label className="field__label">{t('users.linkClient', 'Linked client record')}</label>
                <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} required>
                  <option value="">—</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            ) : null}
          </div>
          {role === 'manager' ? (
            <label className="adm-check">
              <input type="checkbox" checked={financeGrant} onChange={(e) => setFinanceGrant(e.target.checked)} />
              {t('fo.users.grantFinance', 'Also grant finance (month close, post-close edits)')}
            </label>
          ) : null}
          <button className="btn btn--primary btn--block" type="submit" disabled={status === 'sending'}>
            {status === 'sending' ? t('users.sending', 'Sending invite…') : t('users.sendInvite', 'Send invite')}
          </button>
          {status === 'ok' ? <div className="banner banner--success">{t('users.inviteSent', 'Invite sent.')}</div> : null}
          {error ? <div className="banner banner--error">{error}</div> : null}
        </form>

        <h2 className="section-title">{t('users.everyone', 'Everyone')}</h2>
        <div className="adm-list adm-list--grid">
          {users.filter((u) => features.legacyTasks || (u.role !== 'client' && u.role !== 'worker')).map((u) => (
            <div key={u.id} className={`card adm-person${u.active ? '' : ' adm-person--off'}`}>
              <div>
                <div className="adm-person__head">
                  <div className="card__title"><bdi>{u.fullName ?? u.email ?? u.id}</bdi></div>
                  <span className="badge">{t(`fo.role.${u.role}`, u.role)}</span>
                  {u.financeAccess && u.role !== 'finance' ? <span className="badge">{t('fo.role.finance', 'Finance')}</span> : null}
                  {u.active ? null : <span className="badge adm-tag--off">{t('fo.status.inactive', 'Inactive')}</span>}
                </div>
                {u.fullName && u.email ? <div className="card__meta"><bdi>{u.email}</bdi></div> : null}
              </div>
              {u.role !== 'client' ? (
                <div className="adm-fields">
                  {/* Your own role cannot be changed here, so the last manager can't demote themself (UAT D1). */}
                  <select className="input" value={u.role} aria-label={t('users.role', 'Role') ?? ''}
                    disabled={u.id === me?.id} title={u.id === me?.id ? t('users.ownRole', 'Another manager must change your role.') ?? undefined : undefined}
                    onChange={(e) => void updateProfile(u, { role: e.target.value })}>
                    <option value="supervisor">{t('fo.role.supervisor', 'Supervisor')}</option>
                    <option value="manager">{t('fo.role.manager', 'Manager')}</option>
                    <option value="finance">{t('fo.role.finance', 'Finance')}</option>
                    {features.legacyTasks ? <option value="worker">{t('fo.role.worker', 'Worker (older task list)')}</option> : null}
                  </select>
                  {u.role === 'manager' ? (
                    <label className="adm-check">
                      <input type="checkbox" checked={u.financeAccess === true}
                        onChange={(e) => void updateProfile(u, { finance_access: e.target.checked })} />
                      {t('fo.users.financeGrant', 'Finance access')}
                    </label>
                  ) : null}
                </div>
              ) : null}
              <div className="adm-actions">
                {u.role !== 'client' ? (
                  <button className="btn btn--ghost btn--sm" onClick={() => setPasswordFor(u)}>
                    {t('users.setPassword', 'Set password')}
                  </button>
                ) : null}
                {/* Nobody can switch off their own account (UAT M4; the database refuses it too). */}
                {u.id !== me?.id ? (
                  <button className="btn btn--ghost btn--sm" onClick={() => toggleActive(u)}>
                    {u.active ? t('users.deactivate', 'Deactivate') : t('users.activate', 'Activate')}
                  </button>
                ) : null}
              </div>
              {pwTarget?.id === u.id ? (
                <div className="adm-tile">
                  <input
                    className="input"
                    type="text"
                    placeholder={t('users.newPassword', 'New password (min 8 chars)') ?? ''}
                    value={pwValue}
                    onChange={(e) => setPwValue(e.target.value)}
                  />
                  <div className="adm-actions">
                    <button className="btn btn--primary btn--sm" disabled={pwValue.length < 8 || pwSaving} onClick={savePassword}>
                      {pwSaving ? t('common.saving', 'Saving…') : t('users.savePassword', 'Save')}
                    </button>
                    <button className="btn btn--ghost btn--sm" onClick={() => { setPwTarget(null); setPwValue(''); }}>
                      {t('common.cancel', 'Cancel')}
                    </button>
                  </div>
                  {pwMsg ? <div className={`banner banner--${pwMsg.ok ? 'success' : 'error'}`}>{pwMsg.text}</div> : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </main>
    </AppShell>
  );
}
