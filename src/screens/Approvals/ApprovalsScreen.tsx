import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/app/providers/LanguageContext';
import { Link } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { AppHeader } from '@/components/AppHeader';
import { StatusPill } from '@/components/StatusPill';
import { listTasks } from '@/services/data/tasks';
import { TaskWhoLine } from '@/components/TaskWhoLine';
import type { FieldTask } from '@/domain/models/ops';
import { APP_TIME_ZONE } from '@/lib/dates';
import { formatDateAndTime } from '@/lib/datetime';
import { Icon } from '@/components/Icon';
import '@/styles/screens/field.css';

export function ApprovalsScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
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
            <div className="empty__icon"><Icon name="check-circle" /></div>
            <p>{t('approvals.empty', 'Nothing waiting on you.')}</p>
          </div>
        ) : (
          <div className="stack">
            {tasks.map((x) => (
              <Link key={x.id} to={`/tasks/${x.id}`} className="card card--tap visit">
                <div className="visit__body">
                  <div className="visit__top">
                    <span className="visit__time">
                      {formatDateAndTime(x.scheduledAt, language, {
                        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                    <StatusPill status={x.status} approvalMethod={x.approvalMethod} />
                  </div>
                  <div className="card__title">{x.title}</div>
                  <TaskWhoLine task={x} />
                  <div className="card__meta">{new Date(x.scheduledAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: APP_TIME_ZONE })}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}
