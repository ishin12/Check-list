import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { AppHeader } from '@/components/AppHeader';
import { getSupabase } from '@/services/supabase/client';
import { createTask } from '@/services/data/tasks';
import { RECURRENCE_OPTIONS, recurrenceLabel, type Recurrence } from '@/domain/job/recurrence';

interface Option { id: string; label: string }
interface TemplateOpt extends Option { /* same shape, kept distinct for readability */ }

export function TaskNewScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [workers, setWorkers] = useState<Option[]>([]);
  const [clients, setClients] = useState<Option[]>([]);
  const [templates, setTemplates] = useState<TemplateOpt[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [workerId, setWorkerId] = useState('');
  const [clientId, setClientId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [when, setWhen] = useState(defaultWhen());
  const [recurrence, setRecurrence] = useState<Recurrence>('none');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const sb = getSupabase();
      const [{ data: ws }, { data: cs }, { data: ts }] = await Promise.all([
        sb.from('profiles').select('id, full_name, email').eq('role', 'worker').eq('active', true),
        sb.from('clients').select('id, name').order('name'),
        sb.from('templates').select('id, title').order('updated_at', { ascending: false }),
      ]);
      setWorkers((ws ?? []).map((w) => ({ id: w.id, label: w.full_name ?? w.email ?? w.id })));
      setClients((cs ?? []).map((c) => ({ id: c.id, label: c.name })));
      setTemplates((ts ?? []).map((tpl) => ({
        id: tpl.id,
        label: (tpl.title?.en ?? tpl.title?.ar ?? 'Untitled') as string,
      })));
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const task = await createTask({
        title, description: description || undefined,
        clientId, assignedWorkerId: workerId,
        scheduledAt: new Date(when).toISOString(),
        recurrence,
        templateId: templateId || undefined,
      });
      navigate(`/tasks/${task.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const ready = title && clientId && workerId && when;

  return (
    <AppShell>
      <AppHeader title={t('taskNew.title', 'New task')} showBack />
      <form className="app-main" onSubmit={onSubmit}>
        {error ? <div className="banner banner--error">{error}</div> : null}
        <div className="field">
          <label className="field__label">{t('taskNew.title', 'Title')}</label>
          <input className="input" required value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label className="field__label">{t('taskNew.description', 'Description')}</label>
          <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="field">
          <label className="field__label">{t('taskNew.client', 'Client')}</label>
          <select className="input" required value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">—</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="field__label">{t('taskNew.worker', 'Assign to')}</label>
          <select className="input" required value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
            <option value="">—</option>
            {workers.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="field__label">{t('taskNew.when', 'Scheduled at')}</label>
          <input className="input" type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} />
        </div>
        <div className="field">
          <label className="field__label">{t('taskNew.template', 'Checklist template')}</label>
          <select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">{t('taskNew.noTemplate', '— none —')}</option>
            {templates.map((tpl) => <option key={tpl.id} value={tpl.id}>{tpl.label}</option>)}
          </select>
          <div className="hint">{t('taskNew.templateHint', 'The worker sees this checklist on the task and ticks items off as they go.')}</div>
        </div>
        <div className="field">
          <label className="field__label">{t('taskNew.repeats', 'Repeats')}</label>
          <select
            className="input"
            value={recurrence}
            onChange={(e) => setRecurrence(e.target.value as Recurrence)}
          >
            {RECURRENCE_OPTIONS.map((opt) => {
              const lbl = recurrenceLabel(opt);
              return <option key={opt} value={opt}>{t(lbl.i18n, lbl.fallback)}</option>;
            })}
          </select>
        </div>
        <button className="btn btn--primary btn--block btn--lg" disabled={!ready || saving} type="submit">
          {saving ? t('common.saving', 'Saving…') : t('taskNew.create', 'Create task')}
        </button>
      </form>
    </AppShell>
  );
}

function defaultWhen(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  // datetime-local wants YYYY-MM-DDTHH:mm (no timezone)
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
