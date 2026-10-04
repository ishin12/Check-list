import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { AppShell } from '@/components/AppShell';
import { CrewPicker, type CrewSelection } from '@/components/field/CrewPicker';
import { SearchBox, matches } from '@/components/field/SearchBox';
import { WorkTypePicker } from '@/components/field/WorkTypePicker';
import { useFieldData } from '@/app/providers/FieldDataContext';
import { useLanguage } from '@/app/providers/LanguageContext';
import { dayLoads, getVisit, listLabor, listMonthCloses, listTasks, listVisits } from '@/services/data/fieldOps';
import { recordTargetDay, startVisit } from '@/services/data/visitFlow';
import { isMonthClosed, previousCrew } from '@/domain/labor/allocation';
import { configText } from '@/lib/configText';
import { addDays, formatDate, localToday } from '@/lib/dates';
import { friendlyError } from '@/lib/ruleErrors';
import { useAsync } from '@/lib/useAsync';
import { useMyProjects, useNames, useRoles } from './common';
import { ErrorBanner } from '@/components/ErrorBanner';

/**
 * §5 steps 1–3: pick the project, start the visit, pick the work type and the
 * crew — in one screen, target under a minute (§34). Work with no project is
 * booked here too, on an operational target (v2.2 §17, TC-14).
 */
