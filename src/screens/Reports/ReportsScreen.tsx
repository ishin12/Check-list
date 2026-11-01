import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '@/components/AppShell';
import { AppHeader } from '@/components/AppHeader';
import { Icon } from '@/components/Icon';
import { listTasks } from '@/services/data/tasks';
import { getSupabase } from '@/services/supabase/client';
import { reportExcel, summarizeTasks } from '@/domain/reports';
import type { FieldTask } from '@/domain/models/ops';
import '@/styles/screens/admin.css';

interface ClientRow { id: string; name: string }

export function ReportsScreen() {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<FieldTask[]>([]);
  const [clients, setClients] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [loadedTasks, clientResult] = await Promise.all([
          listTasks(),
          getSupabase().from('clients').select('id, name').order('name'),
        ]);
        setTasks(loadedTasks);
        const names: Record<string, string> = {};
        for (const client of (clientResult.data ?? []) as ClientRow[]) names[client.id] = client.name;
        setClients(names);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  const summary = summarizeTasks(tasks);
  function downloadCsv() {
    const excel = reportExcel(tasks);
    const url = URL.createObjectURL(new Blob([excel], { type: 'application/vnd.ms-excel;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `check-list-report-${new Date().toISOString().slice(0, 10)}.xls`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell>
      <AppHeader title={t('reports.title', 'Reports')} showBack />
      <main className="app-main">
        {error ? <div className="banner banner--error">{error}</div> : null}
        <section className="card adm-card">
          <div className="adm-card__title">{t('reports.summary', 'Operational summary')}</div>
          <p className="adm-card__lede">{t('reports.readOnly', 'Read-only view for reporting and accountability.')}</p>
          <div className="report-metrics">
            <div><strong>{summary.total}</strong><span>{t('reports.totalTasks', 'Total tasks')}</span></div>
            <div><strong>{summary.approved}</strong><span>{t('reports.approved', 'Approved')}</span></div>
            <div><strong>{summary.pending}</strong><span>{t('reports.pending', 'Open or pending')}</span></div>
            <div><strong>{summary.completionRate}%</strong><span>{t('reports.completionRate', 'Completion')}</span></div>
          </div>
          <button className="btn btn--primary" type="button" onClick={downloadCsv} disabled={!tasks.length}>
            <Icon name="share" /> {t('reports.exportExcel', 'Export Excel')}
          </button>
          <p className="hint">{t('reports.noAmounts', 'This report contains operational totals, not monetary accounting.')}</p>
        </section>
        <section className="card adm-card">
          <div className="adm-card__title">{t('reports.recentWork', 'Recent work')}</div>
          {tasks.length === 0 ? <p className="hint">{t('reports.noTasks', 'No tasks found.')}</p> : (
            <div className="adm-list">
              {tasks.slice(-20).reverse().map((task) => (
                <div className="adm-row" key={task.id}>
                  <div className="adm-row__text">
                    <div className="card__title">{task.title}</div>
                    <div className="card__meta">{clients[task.clientId] ?? task.clientId} · {task.status}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </AppShell>
  );
}
