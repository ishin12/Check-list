import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '@/components/AppShell';
import { AppHeader } from '@/components/AppHeader';
import { getSupabase } from '@/services/supabase/client';
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
  const [role, setRole] = useState<Role>('worker');
  const [clientId, setClientId] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const sb = getSupabase();
    const [{ data: ps }, { data: cs }] = await Promise.all([
      sb.from('profiles').select('id, role, full_name, email, phone, client_id, active').order('full_name'),
      sb.from('clients').select('id, name').order('name'),
    ]);
    setUsers((ps ?? []).map((p) => ({
      id: p.id, role: p.role, fullName: p.full_name ?? undefined,
      email: p.email ?? undefined, phone: p.phone ?? undefined,
      clientId: p.client_id ?? undefined, active: p.active,
    })));
    setClients((cs ?? []).map((c) => ({ id: c.id, name: c.name })));
  }

  useEffect(() => { void load(); }, []);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending'); setError(null);
    try {
      const sb = getSupabase();
      const { data: { session } } = await sb.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          email: email.trim(),
          role,
          full_name: fullName || undefined,
          client_id: role === 'client' ? clientId || undefined : undefined,
        }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      setStatus('ok');
      setEmail(''); setFullName(''); setClientId('');
      await load();
      await directory.refresh();
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function toggleActive(u: AppUser) {
    await getSupabase().from('profiles').update({ active: !u.active }).eq('id', u.id);
    await load();
    await directory.refresh();
  }

  return (
    <AppShell>
      <AppHeader title={t('users.title', 'Team & clients')} showBack />
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
              <option value="worker">Worker</option>
              <option value="manager">Manager</option>
              <option value="client">Client</option>
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
          <button className="btn btn--primary btn--block" type="submit" disabled={status === 'sending'}>
            {status === 'sending' ? t('users.sending', 'Sending invite…') : t('users.sendInvite', 'Send invite')}
          </button>
          {status === 'ok' ? <div className="banner banner--success">{t('users.inviteSent', 'Invite sent.')}</div> : null}
          {error ? <div className="banner banner--error">{error}</div> : null}
        </form>

        <div className="section-title">{t('users.everyone', 'Everyone')}</div>
        <div className="stack">
          {users.map((u) => (
            <div key={u.id} className="card">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <div className="card__title">{u.fullName ?? u.email ?? u.id}</div>
                  <div className="card__meta">{u.role}{u.active ? '' : ' · inactive'}</div>
                </div>
                <button className="btn btn--ghost" onClick={() => toggleActive(u)}>
                  {u.active ? t('users.deactivate', 'Deactivate') : t('users.activate', 'Activate')}
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </AppShell>
  );
}
