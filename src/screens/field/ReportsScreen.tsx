import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { AppShell } from '@/components/AppShell';
import { FieldStatusPill } from '@/components/field/FieldStatusPill';
import { useFieldData } from '@/app/providers/FieldDataContext';
import { useLanguage } from '@/app/providers/LanguageContext';
import { getWorkDays, listLabor, listRecurring, listReports, listTasks, listVisits } from '@/services/data/fieldOps';
import {
  laborLines,
  laborMatrix,
  openWorkReport,
  placeOf,
  projectReport,
  targetOfPlace,
  unallocatedByWorker,
  unallocatedReport,
  workerReport,
  workTypeReport,
} from '@/domain/reports/reports';
import { PlaceSelect } from '@/components/field/PlaceSelect';
import { configText } from '@/lib/configText';
import { exportExcel, type ExportSheet } from '@/services/export/excel';
import { addMonths, eachDay, formatDate, localToday, monthEnd, monthStart, weekday, riyadhDate } from '@/lib/dates';
import { friendlyError } from '@/lib/ruleErrors';
import { useAsync } from '@/lib/useAsync';
import { useNames, useRoles } from './common';
import { ErrorBanner } from '@/components/ErrorBanner';

type Tab = 'workers' | 'projects' | 'worktypes' | 'matrix' | 'lines' | 'unallocated' | 'open' | 'visits';

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * Management & finance reports (§14): filter by period, project and worker
 * (§34); export to Excel for finance.
 */