export function StartVisitScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const fd = useFieldData();
  const names = useNames();
  const { user, isManager } = useRoles();
  const myProjects = useMyProjects();
  const plannedId = params.get('visit');

  const [projectId, setProjectId] = useState<string | null>(params.get('project'));
  const [targetId, setTargetId] = useState<string | null>(params.get('target'));
  const [workTypeId, setWorkTypeIdRaw] = useState('');
  // True while the work type is the suggestion from the last visit, not a choice (UAT v2.2 D1).
  const [suggested, setSuggested] = useState(false);
  const setWorkTypeId = (id: string) => { setWorkTypeIdRaw(id); setSuggested(false); };
  const [done, setDone] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [date, setDate] = useState(localToday());
  const [crew, setCrew] = useState<CrewSelection>(new Map());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const planned = useAsync(async () => {
    if (!plannedId) return null;
    const v = await getVisit(plannedId);
    if (v) {
      setProjectId(v.projectId); setDate(v.visitDate > localToday() ? localToday() : v.visitDate);
      if (v.workTypeId) setWorkTypeId(v.workTypeId);
    }
    return v;
  }, [plannedId]);

  const project = fd.project(projectId ?? undefined);

  const ctx = useAsync(async () => {
    if (!projectId) return null;
    const [loads, labor, tasks, visits] = await Promise.all([
      dayLoads(date, date),
      listLabor({ projectId, from: addDays(date, -45), to: date }),
      listTasks({ projectId }),
      listVisits({ projectId }),
    ]);
    const booked = new Map<string, number>();
    for (const [key, total] of loads) booked.set(key.split('|')[0], total);
    // The crew of the most recent day on this project, today included, so it
    // matches the "last visit" shown above (UAT N-5).
    return { booked, previous: previousCrew(projectId, addDays(date, 1), labor), tasks, visits };
  }, [projectId, date]);

  // Suggest the work type of the last visit on this project; the supervisor can change it.
  useEffect(() => {
    if (workTypeId || !ctx.data) return;
    const last = ctx.data.visits.find((v) => v.workTypeId && fd.workType(v.workTypeId)?.active);
    if (last?.workTypeId) { setWorkTypeIdRaw(last.workTypeId); setSuggested(true); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.data, workTypeId, fd]);

  const target = fd.target(targetId ?? undefined);
  // Say at once when the date is in a closed month, not after the crew is picked (UAT v2.2 F2).
  const closes = useAsync(listMonthCloses, []);
  const closedMonth = isMonthClosed(date, closes.data ?? []);
  const closedBanner = closedMonth
    ? <div className="banner banner--error">{t('fo.start.monthClosed', 'This month is closed. Days in it can no longer be recorded here — only finance can correct them, with a reason.')}</div>
    : null;
  // From home's "work without a project": bring the targets into view.
  const showTargets = params.get('show') === 'targets';
  useEffect(() => {
    if (showTargets && !projectId && !targetId && fd.ready) document.getElementById('no-project')?.scrollIntoView({ block: 'start' });
  }, [showTargets, projectId, targetId, fd.ready]);
  const targetLoads = useAsync(async () => {
    if (!targetId) return null;
    const booked = new Map<string, number>();
    for (const [key, total] of await dayLoads(date, date)) booked.set(key.split('|')[0], total);
    return booked;
  }, [targetId, date]);

  async function saveTargetDay() {
    if (!target || !user) return;
    setSaving(true); setError(null); setDone(null);
    try {
      const count = crew.size;
      await recordTargetDay({
        targetId: target.id, workTypeId, supervisorId: user.id, date,
        crew: [...crew].map(([employeeId, duration]) => ({ employeeId, duration })),
      });
      setCrew(new Map());
      setDone(t('fo.start.targetSaved', '{{count}} worker(s) recorded on {{target}}.', { count, target: configText(target.name, language) }));
      await targetLoads.reload();
    } catch (e) {
      setError(friendlyError(e, t));
      if (/BR-001/.test(String((e as Error)?.message ?? e))) { setCrew(new Map()); await targetLoads.reload(); }
    } finally {
      setSaving(false);
    }
  }

  const openCount = (ctx.data?.tasks ?? []).filter((x) => x.status !== 'completed').length;
  const followCount = (ctx.data?.tasks ?? []).filter((x) => x.status === 'needs_follow_up').length;
  const lastVisit = (ctx.data?.visits ?? []).find((v) => v.status === 'completed');
  const openToday = (ctx.data?.visits ?? []).find((v) => v.visitDate === date && v.status === 'in_progress');

  const choices = useMemo(
    () => myProjects.filter((p) => p.status === 'active' && matches(query, p.name, p.code, names.client(p.clientId))),
    [myProjects, query, names],
  );

  async function start() {
    if (!project || !user) return;
    setSaving(true); setError(null);
    try {
      const id = await startVisit({
        project, supervisorId: isManager && planned.data ? planned.data.supervisorId : user.id, date,
        crew: [...crew].map(([employeeId, duration]) => ({ employeeId, duration })),
        workTypeId,
        plannedVisit: planned.data ?? undefined,
      });
      await fd.refresh();
      navigate(`/visits/${id}`, { replace: true });
    } catch (e) {
      setError(friendlyError(e, t));
      // Someone else may have just booked a worker: show the current availability (UAT N-6).
      if (/BR-001/.test(String((e as Error)?.message ?? e))) { setCrew(new Map()); await ctx.reload(); }
    } finally {
      setSaving(false);
    }
  }

  if (!project && target) {
    return (
      <AppShell>
        <AppHeader title={t('fo.start.targetTitle', 'Work without a project')} showBack />
        <main className="app-main">
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="grow">
                <div className="card__title">{configText(target.name, language)}</div>
                <div className="card__meta">{t('fo.start.targetHint', 'Operational target — the days are recorded here, with no project, checklist or client report.')}</div>
              </div>
              <button type="button" className="btn btn--ghost" onClick={() => { setTargetId(null); setCrew(new Map()); setDone(null); setError(null); }}>
                {t('fo.start.change', 'Change')}
              </button>
            </div>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="target-date">{t('fo.rep.day', 'Date')}</label>
            <input id="target-date" className="input" type="date" value={date} max={localToday()} onChange={(e) => { setDate(e.target.value); setCrew(new Map()); setDone(null); }} />
            {date > localToday() ? <div className="hint" style={{ color: 'var(--color-danger)' }}>{t('err.futureDay', 'Days cannot be recorded in advance. Choose today or an earlier date.')}</div> : null}
          </div>
          {closedBanner}
          <WorkTypePicker workTypes={fd.workTypes} value={workTypeId} onChange={setWorkTypeId} />
          <div className="section-title">{t('fo.start.targetCrew', 'Workers')}</div>
          <ErrorBanner message={targetLoads.error} />
          {targetLoads.data ? (
            <CrewPicker employees={fd.employees} booked={targetLoads.data} value={crew} onChange={(c) => { setCrew(c); setDone(null); }} />
          ) : <p className="hint">{t('common.loading', 'Loading…')}</p>}
          {done ? (
            <div className="banner banner--success">
              {done}{' '}<Link to={`/labor?from=${date}&to=${date}`}>{t('fo.pd.laborLedger', 'Labor ledger')}</Link>
            </div>
          ) : null}
          <ErrorBanner message={error} />
        </main>
        <div className="action-bar">
          <button type="button" className="btn btn--primary btn--lg btn--block" disabled={saving || crew.size === 0 || !workTypeId || date > localToday() || closedMonth} onClick={() => void saveTargetDay()}>
            {saving ? t('common.saving', 'Saving…')
              : crew.size === 0 ? t('fo.start.pickWorkers', 'Select the workers')
              : !workTypeId ? t('fo.start.pickWorkType', 'Choose the work type')
              : t('fo.start.saveTarget', 'Record {{count}} worker(s)', { count: crew.size })}
          </button>
        </div>
      </AppShell>
    );
  }

  if (!project) {
    const targetsBlock = (
      <>
        {/* A day with no project goes on an operational target, never on a made-up project (v2.2). */}
        <div className="section-title" id="no-project">{t('fo.start.noProjectTitle', 'Work without a project')}</div>
        <div className="card__meta">{t('fo.start.noProjectHint', 'Warehouse, office, training, leave or absence: record the workers here — no project is created.')}</div>
        <div className="chips">
          {fd.targets.filter((o) => o.active).map((o) => (
            <button key={o.id} type="button" className="chip" onClick={() => { setTargetId(o.id); setCrew(new Map()); setWorkTypeId(''); setDone(null); }}>
              {configText(o.name, language)}
            </button>
          ))}
        </div>
      </>
    );
    return (
      <AppShell>
        <AppHeader title={showTargets ? t('fo.start.targetTitle', 'Work without a project') : t('fo.start.pickProject', 'Choose project')} showBack />
        <main className="app-main">
          {showTargets ? targetsBlock : null}
          {showTargets ? <div className="section-title">{t('fo.start.orProject', 'Or start a visit on a project')}</div> : null}
          <SearchBox value={query} onChange={setQuery} placeholder={t('fo.start.searchProjects', 'Search projects or clients') ?? ''} />
          {choices.length === 0 ? (
            <p className="hint">{query.trim() ? t('fo.projects.none', 'No projects match.') : t('fo.start.noProjects', 'No active projects assigned to you.')}</p>
          ) : null}
          <div className="stack">
            {choices.map((p) => (
              <button key={p.id} type="button" className="card card--tap" onClick={() => { setProjectId(p.id); setWorkTypeId(''); }}>
                <div className="grow">
                  <div className="card__title">{p.name}</div>
                  <div className="card__meta">
                    {[p.code, names.client(p.clientId), configText(fd.type(p.projectTypeId)?.name, language)].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <span aria-hidden>{language === 'en' ? '›' : '‹'}</span>
              </button>
            ))}
          </div>
          {showTargets ? null : targetsBlock}
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <AppHeader title={t('fo.start.title', 'Start visit')} showBack />
      <main className="app-main">
        {project.status !== 'active' ? (
          <div className="banner banner--error">{t('fo.start.notActive', 'Visits can only be started on active projects. This project is {{status}}.', { status: t(`fo.status.${project.status}`, project.status) })}</div>
        ) : null}
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="grow">
              <div className="card__title">{project.name}</div>
              <div className="card__meta">{[project.code, names.client(project.clientId), configText(fd.stage(project.stageId)?.name, language)].filter(Boolean).join(' · ')}</div>
            </div>
            {!plannedId && !params.get('project') ? (
              <button type="button" className="btn btn--ghost" onClick={() => { setProjectId(null); setCrew(new Map()); setWorkTypeId(''); }}>
                {t('fo.start.change', 'Change')}
              </button>
            ) : null}
          </div>
          <div className="card__meta" style={{ marginTop: 8 }}>
            {lastVisit
              ? t('fo.start.lastVisit', 'Last visit {{date}} by {{name}}', { date: formatDate(lastVisit.visitDate, language), name: names.person(lastVisit.supervisorId) })
              : t('fo.start.firstVisit', 'First visit on this project')}
            {' · '}
            {t('fo.start.openItems', '{{count}} open item(s), {{follow}} follow-up', { count: openCount, follow: followCount })}
          </div>
        </div>

        {openToday ? (
          <div className="banner banner--info">
            {t('fo.start.alreadyOpen', 'A visit on this project is already in progress today.')}{' '}
            <button type="button" className="btn btn--ghost" onClick={() => navigate(`/visits/${openToday.id}`)}>{t('fo.start.openIt', 'Open it')}</button>
          </div>
        ) : null}

        <div className="field">
          <label className="field__label" htmlFor="visit-date">{t('fo.start.date', 'Visit date')}</label>
          <input id="visit-date" className="input" type="date" value={date} max={localToday()} onChange={(e) => { setDate(e.target.value); setCrew(new Map()); }} />
          {date > localToday() ? <div className="hint" style={{ color: 'var(--color-danger)' }}>{t('err.futureVisit', 'A visit cannot be started before its date.')}</div> : null}
        </div>
        {closedBanner}

        <WorkTypePicker workTypes={fd.workTypes} value={workTypeId} onChange={setWorkTypeId} />
        {suggested && workTypeId ? (
          <div className="hint" style={{ marginTop: -8 }}>{t('fo.wt.suggested', 'Suggested from the last visit on this project — tap another type if today’s work is different.')}</div>
        ) : null}

        <div className="section-title">{t('fo.start.crew', 'Crew with you today')}</div>
        <ErrorBanner message={ctx.error} />
        {ctx.data ? (
          <CrewPicker
            employees={fd.employees}
            booked={ctx.data.booked}
            value={crew}
            onChange={setCrew}
            previous={ctx.data.previous}
          />
        ) : <p className="hint">{t('common.loading', 'Loading…')}</p>}

        <ErrorBanner message={error} />
      </main>
      <div className="action-bar">
        <button type="button" className="btn btn--primary btn--lg btn--block" disabled={saving || crew.size === 0 || !workTypeId || project.status !== 'active' || date > localToday() || closedMonth} onClick={() => void start()}>
          {saving ? t('common.saving', 'Saving…')
            : crew.size === 0 ? t('fo.start.pickCrew', 'Select the crew to start')
            : !workTypeId ? t('fo.start.pickWorkType', 'Choose the work type')
            : t('fo.start.go', 'Start visit with {{count}} worker(s)', { count: crew.size })}
        </button>
      </div>
    </AppShell>
  );
}
