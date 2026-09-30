import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAsync } from '@/lib/useAsync';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { AppShell } from '@/components/AppShell';
import { useDirectory } from '@/app/providers/DirectoryContext';
import { useFieldData } from '@/app/providers/FieldDataContext';
import { useLanguage } from '@/app/providers/LanguageContext';
import { createProject, createRecurring, listRecurring, updateProject, listVisits } from '@/services/data/fieldOps';
import { recurringItemsFromTemplates } from '@/domain/fieldops/visitPlan';
import { isSupervisorRole } from '@/domain/auth/permissions';
import { configText } from '@/lib/configText';
import { localToday } from '@/lib/dates';
import { friendlyError } from '@/lib/ruleErrors';
import { ErrorBanner } from '@/components/ErrorBanner';

/**
 * Create / edit a project (§3, §10). Required: name, type (status defaults to
 * active) — §28. On create, the periodic items of the type's checklists start
 * being tracked (§8), first due today.
 */
export function ProjectEditScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const fd = useFieldData();
  const { workers, clients } = useDirectory();
  const existing = fd.project(id);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [clientId, setClientId] = useState(params.get('client') ?? '');
  const [typeId, setTypeId] = useState('');
  const [stageId, setStageId] = useState('');
  const [supervisorId, setSupervisorId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!existing) return;
    setName(existing.name); setCode(existing.code ?? ''); setClientId(existing.clientId);
    setTypeId(existing.projectTypeId); setStageId(existing.stageId ?? ''); setSupervisorId(existing.supervisorId ?? '');
    setNotes(existing.notes ?? '');
  }, [existing]);

  const type = fd.type(typeId);
  const currentStageOrder = fd.stage(existing?.stageId)?.sortOrder ?? 0;
  const stages = useMemo(() => fd.stages.filter((s) => s.projectTypeId === typeId && s.active).sort((a, b) => a.sortOrder - b.sortOrder), [fd.stages, typeId]);
  const supervisors = [...workers.values()].filter((w) => w.active && (isSupervisorRole(w.role) || w.role === 'manager'))
    .sort((a, b) => (a.fullName ?? '').localeCompare(b.fullName ?? ''));
  const clientList = [...clients.values()].sort((a, b) => a.name.localeCompare(b.name));

  // A staged project always has a current stage (UAT D-30).
  const stageMissing = !!type?.usesStages && !stageId;
  // Reassigning while the current supervisor has a visit open (UAT D-17).
  const openVisits = useAsync(async () => (existing ? listVisits({ projectId: existing.id, status: 'in_progress' }) : []), [existing?.id]);
  const reassigning = !!existing && (existing.supervisorId ?? '') !== supervisorId;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !typeId || !clientId || stageMissing) return;
    setSaving(true); setError(null);
    const input = { name, code, clientId, projectTypeId: typeId, stageId: type?.usesStages ? stageId : '', supervisorId, notes };
    try {
      if (existing) {
        await updateProject(existing.id, input);
        await syncRecurring({ ...existing, projectTypeId: typeId, stageId: input.stageId || undefined });
        await fd.refresh();
        navigate(`/projects/${existing.id}`, { replace: true });
      } else {
        const p = await createProject(input);
        await syncRecurring(p);
        await fd.refresh();
        navigate(`/projects/${p.id}`, { replace: true });
      }
    } catch (err) {
      setError(friendlyError(err, t));
    } finally {
      setSaving(false);
    }
  }

  async function syncRecurring(p: { id: string; projectTypeId: string; stageId?: string }) {
    const current = await listRecurring({ projectId: p.id });
    const items = recurringItemsFromTemplates(p, fd.templates, current, localToday(), () => crypto.randomUUID());
    await createRecurring(items);
  }

  return (
    <AppShell>
      <AppHeader title={existing ? t('fo.projects.edit', 'Edit project') : t('fo.projects.newTitle', 'New project')} showBack />
      <form className="app-main" onSubmit={save}>
        <div className="field">
          <label className="field__label" htmlFor="p-name">{t('fo.projects.name', 'Project / site name')} *</label>
          <input id="p-name" className="input" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="p-code">{t('fo.projects.code', 'Code (optional)')}</label>
          <input id="p-code" className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder={`${(type?.code ?? 'mnt').slice(0, 3).toUpperCase()}-012`} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="p-client">{t('fo.projects.client', 'Client')} *</label>
          <select id="p-client" className="input" required value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">—</option>
            {clientList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Link to="/clients/new" className="card__meta">＋ {t('fo.projects.newClient', 'Add a client')}</Link>
        </div>
        <div className="field">
          <span className="field__label">{t('fo.projects.type', 'Project type')} *</span>
          <div className="chips">
            {fd.types.filter((x) => x.active || x.id === typeId).map((ty) => (
              <button key={ty.id} type="button" className={`chip${typeId === ty.id ? ' chip--active' : ''}`} onClick={() => { setTypeId(ty.id); setStageId(''); }}>
                {configText(ty.name, language)}
              </button>
            ))}
          </div>
        </div>
        {type?.usesStages ? (
          <div className="field">
            <label className="field__label" htmlFor="p-stage">{t('fo.projects.stage', 'Current stage')}</label>
            <select id="p-stage" className="input" value={stageId} onChange={(e) => setStageId(e.target.value)}>
              <option value="">—</option>
              {stages.map((s, i) => (
                // An existing project moves forward only from its page, once the
                // stage checklist is done (§9); here it can only be set back.
                <option key={s.id} value={s.id} disabled={!!existing?.stageId && existing.projectTypeId === typeId && s.sortOrder > currentStageOrder}>
                  {i + 1}. {configText(s.name, language)}
                </option>
              ))}
            </select>
            {stageMissing ? <div className="hint" style={{ color: 'var(--color-danger)' }}>{t('fo.projects.stageRequired', 'Choose the stage this project is at.')}</div> : null}
            {existing?.stageId ? <div className="hint">{t('fo.stage.editHint', 'To move forward, use "Move to next stage" on the project page once the stage checklist is done.')}</div> : null}
          </div>
        ) : null}
        <div className="field">
          <label className="field__label" htmlFor="p-sup">{t('fo.projects.supervisor', 'Supervisor')}</label>
          <select id="p-sup" className="input" value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)}>
            <option value="">{t('fo.projects.unassigned', 'Unassigned')}</option>
            {supervisors.map((w) => <option key={w.id} value={w.id}>{w.fullName ?? w.email}</option>)}
          </select>
          {existing && existing.supervisorId && existing.supervisorId !== supervisorId ? (
            <div className="card__meta">{t('fo.projects.handover', 'The new supervisor sees the full history and open work.')}</div>
          ) : null}
          {reassigning && openVisits.data?.length ? (
            <div className="banner banner--warn">
              {t('fo.projects.reassignOpenVisit', '{{count}} visit(s) of this project are in progress. After saving, the new supervisor (or you, as manager) finishes them, and the current supervisor no longer sees this project.', { count: openVisits.data.length })}
            </div>
          ) : null}
        </div>
        <div className="field">
          <label className="field__label" htmlFor="p-notes">{t('fo.projects.notes', 'Notes (optional)')}</label>
          <textarea id="p-notes" className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <ErrorBanner message={error} />
        <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={saving || !name.trim() || !typeId || !clientId || stageMissing}>
          {saving ? t('common.saving', 'Saving…') : t('common.save', 'Save')}
        </button>
      </form>
    </AppShell>
  );
}
