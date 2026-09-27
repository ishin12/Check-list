import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { AppShell } from '@/components/AppShell';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FieldStatusPill } from '@/components/field/FieldStatusPill';
import { PhotoThumb, PhotoViewer } from '@/components/field/Photos';
import { useDirectory } from '@/app/providers/DirectoryContext';
import { useFieldData } from '@/app/providers/FieldDataContext';
import { useLanguage } from '@/app/providers/LanguageContext';
import {
  createRecurring,
  createTasks,
  createVisit,
  deletePlannedVisit,
  listLabor,
  listPhotos,
  listRecurring,
  listReports,
  listTasks,
  listVisits,
  updateProject,
  updateRecurring,
} from '@/services/data/fieldOps';
import { isOverdue, projectCloseBlockers } from '@/domain/fieldops/fieldOps';
import { recurringItemsFromTemplates } from '@/domain/fieldops/visitPlan';
import { isSupervisorRole } from '@/domain/auth/permissions';
import { RECURRENCE_OPTIONS, recurrenceLabel, type Recurrence } from '@/domain/job/recurrence';
import type { ProjectStatus, ProjectTask } from '@/domain/models/ops';
import { configText } from '@/lib/configText';
import { formatDate, localToday } from '@/lib/dates';
import { friendlyError } from '@/lib/ruleErrors';
import { useAsync } from '@/lib/useAsync';
import { useNames, useRoles } from './common';

type Tab = 'overview' | 'visits' | 'tasks' | 'periodic' | 'photos' | 'labor';

/**
 * Project history (§13): visits, tasks by status, photos, reports and labor —
 * visible to whoever supervises it now, whoever supervised it before (BR-007).
 */