export function ReportsScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [params, setParams] = useSearchParams();
  const fd = useFieldData();
  const names = useNames();
  const roles = useRoles();
  const today = localToday();

  const tab = (params.get('tab') as Tab) || 'workers';
  const from = params.get('from') || monthStart(today);
  const to = params.get('to') || monthEnd(today);
  // A project id, or `ot:<id>` for an operational target (v2.2).
  const place = params.get('project') || '';
  const isTarget = targetOfPlace(place) !== undefined;
  const employeeId = params.get('worker') || '';
  const workTypeId = params.get('wt') || '';
  const setPeriod = (monthFirstDay: string) => {
    const n = new URLSearchParams(params); n.set('from', monthFirstDay); n.set('to', monthEnd(monthFirstDay)); setParams(n, { replace: true });
  };
  const set = (k: string, v: string) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: true }); };

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const { data, error, loading } = useAsync(async () => {
    const [labor, visits, tasks, recurring, workDays] = await Promise.all([
      listLabor({ from, to }), listVisits({ from, to }), listTasks(), listRecurring(), getWorkDays(),
    ]);
    const reports = await listReports(visits.map((v) => v.id));
    return { labor, visits, tasks, recurring, workDays, reports };
  }, [from, to]);

  const filtered = useMemo(() => {
    if (!data) return null;
    const labor = data.labor.filter((a) => (!place || placeOf(a) === place) && (!employeeId || a.employeeId === employeeId)
      && (!workTypeId || a.workTypeId === workTypeId));
    // Operational targets have no visits or tasks.
    const visits = data.visits.filter((v) => (!place || (!isTarget && v.projectId === place)) && (!workTypeId || v.workTypeId === workTypeId));
    const tasks = data.tasks.filter((x) => !place || (!isTarget && x.projectId === place));
    const recurring = data.recurring.filter((r) => !place || (!isTarget && r.projectId === place));
    const employees = fd.employees.filter((e) => !employeeId || e.id === employeeId);
    const days = eachDay(from, to > today ? today : to);
    const unalloc = unallocatedReport(employees, data.labor, days, data.workDays, weekday, (iso) => riyadhDate(new Date(iso)));
    return {
      labor, visits, tasks, recurring,
      workers: workerReport(labor, from, to),
      projects: projectReport(labor, from, to),
      workTypes: workTypeReport(labor, from, to),
      matrix: laborMatrix(labor, from, to),
      lines: laborLines(labor, from, to),
      unalloc,
      unallocSummary: unallocatedByWorker(unalloc),
      open: openWorkReport(tasks, recurring, today),
    };
  }, [data, place, isTarget, employeeId, workTypeId, from, to, today, fd.employees]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'workers', label: t('fo.rep.workers', 'By worker') },
    { key: 'projects', label: t('fo.rep.projectsTargets', 'By project / target') },
    { key: 'worktypes', label: t('fo.rep.workTypes', 'By work type') },
    { key: 'matrix', label: t('fo.rep.matrix', 'Monthly distribution') },
    { key: 'lines', label: t('fo.rep.lines', 'Labor detail') },
    { key: 'unallocated', label: t('fo.rep.unallocated', 'Not allocated') },
    { key: 'open', label: t('fo.rep.open', 'Open & overdue') },
    { key: 'visits', label: t('fo.rep.visits', 'Visits') },
  ];

  const period = `${formatDate(from, language)} – ${formatDate(to, language)}`;
  const H = {
    worker: t('fo.labor.worker', 'Worker'), project: t('fo.report.project', 'Project / site'), days: t('fo.labor.days', 'Days'),
    place: t('fo.ot.placeLabel', 'Project / operational target'), workType: t('fo.wt.label', 'Work type'), duration: t('fo.rep.duration', 'Full / half'),
    date: t('fo.report.date', 'Visit date'), day: t('fo.rep.day', 'Date'), status: t('fo.rep.status', 'Status'), supervisor: t('fo.report.supervisor', 'Supervisor'),
    client: t('fo.report.client', 'Client'), total: t('fo.total', 'Total'), free: t('fo.rep.freeDays', 'Unallocated days'),
    task: t('fo.rep.task', 'Task'), note: t('fo.rep.note', 'Note'), due: t('fo.pd.nextDue', 'Next due'), report: t('fo.report.number', 'Report no.'),
  };
  const statusText = (s: string) => t(`fo.status.${s}`, s);
  const label = (k: Tab) => tabs.find((x) => x.key === k)!.label;
  const durText = (d: number) => (d === 1 ? t('fo.crew.full', 'Full') : t('fo.crew.half', 'Half'));
  const placeLink = (key: string) => (targetOfPlace(key) !== undefined || !fd.project(key)
    ? <span key="p">{targetOfPlace(key) !== undefined ? '◇ ' : ''}{names.place(key)}</span>
    : <Link key="p" to={`/projects/${key}`}>{names.place(key)}</Link>);

  function sheets(): Record<Tab, ExportSheet> {
    const f = filtered!;
    return {
      workers: {
        name: label('workers'), header: [H.worker, H.place, H.days],
        rows: f.workers.flatMap((w) => w.byProject.map((p) => [names.employee(w.employeeId), names.place(p.projectId), p.days])),
        footer: [[H.total, '', f.workers.reduce((s, w) => s + w.days, 0)]],
      },
      projects: {
        name: label('projects'), header: [H.place, H.client, H.worker, H.days],
        rows: f.projects.flatMap((p) => p.byWorker.map((w) => [names.place(p.projectId), targetOfPlace(p.projectId) !== undefined ? '' : names.client(fd.project(p.projectId)?.clientId), names.employee(w.employeeId), w.days])),
        footer: [[H.total, '', '', f.projects.reduce((s, p) => s + p.days, 0)]],
      },
      worktypes: {
        name: label('worktypes'), header: [H.workType, H.place, H.days],
        rows: f.workTypes.flatMap((w) => w.byPlace.map((p) => [names.workType(w.workTypeId || undefined), names.place(p.placeKey), p.days])),
        footer: [[H.total, '', f.workTypes.reduce((s, w) => s + w.days, 0)]],
      },
      lines: {
        name: label('lines'), header: [H.day, H.worker, H.place, H.workType, H.duration, H.days, H.supervisor],
        rows: f.lines.map((a) => [a.workDate, names.employee(a.employeeId), names.place(placeOf(a)), names.workType(a.workTypeId), durText(a.duration), a.duration, names.person(a.supervisorId)]),
        footer: [[H.total, '', '', '', '', f.lines.reduce((s, a) => s + a.duration, 0), '']],
      },
      matrix: {
        name: label('matrix'), header: [H.worker, ...f.matrix.projectIds.map((id) => names.place(id)), H.total],
        rows: f.matrix.employeeIds.map((e) => [names.employee(e), ...f.matrix.projectIds.map((p) => f.matrix.cells.get(`${e}|${p}`) ?? null), f.matrix.rowTotals.get(e) ?? 0]),
        footer: [[H.total, ...f.matrix.projectIds.map((p) => f.matrix.colTotals.get(p) ?? 0), f.matrix.total]],
      },
      unallocated: {
        name: label('unallocated'), header: [H.day, H.worker, H.free],
        rows: f.unalloc.flatMap((d) => d.items.map((x) => [d.date, names.employee(x.employeeId), x.free])),
        footer: [[H.total, '', f.unallocSummary.reduce((s, x) => s + x.freeDays, 0)]],
      },
      open: {
        name: label('open'), header: [H.project, H.task, H.status, H.note, H.due],
        rows: [
          ...f.open.followUp.map((x) => [names.project(x.projectId), names.taskLabel(x), statusText(x.status), x.note ?? '', '']),
          ...f.open.open.map((x) => [names.project(x.projectId), names.taskLabel(x), statusText(x.status), x.note ?? '', '']),
          ...f.open.overduePeriodic.map((r) => [names.project(r.projectId), names.taskLabel(r), statusText('overdue'), '', r.nextDueOn]),
        ],
      },
      visits: {
        name: label('visits'), header: [H.date, H.project, H.client, H.workType, H.supervisor, H.status, H.report],
        rows: f.visits.map((v) => [v.visitDate, names.project(v.projectId), names.client(fd.project(v.projectId)?.clientId), names.workType(v.workTypeId), names.person(v.supervisorId), statusText(v.status),
          (() => { const no = data!.reports.find((r) => r.visitId === v.id)?.reportNumber; return no ? `#${String(no).padStart(5, '0')}` : ''; })()]),
      },
    };
  }

  async function doExport(all: boolean) {
    if (!filtered) return;
    setExporting(true); setExportError(null);
    try {
      const s = sheets();
      await exportExcel(`ghsoon-najd-${all ? 'reports' : tab}-${from}-${to}`, all ? tabs.map((x) => s[x.key]) : [s[tab]], language);
    } catch (e) {
      setExportError(friendlyError(e, t));
    } finally {
      setExporting(false);
    }
  }

  return (
    <AppShell>
      <AppHeader title={t('fo.rep.title', 'Reports')} />
      <main className="app-main">
        <div className="toolbar">
          <div className="field"><label className="field__label" htmlFor="r-from">{t('audit.from', 'From')}</label>
            <input id="r-from" className="input" type="date" value={from} onChange={(e) => set('from', e.target.value)} /></div>
          <div className="field"><label className="field__label" htmlFor="r-to">{t('audit.to', 'To')}</label>
            <input id="r-to" className="input" type="date" value={to} onChange={(e) => set('to', e.target.value)} /></div>
          <div className="field"><label className="field__label" htmlFor="r-proj">{H.place}</label>
            <PlaceSelect id="r-proj" value={place} onChange={(v) => set('project', v)} allLabel={t('fo.all', 'All')} /></div>
          <div className="field"><label className="field__label" htmlFor="r-wt">{H.workType}</label>
            <select id="r-wt" className="input" value={workTypeId} onChange={(e) => set('wt', e.target.value)}>
              <option value="">{t('fo.all', 'All')}</option>
              {fd.workTypes.map((w) => <option key={w.id} value={w.id}>{configText(w.name, language)}</option>)}
            </select></div>
          <div className="field"><label className="field__label" htmlFor="r-emp">{t('fo.labor.worker', 'Worker')}</label>
            <select id="r-emp" className="input" value={employeeId} onChange={(e) => set('worker', e.target.value)}>
              <option value="">{t('fo.all', 'All')}</option>
              {fd.employees.map((e) => <option key={e.id} value={e.id}>{names.employee(e.id)}</option>)}
            </select></div>
        </div>
        <div className="chips">
          <button type="button" className="chip" onClick={() => setPeriod(monthStart(today))}>{t('fo.rep.thisMonth', 'This month')}</button>
          <button type="button" className="chip" onClick={() => setPeriod(addMonths(today, -1))}>{t('fo.rep.lastMonth', 'Last month')}</button>
        </div>

        <div className="tabs" role="tablist">
          {tabs.map((x) => (
            <button key={x.key} type="button" role="tab" aria-selected={tab === x.key} className={`tabs__item${tab === x.key ? ' tabs__item--active' : ''}`} onClick={() => set('tab', x.key)}>{x.label}</button>
          ))}
        </div>

        <div className="row wrap" style={{ justifyContent: 'space-between', gap: 8 }}>
          <span className="card__meta">{period}</span>
          {roles.can('export') ? (
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn btn--ghost" disabled={!filtered || exporting} onClick={() => void doExport(false)}>⬇ {t('fo.rep.excel', 'Excel')}</button>
              <button type="button" className="btn btn--ghost" disabled={!filtered || exporting} onClick={() => void doExport(true)}>⬇ {t('fo.rep.excelAll', 'All reports')}</button>
            </div>
          ) : null}
        </div>
        <ErrorBanner message={error} />
        <ErrorBanner message={exportError} />
        {loading && !filtered ? <p className="hint">{t('common.loading', 'Loading…')}</p> : null}

        {filtered && tab === 'workers' ? (
          <Table head={[H.worker, H.place, H.days]} numeric={[2]}
            rows={filtered.workers.flatMap((w) => w.byProject.map((p, i) => [i === 0 ? <strong key="n">{names.employee(w.employeeId)} · {fmt(w.days)}</strong> : '', placeLink(p.projectId), fmt(p.days)]))}
            foot={[H.total, '', fmt(filtered.workers.reduce((s, w) => s + w.days, 0))]} empty={t('fo.rep.noLabor', 'No labor recorded in this period.')} />
        ) : null}

        {filtered && tab === 'projects' ? (
          <Table head={[H.place, H.worker, H.days]} numeric={[2]}
            rows={filtered.projects.flatMap((p) => p.byWorker.map((w, i) => [i === 0 ? <strong key="n">{targetOfPlace(p.projectId) !== undefined ? '◇ ' : ''}{names.place(p.projectId)} · {fmt(p.days)}</strong> : '', names.employee(w.employeeId), fmt(w.days)]))}
            foot={[H.total, '', fmt(filtered.projects.reduce((s, p) => s + p.days, 0))]} empty={t('fo.rep.noLabor', 'No labor recorded in this period.')} />
        ) : null}

        {filtered && tab === 'worktypes' ? (
          <Table head={[H.workType, H.place, H.days]} numeric={[2]}
            rows={filtered.workTypes.flatMap((w) => w.byPlace.map((p, i) => [i === 0 ? <strong key="n">{names.workType(w.workTypeId || undefined)} · {fmt(w.days)}</strong> : '', placeLink(p.placeKey), fmt(p.days)]))}
            foot={[H.total, '', fmt(filtered.workTypes.reduce((s, w) => s + w.days, 0))]} empty={t('fo.rep.noLabor', 'No labor recorded in this period.')} />
        ) : null}

        {filtered && tab === 'lines' ? (
          <Table head={[H.day, H.worker, H.place, H.workType, H.duration]}
            rows={filtered.lines.map((a) => [formatDate(a.workDate, language, { day: 'numeric', month: 'short' }), names.employee(a.employeeId), placeLink(placeOf(a)), names.workType(a.workTypeId), durText(a.duration)])}
            foot={[H.total, '', '', '', fmt(filtered.lines.reduce((s, a) => s + a.duration, 0))]} empty={t('fo.rep.noLabor', 'No labor recorded in this period.')} />
        ) : null}

        {filtered && tab === 'matrix' ? (
          <Table head={[H.worker, ...filtered.matrix.projectIds.map((id) => names.place(id)), H.total]}
            numeric={filtered.matrix.projectIds.map((_, i) => i + 1).concat(filtered.matrix.projectIds.length + 1)}
            rows={filtered.matrix.employeeIds.map((e) => [names.employee(e), ...filtered.matrix.projectIds.map((p) => { const v = filtered.matrix.cells.get(`${e}|${p}`); return v ? fmt(v) : ''; }), <strong key="t">{fmt(filtered.matrix.rowTotals.get(e) ?? 0)}</strong>])}
            foot={[H.total, ...filtered.matrix.projectIds.map((p) => fmt(filtered.matrix.colTotals.get(p) ?? 0)), fmt(filtered.matrix.total)]}
            empty={t('fo.rep.noLabor', 'No labor recorded in this period.')} />
        ) : null}

        {filtered && tab === 'unallocated' ? (
          <div className="stack">
            <Table head={[H.worker, H.free]} numeric={[1]}
              rows={filtered.unallocSummary.map((x) => [names.employee(x.employeeId), fmt(x.freeDays)])}
              empty={(() => {
                // A worker added after the period was not working here yet (UAT L-4).
                const w = fd.employee(employeeId || undefined);
                const added = w?.createdAt ? riyadhDate(new Date(w.createdAt)) : '';
                return added && added > to
                  ? t('fo.rep.notYetAdded', '{{name}} was added on {{date}}, after this period.', { name: names.employee(w!.id), date: formatDate(added, language) })
                  : t('fo.home.allAllocated', 'Everyone is allocated.');
              })()} />
            {filtered.unalloc.some((d) => d.items.length) ? <div className="section-title">{t('fo.rep.byDay', 'By day')}</div> : null}
            {filtered.unalloc.filter((d) => d.items.length).map((d) => (
              <div key={d.date} className="card">
                <div className="card__title" style={{ fontSize: '1rem' }}>{formatDate(d.date, language, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                <div className="chips" style={{ marginTop: 6 }}>{d.items.map((x) => <span key={x.employeeId} className="chip">{names.employee(x.employeeId)}{x.free < 1 ? ' · ½' : ''}</span>)}</div>
              </div>
            ))}
          </div>
        ) : null}

        {filtered && tab === 'open' ? (
          <div className="stack">
            <div className="kpis">
              <div className="kpi kpi--warn"><div className="kpi__value">{filtered.open.followUp.length}</div><div className="kpi__label">{t('fo.status.needs_follow_up', 'Follow-up')}</div></div>
              <div className="kpi"><div className="kpi__value">{filtered.open.open.length}</div><div className="kpi__label">{t('fo.status.open', 'Open')}</div></div>
              <div className="kpi kpi--danger"><div className="kpi__value">{filtered.open.overduePeriodic.length}</div><div className="kpi__label">{t('fo.rep.overdue', 'Overdue periodic')}</div></div>
            </div>
            <Table head={[H.project, H.task, H.status, H.note]}
              rows={[
                ...filtered.open.followUp.map((x) => [<Link key="p" to={`/projects/${x.projectId}`}>{names.project(x.projectId)}</Link>, names.taskLabel(x), <FieldStatusPill key="s" status={x.status} />, x.note ?? '']),
                ...filtered.open.open.map((x) => [<Link key="p" to={`/projects/${x.projectId}`}>{names.project(x.projectId)}</Link>, names.taskLabel(x), <FieldStatusPill key="s" status={x.status} />, x.note ?? '']),
                ...filtered.open.overduePeriodic.map((r) => [<Link key="p" to={`/projects/${r.projectId}`}>{names.project(r.projectId)}</Link>, names.taskLabel(r), <FieldStatusPill key="s" status="overdue" />, `${H.due}: ${formatDate(r.nextDueOn, language)}`]),
              ]}
              empty={t('fo.home.noFollowUps', 'Nothing waiting.')} />
          </div>
        ) : null}

        {filtered && tab === 'visits' ? (
          <Table head={[H.date, H.project, H.workType, H.supervisor, H.status, H.report]}
            rows={filtered.visits.map((v) => {
              const rep = data!.reports.find((r) => r.visitId === v.id);
              return [formatDate(v.visitDate, language), <Link key="p" to={`/visits/${v.id}`}>{names.project(v.projectId)}</Link>, names.workType(v.workTypeId), names.person(v.supervisorId), <FieldStatusPill key="s" status={v.status} />,
                rep ? <Link key="r" to={`/visits/${v.id}/report`}>#{String(rep.reportNumber).padStart(5, '0')}</Link> : ''];
            })}
            empty={t('fo.pd.noVisits', 'No visits yet.')} />
        ) : null}
      </main>
    </AppShell>
  );
}

function Table({ head, rows, foot, numeric = [], empty }: {
  head: React.ReactNode[]; rows: React.ReactNode[][]; foot?: React.ReactNode[]; numeric?: number[]; empty: string;
}) {
  const { t } = useTranslation();
  if (rows.length === 0) return <p className="hint">{empty}</p>;
  return (
    <>
    {head.length >= 3 ? <p className="hint scroll-hint">↔ {t('fo.rep.swipe', 'Swipe sideways to see every column.')}</p> : null}
    <div className="table-wrap">
      <table className="data">
        <thead><tr>{head.map((h, i) => <th key={i} className={numeric.includes(i) ? 'num' : undefined}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={numeric.includes(j) ? 'num' : undefined}>{c}</td>)}</tr>)}</tbody>
        {foot ? <tfoot><tr>{foot.map((c, j) => <td key={j} className={numeric.includes(j) ? 'num' : undefined}>{c}</td>)}</tr></tfoot> : null}
      </table>
    </div>
    </>
  );
}
