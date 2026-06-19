import { useEffect, useState } from 'react';
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

export function AuditScreen() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const { data, error } = await getSupabase()
          .from('audit_log')
          .select('id, actor_id, action, entity, entity_id, payload, at, actor:profiles!audit_log_actor_id_fkey(full_name, email)')
          .order('at', { ascending: false })
          .limit(200);
        if (error) throw error;
        setRows((data ?? []) as Row[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  return (
    <AppShell>
      <AppHeader title={t('audit.title', 'Audit log')} showBack />
      <main className="app-main">
        {error ? <div className="banner banner--error">{error}</div> : null}
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
