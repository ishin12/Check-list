import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { AppShell } from '@/components/AppShell';
import { CrewPicker, type CrewSelection } from '@/components/field/CrewPicker';
import { SearchBox, matches } from '@/components/field/SearchBox';
import { useFieldData } from '@/app/providers/FieldDataContext';
import { useLanguage } from '@/app/providers/LanguageContext';
import { dayLoads, getVisit, listLabor, listTasks, listVisits } from '@/services/data/fieldOps';
import { startVisit } from '@/services/data/visitFlow';
import { previousCrew } from '@/domain/labor/allocation';
import { configText } from '@/lib/configText';
import { addDays, formatDate, localToday } from '@/lib/dates';
import { friendlyError } from '@/lib/ruleErrors';
import { useAsync } from '@/lib/useAsync';
import { useMyProjects, useNames, useRoles } from './common';
import { ErrorBanner } from '@/components/ErrorBanner';

/**
 * §5 steps 1–3: pick the project, start the visit, pick the crew — in one
 * screen, target under a minute (§34).
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
  const [query, setQuery] = useState('');
  const [date, setDate] = useState(localToday());
  const [crew, setCrew] = useState<CrewSelection>(new Map());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const planned = useAsync(async () => {
    if (!plannedId) return null;
    const v = await getVisit(plannedId);
    if (v) { setProjectId(v.projectId); setDate(v.visitDate > localToday() ? localToday() : v.visitDate); }
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

  if (!project) {
    return (
      <AppShell>
        <AppHeader title={t('fo.start.pickProject', 'Choose project')} showBack />
        <main className="app-main">
          <SearchBox value={query} onChange={setQuery} placeholder={t('fo.start.searchProjects', 'Search projects or clients') ?? ''} />
          {choices.length === 0 ? <p className="hint">{t('fo.start.noProjects', 'No active projects assigned to you.')}</p> : null}
          <div className="stack">
            {choices.map((p) => (
              <button key={p.id} type="button" className="card card--tap" onClick={() => setProjectId(p.id)}>
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
              <button type="button" className="btn btn--ghost" onClick={() => { setProjectId(null); setCrew(new Map()); }}>
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
        <button type="button" className="btn btn--primary btn--lg btn--block" disabled={saving || crew.size === 0 || project.status !== 'active' || date > localToday()} onClick={() => void start()}>
          {saving ? t('common.saving', 'Saving…') : crew.size === 0 ? t('fo.start.pickCrew', 'Select the crew to start') : t('fo.start.go', 'Start visit with {{count}} worker(s)', { count: crew.size })}
        </button>
      </div>
    </AppShell>
  );
}
