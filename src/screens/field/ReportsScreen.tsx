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
  laborMatrix,
  openWorkReport,
  projectReport,
  unallocatedByWorker,
  unallocatedReport,
  workerReport,
} from '@/domain/reports/reports';
import { exportExcel, type ExportSheet } from '@/services/export/excel';
import { addMonths, eachDay, formatDate, localToday, monthEnd, monthStart, weekday } from '@/lib/dates';
import { friendlyError } from '@/lib/ruleErrors';
import { useAsync } from '@/lib/useAsync';
import { useNames, useRoles } from './common';

type Tab = 'workers' | 'projects' | 'matrix' | 'unallocated' | 'open' | 'visits';

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
  const projectId = params.get('project') || '';
  const employeeId = params.get('worker') || '';
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
    const labor = data.labor.filter((a) => (!projectId || a.projectId === projectId) && (!employeeId || a.employeeId === employeeId));
    const visits = data.visits.filter((v) => !projectId || v.projectId === projectId);
    const tasks = data.tasks.filter((x) => !projectId || x.projectId === projectId);
    const recurring = data.recurring.filter((r) => !projectId || r.projectId === projectId);
    const employees = fd.employees.filter((e) => !employeeId || e.id === employeeId);
    const days = eachDay(from, to > today ? today : to);
    const unalloc = unallocatedReport(employees, data.labor, days, data.workDays, weekday);
    return {
      labor, visits, tasks, recurring,
      workers: workerReport(labor, from, to),
      projects: projectReport(labor, from, to),
      matrix: laborMatrix(labor, from, to),
      unalloc,
      unallocSummary: unallocatedByWorker(unalloc),
      open: openWorkReport(tasks, recurring, today),
    };
  }, [data, projectId, employeeId, from, to, today, fd.employees]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'workers', label: t('fo.rep.workers', 'By worker') },
    { key: 'projects', label: t('fo.rep.projects', 'By project') },
    { key: 'matrix', label: t('fo.rep.matrix', 'Monthly distribution') },
    { key: 'unallocated', label: t('fo.rep.unallocated', 'Not allocated') },
    { key: 'open', label: t('fo.rep.open', 'Open & overdue') },
    { key: 'visits', label: t('fo.rep.visits', 'Visits done') },
  ];

  const period = `${formatDate(from, language)} – ${formatDate(to, language)}`;
  const H = {
    worker: t('fo.labor.worker', 'Worker'), project: t('fo.report.project', 'Project / site'), days: t('fo.labor.days', 'Days'),
    date: t('fo.report.date', 'Visit date'), status: t('fo.rep.status', 'Status'), supervisor: t('fo.report.supervisor', 'Supervisor'),
    client: t('fo.report.client', 'Client'), total: t('fo.total', 'Total'), free: t('fo.rep.freeDays', 'Unallocated days'),
    task: t('fo.rep.task', 'Task'), note: t('fo.rep.note', 'Note'), due: t('fo.pd.nextDue', 'Next due'), report: t('fo.report.number', 'Report no.'),
  };
  const statusText = (s: string) => t(`fo.status.${s}`, s);

  function sheets(): Record<Tab, ExportSheet> {
    const f = filtered!;
    return {
      workers: {
        name: tabs[0].label, header: [H.worker, H.project, H.days],
        rows: f.workers.flatMap((w) => w.byProject.map((p) => [names.employee(w.employeeId), names.project(p.projectId), p.days])),
        footer: [[H.total, '', f.workers.reduce((s, w) => s + w.days, 0)]],
      },
      projects: {
        name: tabs[1].label, header: [H.project, H.client, H.worker, H.days],
        rows: f.projects.flatMap((p) => p.byWorker.map((w) => [names.project(p.projectId), names.client(fd.project(p.projectId)?.clientId), names.employee(w.employeeId), w.days])),
        footer: [[H.total, '', '', f.projects.reduce((s, p) => s + p.days, 0)]],
      },
      matrix: {
        name: tabs[2].label, header: [H.worker, ...f.matrix.projectIds.map((id) => names.project(id)), H.total],
        rows: f.matrix.employeeIds.map((e) => [names.employee(e), ...f.matrix.projectIds.map((p) => f.matrix.cells.get(`${e}|${p}`) ?? null), f.matrix.rowTotals.get(e) ?? 0]),
        footer: [[H.total, ...f.matrix.projectIds.map((p) => f.matrix.colTotals.get(p) ?? 0), f.matrix.total]],
      },
      unallocated: {
        name: tabs[3].label, header: [H.date, H.worker, H.free],
        rows: f.unalloc.flatMap((d) => d.items.map((x) => [d.date, names.employee(x.employeeId), x.free])),
        footer: [[H.total, '', f.unallocSummary.reduce((s, x) => s + x.freeDays, 0)]],
      },
      open: {
        name: tabs[4].label, header: [H.project, H.task, H.status, H.note, H.due],
        rows: [
          ...f.open.followUp.map((x) => [names.project(x.projectId), names.taskLabel(x), statusText(x.status), x.note ?? '', '']),
          ...f.open.open.map((x) => [names.project(x.projectId), names.taskLabel(x), statusText(x.status), x.note ?? '', '']),
          ...f.open.overduePeriodic.map((r) => [names.project(r.projectId), r.description, statusText('overdue'), '', r.nextDueOn]),
        ],
      },
      visits: {
        name: tabs[5].label, header: [H.date, H.project, H.client, H.supervisor, H.status, H.report],
        rows: f.visits.map((v) => [v.visitDate, names.project(v.projectId), names.client(fd.project(v.projectId)?.clientId), names.person(v.supervisorId), statusText(v.status),
          data!.reports.find((r) => r.visitId === v.id)?.reportNumber ?? '']),
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
          <div className="field"><label className="field__label" htmlFor="r-proj">{t('fo.report.project', 'Project / site')}</label>
            <select id="r-proj" className="input" value={projectId} onChange={(e) => set('project', e.target.value)}>
              <option value="">{t('fo.all', 'All')}</option>
              {[...fd.projects].sort((a, b) => a.name.localeCompare(b.name)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></div>
          <div className="field"><label className="field__label" htmlFor="r-emp">{t('fo.labor.worker', 'Worker')}</label>
            <select id="r-emp" className="input" value={employeeId} onChange={(e) => set('worker', e.target.value)}>
              <option value="">{t('fo.all', 'All')}</option>
              {fd.employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
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
        {error ? <div className="banner banner--error">{error}</div> : null}
        {exportError ? <div className="banner banner--error">{exportError}</div> : null}
        {loading && !filtered ? <p className="hint">{t('common.loading', 'Loading…')}</p> : null}

        {filtered && tab === 'workers' ? (
          <Table head={[H.worker, H.project, H.days]} numeric={[2]}
            rows={filtered.workers.flatMap((w) => w.byProject.map((p, i) => [i === 0 ? <strong key="n">{names.employee(w.employeeId)} · {fmt(w.days)}</strong> : '', <Link key="p" to={`/projects/${p.projectId}`}>{names.project(p.projectId)}</Link>, fmt(p.days)]))}
            foot={[H.total, '', fmt(filtered.workers.reduce((s, w) => s + w.days, 0))]} empty={t('fo.rep.noLabor', 'No labor recorded in this period.')} />
        ) : null}

        {filtered && tab === 'projects' ? (
          <Table head={[H.project, H.worker, H.days]} numeric={[2]}
            rows={filtered.projects.flatMap((p) => p.byWorker.map((w, i) => [i === 0 ? <strong key="n">{names.project(p.projectId)} · {fmt(p.days)}</strong> : '', names.employee(w.employeeId), fmt(w.days)]))}
            foot={[H.total, '', fmt(filtered.projects.reduce((s, p) => s + p.days, 0))]} empty={t('fo.rep.noLabor', 'No labor recorded in this period.')} />
        ) : null}

        {filtered && tab === 'matrix' ? (
          <Table head={[H.worker, ...filtered.matrix.projectIds.map((id) => names.project(id)), H.total]}
            numeric={filtered.matrix.projectIds.map((_, i) => i + 1).concat(filtered.matrix.projectIds.length + 1)}
            rows={filtered.matrix.employeeIds.map((e) => [names.employee(e), ...filtered.matrix.projectIds.map((p) => { const v = filtered.matrix.cells.get(`${e}|${p}`); return v ? fmt(v) : ''; }), <strong key="t">{fmt(filtered.matrix.rowTotals.get(e) ?? 0)}</strong>])}
            foot={[H.total, ...filtered.matrix.projectIds.map((p) => fmt(filtered.matrix.colTotals.get(p) ?? 0)), fmt(filtered.matrix.total)]}
            empty={t('fo.rep.noLabor', 'No labor recorded in this period.')} />
        ) : null}

        {filtered && tab === 'unallocated' ? (
          <div className="stack">
            <Table head={[H.worker, H.free]} numeric={[1]}
              rows={filtered.unallocSummary.map((x) => [names.employee(x.employeeId), fmt(x.freeDays)])}
              empty={t('fo.home.allAllocated', 'Everyone is allocated.')} />
            <div className="section-title">{t('fo.rep.byDay', 'By day')}</div>
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
                ...filtered.open.overduePeriodic.map((r) => [<Link key="p" to={`/projects/${r.projectId}`}>{names.project(r.projectId)}</Link>, r.description, <FieldStatusPill key="s" status="overdue" />, `${H.due}: ${formatDate(r.nextDueOn, language)}`]),
              ]}
              empty={t('fo.home.noFollowUps', 'Nothing waiting.')} />
          </div>
        ) : null}

        {filtered && tab === 'visits' ? (
          <Table head={[H.date, H.project, H.supervisor, H.status, H.report]}
            rows={filtered.visits.map((v) => {
              const rep = data!.reports.find((r) => r.visitId === v.id);
              return [formatDate(v.visitDate, language), <Link key="p" to={`/visits/${v.id}`}>{names.project(v.projectId)}</Link>, names.person(v.supervisorId), <FieldStatusPill key="s" status={v.status} />,
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
  if (rows.length === 0) return <p className="hint">{empty}</p>;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead><tr>{head.map((h, i) => <th key={i} className={numeric.includes(i) ? 'num' : undefined}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={numeric.includes(j) ? 'num' : undefined}>{c}</td>)}</tr>)}</tbody>
        {foot ? <tfoot><tr>{foot.map((c, j) => <td key={j} className={numeric.includes(j) ? 'num' : undefined}>{c}</td>)}</tr></tfoot> : null}
      </table>
    </div>
  );
}
