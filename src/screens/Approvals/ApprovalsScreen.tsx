import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { AppHeader } from '@/components/AppHeader';
import { StatusPill } from '@/components/StatusPill';
import { listTasks } from '@/services/data/tasks';
import { TaskWhoLine } from '@/components/TaskWhoLine';
import type { FieldTask } from '@/domain/models/ops';

export function ApprovalsScreen() {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<FieldTask[]>([]);

  useEffect(() => {
    void listTasks({ status: 'submitted' }).then(setTasks);
  }, []);

  return (
    <AppShell>
      <AppHeader title={t('approvals.title', 'Approvals')} />
      <main className="app-main">
        {tasks.length === 0 ? (
          <div className="empty">
            <div className="empty__icon">✓</div>
            <p>{t('approvals.empty', 'Nothing waiting on you.')}</p>
          </div>
        ) : (
          <div className="stack">
            {tasks.map((x) => (
              <Link key={x.id} to={`/tasks/${x.id}`} className="card card--tap">
                <div style={{ flex: 1 }}>
                  <div className="card__title">{x.title}</div>
                  <TaskWhoLine task={x} />
                  <div className="card__meta">{new Date(x.scheduledAt).toLocaleString()}</div>
                </div>
                <StatusPill status={x.status} />
              </Link>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}
