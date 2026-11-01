import { useEffect, useState } from 'react';
import { useLanguage } from '@/app/providers/LanguageContext';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { AppHeader } from '@/components/AppHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LocationInput, type LocationInputState } from '@/components/LocationInput';
import { LocationMap } from '@/components/LocationMap';
import { useAuth } from '@/app/providers/AuthContext';
import { useDirectory } from '@/app/providers/DirectoryContext';
import { StatusPill } from '@/components/StatusPill';
import { getSupabase } from '@/services/supabase/client';
import { listTasks } from '@/services/data/tasks';
import { applyClientLocationToTasks, updateClientDetails, updateClientLocation } from '@/services/data/clients';
import { directionsLinkFor, mapsLinkFor, type TaskLocation } from '@/domain/location';
import type { Client, ClientNote, FieldTask } from '@/domain/models/ops';
import { NoteComposer, resolveNote } from '@/components/NoteComposer';
import { TaskWhoLine } from '@/components/TaskWhoLine';
import { formatDate, formatDateAndTime } from '@/lib/datetime';
import '@/styles/screens/admin.css';

export function ClientDetailScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { id } = useParams();
  const { user } = useAuth();
  const directory = useDirectory();
  const [client, setClient] = useState<Client | null>(null);
  const [tasks, setTasks] = useState<FieldTask[]>([]);
  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [editingLocation, setEditingLocation] = useState(false);
  const [locationDraft, setLocationDraft] = useState<TaskLocation | null>(null);
  const [locationState, setLocationState] = useState<LocationInputState>('empty');
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [confirmExistingJobs, setConfirmExistingJobs] = useState(false);
  const [editingClient, setEditingClient] = useState(false);
  const [clientDraft, setClientDraft] = useState({ name: '', email: '', phone: '', address: '' });
  const [savingClient, setSavingClient] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

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
        locationUrl: c.location_url ?? undefined, locationLat: c.location_lat ?? undefined, locationLng: c.location_lng ?? undefined,
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
        <main className="app-main"><p className="hint">{t('common.loading', 'Loading…')}</p></main>
      </AppShell>
    );
  }

  const upcoming = tasks.filter((x) => x.status === 'not_started' || x.status === 'in_progress');
  const history  = tasks.filter((x) => x.status !== 'not_started');
  const openNotes = notes.filter((n) => n.status === 'open');
  const canManage = user?.role === 'manager' || user?.role === 'supervisor';
  const mapsLink = mapsLinkFor(client);
  const directions = directionsLinkFor(client);

  async function saveClientLocation() {
    if (!client || !id) return;
    setSavingLocation(true); setLocationError(null);
    try {
      await updateClientLocation(id, locationDraft);
      setEditingLocation(false);
      if (tasks.length) setConfirmExistingJobs(true);
      else await load();
    } catch (error) {
      setLocationError(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingLocation(false);
    }
  }

  async function applyToExistingJobs() {
    if (!id) return;
    setSavingLocation(true); setLocationError(null);
    try {
      await applyClientLocationToTasks(id, locationDraft);
      setConfirmExistingJobs(false);
      await load();
    } catch (error) {
      setLocationError(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingLocation(false);
    }
  }

  function startEditingClient(clientToEdit: Client) {
    setClientDraft({
      name: clientToEdit.name,
      email: clientToEdit.email ?? '',
      phone: clientToEdit.phone ?? '',
      address: clientToEdit.address ?? '',
    });
    setClientError(null);
    setEditingClient(true);
  }

  async function saveClientDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !clientDraft.name.trim()) return;
    setSavingClient(true); setClientError(null);
    try {
      await updateClientDetails(id, {
        name: clientDraft.name.trim(),
        email: clientDraft.email.trim() || null,
        phone: clientDraft.phone.trim() || null,
        address: clientDraft.address.trim() || null,
      });
      await directory.refresh();
      setEditingClient(false);
      await load();
    } catch (error) {
      setClientError(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingClient(false);
    }
  }

  const contactBits = [client.phone, client.email, client.address].filter(Boolean) as string[];
  return (
    <AppShell>
      <AppHeader title={client.name} showBack />
      <main className="app-main">
        <section className="section">
          <div className="adm-section-head">
            <div className="section-title">{t('clients.details', 'Client details')}</div>
            {canManage && !editingClient ? <button className="btn btn--ghost" type="button" onClick={() => startEditingClient(client)}>{t('clients.edit', 'Edit client')}</button> : null}
          </div>
          {clientError ? <div className="banner banner--error">{clientError}</div> : null}
          {editingClient ? (
            <form className="card adm-card" onSubmit={saveClientDetails}>
              <div className="field">
                <label className="field__label" htmlFor="client-name">{t('clientNew.name', 'Name')}</label>
                <input id="client-name" className="input" required disabled={savingClient} value={clientDraft.name} onChange={(e) => setClientDraft((draft) => ({ ...draft, name: e.target.value }))} />
              </div>
              <div className="adm-fields adm-fields--md-2">
                <div className="field">
                  <label className="field__label" htmlFor="client-email">{t('auth.email', 'Email')}</label>
                  <input id="client-email" className="input" type="email" disabled={savingClient} value={clientDraft.email} onChange={(e) => setClientDraft((draft) => ({ ...draft, email: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="field__label" htmlFor="client-phone">{t('clientNew.phone', 'Phone')}</label>
                  <input id="client-phone" className="input" type="tel" disabled={savingClient} value={clientDraft.phone} onChange={(e) => setClientDraft((draft) => ({ ...draft, phone: e.target.value }))} />
                </div>
              </div>
              <div className="field">
                <label className="field__label" htmlFor="client-address">{t('clientNew.address', 'Address')}</label>
                <textarea id="client-address" className="textarea" disabled={savingClient} value={clientDraft.address} onChange={(e) => setClientDraft((draft) => ({ ...draft, address: e.target.value }))} />
              </div>
              <div className="adm-actions">
                <button className="btn btn--primary" type="submit" disabled={savingClient || !clientDraft.name.trim()}>{savingClient ? t('common.saving', 'Saving…') : t('clients.save', 'Save client')}</button>
                <button className="btn btn--ghost" type="button" disabled={savingClient} onClick={() => setEditingClient(false)}>{t('common.cancel', 'Cancel')}</button>
              </div>
            </form>
          ) : (
            <div className={`card adm-contact${contactBits.length ? '' : ' adm-contact--empty'}`}>
              {contactBits.length ? contactBits.map((v, i) => <bdi key={i}>{v}</bdi>) : '—'}
            </div>
          )}
        </section>

        <section className="section">
          <div className="section-title">{t('clients.location', 'Site location')}</div>
          {locationError ? <div className="banner banner--error">{locationError}</div> : null}
          {editingLocation ? (
            <div className="card adm-card">
              <LocationInput initial={client} disabled={savingLocation} onChange={(value, state) => { setLocationDraft(value); setLocationState(state); }} />
              <div className="adm-actions">
                <button className="btn btn--primary" type="button" disabled={savingLocation || locationState === 'invalid'} onClick={() => void saveClientLocation()}>
                  {savingLocation ? t('common.saving', 'Saving…') : t('location.save', 'Save location')}
                </button>
                <button className="btn btn--ghost" type="button" disabled={savingLocation} onClick={() => setEditingLocation(false)}>{t('common.cancel', 'Cancel')}</button>
              </div>
            </div>
          ) : mapsLink ? (
            <div className="card location-card">
              <LocationMap location={client} />
              <div className="location-card__actions">
                <a className="btn" href={mapsLink} target="_blank" rel="noopener noreferrer">{t('location.open', 'Open in Google Maps')}</a>
                {directions ? <a className="btn btn--ghost" href={directions} target="_blank" rel="noopener noreferrer">{t('location.directions', 'Directions')}</a> : null}
              </div>
            </div>
          ) : <p className="hint">{t('clients.noLocation', 'No site location saved.')}</p>}
          {canManage && !editingLocation ? <button className="btn btn--ghost" type="button" onClick={() => { setLocationDraft(client); setLocationState('valid'); setLocationError(null); setEditingLocation(true); }}>{mapsLink ? t('location.edit', 'Edit location') : t('location.add', 'Add location')}</button> : null}
        </section>

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
          <div className="section-title">{t('clients.upcoming', 'Upcoming visits')}</div>
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
      <ConfirmDialog
        open={confirmExistingJobs}
        title={t('clients.updateExistingLocationTitle', 'Update existing jobs?')}
        body={t('clients.updateExistingLocationBody', 'The client location is saved. Do you also want to update the location on every existing job for this client?')}
        confirmLabel={t('clients.updateExistingLocationConfirm', 'Update all jobs')}
        onConfirm={() => void applyToExistingJobs()}
        onCancel={() => { setConfirmExistingJobs(false); void load(); }}
      />
    </AppShell>
  );
}
