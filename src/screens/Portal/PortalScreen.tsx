import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '@/components/AppShell';
import { AppHeader } from '@/components/AppHeader';
import { StatusPill } from '@/components/StatusPill';
import { useAuth } from '@/app/providers/AuthContext';
import { listTasks } from '@/services/data/tasks';
import { TaskWhoLine } from '@/components/TaskWhoLine';
import type { FieldTask } from '@/domain/models/ops';
import { formatDate } from '@/lib/datetime';
import { useLanguage } from '@/app/providers/LanguageContext';
import { Icon } from '@/components/Icon';
import { VisitWhen } from '@/screens/Sign/VisitWhen';
import '@/styles/screens/first-impression.css';

export function PortalScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { user, signOut } = useAuth();
  const [tasks, setTasks] = useState<FieldTask[]>([]);

  useEffect(() => {
    if (!user?.clientId) return;
    void listTasks({ clientId: user.clientId }).then(setTasks);
  }, [user]);

  const upcoming = tasks.filter((x) => x.status !== 'approved' && x.status !== 'rejected');
  const past = tasks.filter((x) => x.status === 'approved');

  return (
    <AppShell bare>
      <AppHeader title={t('portal.title', 'Your visits')}>
        <button className="icon-btn" onClick={signOut} aria-label={t('auth.signOut', 'Sign out')}><Icon name="sign-out" /></button>
      </AppHeader>
      <main className="app-main">
        <section className="portal-section">
          <h2 className="section-title">{t('portal.upcoming', 'Upcoming')}</h2>
          {upcoming.length === 0 ? (
            <div className="empty">
              <div className="empty__icon"><Icon name="calendar" /></div>
              <p>{t('portal.noUpcoming', 'Nothing scheduled.')}</p>
            </div>
          ) : (
            <div className="stack">
              {upcoming.map((x, i) => (
                // The next visit leads: the accent tone step, as on the worker's Today.
                <div key={x.id} className={`card${i === 0 ? ' card--accent' : ''}`}>
                  <div className="portal-visit">
                    <div className="portal-visit__main">
                      <div className="card__title">{x.title}</div>
                      <TaskWhoLine task={x} hideClient />
                      <div className="card__meta"><VisitWhen iso={x.scheduledAt} language={language} /></div>
                    </div>
                    <StatusPill status={x.status} approvalMethod={x.approvalMethod} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="portal-section">
          <h2 className="section-title">{t('portal.past', 'Completed')}</h2>
          {past.length === 0 ? (
            <div className="empty">
              <div className="empty__icon"><Icon name="check-circle" /></div>
              <p>{t('portal.noPast', 'No completed visits yet.')}</p>
            </div>
          ) : (
            <div className="stack">
              {past.map((x) => (
                <div key={x.id} className="card">
                  <div className="card__title">{x.title}</div>
                  <TaskWhoLine task={x} hideClient />
                  <div className="card__meta">{formatDate(x.scheduledAt, language)}</div>
                  {x.extraWork.length > 0 ? (
                    <div className="portal-extras">
                      <div className="portal-extras__title">{t('extras.title', 'Extra work done')}</div>
                      <ul>
                        {x.extraWork.map((e) => <li key={e.id}>{e.body}</li>)}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </AppShell>
  );
}
