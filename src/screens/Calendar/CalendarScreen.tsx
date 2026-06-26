import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { AppShell } from '@/components/AppShell';
import { StatusPill } from '@/components/StatusPill';
import { useAuth } from '@/app/providers/AuthContext';
import { listTasks } from '@/services/data/tasks';
import { getSupabase } from '@/services/supabase/client';
import { TaskWhoLine } from '@/components/TaskWhoLine';
import type { FieldTask } from '@/domain/models/ops';

interface Option { id: string; label: string }

export function CalendarScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<FieldTask[]>([]);
  const [workers, setWorkers] = useState<Option[]>([]);
  const [clients, setClients] = useState<Option[]>([]);
  const [filterKind, setFilterKind] = useState<'worker' | 'client'>('worker');
  const [filterId, setFilterId] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);

  const isManager = user?.role === 'manager';

  // Load reference lists for the manager filter dropdown.
  useEffect(() => {
    if (!isManager) return;
    void (async () => {
      const sb = getSupabase();
      const [{ data: ws }, { data: cs }] = await Promise.all([
        sb.from('profiles').select('id, full_name, email').eq('role', 'worker').eq('active', true),
        sb.from('clients').select('id, name'),
      ]);
      setWorkers((ws ?? []).map((w) => ({ id: w.id, label: w.full_name ?? w.email ?? w.id })));
      setClients((cs ?? []).map((c) => ({ id: c.id, label: c.name })));
    })();
  }, [isManager]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const start = new Date(); start.setDate(start.getDate() - 7); start.setHours(0,0,0,0);
        const end = new Date();   end.setDate(end.getDate() + 30);    end.setHours(23,59,59,999);
        const ts = await listTasks({
          workerId:
            !isManager ? user.id :
            (filterKind === 'worker' && filterId !== 'all' ? filterId : undefined),
          clientId: isManager && filterKind === 'client' && filterId !== 'all' ? filterId : undefined,
          from: start.toISOString(),
          to: end.toISOString(),
        });
        setTasks(ts);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [user, isManager, filterKind, filterId]);

  const groups = useMemo(() => groupByDay(tasks), [tasks]);

  return (
    <AppShell>
      <AppHeader title={t('calendar.title', 'Calendar')}>
        {isManager ? (
          <Link to="/tasks/new" className="btn btn--primary btn--icon" aria-label={t('calendar.add', 'Add task')}>
            +
          </Link>
        ) : null}
      </AppHeader>
      <main className="app-main">
        {error ? <div className="banner banner--error">{error}</div> : null}

        {isManager ? (
          <div className="row" style={{ gap: 8 }}>
            <select
              className="input"
              value={filterKind}
              onChange={(e) => { setFilterKind(e.target.value as 'worker' | 'client'); setFilterId('all'); }}
              style={{ maxWidth: 160 }}
            >
              <option value="worker">{t('calendar.byWorker', 'By worker')}</option>
              <option value="client">{t('calendar.byClient', 'By client')}</option>
            </select>
            <select className="input" value={filterId} onChange={(e) => setFilterId(e.target.value)}>
              <option value="all">{t('calendar.all', 'All')}</option>
              {(filterKind === 'worker' ? workers : clients).map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>
        ) : null}

        {groups.length === 0 ? (
          <div className="empty">
            <div className="empty__icon">▦</div>
            <p>{t('calendar.empty', 'No visits in this range.')}</p>
          </div>
        ) : null}

        <div className="agenda">
          {groups.map(([day, items]) => (
            <section key={day} className="agenda__day">
              <header className="agenda__header">
                <span className="agenda__date">{formatDay(day)}</span>
                <span className="agenda__count" title="task count">{items.length}</span>
              </header>
              <div className="stack">
                {items.map((x) => (
                  <Link key={x.id} to={`/tasks/${x.id}`} className="card card--tap">
                    <div style={{ flex: 1 }}>
                      <div className="card__title">{x.title}</div>
                      <TaskWhoLine task={x} hideWorker={!isManager} />
                      <div className="card__meta">
                        {new Date(x.scheduledAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <StatusPill status={x.status} approvalMethod={x.approvalMethod} />
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </AppShell>
  );
}

function groupByDay(tasks: FieldTask[]): Array<[string, FieldTask[]]> {
  const map = new Map<string, FieldTask[]>();
  for (const t of tasks) {
    const day = t.scheduledAt.slice(0, 10);
    if (!map.has(day)) map.set(day, []);
    map.get(day)!.push(t);
  }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
}

function formatDay(day: string): string {
  const d = new Date(day + 'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
