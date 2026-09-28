import { useTranslation } from 'react-i18next';
import { features } from '@/config/features';
import { Link } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { AppShell } from '@/components/AppShell';
import { FieldStatusPill } from '@/components/field/FieldStatusPill';
import { useFieldData } from '@/app/providers/FieldDataContext';
import { useLanguage } from '@/app/providers/LanguageContext';
import { dayLoads, getWorkDays, listRecurring, listTasks, listVisits } from '@/services/data/fieldOps';
import { dueRecurringItems, isOverdue } from '@/domain/fieldops/fieldOps';
import { addDays, formatDate, localToday, weekday } from '@/lib/dates';
import { useAsync } from '@/lib/useAsync';
import { useMyProjects, useNames, useRoles } from './common';

/**
 * Supervisor home (§4): only what is needed today — today's visits, open and
 * follow-up work, "+ Start visit", and workers not yet allocated today.
 */
export function FieldHomeScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const fd = useFieldData();
  const { user, isManager } = useRoles();
  const names = useNames();
  const projects = useMyProjects();
  const projectIds = projects.map((p) => p.id);
  const today = localToday();

  const { data, error, loading } = useAsync(async () => {
    if (!fd.ready) return null;
    const [visits, tasks, recurring, loads, workDays] = await Promise.all([
      listVisits({ projectIds, from: addDays(today, -60), to: addDays(today, 14) }),
      listTasks({ projectIds }),
      listRecurring({ projectIds }),
      dayLoads(today, today),
      getWorkDays(),
    ]);
    return { visits, tasks, recurring, loads, workDays };
  }, [fd.ready, projectIds.join(','), today]);

  const visitsToday = (data?.visits ?? []).filter((v) => v.visitDate === today);
  const unclosed = (data?.visits ?? []).filter((v) => v.status === 'in_progress' && v.visitDate < today);
  const upcoming = (data?.visits ?? []).filter((v) => v.status === 'planned' && v.visitDate > today).slice(-5).reverse();
  const followUps = (data?.tasks ?? []).filter((x) => x.status === 'needs_follow_up');
  const openManual = (data?.tasks ?? []).filter((x) => x.status === 'open' && x.source === 'manual');
  const due = projects.flatMap((p) => dueRecurringItems(p.id, today, data?.recurring ?? []));
  const isWorkDay = (data?.workDays ?? []).includes(weekday(today));
  const unallocated = fd.employees
    .filter((e) => e.status === 'active')
    .map((e) => ({ e, free: 1 - (data?.loads.get(`${e.id}|${today}`) ?? 0) }))
    .filter((x) => x.free > 0);

  return (
    <AppShell>
      <AppHeader title={t('fo.home.title', 'Today')} />
      <main className="app-main">
        {error || fd.error ? <div className="banner banner--error">{error ?? fd.error}</div> : null}

        <div className="hero hero--brand">
          <div className="hero__title">{t('today.greeting', 'Hi {{name}}', { name: user?.fullName ?? user?.email ?? '' })}</div>
          <div className="hero__desc">{formatDate(today, language, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        </div>

        <Link to="/visits/start" className="btn btn--primary btn--lg btn--block">＋ {t('fo.home.startVisit', 'Start visit')}</Link>

        <div className="kpis">
          <a href="#today" className="kpi"><div className="kpi__value">{visitsToday.length}</div><div className="kpi__label">{t('fo.home.visitsToday', 'Visits today')}</div></a>
          <a href="#follow" className={`kpi${followUps.length ? ' kpi--warn' : ''}`}><div className="kpi__value">{followUps.length + openManual.length}</div><div className="kpi__label">{t('fo.home.openItems', 'Open / follow-up')}</div></a>
          <a href="#due" className={`kpi${due.some((d) => isOverdue(d, today)) ? ' kpi--danger' : ''}`}><div className="kpi__value">{due.length}</div><div className="kpi__label">{t('fo.home.dueItems', 'Periodic due')}</div></a>
          <a href="#crew" className="kpi"><div className="kpi__value">{isWorkDay ? unallocated.length : '—'}</div><div className="kpi__label">{t('fo.home.unallocated', 'Not allocated today')}</div></a>
        </div>

        {loading && !data ? <p className="hint">{t('common.loading', 'Loading…')}</p> : null}

        {unclosed.length ? (
          <section className="stack">
            <div className="banner banner--error">{t('fo.home.unclosedHint', 'These visits were never completed. Finish them so their follow-ups and report are recorded.')}</div>
            {unclosed.map((v) => (
              <Link key={v.id} to={`/visits/${v.id}`} className="card card--tap">
                <div className="grow">
                  <div className="card__title">{names.project(v.projectId)}</div>
                  <div className="card__meta">{formatDate(v.visitDate, language)} · {names.person(v.supervisorId)}</div>
                </div>
                <FieldStatusPill status={v.status} />
              </Link>
            ))}
          </section>
        ) : null}

        <section id="today" className="stack">
          <div className="section-title">{t('fo.home.todaysVisits', "Today's visits")}</div>
          {visitsToday.length === 0 ? <p className="hint">{t('fo.home.noVisits', 'No visits yet today. Tap “Start visit” when you arrive on site.')}</p> : null}
          {visitsToday.map((v) => (
            <Link key={v.id} to={v.status === 'planned' ? `/visits/start?visit=${v.id}` : `/visits/${v.id}`} className="card card--tap">
              <div className="grow">
                <div className="card__title">{names.project(v.projectId)}</div>
                <div className="card__meta">{names.client(fd.project(v.projectId)?.clientId)}{isManager ? ` · ${names.person(v.supervisorId)}` : ''}</div>
              </div>
              <FieldStatusPill status={v.status} />
            </Link>
          ))}
          {upcoming.length ? (
            <details>
              <summary className="card__meta">{t('fo.home.upcoming', 'Planned visits ahead')} ({upcoming.length})</summary>
              <div className="stack" style={{ marginTop: 8 }}>
                {upcoming.map((v) => (
                  <Link key={v.id} to={`/projects/${v.projectId}`} className="card card--tap">
                    <div className="grow"><div className="card__title">{names.project(v.projectId)}</div>
                      <div className="card__meta">{formatDate(v.visitDate, language)}</div></div>
                  </Link>
                ))}
              </div>
            </details>
          ) : null}
        </section>

        <section id="follow" className="stack">
          <div className="section-title">{t('fo.home.followUps', 'Open and follow-up work')}</div>
          {followUps.length + openManual.length === 0 ? <p className="hint">{t('fo.home.noFollowUps', 'Nothing waiting.')}</p> : null}
          {[...followUps, ...openManual].slice(0, 12).map((x) => (
            <Link key={x.id} to={`/projects/${x.projectId}`} className="card card--tap">
              <div className="grow">
                <div className="card__title">{names.taskLabel(x)}</div>
                <div className="card__meta">{names.project(x.projectId)}{x.note ? ` · ${x.note}` : ''}</div>
              </div>
              <FieldStatusPill status={x.status} />
            </Link>
          ))}
        </section>

        {due.length ? (
          <section id="due" className="stack">
            <div className="section-title">{t('fo.home.due', 'Periodic maintenance due')}</div>
            {due.map((r) => (
              <Link key={r.id} to={`/projects/${r.projectId}`} className="card card--tap">
                <div className="grow">
                  <div className="card__title">{r.description}</div>
                  <div className="card__meta">{names.project(r.projectId)} · {t('fo.home.dueOn', 'due')} {formatDate(r.nextDueOn, language)}</div>
                </div>
                {isOverdue(r, today) ? <FieldStatusPill status="overdue" /> : null}
              </Link>
            ))}
          </section>
        ) : null}

        <section id="crew" className="stack">
          <div className="section-title">{t('fo.home.unallocatedTitle', 'Workers not allocated today')}</div>
          {!isWorkDay ? <p className="hint">{t('fo.home.dayOff', 'Today is not a working day.')}</p>
            : unallocated.length === 0 ? <p className="hint">{t('fo.home.allAllocated', 'Everyone is allocated.')}</p> : (
              <div className="chips">
                {unallocated.map(({ e, free }) => (
                  <span key={e.id} className="chip">{e.fullName}{free < 1 ? ` · ½` : ''}</span>
                ))}
              </div>
            )}
        </section>

        {features.legacyTasks && (user?.role === 'worker' || isManager) ? (
          <Link to="/today" className="card__meta" style={{ textAlign: 'center' }}>{t('fo.home.legacy', 'Open the older task list')}</Link>
        ) : null}
      </main>
    </AppShell>
  );
}
