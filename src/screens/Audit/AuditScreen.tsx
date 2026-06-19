import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '@/components/AppShell';
import { AppHeader } from '@/components/AppHeader';
import { getSupabase } from '@/services/supabase/client';

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

const ENTITY_OPTIONS = ['all', 'task', 'client_note', 'task_proofs', 'client', 'profile'] as const;

function startOfDayInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function AuditScreen() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [entity, setEntity] = useState<string>('all');
  const [from, setFrom] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() - 14); return startOfDayInput(d);
  });
  const [to, setTo] = useState<string>(() => startOfDayInput(new Date()));
  const [actor, setActor] = useState<string>('');

  async function load() {
    try {
      let q = getSupabase()
        .from('audit_log')
        .select('id, actor_id, action, entity, entity_id, payload, at, actor:profiles!audit_log_actor_id_fkey(full_name, email)')
        .order('at', { ascending: false })
        .limit(500);
      if (entity !== 'all') q = q.eq('entity', entity);
      if (from) q = q.gte('at', new Date(from + 'T00:00:00').toISOString());
      if (to) q = q.lte('at', new Date(to + 'T23:59:59').toISOString());
      if (actor) q = q.eq('actor_id', actor);
      const { data, error } = await q;
      if (error) throw error;
      setRows((data ?? []) as Row[]);
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
                  <option key={opt} value={opt}>{opt === 'all' ? t('audit.allTypes', 'All') : opt}</option>
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

        {rows.length === 0 ? (
          <div className="empty"><div className="empty__icon">◷</div><p>{t('audit.empty', 'Nothing logged yet.')}</p></div>
        ) : (
          <div className="stack">
            {rows.map((r) => (
              <div key={r.id} className="card">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="card__title">{r.action}</span>
                  <span className="card__meta">{new Date(r.at).toLocaleString()}</span>
                </div>
                <div className="card__meta">
                  {r.actor?.[0]?.full_name ?? r.actor?.[0]?.email ?? r.actor_id ?? 'system'} · {r.entity}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}
