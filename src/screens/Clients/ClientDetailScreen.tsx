import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { AppHeader } from '@/components/AppHeader';
import { StatusPill } from '@/components/StatusPill';
import { getSupabase } from '@/services/supabase/client';
import { listTasks } from '@/services/data/tasks';
import type { Client, ClientNote, FieldTask } from '@/domain/models/ops';
import { NoteComposer, resolveNote } from '@/components/NoteComposer';
import { TaskWhoLine } from '@/components/TaskWhoLine';
import { FieldStatusPill } from '@/components/field/FieldStatusPill';
import { useFieldData } from '@/app/providers/FieldDataContext';
import { useLanguage } from '@/app/providers/LanguageContext';
import { Icon } from '@/components/Icon';
import { formatDate, formatDateAndTime } from '@/lib/datetime';
import '@/styles/screens/admin.css';

export function ClientDetailScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { id } = useParams();
  const [client, setClient] = useState<Client | null>(null);
  const [tasks, setTasks] = useState<FieldTask[]>([]);
  const [notes, setNotes] = useState<ClientNote[]>([]);
  const fd = useFieldData();

  async function load() {
    if (!id) return;
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
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

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
  const contactBits = [client.phone, client.email, client.address].filter(Boolean) as string[];

  return (
    <AppShell>
      <AppHeader title={client.name} showBack />
      <main className="app-main">
        <div className={`card adm-contact${contactBits.length ? '' : ' adm-contact--empty'}`}>
          {contactBits.length ? contactBits.map((v, i) => <bdi key={i}>{v}</bdi>) : '—'}
        </div>

        <section className="section">
          <div className="section-title">{t('notes.open', 'Open notes')}</div>
          {openNotes.length === 0 ? (
            <p className="hint">{t('notes.none', 'No open notes.')}</p>
          ) : (
            <div className="stack">
              {openNotes.map((n) => (
                <div key={n.id} className="note-card">
                  <div dir="auto">{n.body}</div>
                  <div className="adm-note__foot">
                    <span className="card__meta">{formatDate(n.createdAt, language)}</span>
                    <button className="btn btn--ghost" onClick={async () => { await resolveNote(n.id); await load(); }}>
                      {t('notes.resolve', 'Mark resolved')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="adm-after">
            <NoteComposer clientId={client.id} onSaved={load} />
          </div>
        </section>

        <section className="section">
          <div className="adm-section-head">
            <h2 className="section-title">{t('fo.projects.title', 'Projects')}</h2>
            <Link to={`/projects/new?client=${client.id}`} className="btn btn--ghost btn--sm"><Icon name="plus" /> {t('fo.projects.new', 'New')}</Link>
          </div>
          {fd.projects.filter((p) => p.clientId === client.id).length === 0 ? <p className="hint">{t('fo.projects.none', 'No projects match.')}</p> : null}
          <div className="adm-list">
            {fd.projects.filter((p) => p.clientId === client.id).map((p) => (
              <div key={p.id} className="adm-row adm-row--link">
                <Link to={`/projects/${p.id}`} className="adm-row__main">
                  <div className="adm-row__text">
                    <div className="card__title">{p.name}</div>
                    {p.code ? <div className="card__meta"><bdi>{p.code}</bdi></div> : null}
                  </div>
                  <FieldStatusPill status={p.status} />
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-title">{t('clients.upcoming', 'Upcoming visits')} · {t('fo.legacy', 'older task list')}</div>
          {upcoming.length === 0 ? (
            <p className="hint">{t('clients.noUpcoming', 'Nothing scheduled.')}</p>
          ) : (
            <div className="stack">
              {upcoming.map((x) => (
                <Link key={x.id} to={`/tasks/${x.id}`} className="card card--tap">
                  <div className="adm-row__text">
                    <div className="card__title">{x.title}</div>
                    <TaskWhoLine task={x} hideClient />
                    <div className="card__meta">{formatDateAndTime(x.scheduledAt, language)}</div>
                  </div>
                  <StatusPill status={x.status} approvalMethod={x.approvalMethod} />
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="section">
          <div className="section-title">{t('clients.history', 'Visit history')}</div>
          {history.length === 0 ? (
            <p className="hint">{t('clients.noHistory', 'No past visits yet.')}</p>
          ) : (
            <div className="timeline">
              {history.map((x) => (
                <Link key={x.id} to={`/tasks/${x.id}`} className="timeline__item">
                  <span className="timeline__dot" />
                  <div className="adm-row__text">
                    <div className="card__title">{x.title}</div>
                    <TaskWhoLine task={x} hideClient />
                    <div className="card__meta">{formatDate(x.scheduledAt, language)}</div>
                  </div>
                  <StatusPill status={x.status} approvalMethod={x.approvalMethod} />
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </AppShell>
  );
}
