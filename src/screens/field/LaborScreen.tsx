import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { AppShell } from '@/components/AppShell';
import { useFieldData } from '@/app/providers/FieldDataContext';
import { useLanguage } from '@/app/providers/LanguageContext';
import { dayLoads, insertCrew, listLabor, listMonthCloses, updateLabor, voidLabor } from '@/services/data/fieldOps';
import { isMonthClosed } from '@/domain/labor/allocation';
import { targetOfPlace } from '@/domain/reports/reports';
import { PlaceSelect } from '@/components/field/PlaceSelect';
import { configText } from '@/lib/configText';
import type { LaborAllocation, LaborDuration } from '@/domain/models/ops';
import { formatDate, localToday, monthEnd, monthStart } from '@/lib/dates';
import { friendlyError } from '@/lib/ruleErrors';
import { useAsync } from '@/lib/useAsync';
import { useNames, useRoles } from './common';
import { ErrorBanner } from '@/components/ErrorBanner';

/**
 * Labor ledger (§6, §23): the single record of allocations used by finance
 * (§24). Supervisors correct their own rows before month close; after close
 * only finance can change a row, with a reason, and the change is audited
 * (BR-009/010). Rows are voided, never deleted (BR-014).
 */
export function LaborScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [params, setParams] = useSearchParams();
  const fd = useFieldData();
  const names = useNames();
  const { user, isManager, isFinance } = useRoles();
  const today = localToday();

  const from = params.get('from') || monthStart(today);
  const to = params.get('to') || monthEnd(today);
  // "project" holds a project id or `ot:<targetId>` for an operational target (v2.2).
  const place = params.get('project') || '';
  const targetId = targetOfPlace(place);
  const projectId = targetId === undefined ? place : '';
  const employeeId = params.get('worker') || '';
  const workTypeId = params.get('wt') || '';
  const [showVoided, setShowVoided] = useState(false);
  const set = (k: string, v: string) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: true }); };

  const { data, error, reload } = useAsync(async () => {
    const [rows, closes] = await Promise.all([
      listLabor({ from, to, projectId: projectId || undefined, targetId: targetId || undefined, employeeId: employeeId || undefined,
        workTypeId: workTypeId || undefined, includeVoided: true }),
      listMonthCloses(),
    ]);
    return { rows, closes };
  }, [from, to, projectId, targetId, employeeId, workTypeId]);

  const rows = useMemo(() => (data?.rows ?? []).filter((r) => showVoided || !r.voidedAt), [data, showVoided]);
  const total = rows.filter((r) => !r.voidedAt).reduce((s, r) => s + r.duration, 0);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <AppShell>
      <AppHeader title={t('fo.labor.title', 'Labor')} action={isManager || isFinance ? (
        <button type="button" className="btn btn--primary" onClick={() => setAdding((x) => !x)}>＋ {t('fo.add', 'Add')}</button>
      ) : undefined} />
      <main className="app-main">
        <div className="toolbar">
          <div className="field"><label className="field__label" htmlFor="l-from">{t('audit.from', 'From')}</label>
            <input id="l-from" className="input" type="date" value={from} onChange={(e) => set('from', e.target.value)} /></div>
          <div className="field"><label className="field__label" htmlFor="l-to">{t('audit.to', 'To')}</label>
            <input id="l-to" className="input" type="date" value={to} onChange={(e) => set('to', e.target.value)} /></div>
          <div className="field"><label className="field__label" htmlFor="l-proj">{t('fo.ot.placeLabel', 'Project / operational target')}</label>
            <PlaceSelect id="l-proj" value={place} onChange={(v) => set('project', v)} allLabel={t('fo.all', 'All')} /></div>
          <div className="field"><label className="field__label" htmlFor="l-wt">{t('fo.wt.label', 'Work type')}</label>
            <select id="l-wt" className="input" value={workTypeId} onChange={(e) => set('wt', e.target.value)}>
              <option value="">{t('fo.all', 'All')}</option>
              {fd.workTypes.map((w) => <option key={w.id} value={w.id}>{configText(w.name, language)}</option>)}
            </select></div>
          <div className="field"><label className="field__label" htmlFor="l-emp">{t('fo.labor.worker', 'Worker')}</label>
            <select id="l-emp" className="input" value={employeeId} onChange={(e) => set('worker', e.target.value)}>
              <option value="">{t('fo.all', 'All')}</option>
              {fd.employees.map((e) => <option key={e.id} value={e.id}>{names.employee(e.id)}</option>)}
            </select></div>
        </div>
        <label className="checkbox-row"><input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} />{t('fo.labor.showVoided', 'Show voided rows')}</label>

        {adding ? <AddAllocation closes={data?.closes ?? []} onDone={async () => { setAdding(false); await reload(); }} /> : null}
        <ErrorBanner message={error} />

        <div className="card__meta">{t('fo.labor.summary', '{{count}} row(s) · {{days}} day(s)', { count: rows.filter((r) => !r.voidedAt).length, days: total })}</div>
        <div className="stack">
          {rows.map((r) => {
            const closed = isMonthClosed(r.workDate, data?.closes ?? []);
            // Open month: managers, or the supervisor who recorded it while still on the project.
            // Closed month: finance only, with a reason (§29, BR-009/010).
            const own = r.supervisorId === user?.id && (r.projectId ? fd.project(r.projectId)?.supervisorId === user?.id : !!r.operationalTargetId);
            const canEdit = !r.voidedAt && (closed ? isFinance : (isManager || own));
            return (
              <div key={r.id} className="card" style={r.voidedAt ? { opacity: 0.6 } : undefined}>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div className="grow">
                    <div className="card__title" style={{ fontSize: '1rem' }}>{names.employee(r.employeeId)} · {r.duration === 1 ? t('fo.crew.full', 'Full') : t('fo.crew.half', 'Half')}</div>
                    <div className="card__meta">
                      {formatDate(r.workDate, language, { weekday: 'short', day: 'numeric', month: 'short' })}
                      {/* A project reassigned to someone else stays in their own labor history, without dead links (UAT M2). */}
                      {r.operationalTargetId ? <> · <bdi>◇ {names.target(r.operationalTargetId)}</bdi></> : fd.project(r.projectId) ? (
                        <>
                          {' · '}<Link to={`/projects/${r.projectId}`}><bdi>{names.project(r.projectId)}</bdi></Link>
                          {r.visitId ? <> · <Link to={`/visits/${r.visitId}`}>{t('fo.visit.title', 'Visit')}</Link></> : null}
                        </>
                      ) : <> · {t('fo.labor.otherProject', 'A project no longer assigned to you')}</>}
                      {' · '}<bdi>{names.person(r.supervisorId)}</bdi>
                    </div>
                    <div className="card__meta">{t('fo.wt.label', 'Work type')}: {names.workType(r.workTypeId)}</div>
                    {r.notes ? <div className="card__meta">📝 {r.notes}</div> : null}
                    {r.changeReason ? <div className="card__meta">✎ {t('fo.labor.reason', 'Reason')}: {r.changeReason}</div> : null}
                    {r.voidedAt ? <div className="card__meta">⊘ {t('fo.labor.voided', 'Voided')}: {r.voidReason}</div> : null}
                  </div>
                  {closed ? <span className="tag">🔒 {t('fo.labor.closed', 'Month closed')}</span> : null}
                </div>
                {canEdit ? (
                  editing === r.id
                    ? <EditAllocation row={r} closed={closed} onDone={async () => { setEditing(null); await reload(); }} onCancel={() => setEditing(null)} />
                    : <button type="button" className="btn btn--ghost" style={{ marginTop: 8 }} onClick={() => setEditing(r.id)}>{t('common.edit', 'Edit')}</button>
                ) : null}
              </div>
            );
          })}
          {data && rows.length === 0 ? <p className="hint">{t('fo.rep.noLabor', 'No labor recorded in this period.')}</p> : null}
        </div>
      </main>
    </AppShell>
  );
}

