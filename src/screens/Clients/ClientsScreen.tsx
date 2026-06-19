import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { AppHeader } from '@/components/AppHeader';
import { getSupabase } from '@/services/supabase/client';
import type { Client } from '@/domain/models/ops';

export function ClientsScreen() {
  const { t } = useTranslation();
  const [clients, setClients] = useState<Client[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    void (async () => {
      const { data } = await getSupabase().from('clients').select('*').order('name');
      setClients((data ?? []).map((r) => ({
        id: r.id, name: r.name, email: r.email ?? undefined, phone: r.phone ?? undefined,
        address: r.address ?? undefined, notes: r.notes ?? undefined,
        createdAt: r.created_at, updatedAt: r.updated_at,
      })));
    })();
  }, []);

  const filtered = clients.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <AppShell>
      <AppHeader title={t('clients.title', 'Clients')}>
        <Link to="/clients/new" className="btn btn--primary btn--icon" aria-label={t('clients.add', 'Add client')}>+</Link>
      </AppHeader>
      <main className="app-main">
        <input className="input" placeholder={t('clients.search', 'Search clients…') ?? ''} value={q} onChange={(e) => setQ(e.target.value)} />
        {filtered.length === 0 ? (
          <div className="empty">
            <div className="empty__icon">⌖</div>
            <p>{t('clients.empty', 'No clients yet.')}</p>
          </div>
        ) : (
          <div className="stack">
            {filtered.map((c) => (
              <Link key={c.id} to={`/clients/${c.id}`} className="card card--tap">
                <div style={{ flex: 1 }}>
                  <div className="card__title">{c.name}</div>
                  <div className="card__meta">{c.phone ?? c.email ?? '—'}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}
