import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '@/components/AppShell';
import { features } from '@/config/features';
import { AppHeader } from '@/components/AppHeader';
import { getSupabase } from '@/services/supabase/client';
import { invokeFunction } from '@/services/data/functions';
import { useDirectory } from '@/app/providers/DirectoryContext';
import type { AppUser, Role } from '@/domain/models/ops';

interface ClientOpt { id: string; name: string }

export function UsersScreen() {
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
        <form className="card stack" onSubmit={invite}>
          <div className="card__title">{t('users.invite', 'Invite someone')}</div>
          <div className="field">
            <label className="field__label">{t('auth.email', 'Email')}</label>
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
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
          {role === 'manager' ? (
            <label className="checkbox-row">
              <input type="checkbox" checked={financeGrant} onChange={(e) => setFinanceGrant(e.target.checked)} />
              {t('fo.users.grantFinance', 'Also grant finance (month close, post-close edits)')}
            </label>
          ) : null}
          {role === 'client' ? (
            <div className="field">
              <label className="field__label">{t('users.linkClient', 'Linked client record')}</label>
              <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} required>
                <option value="">—</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          ) : null}
          <button className="btn btn--primary btn--block" type="submit" disabled={status === 'sending'}>
            {status === 'sending' ? t('users.sending', 'Sending invite…') : t('users.sendInvite', 'Send invite')}
          </button>
          {status === 'ok' ? <div className="banner banner--success">{t('users.inviteSent', 'Invite sent.')}</div> : null}
          {error ? <div className="banner banner--error">{error}</div> : null}
        </form>

        <div className="section-title">{t('users.everyone', 'Everyone')}</div>
        <div className="stack">
          {users.filter((u) => features.legacyTasks || (u.role !== 'client' && u.role !== 'worker')).map((u) => (
            <div key={u.id} className="card">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <div className="card__title">{u.fullName ?? u.email ?? u.id}</div>
                  <div className="card__meta">
                    {t(`fo.role.${u.role}`, u.role)}
                    {u.financeAccess && u.role !== 'finance' ? ` + ${t('fo.role.finance', 'Finance')}` : ''}
                    {u.active ? '' : ` · ${t('fo.status.inactive', 'Inactive')}`}
                  </div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  {u.role !== 'client' ? (
                    <button className="btn btn--ghost" onClick={() => setPasswordFor(u)}>
                      {t('users.setPassword', 'Set password')}
                    </button>
                  ) : null}
                  <button className="btn btn--ghost" onClick={() => toggleActive(u)}>
                    {u.active ? t('users.deactivate', 'Deactivate') : t('users.activate', 'Activate')}
                  </button>
                </div>
              </div>
              {u.role !== 'client' ? (
                <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
                  <select className="input" style={{ maxWidth: 220 }} value={u.role} aria-label={t('users.role', 'Role') ?? ''}
                    onChange={(e) => void updateProfile(u, { role: e.target.value })}>
                    <option value="supervisor">{t('fo.role.supervisor', 'Supervisor')}</option>
                    <option value="manager">{t('fo.role.manager', 'Manager')}</option>
                    <option value="finance">{t('fo.role.finance', 'Finance')}</option>
                    {features.legacyTasks ? <option value="worker">{t('fo.role.worker', 'Worker (older task list)')}</option> : null}
                  </select>
                  {u.role === 'manager' ? (
                    <label className="checkbox-row">
                      <input type="checkbox" checked={u.financeAccess === true}
                        onChange={(e) => void updateProfile(u, { finance_access: e.target.checked })} />
                      {t('fo.users.financeGrant', 'Finance access')}
                    </label>
                  ) : null}
                </div>
              ) : null}
              {pwTarget?.id === u.id ? (
                <div className="stack" style={{ marginTop: 10 }}>
                  <input
                    className="input"
                    type="text"
                    placeholder={t('users.newPassword', 'New password (min 8 chars)') ?? ''}
                    value={pwValue}
                    onChange={(e) => setPwValue(e.target.value)}
                  />
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn btn--primary" disabled={pwValue.length < 8 || pwSaving} onClick={savePassword}>
                      {pwSaving ? t('common.saving', 'Saving…') : t('users.savePassword', 'Save')}
                    </button>
                    <button className="btn btn--ghost" onClick={() => { setPwTarget(null); setPwValue(''); }}>
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
