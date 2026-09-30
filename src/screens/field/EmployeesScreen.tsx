import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppHeader } from '@/components/AppHeader';
import { AppShell } from '@/components/AppShell';
import { FieldStatusPill } from '@/components/field/FieldStatusPill';
import { SearchBox, matches } from '@/components/field/SearchBox';
import { useFieldData } from '@/app/providers/FieldDataContext';
import { listLabor, saveEmployee } from '@/services/data/fieldOps';
import { localToday } from '@/lib/dates';
import { useNames } from './common';
import type { Employee } from '@/domain/models/ops';
import { friendlyError } from '@/lib/ruleErrors';
import { useRoles } from './common';
import { ErrorBanner } from '@/components/ErrorBanner';

/**
 * Crew list (§15 Employees). Workers are never deleted; deactivating hides
 * them from future crew pickers while their history stays (§31).
 */
export function EmployeesScreen() {
  const { t } = useTranslation();
  const fd = useFieldData();
  const { isManager } = useRoles();
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Partial<Employee> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState<{ e: Employee; projects: string[] } | null>(null);
  const names = useNames();
  const norm = (s?: string) => (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  // Two workers with the same name must be told apart by employee no. (UAT D-33).
  const duplicate = !!editing?.fullName?.trim()
    && fd.employees.some((x) => x.id !== editing.id && norm(x.fullName) === norm(editing.fullName));
  const needsCode = duplicate && !editing?.code?.trim();
  // Employee numbers are unique (UAT M1; also enforced by the database, 0008).
  const codeTaken = !!editing?.code?.trim()
    && fd.employees.some((x) => x.id !== editing.id && norm(x.code) === norm(editing.code));

  const list = fd.employees
    .filter((e) => showInactive || e.status === 'active')
    .filter((e) => matches(query, e.fullName, e.code, e.phone));

  async function save() {
    if (!editing?.fullName?.trim()) return;
    setBusy(true); setError(null);
    try {
      await saveEmployee({
        id: editing.id, fullName: editing.fullName, code: editing.code, phone: editing.phone,
        notes: editing.notes, status: editing.status ?? 'active',
      });
      setEditing(null);
      await fd.refresh();
    } catch (e) {
      setError(friendlyError(e, t));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(e: Employee, confirmed = false) {
    setError(null);
    try {
      // Warn before taking someone off who is on a crew today (UAT D-36).
      if (e.status === 'active' && !confirmed) {
        const today = localToday();
        const rows = await listLabor({ employeeId: e.id, from: today, to: today });
        if (rows.length) { setConfirmOff({ e, projects: rows.map((r) => names.project(r.projectId)) }); return; }
      }
      setConfirmOff(null);
      await saveEmployee({ ...e, status: e.status === 'active' ? 'inactive' : 'active' });
      await fd.refresh();
    } catch (err) {
      setError(friendlyError(err, t));
    }
  }

  return (
    <AppShell>
      <AppHeader title={t('fo.emp.title', 'Workers')} showBack action={isManager ? (
        <button type="button" className="btn btn--primary" onClick={() => setEditing({ status: 'active' })}>＋ {t('fo.add', 'Add')}</button>
      ) : undefined} />
      <main className="app-main">
        <p className="hint">{t('fo.emp.hint', 'Crew members recorded on visits. They do not need an app login. Supervisors are not counted as labor.')}</p>
        {editing ? (
          <div className="card stack">
            <div className="card__title">{editing.id ? t('fo.emp.edit', 'Edit worker') : t('fo.emp.new', 'New worker')}</div>
            <div className="field"><label className="field__label" htmlFor="e-name">{t('fo.emp.name', 'Full name')} *</label>
              <input id="e-name" className="input" value={editing.fullName ?? ''} onChange={(e) => setEditing({ ...editing, fullName: e.target.value })} /></div>
            <div className="toolbar">
              <div className="field"><label className="field__label" htmlFor="e-code">{t('fo.emp.code', 'Employee no.')}</label>
                <input id="e-code" className="input" value={editing.code ?? ''} onChange={(e) => setEditing({ ...editing, code: e.target.value })} /></div>
              <div className="field"><label className="field__label" htmlFor="e-phone">{t('fo.emp.phone', 'Phone')}</label>
                <input id="e-phone" className="input" type="tel" value={editing.phone ?? ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></div>
            </div>
            <div className="field"><label className="field__label" htmlFor="e-notes">{t('fo.projects.notes', 'Notes (optional)')}</label>
              <input id="e-notes" className="input" value={editing.notes ?? ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></div>
            {codeTaken ? <div className="banner banner--error">{t('fo.emp.codeTaken', 'This employee no. already belongs to another worker.')}</div> : null}
            {duplicate ? (
              <div className="banner banner--warn">{t('fo.emp.duplicate', 'Another worker already has this name. Enter an employee no. so the two can be told apart.')}</div>
            ) : null}
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn btn--primary" disabled={busy || !editing.fullName?.trim() || needsCode || codeTaken} onClick={() => void save()}>{t('common.save', 'Save')}</button>
              <button type="button" className="btn btn--ghost" onClick={() => setEditing(null)}>{t('common.cancel', 'Cancel')}</button>
            </div>
          </div>
        ) : null}
        <ErrorBanner message={error} />
        {confirmOff ? (
          <div className="banner banner--warn stack">
            <div>{t('fo.emp.onCrewToday', '{{name}} is on today\'s crew ({{projects}}). Deactivating keeps today\'s record; they will not be offered for new visits.', { name: confirmOff.e.fullName, projects: confirmOff.projects.join(', ') })}</div>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn btn--danger" onClick={() => void toggle(confirmOff.e, true)}>{t('users.deactivate', 'Deactivate')}</button>
              <button type="button" className="btn btn--ghost" onClick={() => setConfirmOff(null)}>{t('common.cancel', 'Cancel')}</button>
            </div>
          </div>
        ) : null}
        <SearchBox value={query} onChange={setQuery} placeholder={t('fo.crew.search', 'Search workers') ?? ''} />
        <label className="checkbox-row"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />{t('fo.emp.showInactive', 'Show inactive')}</label>
        <div className="card__meta">{t('fo.emp.count', '{{count}} worker(s)', { count: list.length })}</div>
        <div className="stack">
          {list.map((e) => (
            <div key={e.id} className="card">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="grow">
                  <div className="card__title">{e.fullName}</div>
                  <div className="card__meta">{[e.code, e.phone, e.notes].filter(Boolean).join(' · ') || '—'}</div>
                </div>
                {e.status === 'inactive' ? <FieldStatusPill status="inactive" /> : null}
              </div>
              {isManager ? (
                <div className="row" style={{ gap: 8, marginTop: 8 }}>
                  <button type="button" className="btn btn--ghost" onClick={() => setEditing(e)}>{t('common.edit', 'Edit')}</button>
                  <button type="button" className="btn btn--ghost" onClick={() => void toggle(e)}>
                    {e.status === 'active' ? t('users.deactivate', 'Deactivate') : t('users.activate', 'Activate')}
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </main>
    </AppShell>
  );
}
