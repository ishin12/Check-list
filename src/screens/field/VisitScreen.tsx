import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { AppShell } from '@/components/AppShell';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CrewPicker, type CrewSelection } from '@/components/field/CrewPicker';
import { FieldStatusPill } from '@/components/field/FieldStatusPill';
import { TaskItemCard } from '@/components/field/TaskItemCard';
import { useFieldData } from '@/app/providers/FieldDataContext';
import { useLanguage } from '@/app/providers/LanguageContext';
import {
  dayLoads,
  getProject,
  getVisit,
  insertCrew,
  listLabor,
  listMonthCloses,
  listPhotos,
  listTasks,
  updateLabor,
  updateVisit,
  voidLabor,
} from '@/services/data/fieldOps';
import { completeVisit, optionalVisitItems, syncVisitTasks } from '@/services/data/visitFlow';
import { isMonthClosed } from '@/domain/labor/allocation';
import { answeredOnVisit, canCompleteVisit, tasksForVisit, visitCompletionCheck } from '@/domain/fieldops/fieldOps';
import type { LaborAllocation, ProjectTask } from '@/domain/models/ops';
import { configText } from '@/lib/configText';
import { formatDate } from '@/lib/dates';
import { friendlyError } from '@/lib/ruleErrors';
import { useAsync } from '@/lib/useAsync';
import { useNames, useRoles } from './common';
import { ErrorBanner } from '@/components/ErrorBanner';

const SOURCE_ORDER: Record<ProjectTask['source'], number> = { manual: 0, recurring: 1, stage: 2, checklist: 3 };

/** Existing work brought into the visit (not raised by it). Fixed for the whole visit. */
function carriedIn(t: ProjectTask, visitId: string): boolean {
  return !t.pending && t.visitId !== visitId;
}

