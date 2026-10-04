import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '@/components/AppShell';
import { AppHeader } from '@/components/AppHeader';
import { getSupabase } from '@/services/supabase/client';
import { addDays, formatDate, formatDateTime, formatMonth, localToday, weekdayName } from '@/lib/dates';
import { features } from '@/config/features';
import { useLanguage } from '@/app/providers/LanguageContext';
import { useFieldData } from '@/app/providers/FieldDataContext';
import { configText } from '@/lib/configText';
import { useNames } from '@/screens/field/common';

interface Row {
  id: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  payload: Record<string, unknown>;
  at: string;
  actor?: { full_name: string | null; email: string | null }[] | null;
}

const LEGACY_ENTITIES = ['task', 'client_note', 'task_proofs', 'client'];
const ENTITY_OPTIONS = ['all', 'labor_allocations', 'month_closes', 'projects', 'visits', 'project_tasks', 'employees', 'templates', 'profiles', 'project_types', 'project_stages', 'work_types', 'operational_targets', 'app_settings',
  ...(features.legacyTasks ? LEGACY_ENTITIES : [])];

export function AuditScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const fd = useFieldData();
  const names = useNames();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [entity, setEntity] = useState<string>('all');
  // Days are Riyadh days (UAT I05).
  const [from, setFrom] = useState<string>(() => addDays(localToday(), -14));
  const [to, setTo] = useState<string>(() => localToday());
  const [actor, setActor] = useState<string>('');

  async function load() {
    try {
      let q = getSupabase()
        .from('audit_log')
        .select('id, actor_id, action, entity, entity_id, payload, at, actor:profiles!audit_log_actor_id_fkey(full_name, email)')
        .order('at', { ascending: false })
        .limit(500);
      if (entity !== 'all') q = q.eq('entity', entity);
      if (from) q = q.gte('at', new Date(from + 'T00:00:00+03:00').toISOString());
      if (to) q = q.lte('at', new Date(to + 'T23:59:59+03:00').toISOString());
      if (actor) q = q.eq('actor_id', actor);
      const { data, error } = await q;
      if (error) throw error;
      // The older task system's entries are hidden with it (UAT D-34).
      setRows(((data ?? []) as Row[]).filter((r) => features.legacyTasks || !LEGACY_ENTITIES.includes(r.entity)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [entity, from, to, actor]);

  const actors = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) {
      if (!r.actor_id) continue;
      const name = r.actor?.[0]?.full_name ?? r.actor?.[0]?.email ?? r.actor_id;
      seen.set(r.actor_id, name);
    }
    return Array.from(seen.entries());
  }, [rows]);

  /** "Labor day changed", "Task created"… instead of table.operation. */
  function actionLabel(r: Row): string {
    const [table, op] = r.action.includes('.') ? r.action.split('.') : [r.entity, r.action];
    const verb = t(`audit.op.${op}`, op);
    return `${t(`audit.entityName.${table}`, table)} · ${verb}`;
  }

  const day = (d?: string) => (d ? formatDate(d, language) : undefined);

  /** Key values of a record that was created (old is empty, so there is no diff). */
  function created(r: Row): [string, string][] {
    const row = (r.payload?.old ? null : r.payload?.new) as Record<string, unknown> | null;
    if (!row) return [];
    return (CREATED_FIELDS[r.entity] ?? []).filter((k) => row[k] !== null && row[k] !== undefined && row[k] !== '')
      .map((k) => [k, typeof row[k] === 'object' ? JSON.stringify(row[k]) : String(row[k])]);
  }

  /** The record the change is about, by name. */
  function recordName(r: Row): string {
    const row = ((r.payload?.new ?? r.payload?.old) ?? {}) as Record<string, unknown>;
    const s = (v: unknown) => (typeof v === 'string' ? v : undefined);
    switch (r.entity) {
      case 'projects': return s(row.name) ?? '';
      case 'employees': return [s(row.full_name), s(row.code)].filter(Boolean).join(' · ');
      case 'project_tasks': return [names.taskLabel({ templateId: s(row.template_id), templateItemId: s(row.template_item_id), description: s(row.description) ?? '' } as never), names.project(s(row.project_id))].filter(Boolean).join(' · ');
      case 'visits': return [names.project(s(row.project_id)), day(s(row.visit_date))].filter(Boolean).join(' · ');
      case 'labor_allocations': return [names.employee(s(row.employee_id)), day(s(row.work_date)),
        row.operational_target_id ? names.target(s(row.operational_target_id)) : names.project(s(row.project_id))].filter(Boolean).join(' · ');
      case 'month_closes': return s(row.month) ? formatMonth(s(row.month)!, language) : '';
      case 'app_settings': return t('fo.config.workDays', 'Working days');
      case 'templates': return configText(row.title as never, language) || '';
      case 'profiles': return s(row.full_name) ?? s(row.email) ?? '';
      case 'project_types':
      case 'project_stages':
      case 'work_types':
      case 'operational_targets': return configText(row.name as never, language) || s(row.code) || '';
      default: return '';
    }
  }

  /** A field value in words: statuses, days, yes/no and names instead of ids. */
  function value(field: string, v: string): string {
    if (v === '—') return v;
    if (field === 'status') return t(`fo.status.${v}`, v);
    if (field === 'role') return t(`demo.role.${v}`, v);
    if (field === 'work_days') { try { return (JSON.parse(v) as number[]).map((d) => weekdayName(d, language)).join('، '); } catch { return v; } }
    if (field === 'name') { try { return configText(JSON.parse(v), language) || v; } catch { return v; } }
    if (field === 'title') { try { return configText(JSON.parse(v), language) || v; } catch { return v; } }
    if (field === 'tasks') { try { return t('templates.tasksCount', { count: (JSON.parse(v) as unknown[]).length }); } catch { return v; } }
    if (field === 'duration') return v === '1' ? t('fo.crew.full', 'Full') : v === '0.5' ? t('fo.crew.half', 'Half') : v;
    if (v === 'true') return t('common.yes', 'Yes');
    if (v === 'false') return t('common.no', 'No');
    if (field === 'employee_id') return names.employee(v);
    if (field === 'project_id') return names.project(v);
    if (field === 'supervisor_id' || field === 'voided_by') return names.person(v);
    if (field === 'stage_id') return configText(fd.stage(v)?.name, language) || v;
    if (field === 'work_type_id') return names.workType(v);
    if (field === 'operational_target_id') return names.target(v);
    if (field.endsWith('_at') && /^\d{4}-\d{2}-\d{2}T/.test(v)) return formatDateTime(v, language);
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return formatDate(v, language);
    return v;
  }

  return (
    <AppShell>
      <AppHeader title={t('audit.title', 'Audit log')} showBack />
      <main className="app-main">
        {error ? <div className="banner banner--error">{error}</div> : null}

        <section className="card stack">
          <div className="section-title">{t('audit.filters', 'Filters')}</div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <div className="field" style={{ minWidth: 140, flex: 1 }}>
              <label className="field__label">{t('audit.entity', 'Type')}</label>
              <select className="input" value={entity} onChange={(e) => setEntity(e.target.value)}>
                {ENTITY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt === 'all' ? t('audit.allTypes', 'All') : t(`audit.entityName.${opt}`, opt)}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ minWidth: 140, flex: 1 }}>
              <label className="field__label">{t('audit.actor', 'Who')}</label>
              <select className="input" value={actor} onChange={(e) => setActor(e.target.value)}>
                <option value="">{t('audit.anyone', 'Anyone')}</option>
                {actors.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ minWidth: 140, flex: 1 }}>
              <label className="field__label">{t('audit.from', 'From')}</label>
              <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="field" style={{ minWidth: 140, flex: 1 }}>
              <label className="field__label">{t('audit.to', 'To')}</label>
              <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        </section>

        <p className="hint">{t('audit.riyadhNote', 'Times are Riyadh time.')}</p>
        {rows.length === 0 ? (
          <div className="empty"><div className="empty__icon">◷</div><p>{t('audit.empty', 'Nothing logged yet.')}</p></div>
        ) : (
          <div className="stack">
            {rows.map((r) => (
              <div key={r.id} className="card">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="card__title">{actionLabel(r)}</span>
                  <span className="card__meta">{formatDateTime(r.at, language)}</span>
                </div>
                <div className="card__meta">
                  {r.actor?.[0]?.full_name ?? r.actor?.[0]?.email ?? (r.actor_id ? r.actor_id : t('audit.system', 'System'))}
                  {recordName(r) ? ` · ${recordName(r)}` : ''}
                </div>
                {changes(r.payload).length ? (
                  <ul className="card__meta" style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>
                    {changes(r.payload).filter(([, from, to]) => value('x', from) !== value('x', to)).map(([k, from, to]) => (
                      // <bdi> keeps English values and the arrow in order inside Arabic text.
                      <li key={k}><strong>{t(`audit.field.${k}`, k)}</strong>: <bdi>{value(k, from)}</bdi> {language === 'en' ? '→' : '←'} <bdi>{value(k, to)}</bdi></li>
                    ))}
                  </ul>
                ) : null}
                {created(r).length ? (
                  <ul className="card__meta" style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>
                    {created(r).map(([k, v]) => <li key={k}><strong>{t(`audit.field.${k}`, k)}</strong>: <bdi>{value(k, v)}</bdi></li>)}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}

// Technical links and bookkeeping that mean nothing to a reader (UAT D-11/12).
const NOISE = new Set(['updated_at', 'updated_by', 'created_at', 'created_by', 'id', 'visit_id', 'last_visit_id',
  'completed_in_visit_id', 'follow_up_visit_id', 'template_id', 'template_item_id', 'recurring_item_id', 'was_follow_up']);

/** Fields worth showing for a newly created record (UAT D-2). */
const CREATED_FIELDS: Record<string, string[]> = {
  labor_allocations: ['duration', 'work_type_id', 'operational_target_id', 'change_reason', 'notes'],
  project_tasks: ['status', 'note'],
  visits: ['status', 'work_type_id'],
  month_closes: [],
};

/** Field-level old → new for audit rows written by 0006's audit_row() (§30). */
function changes(payload: Record<string, unknown>): [string, string, string][] {
  const oldRow = payload?.old as Record<string, unknown> | null | undefined;
  const newRow = payload?.new as Record<string, unknown> | null | undefined;
  if (!oldRow || !newRow) return [];
  const show = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  return Object.keys(newRow)
    .filter((k) => !NOISE.has(k) && JSON.stringify(oldRow[k]) !== JSON.stringify(newRow[k]))
    .map((k) => [k, show(oldRow[k]), show(newRow[k])]);
}
