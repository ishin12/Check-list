import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { AppHeader } from '@/components/AppHeader';
import { StatusPill } from '@/components/StatusPill';
import { getSupabase } from '@/services/supabase/client';
import { listTasks } from '@/services/data/tasks';
import type { Client, ClientNote, FieldTask } from '@/domain/models/ops';

export function ClientDetailScreen() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [client, setClient] = useState<Client | null>(null);
  const [tasks, setTasks] = useState<FieldTask[]>([]);
  const [notes, setNotes] = useState<ClientNote[]>([]);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      const sb = getSupabase();
      const [{ data: c }, ts, { data: ns }] = await Promise.all([
        sb.from('clients').select('*').eq('id', id).maybeSingle(),
        listTasks({ clientId: id }),
        sb.from('client_notes').select('*').eq('client_id', id).order('created_at', { ascending: false }),
      ]);
      if (c) {
        setClient({
          id: c.id, name: c.name, email: c.email ?? undefined, phone: c.phone ?? undefined,
          address: c.address ?? undefined, notes: c.notes ?? undefined,
          createdAt: c.created_at, updatedAt: c.updated_at,
        });
      }
      setTasks(ts);
      setNotes((ns ?? []).map((r) => ({
        id: r.id, clientId: r.client_id, body: r.body, status: r.status,
        createdAt: r.created_at, resolvedAt: r.resolved_at ?? undefined,
        createdInTaskId: r.created_in_task_id ?? undefined,
        resolvedInTaskId: r.resolved_in_task_id ?? undefined,
        createdBy: r.created_by ?? undefined,
      })));
    })();
  }, [id]);

  if (!client) {
    return (
      <AppShell>
        <AppHeader title={t('clients.title', 'Client')} showBack />
        <main className="app-main"><p className="hint">Loading…</p></main>
      </AppShell>
    );
  }

  const upcoming = tasks.filter((x) => x.status === 'not_started' || x.status === 'in_progress');
  const history  = tasks.filter((x) => x.status !== 'not_started');
  const openNotes = notes.filter((n) => n.status === 'open');

  return (
    <AppShell>
      <AppHeader title={client.name} showBack />
      <main className="app-main">
        <div className="card">
          <div className="card__title">{client.name}</div>
          <div className="card__meta">{[client.phone, client.email, client.address].filter(Boolean).join(' · ') || '—'}</div>
        </div>

        {openNotes.length > 0 ? (
          <section>
            <div className="section-title">📎 {t('notes.open', 'Open notes')}</div>
            <div className="stack">
              {openNotes.map((n) => (
                <div key={n.id} className="note-card">
                  <div>{n.body}</div>
                  <div className="card__meta">{new Date(n.createdAt).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <div className="section-title">{t('clients.upcoming', 'Upcoming visits')}</div>
          {upcoming.length === 0 ? (
            <p className="hint">{t('clients.noUpcoming', 'Nothing scheduled.')}</p>
          ) : (
            <div className="stack">
              {upcoming.map((x) => (
                <Link key={x.id} to={`/tasks/${x.id}`} className="card card--tap">
                  <div style={{ flex: 1 }}>
                    <div className="card__title">{x.title}</div>
                    <div className="card__meta">{new Date(x.scheduledAt).toLocaleString()}</div>
                  </div>
                  <StatusPill status={x.status} />
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="section-title">{t('clients.history', 'Visit history')}</div>
          {history.length === 0 ? (
            <p className="hint">{t('clients.noHistory', 'No past visits yet.')}</p>
          ) : (
            <div className="timeline">
              {history.map((x) => (
                <Link key={x.id} to={`/tasks/${x.id}`} className="timeline__item">
                  <span className="timeline__dot" />
                  <div style={{ flex: 1 }}>
                    <div className="card__title">{x.title}</div>
                    <div className="card__meta">{new Date(x.scheduledAt).toLocaleDateString()}</div>
                  </div>
                  <StatusPill status={x.status} />
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </AppShell>
  );
}