/** §5 steps 4–7: what is required, execute, follow-up, complete. */
export function VisitScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { id } = useParams();
  const navigate = useNavigate();
  const fd = useFieldData();
  const names = useNames();
  const { user, isManager, isFinance } = useRoles();

  const { data, error, reload } = useAsync(async () => {
    const visit = id ? await getVisit(id) : null;
    if (!visit) return null;
    const [tasks, photos, crew, project, closes] = await Promise.all([
      listTasks({ projectId: visit.projectId }),
      listPhotos({ projectId: visit.projectId }),
      listLabor({ visitId: visit.id }),
      getProject(visit.projectId),
      listMonthCloses(),
    ]);
    const optional = visit.status === 'in_progress' && project
      ? await optionalVisitItems(project, visit.id, visit.visitDate) : [];
    return { visit, tasks, photos, crew, optional, monthClosed: isMonthClosed(visit.visitDate, closes) };
  }, [id]);

  const [editCrew, setEditCrew] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  useEffect(() => { if (data?.visit) setNotes(data.visit.notes ?? ''); }, [data?.visit]);
  useEffect(() => {
    if (data?.visit.status === 'planned') navigate(`/visits/start?visit=${data.visit.id}`, { replace: true });
  }, [data?.visit, navigate]);

  const visit = data?.visit;
  const project = fd.project(visit?.projectId);
  const editable = !!visit && visit.status === 'in_progress' && (isManager || project?.supervisorId === user?.id || visit.supervisorId === user?.id);

  const visitTasks = useMemo(() => {
    if (!visit || !data) return [];
    const list = visit.status === 'completed'
      ? data.tasks.filter((x) => answeredOnVisit(x, visit.id))
      : [...tasksForVisit(visit.projectId, visit.id, data.tasks), ...data.optional];
    return [...list].sort((a, b) =>
      (a.pending ? 1 : 0) - (b.pending ? 1 : 0)   // unused optional items last
      // Work carried in from earlier visits first. This does not depend on the
      // answer given now, so cards stay in place while they are answered.
      || (carriedIn(b, visit.id) ? 1 : 0) - (carriedIn(a, visit.id) ? 1 : 0)
      || SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source]
      || (a.createdAt < b.createdAt ? -1 : 1));
  }, [visit, data]);

  const photoTaskIds = useMemo(
    () => new Set((data?.photos ?? []).filter((p) => p.visitId === visit?.id).map((p) => p.taskId)),
    [data?.photos, visit?.id],
  );
  const check = visit ? visitCompletionCheck(visit.id, visitTasks, photoTaskIds, data?.crew.length ?? 0) : null;
  const requiredTotal = visitTasks.filter((x) => x.required).length;
  const requiredDone = requiredTotal - (check?.undecided.length ?? 0);

  async function run(action: () => Promise<unknown>) {
    setBusy(true); setActionError(null);
    try { await action(); await reload(); } catch (e) { setActionError(friendlyError(e, t)); } finally { setBusy(false); }
  }

  async function complete() {
    if (!visit || !project) return;
    setConfirm(false);
    setBusy(true); setActionError(null);
    try {
      if (notes !== (visit.notes ?? '')) await updateVisit(visit.id, { notes });
      await completeVisit({ ...visit, notes }, {
        projectName: project.name, projectCode: project.code, clientName: names.client(project.clientId),
        supervisorName: names.person(visit.supervisorId), employeeName: names.employee, taskLabel: names.taskLabel,
      });
      navigate(`/visits/${visit.id}/report`, { replace: true });
    } catch (e) {
      setActionError(friendlyError(e, t));
    } finally {
      setBusy(false);
    }
  }

  if (!visit || !data) {
    return (
      <AppShell>
        <AppHeader title={t('fo.visit.title', 'Visit')} showBack />
        <main className="app-main">{error ? <div className="banner banner--error">{error}</div> : <p className="hint">{t('common.loading', 'Loading…')}</p>}</main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <AppHeader title={project?.name ?? t('fo.visit.title', 'Visit')} showBack />
      <main className="app-main">
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="grow">
              <div className="card__title">{formatDate(visit.visitDate, language, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
              <div className="card__meta">
                {[names.client(project?.clientId), names.person(visit.supervisorId), visit.status === 'in_progress' ? configText(fd.stage(project?.stageId)?.name, language) : ''].filter(Boolean).join(' · ')}
              </div>
            </div>
            <FieldStatusPill status={visit.status} />
          </div>
          <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
            <Link className="btn btn--ghost" to={`/projects/${visit.projectId}`}>{t('fo.visit.history', 'Project history')}</Link>
            {visit.status === 'completed' ? <Link className="btn btn--primary" to={`/visits/${visit.id}/report`}>{t('fo.visit.report', 'Visit report')}</Link> : null}
          </div>
        </div>

        {/* Crew (§6) */}
        <section className="stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="section-title">{t('fo.visit.crew', 'Crew')} · {data.crew.reduce((s, a) => s + a.duration, 0)} {t('fo.days', 'day(s)')}</span>
            {editable && !data.monthClosed ? <button type="button" className="btn btn--ghost" onClick={() => setEditCrew((x) => !x)}>{editCrew ? t('common.done', 'Done') : t('fo.visit.editCrew', 'Edit crew')}</button> : null}
          </div>
          {data.crew.length === 0 ? <div className="banner banner--info">{t('fo.visit.noCrew', 'No crew recorded yet.')}</div> : null}
          {editable && data.monthClosed ? (
            <div className="banner banner--info">
              {isFinance
                ? <>{t('fo.visit.monthClosedCrewFinance', 'This month is closed. Correct its labor in the labor ledger, with a reason.')} <Link to={`/labor?from=${visit.visitDate}&to=${visit.visitDate}`}>{t('fo.pd.laborLedger', 'Labor ledger')}</Link></>
                : t('fo.visit.monthClosedCrew', 'This month is closed: the crew can no longer be changed here. Ask finance for a correction.')}
            </div>
          ) : null}
          {editCrew ? (
            <CrewEditor visitId={visit.id} projectId={visit.projectId} workDate={visit.visitDate}
              supervisorId={isManager ? visit.supervisorId : user!.id} crew={data.crew} onChanged={reload} />
          ) : (
            <div className="chips">
              {[...data.crew].sort((a, b) => names.employee(a.employeeId).localeCompare(names.employee(b.employeeId))).map((a) => <span key={a.id} className="chip">{names.employee(a.employeeId)} · {a.duration === 1 ? t('fo.crew.full', 'Full') : t('fo.crew.half', 'Half')}</span>)}
            </div>
          )}
        </section>

        {/* Tasks (§5 step 4–6, §7) */}
        <section className="stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="section-title">{t('fo.visit.tasks', 'Required work')} · {requiredDone}/{requiredTotal}</span>
            {editable && project ? (
              <button type="button" className="btn btn--ghost" disabled={busy}
                onClick={() => void run(() => syncVisitTasks(project, visit.id, visit.visitDate))}>
                ⟳ {t('fo.visit.refresh', 'Refresh checklist')}
              </button>
            ) : null}
          </div>
          {requiredTotal ? (
            <div className="progress"><div className="progress__track"><div className="progress__fill" style={{ width: `${(requiredDone / requiredTotal) * 100}%` }} /></div></div>
          ) : null}
          {visitTasks.length === 0 ? <p className="hint">{t('fo.visit.noTasks', 'No tasks for this visit. The manager can add tasks or a checklist for this project.')}</p> : null}
          {visitTasks.map((x) => (
            <TaskItemCard
              key={x.id}
              task={x}
              label={names.taskLabel(x)}
              photos={data.photos.filter((p) => p.taskId === x.id)}
              visitId={visit.id}
              visitStatus={visit.status}
              editable={editable}
              onChanged={() => void reload()}
            />
          ))}
        </section>

        {editable ? (
          <div className="field">
            <label className="field__label" htmlFor="visit-notes">{t('fo.visit.notes', 'Visit notes (optional)')}</label>
            <textarea id="visit-notes" className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)}
              onBlur={() => { if (notes !== (visit.notes ?? '')) void run(() => updateVisit(visit.id, { notes })); }} />
          </div>
        ) : visit.notes ? <div className="card"><div className="card__meta">{visit.notes}</div></div> : null}

        {editable && check && !canCompleteVisit(check) ? (
          <div className="banner banner--warn" id="complete-blockers">
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{t('fo.visit.toComplete', 'Before completing:')}</div>
            <ul style={{ margin: 0, paddingInlineStart: 18 }}>
              {check.noCrew ? <li>{t('fo.visit.needCrew', 'Add the crew.')}</li> : null}
              {check.undecided.length ? (
                <li>
                  {t('fo.visit.needAnswers', 'Answer {{count}} required item(s): done, not done or follow-up.', { count: check.undecided.length })}
                  {' '}<strong>{check.undecided.map((id) => names.taskLabel(visitTasks.find((x) => x.id === id)!)).join(language === 'en' ? ', ' : '، ')}</strong>
                </li>
              ) : null}
              {check.missingPhotos.length ? (
                <li>
                  {t('fo.visit.needPhotos', 'Add a photo to {{count}} completed item(s) that require one.', { count: check.missingPhotos.length })}
                  {' '}<strong>{check.missingPhotos.map((id) => names.taskLabel(visitTasks.find((x) => x.id === id)!)).join(language === 'en' ? ', ' : '، ')}</strong>
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}
        <ErrorBanner message={actionError} />
      </main>

      {editable ? (
        <div className="action-bar">
          {/* Stays tappable: when something is missing it shows what (UAT D-21). */}
          <button type="button" className={`btn btn--lg btn--block ${check && canCompleteVisit(check) ? 'btn--success' : 'btn--ghost'}`} disabled={busy || !check}
            onClick={() => {
              if (check && canCompleteVisit(check)) setConfirm(true);
              else document.getElementById('complete-blockers')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}>
            {busy ? t('common.saving', 'Saving…') : `✓ ${t('fo.visit.complete', 'Complete visit')}`}
          </button>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirm}
        title={t('fo.visit.confirmTitle', 'Complete this visit?')}
        body={t('fo.visit.confirmBody', 'The report is generated from what you recorded. Follow-up and not-done items stay open for the next visit.') ?? ''}
        confirmLabel={t('fo.visit.complete', 'Complete visit') ?? ''}
        onConfirm={() => void complete()}
        onCancel={() => setConfirm(false)}
      />
    </AppShell>
  );
}

/** Add workers, change full/half, or remove (void) a worker from the visit. */
function CrewEditor({ visitId, projectId, workDate, supervisorId, crew, onChanged }: {
  visitId: string; projectId: string; workDate: string; supervisorId: string; crew: LaborAllocation[]; onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const fd = useFieldData();
  const names = useNames();
  const [adding, setAdding] = useState<CrewSelection>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loads = useAsync(async () => {
    const m = await dayLoads(workDate, workDate);
    const booked = new Map<string, number>();
    for (const [k, v] of m) booked.set(k.split('|')[0], v);
    return booked;
  }, [workDate, crew.length]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); await onChanged(); await loads.reload(); } catch (e) { setError(friendlyError(e, t)); } finally { setBusy(false); }
  }

  return (
    <div className="card stack">
      {[...crew].sort((a, b) => names.employee(a.employeeId).localeCompare(names.employee(b.employeeId))).map((a) => (
        <div key={a.id} className="crew-row crew-row--on">
          <span className="crew-row__name">{names.employee(a.employeeId)}</span>
          <div className="dur">
            <button type="button" className={a.duration === 1 ? 'dur--on' : ''} disabled={busy}
              onClick={() => a.duration !== 1 && void act(() => updateLabor(a.id, { duration: 1 }))}>{t('fo.crew.full', 'Full')}</button>
            <button type="button" className={a.duration === 0.5 ? 'dur--on' : ''} disabled={busy}
              onClick={() => a.duration !== 0.5 && void act(() => updateLabor(a.id, { duration: 0.5 }))}>{t('fo.crew.half', 'Half')}</button>
          </div>
          <button type="button" className="icon-btn" aria-label={t('fo.crew.remove', 'Remove') ?? ''} disabled={busy}
            onClick={() => void act(() => voidLabor(a.id, t('fo.crew.removedReason', 'Removed from visit')))}>✕</button>
        </div>
      ))}
      <div className="section-title">{t('fo.crew.add', 'Add workers')}</div>
      {loads.data ? (
        <CrewPicker employees={fd.employees} booked={loads.data} value={adding} onChange={setAdding}
          onVisit={new Set(crew.map((a) => a.employeeId))} />
      ) : null}
      {adding.size ? (
        <button type="button" className="btn btn--primary btn--block" disabled={busy}
          onClick={() => void act(async () => {
            await insertCrew([...adding].map(([employeeId, duration]) => ({ workDate, employeeId, projectId, visitId, duration, supervisorId })));
            setAdding(new Map());
          })}>
          {t('fo.crew.addSelected', 'Add {{count}} worker(s)', { count: adding.size })}
        </button>
      ) : null}
      <ErrorBanner message={error} />
    </div>
  );
}