function EditAllocation({ row, closed, onDone, onCancel }: { row: LaborAllocation; closed: boolean; onDone: () => Promise<void>; onCancel: () => void }) {
  const { t } = useTranslation();
  const fd = useFieldData();
  const { language } = useLanguage();
  const [duration, setDuration] = useState<LaborDuration>(row.duration);
  const [workTypeId, setWorkTypeId] = useState(row.workTypeId ?? '');
  const [notes, setNotes] = useState(row.notes ?? '');
  const [reason, setReason] = useState('');
  const [voidReason, setVoidReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); await onDone(); } catch (e) { setError(friendlyError(e, t)); } finally { setBusy(false); }
  }

  return (
    <div className="stack" style={{ marginTop: 10, background: 'var(--color-surface-2)', padding: 12, borderRadius: 12 }}>
      {closed ? <div className="banner banner--info">{t('fo.labor.closedHint', 'This month is closed. Your change needs a reason and is recorded in the audit log.')}</div> : null}
      <div className="dur" role="group">
        <button type="button" className={duration === 1 ? 'dur--on' : ''} onClick={() => setDuration(1)}>{t('fo.crew.full', 'Full')}</button>
        <button type="button" className={duration === 0.5 ? 'dur--on' : ''} onClick={() => setDuration(0.5)}>{t('fo.crew.half', 'Half')}</button>
      </div>
      {/* A visit's crew follows the visit's work type; it is changed on the visit (TC-13). */}
      {row.visitId ? null : (
        <div className="field"><label className="field__label" htmlFor={`wt-${row.id}`}>{t('fo.wt.label', 'Work type')}</label>
          <select id={`wt-${row.id}`} className="input" value={workTypeId} onChange={(e) => setWorkTypeId(e.target.value)}>
            {fd.workTypes.filter((w) => w.active || w.id === row.workTypeId).map((w) => <option key={w.id} value={w.id}>{configText(w.name, language)}</option>)}
          </select></div>
      )}
      <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('fo.rep.note', 'Note') ?? ''} />
      {closed ? <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('fo.labor.reasonRequired', 'Reason for the change (required)') ?? ''} /> : null}
      <div className="row wrap" style={{ gap: 8 }}>
        <button type="button" className="btn btn--primary" disabled={busy || (closed && !reason.trim())}
          onClick={() => void act(() => updateLabor(row.id, { duration, notes,
            ...(!row.visitId && workTypeId && workTypeId !== row.workTypeId ? { workTypeId } : {}),
            ...(closed ? { changeReason: reason } : {}) }))}>{t('common.save', 'Save')}</button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>{t('common.cancel', 'Cancel')}</button>
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <input className="input grow" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder={t('fo.labor.voidReason', 'Why void this row?') ?? ''} />
        {/* One reason is enough to void, also in a closed month (UAT L-1). */}
        <button type="button" className="btn btn--danger" disabled={busy || !voidReason.trim()}
          onClick={() => void act(() => voidLabor(row.id, voidReason, closed ? (reason.trim() || voidReason) : undefined))}>{t('fo.labor.void', 'Void')}</button>
      </div>
      <ErrorBanner message={error} />
    </div>
  );
}