export function ProjectDetailScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { id } = useParams();
  const fd = useFieldData();
  const names = useNames();
  const { isManager, user } = useRoles();
  const project = fd.project(id);
  const [tab, setTab] = useState<Tab>('overview');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmStatus, setConfirmStatus] = useState<ProjectStatus | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);

  const { data, error, reload } = useAsync(async () => {
    if (!id) return null;
    const [visits, tasks, recurring, photos, labor] = await Promise.all([
      listVisits({ projectId: id }), listTasks({ projectId: id }), listRecurring({ projectId: id }),
      listPhotos({ projectId: id }), listLabor({ projectId: id }),
    ]);
    const reports = await listReports(visits.map((v) => v.id));
    return { visits, tasks, recurring, photos, labor, reports };
  }, [id]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setActionError(null);
    try { await fn(); await reload(); await fd.refresh(); } catch (e) { setActionError(friendlyError(e, t)); } finally { setBusy(false); }
  }

  if (!project) {
    return (
      <AppShell>
        <AppHeader title={t('fo.projects.title', 'Projects')} showBack />
        <main className="app-main"><p className="hint">{fd.ready ? t('fo.projects.notFound', 'Project not found or not assigned to you.') : t('common.loading', 'Loading…')}</p></main>
      </AppShell>
    );
  }

  const today = localToday();
  const open = (data?.tasks ?? []).filter((x) => x.status === 'open');
  const follow = (data?.tasks ?? []).filter((x) => x.status === 'needs_follow_up');
  const done = (data?.tasks ?? []).filter((x) => x.status === 'completed');
  const blockers = projectCloseBlockers(project, data?.tasks ?? []);
  const canWork = project.status === 'active' && (isManager || project.supervisorId === user?.id);
  const final = project.status === 'completed' || project.status === 'closed';
  const days = (data?.labor ?? []).reduce((s, a) => s + a.duration, 0);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: t('fo.pd.overview', 'Overview') },
    { key: 'visits', label: `${t('fo.pd.visits', 'Visits')} (${data?.visits.length ?? 0})` },
    { key: 'tasks', label: `${t('fo.pd.tasks', 'Tasks')} (${open.length + follow.length})` },
    { key: 'periodic', label: `${t('fo.pd.periodic', 'Periodic')} (${data?.recurring.filter((r) => r.active).length ?? 0})` },
    { key: 'photos', label: `${t('fo.pd.photos', 'Photos')} (${data?.photos.length ?? 0})` },
    { key: 'labor', label: `${t('fo.pd.labor', 'Labor')} (${days})` },
  ];

  return (
    <AppShell>
      <AppHeader title={project.name} showBack action={isManager ? <Link to={`/projects/${project.id}/edit`} className="btn btn--ghost">{t('common.edit', 'Edit')}</Link> : undefined} />
      <main className="app-main">
        {error ? <div className="banner banner--error">{error}</div> : null}
        <div className="card stack" style={{ gap: 6 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="grow">
              <div className="card__title">{project.name}</div>
              <div className="card__meta">{[project.code, names.client(project.clientId)].filter(Boolean).join(' · ')}</div>
            </div>
            <FieldStatusPill status={project.status} />
          </div>
          <div className="card__meta">
            {configText(fd.type(project.projectTypeId)?.name, language)}
            {project.stageId ? ` · ${t('fo.projects.stage', 'Current stage')}: ${configText(fd.stage(project.stageId)?.name, language)}` : ''}
          </div>
          <div className="card__meta">{t('fo.projects.supervisor', 'Supervisor')}: {project.supervisorId ? names.person(project.supervisorId) : t('fo.projects.unassigned', 'Unassigned')}</div>
          {project.notes ? <div className="card__meta">📝 {project.notes}</div> : null}
          <div className="row wrap" style={{ gap: 8, marginTop: 6 }}>
            {canWork ? <Link className="btn btn--primary" to={`/visits/start?project=${project.id}`}>＋ {t('fo.home.startVisit', 'Start visit')}</Link> : null}
            {isManager && !final ? (
              <>
                {project.status === 'active'
                  ? <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setConfirmStatus('on_hold')}>{t('fo.pd.hold', 'Put on hold')}</button>
                  : <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void run(() => updateProject(project.id, { status: 'active' }))}>{t('fo.pd.resume', 'Resume')}</button>}
                <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setConfirmStatus('completed')}>{t('fo.pd.complete', 'Mark completed')}</button>
                <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setConfirmStatus('closed')}>{t('fo.pd.close', 'Close')}</button>
              </>
            ) : null}
          </div>
          {isManager && !final && blockers.length ? (
            <div className="card__meta">{t('fo.pd.closeBlocked', '{{count}} open or follow-up task(s) must be finished before the project can be completed or closed.', { count: blockers.length })}</div>
          ) : null}
        </div>
        {actionError ? <div className="banner banner--error">{actionError}</div> : null}

        <div className="tabs" role="tablist">
          {tabs.map((x) => (
            <button key={x.key} role="tab" aria-selected={tab === x.key} type="button" className={`tabs__item${tab === x.key ? ' tabs__item--active' : ''}`} onClick={() => setTab(x.key)}>{x.label}</button>
          ))}
        </div>

        {!data ? <p className="hint">{t('common.loading', 'Loading…')}</p> : null}

        {data && tab === 'overview' ? (
          <div className="stack">
            <div className="kpis">
              <div className="kpi"><div className="kpi__value">{data.visits.filter((v) => v.status === 'completed').length}</div><div className="kpi__label">{t('fo.pd.visitsDone', 'Visits done')}</div></div>
              <div className={`kpi${follow.length ? ' kpi--warn' : ''}`}><div className="kpi__value">{follow.length}</div><div className="kpi__label">{t('fo.status.needs_follow_up', 'Follow-up')}</div></div>
              <div className="kpi"><div className="kpi__value">{open.length}</div><div className="kpi__label">{t('fo.status.open', 'Open')}</div></div>
              <div className="kpi"><div className="kpi__value">{days}</div><div className="kpi__label">{t('fo.pd.laborDays', 'Labor days')}</div></div>
            </div>
            <div className="section-title">{t('fo.home.followUps', 'Open and follow-up work')}</div>
            <TaskList tasks={[...follow, ...open]} empty={t('fo.home.noFollowUps', 'Nothing waiting.')} />
            <div className="section-title">{t('fo.pd.recentVisits', 'Recent visits')}</div>
            <VisitList visits={data.visits.slice(0, 5)} reports={data.reports} canDelete={false} onDelete={() => undefined} />
          </div>
        ) : null}

        {data && tab === 'visits' ? (
          <div className="stack">
            {isManager && !final ? <PlanVisit projectId={project.id} defaultSupervisor={project.supervisorId} onDone={reload} /> : null}
            <VisitList visits={data.visits} reports={data.reports} canDelete={isManager}
              onDelete={(visitId) => void run(() => deletePlannedVisit(visitId))} />
          </div>
        ) : null}

        {data && tab === 'tasks' ? (
          <div className="stack">
            {isManager && !final ? <AddTask projectId={project.id} onDone={reload} /> : null}
            <div className="section-title">{t('fo.status.needs_follow_up', 'Follow-up')} ({follow.length})</div>
            <TaskList tasks={follow} empty={t('fo.report.none', 'None')} />
            <div className="section-title">{t('fo.status.open', 'Open')} ({open.length})</div>
            <TaskList tasks={open} empty={t('fo.report.none', 'None')} />
            <div className="section-title">{t('fo.status.completed', 'Completed')} ({done.length})</div>
            <TaskList tasks={[...done].reverse()} empty={t('fo.report.none', 'None')} />
          </div>
        ) : null}

        {data && tab === 'periodic' ? (
          <div className="stack">
            {isManager && !final ? (
              <div className="row wrap" style={{ gap: 8 }}>
                <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void run(async () => {
                  await createRecurring(recurringItemsFromTemplates(project, fd.templates, data.recurring, today, () => crypto.randomUUID()));
                })}>⟳ {t('fo.pd.syncPeriodic', 'Add periodic items from checklists')}</button>
              </div>
            ) : null}
            {isManager && !final ? <AddRecurring projectId={project.id} onDone={reload} /> : null}
            {data.recurring.length === 0 ? <p className="hint">{t('fo.pd.noPeriodic', 'No periodic items. Set a frequency on checklist items, or add one here.')}</p> : null}
            {data.recurring.map((r) => (
              <div key={r.id} className="card">
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div className="grow">
                    <div className="card__title">{r.description}</div>
                    <div className="card__meta">
                      ↻ {t(recurrenceLabel(r.recurrence).i18n, recurrenceLabel(r.recurrence).fallback)}
                      {' · '}{t('fo.pd.lastDone', 'Last done')}: {r.lastDoneOn ? formatDate(r.lastDoneOn, language) : '—'}
                      {' · '}{t('fo.pd.nextDue', 'Next due')}: {formatDate(r.nextDueOn, language)}
                    </div>
                  </div>
                  {!r.active ? <FieldStatusPill status="inactive" /> : isOverdue(r, today) ? <FieldStatusPill status="overdue" /> : null}
                </div>
                {isManager && !final ? (
                  <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
                    <select className="input" style={{ maxWidth: 200 }} value={r.recurrence} disabled={busy}
                      onChange={(e) => void run(() => updateRecurring(r.id, { recurrence: e.target.value as Exclude<Recurrence, 'none'> }))}>
                      {RECURRENCE_OPTIONS.filter((x) => x !== 'none').map((x) => <option key={x} value={x}>{t(recurrenceLabel(x).i18n, recurrenceLabel(x).fallback)}</option>)}
                    </select>
                    <input className="input" style={{ maxWidth: 180 }} type="date" value={r.nextDueOn} disabled={busy}
                      onChange={(e) => e.target.value && void run(() => updateRecurring(r.id, { nextDueOn: e.target.value }))} />
                    <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void run(() => updateRecurring(r.id, { active: !r.active }))}>
                      {r.active ? t('fo.pause', 'Pause') : t('fo.resume', 'Resume')}
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {data && tab === 'photos' ? (
          <div className="stack">
            {data.photos.length === 0 ? <p className="hint">{t('fo.pd.noPhotos', 'No photos yet.')}</p> : null}
            {groupBy(data.photos, (p) => p.visitId ?? '').map(([visitId, photos]) => {
              const v = data.visits.find((x) => x.id === visitId);
              return (
                <div key={visitId} className="stack" style={{ gap: 6 }}>
                  <div className="section-title">{v ? formatDate(v.visitDate, language) : t('fo.pd.noVisit', 'Outside a visit')}</div>
                  <div className="thumbs">{photos.map((p) => <PhotoThumb key={p.id} photo={p} onOpen={setViewer} />)}</div>
                </div>
              );
            })}
          </div>
        ) : null}

        {data && tab === 'labor' ? (
          <div className="stack">
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>{t('fo.labor.worker', 'Worker')}</th><th className="num">{t('fo.labor.days', 'Days')}</th><th className="num">{t('fo.labor.entries', 'Entries')}</th></tr></thead>
                <tbody>
                  {groupBy(data.labor, (a) => a.employeeId).map(([emp, rows]) => (
                    <tr key={emp}><td>{names.employee(emp)}</td><td className="num">{rows.reduce((s, a) => s + a.duration, 0)}</td><td className="num">{rows.length}</td></tr>
                  ))}
                </tbody>
                <tfoot><tr><td>{t('fo.total', 'Total')}</td><td className="num">{days}</td><td className="num">{data.labor.length}</td></tr></tfoot>
              </table>
            </div>
            <Link to={`/labor?project=${project.id}`} className="btn btn--ghost">{t('fo.pd.laborLedger', 'Open labor ledger')}</Link>
          </div>
        ) : null}
      </main>

      <ConfirmDialog
        open={!!confirmStatus}
        title={confirmStatus === 'on_hold' ? t('fo.pd.holdTitle', 'Put this project on hold?') : t('fo.pd.closeTitle', 'Close out this project?')}
        body={confirmStatus === 'on_hold'
          ? t('fo.pd.holdBody', 'It stays visible with its history; no new visits until it is resumed.') ?? ''
          : t('fo.pd.closeBody', 'The project keeps its full history and stays searchable, but cannot be reopened.') ?? ''}
        onConfirm={() => { const s = confirmStatus!; setConfirmStatus(null); void run(() => updateProject(project.id, { status: s })); }}
        onCancel={() => setConfirmStatus(null)}
      />
      <PhotoViewer url={viewer} onClose={() => setViewer(null)} />
    </AppShell>
  );

  function TaskList({ tasks, empty }: { tasks: ProjectTask[]; empty: string }) {
    if (tasks.length === 0) return <p className="hint">{empty}</p>;
    return (
      <div className="stack">
        {tasks.map((x) => {
          const v = data?.visits.find((vv) => vv.id === (x.completedInVisitId ?? x.lastVisitId));
          return (
            <div key={x.id} className="card">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div className="grow">
                  <div className="card__title" style={{ fontSize: '1rem' }}>{names.taskLabel(x)}</div>
                  <div className="card__meta">
                    {[x.note, v ? `${t('fo.pd.lastVisit', 'Last visit')} ${formatDate(v.visitDate, language)}` : null].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <FieldStatusPill status={x.status} />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function VisitList({ visits, reports, canDelete, onDelete }: {
    visits: NonNullable<typeof data>['visits']; reports: NonNullable<typeof data>['reports']; canDelete: boolean; onDelete: (id: string) => void;
  }) {
    if (visits.length === 0) return <p className="hint">{t('fo.pd.noVisits', 'No visits yet.')}</p>;
    return (
      <div className="stack">
        {visits.map((v) => {
          const rep = reports.find((r) => r.visitId === v.id);
          const crew = (data?.labor ?? []).filter((a) => a.visitId === v.id);
          return (
            <div key={v.id} className="card">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Link to={v.status === 'planned' ? `/visits/start?visit=${v.id}` : `/visits/${v.id}`} className="grow list-link">
                  <div className="card__title" style={{ fontSize: '1rem' }}>{formatDate(v.visitDate, language, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</div>
                  <div className="card__meta">{names.person(v.supervisorId)}{crew.length ? ` · ${crew.length} ${t('fo.pd.workers', 'worker(s)')}` : ''}</div>
                </Link>
                <FieldStatusPill status={v.status} />
              </div>
              <div className="row wrap" style={{ gap: 8, marginTop: 6 }}>
                {rep ? <Link className="btn btn--ghost" to={`/visits/${v.id}/report`}>{t('fo.visit.report', 'Visit report')} #{String(rep.reportNumber).padStart(5, '0')}</Link> : null}
                {canDelete && v.status === 'planned' && crew.length === 0 ? (
                  <button type="button" className="btn btn--ghost" onClick={() => onDelete(v.id)}>{t('fo.pd.cancelPlanned', 'Cancel planned visit')}</button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
}

function groupBy<T>(list: T[], key: (x: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const x of list) { const k = key(x); m.set(k, [...(m.get(k) ?? []), x]); }
  return [...m];
}

/** Manager assigns a visit to a supervisor for a date (§19 "create a visit and assign it"). */
function PlanVisit({ projectId, defaultSupervisor, onDone }: { projectId: string; defaultSupervisor?: string; onDone: () => Promise<void> }) {
  const { t } = useTranslation();
  const { workers } = useDirectory();
  const [date, setDate] = useState(localToday());
  const [sup, setSup] = useState(defaultSupervisor ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sups = [...workers.values()].filter((w) => w.active && (isSupervisorRole(w.role) || w.role === 'manager'));
  return (
    <details className="card">
      <summary className="card__title" style={{ fontSize: '1rem' }}>＋ {t('fo.pd.planVisit', 'Plan a visit')}</summary>
      <div className="toolbar" style={{ marginTop: 10 }}>
        <div className="field"><label className="field__label">{t('fo.start.date', 'Visit date')}</label>
          <input className="input" type="date" value={date} min={localToday()} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="field"><label className="field__label">{t('fo.projects.supervisor', 'Supervisor')}</label>
          <select className="input" value={sup} onChange={(e) => setSup(e.target.value)}>
            <option value="">—</option>
            {sups.map((w) => <option key={w.id} value={w.id}>{w.fullName ?? w.email}</option>)}
          </select></div>
        <button type="button" className="btn btn--primary" disabled={busy || !sup || !date} onClick={async () => {
          setBusy(true); setError(null);
          try { await createVisit({ projectId, visitDate: date, supervisorId: sup }); await onDone(); } catch (e) { setError(friendlyError(e, t)); } finally { setBusy(false); }
        }}>{t('fo.pd.plan', 'Plan')}</button>
      </div>
      {error ? <div className="banner banner--error">{error}</div> : null}
    </details>
  );
}

/** Manager adds a task for the next visit (§10, §29: tasks are manager-created). */
function AddTask({ projectId, onDone }: { projectId: string; onDone: () => Promise<void> }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="card stack" onSubmit={async (e) => {
      e.preventDefault();
      if (!text.trim()) return;
      setBusy(true); setError(null);
      try {
        await createTasks([{ projectId, description: text.trim(), source: 'manual', required: true, photoRequired: photo }]);
        setText(''); setPhoto(false); await onDone();
      } catch (err) { setError(friendlyError(err, t)); } finally { setBusy(false); }
    }}>
      <div className="card__title" style={{ fontSize: '1rem' }}>＋ {t('fo.pd.addTask', 'Add a task for the next visit')}</div>
      <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('fo.pd.taskPlaceholder', 'What needs to be done?') ?? ''} />
      <label className="checkbox-row"><input type="checkbox" checked={photo} onChange={(e) => setPhoto(e.target.checked)} />{t('fo.task.photoRequired', 'Photo required')}</label>
      <button type="submit" className="btn btn--primary" disabled={busy || !text.trim()}>{t('fo.add', 'Add')}</button>
      {error ? <div className="banner banner--error">{error}</div> : null}
    </form>
  );
}

function AddRecurring({ projectId, onDone }: { projectId: string; onDone: () => Promise<void> }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [rec, setRec] = useState<Exclude<Recurrence, 'none'>>('monthly');
  const [due, setDue] = useState(localToday());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <details className="card">
      <summary className="card__title" style={{ fontSize: '1rem' }}>＋ {t('fo.pd.addPeriodic', 'Add a periodic item')}</summary>
      <div className="stack" style={{ marginTop: 10 }}>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('fo.pd.periodicPlaceholder', 'e.g. Pump inspection') ?? ''} />
        <div className="toolbar">
          <div className="field"><label className="field__label">{t('fo.pd.frequency', 'Frequency')}</label>
            <select className="input" value={rec} onChange={(e) => setRec(e.target.value as Exclude<Recurrence, 'none'>)}>
              {RECURRENCE_OPTIONS.filter((x) => x !== 'none').map((x) => <option key={x} value={x}>{t(recurrenceLabel(x).i18n, recurrenceLabel(x).fallback)}</option>)}
            </select></div>
          <div className="field"><label className="field__label">{t('fo.pd.firstDue', 'First due')}</label>
            <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
        </div>
        <button type="button" className="btn btn--primary" disabled={busy || !text.trim()} onClick={async () => {
          setBusy(true); setError(null);
          try {
            await createRecurring([{ projectId, description: text.trim(), recurrence: rec, nextDueOn: due, photoRequired: false, active: true }]);
            setText(''); await onDone();
          } catch (e) { setError(friendlyError(e, t)); } finally { setBusy(false); }
        }}>{t('fo.add', 'Add')}</button>
        {error ? <div className="banner banner--error">{error}</div> : null}
      </div>
    </details>
  );
}
