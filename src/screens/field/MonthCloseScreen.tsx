import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { AppShell } from '@/components/AppShell';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useFieldData } from '@/app/providers/FieldDataContext';
import { useLanguage } from '@/app/providers/LanguageContext';
import { closeMonth, getWorkDays, listLabor, listMonthCloses, listVisits } from '@/services/data/fieldOps';
import { placeOf, unallocatedByWorker, unallocatedReport } from '@/domain/reports/reports';
import { addMonths, eachDay, formatDateTimeShort, formatMonth, localToday, monthEnd, monthStart, weekday, formatDate, riyadhDate } from '@/lib/dates';
import { friendlyError } from '@/lib/ruleErrors';
import { useAsync } from '@/lib/useAsync';
import { useNames, useRoles } from './common';
import { ErrorBanner } from '@/components/ErrorBanner';

/**
 * Month close (§20, §23, BR-009): finance reviews the month, then closes it.
 * After close, supervisors cannot change that month's labor; finance can,
 * with a reason that is audited (BR-010). A close cannot be undone. While a
 * visit of the month is in progress the month cannot close (v2.2 §36A).
 */
export function MonthCloseScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const fd = useFieldData();
  const names = useNames();
  const { isFinance } = useRoles();
  const today = localToday();
  const months = Array.from({ length: 6 }, (_, i) => addMonths(today, -i));
  const [selected, setSelected] = useState(addMonths(today, -1));
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const closes = useAsync(listMonthCloses, []);
  const detail = useAsync(async () => {
    const from = monthStart(selected);
    const to = monthEnd(selected);
    const [labor, visits, workDays] = await Promise.all([listLabor({ from, to }), listVisits({ from, to }), getWorkDays()]);
    const days = eachDay(from, to < today ? to : today);
    const unalloc = unallocatedReport(fd.employees, labor, days, workDays, weekday, (iso) => riyadhDate(new Date(iso)));
    return {
      days: labor.reduce((s, a) => s + a.duration, 0),
      rows: labor.length,
      places: new Set(labor.map(placeOf)).size,
      inProgress: visits.filter((v) => v.status === 'in_progress'),
      notStarted: visits.filter((v) => v.status === 'planned'),
      unalloc: unallocatedByWorker(unalloc),
    };
  }, [selected, fd.employees.length]);

  const closedRow = (closes.data ?? []).find((c) => c.month === monthStart(selected));
  const isFuture = monthStart(selected) > monthStart(today);

  async function doClose() {
    setConfirm(false); setError(null); setDone(null);
    try {
      await closeMonth(monthStart(selected));
      setDone(t('fo.close.closed', '{{month}} is closed.', { month: formatMonth(selected, language) }));
      await closes.reload();
    } catch (e) {
      setError(friendlyError(e, t));
      // Show what changed meanwhile (e.g. a visit started elsewhere) — UAT v2.2 F4.
      await Promise.all([closes.reload(), detail.reload()]);
    }
  }

  return (
    <AppShell>
      <AppHeader title={t('tabs.monthClose', 'Month close')} />
      <main className="app-main">
        <div className="chips">
          {months.map((m) => {
            const isClosed = (closes.data ?? []).some((c) => c.month === monthStart(m));
            return (
              <button key={m} type="button" className={`chip${monthStart(selected) === monthStart(m) ? ' chip--active' : ''}`} onClick={() => setSelected(m)}>
                {isClosed ? '🔒 ' : ''}{formatMonth(m, language)}
              </button>
            );
          })}
        </div>

        <ErrorBanner message={closes.error ?? detail.error} />
        <ErrorBanner message={error} />
        {done ? <div className="banner banner--success">{done}</div> : null}

        <div className="card stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="card__title">{formatMonth(selected, language)}</div>
            {closedRow ? <span className="status-pill status-pill--closed">🔒 {t('fo.labor.closed', 'Month closed')}</span> : <span className="status-pill status-pill--open">{t('fo.close.open', 'Open')}</span>}
          </div>
          {closedRow ? (
            <div className="card__meta">{t('fo.close.closedBy', 'Closed by {{name}} on {{when}}', { name: names.person(closedRow.closedBy), when: formatDateTimeShort(closedRow.closedAt, language) })}</div>
          ) : null}
          {detail.data ? (
            <div className="kpis">
              <div className="kpi"><div className="kpi__value">{detail.data.days}</div><div className="kpi__label">{t('fo.pd.laborDays', 'Labor days')}</div></div>
              <div className="kpi"><div className="kpi__value">{detail.data.places}</div><div className="kpi__label">{t('fo.close.places', 'Projects & targets')}</div></div>
              <div className={`kpi${detail.data.unalloc.length ? ' kpi--warn' : ''}`}><div className="kpi__value">{detail.data.unalloc.reduce((s, x) => s + x.freeDays, 0)}</div><div className="kpi__label">{t('fo.rep.freeDays', 'Unallocated days')}</div></div>
              <div className={`kpi${detail.data.inProgress.length ? ' kpi--danger' : ''}`}><div className="kpi__value">{detail.data.inProgress.length}</div><div className="kpi__label">{t('fo.close.inProgressVisits', 'Visits in progress')}</div></div>
            </div>
          ) : <p className="hint">{t('common.loading', 'Loading…')}</p>}

          <div className="section-title">{t('fo.close.steps', 'Before closing')}</div>
          <ol style={{ margin: 0, paddingInlineStart: 20 }} className="stack">
            <li><Link to={`/reports?tab=unallocated&from=${monthStart(selected)}&to=${monthEnd(selected)}`}>{t('fo.close.reviewUnallocated', 'Review workers not allocated')}</Link></li>
            <li><Link to={`/reports?tab=visits&from=${monthStart(selected)}&to=${monthEnd(selected)}`}>{t('fo.close.reviewVisits', 'Check every visit is completed')}</Link></li>
            <li><Link to={`/labor?from=${monthStart(selected)}&to=${monthEnd(selected)}`}>{t('fo.close.reviewLedger', 'Review the labor ledger')}</Link></li>
            <li><Link to={`/reports?tab=lines&from=${monthStart(selected)}&to=${monthEnd(selected)}`}>{t('fo.close.exportV22', 'Export labor days by project / target and work type to Excel')}</Link></li>
          </ol>

          {detail.data?.unalloc.length ? (
            <details>
              <summary className="card__meta">{t('fo.rep.unallocated', 'Not allocated')} ({detail.data.unalloc.length})</summary>
              <div className="chips" style={{ marginTop: 8 }}>
                {detail.data.unalloc.map((x) => <span key={x.employeeId} className="chip">{names.employee(x.employeeId)} · {x.freeDays}</span>)}
              </div>
            </details>
          ) : null}

          {!closedRow && detail.data?.inProgress.length ? (
            // §36A: the month closes only after these are completed (by their supervisor or a manager).
            <div className="banner banner--error" id="open-visits">
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                {t('fo.close.inProgressTitle', '{{count}} visit(s) in this month are still in progress', { count: detail.data.inProgress.length })}
              </div>
              <ul style={{ margin: '0 0 6px', paddingInlineStart: 18 }}>
                {detail.data.inProgress.map((v) => (
                  <li key={v.id}>
                    <Link to={`/visits/${v.id}`}>{fd.project(v.projectId)?.name ?? '—'}</Link>
                    {' · '}{formatDate(v.visitDate, language)} · {names.person(v.supervisorId)}
                  </li>
                ))}
              </ul>
              <div>{t('fo.close.inProgressBody', 'The month cannot be closed until they are completed. Their supervisor or a manager completes them first.')}</div>
            </div>
          ) : null}
          {!closedRow && detail.data?.notStarted.length ? (
            <div className="banner banner--info">
              {t('fo.close.notStarted', '{{count}} planned visit(s) in this month were not started. They have no labor and do not block the close.', { count: detail.data.notStarted.length })}
            </div>
          ) : null}
          {!closedRow && !isFuture && monthEnd(selected) >= today ? (
            <div className="banner banner--info">{t('fo.close.notEnded', 'This month has not ended yet. Days after today have no labor recorded.')}</div>
          ) : null}
          {!closedRow && isFinance ? (
            <button type="button" className="btn btn--primary btn--lg btn--block" disabled={isFuture || !detail.data || detail.data.inProgress.length > 0} onClick={() => setConfirm(true)}>
              🔒 {t('fo.close.closeMonth', 'Close {{month}}', { month: formatMonth(selected, language) })}
            </button>
          ) : null}
          {!isFinance ? <p className="hint">{t('fo.close.financeOnly', 'Only finance can close a month.')}</p> : null}
        </div>
      </main>
      <ConfirmDialog
        open={confirm}
        title={t('fo.close.confirmTitle', 'Close {{month}}?', { month: formatMonth(selected, language) })}
        body={t('fo.close.confirmBody', 'Supervisors will no longer be able to change this month’s labor. Finance can still correct it with a reason, and every change is logged. This cannot be undone.') ?? ''}
        confirmLabel={t('fo.close.confirm', 'Close month') ?? ''}
        onConfirm={() => void doClose()}
        onCancel={() => setConfirm(false)}
      />
    </AppShell>
  );
}