/** Manager/finance adds an allocation outside a visit (e.g. a correction). */
function AddAllocation({ closes, onDone }: { closes: { month: string }[]; onDone: () => Promise<void> }) {
  const { t } = useTranslation();
  const names = useNames();
  const fd = useFieldData();
  const { user, isManager } = useRoles();
  const [date, setDate] = useState(localToday());
  const [employeeId, setEmployeeId] = useState('');
  const { language } = useLanguage();
  const [place, setPlace] = useState('');
  const [workTypeId, setWorkTypeId] = useState('');
  const [duration, setDuration] = useState<LaborDuration>(1);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const targetId = targetOfPlace(place);
  const projectId = targetId === undefined ? place : '';
  const project = fd.project(projectId || undefined);
  const closed = isMonthClosed(date, closes);
  const load = useAsync(async () => (employeeId ? (await dayLoads(date, date)).get(`${employeeId}|${date}`) ?? 0 : 0), [employeeId, date]);

  return (
    <div className="card stack">
      <div className="card__title">{t('fo.labor.add', 'Add labor')}</div>
      <div className="toolbar">
        <div className="field"><label className="field__label">{t('fo.rep.day', 'Date')}</label>
          <input className="input" type="date" value={date} max={localToday()} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="field"><label className="field__label">{t('fo.labor.worker', 'Worker')}</label>
          <select className="input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">—</option>
            {fd.employees.filter((e) => e.status === 'active').map((e) => <option key={e.id} value={e.id}>{names.employee(e.id)}</option>)}
          </select></div>
        <div className="field"><label className="field__label" htmlFor="add-place">{t('fo.ot.placeLabel', 'Project / operational target')}</label>
          <PlaceSelect id="add-place" value={place} onChange={setPlace} allLabel="—" openOnly /></div>
        <div className="field"><label className="field__label" htmlFor="add-wt">{t('fo.wt.label', 'Work type')}</label>
          <select id="add-wt" className="input" value={workTypeId} onChange={(e) => setWorkTypeId(e.target.value)}>
            <option value="">—</option>
            {fd.workTypes.filter((w) => w.active).map((w) => <option key={w.id} value={w.id}>{configText(w.name, language)}</option>)}
          </select></div>
      </div>
      <div className="dur" role="group">
        <button type="button" className={duration === 1 ? 'dur--on' : ''} onClick={() => setDuration(1)}>{t('fo.crew.full', 'Full')}</button>
        <button type="button" className={duration === 0.5 ? 'dur--on' : ''} onClick={() => setDuration(0.5)}>{t('fo.crew.half', 'Half')}</button>
      </div>
      {!closed && !isManager ? <div className="banner banner--info">{t('fo.labor.financeOpenMonth', 'Finance can add labor only to closed months. In an open month the supervisor records it on the visit.')}</div> : null}
      {employeeId ? <div className="card__meta">{t('fo.labor.booked', 'Already booked that day: {{days}}', { days: load.data ?? 0 })}</div> : null}
      {closed ? <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('fo.labor.reasonRequired', 'Reason for the change (required)') ?? ''} /> : null}
      <button type="button" className="btn btn--primary" disabled={busy || !employeeId || !place || !workTypeId || (closed && !reason.trim()) || (!closed && !isManager)} onClick={async () => {
        setBusy(true); setError(null);
        try {
          // In a closed month the reason lets the database accept and audit it (BR-010).
          await insertCrew([{ workDate: date, employeeId, duration, workTypeId,
            ...(targetId ? { operationalTargetId: targetId } : { projectId }),
            supervisorId: project?.supervisorId ?? user!.id,
            ...(closed ? { changeReason: reason } : {}) }]);
          await onDone();
        } catch (e) { setError(friendlyError(e, t)); } finally { setBusy(false); }
      }}>{t('common.save', 'Save')}</button>
      <ErrorBanner message={error} />
    </div>
  );
}
