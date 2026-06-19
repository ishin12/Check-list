import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '@/components/AppShell';
import { AppHeader } from '@/components/AppHeader';
import { StatusPill } from '@/components/StatusPill';
import { useAuth } from '@/app/providers/AuthContext';
import { listTasks } from '@/services/data/tasks';
import type { FieldTask } from '@/domain/models/ops';

export function PortalScreen() {
  const { t } = useTranslation();
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
        <button className="icon-btn" onClick={signOut}>↩</button>
      </AppHeader>
      <main className="app-main">
        <section>
          <div className="section-title">{t('portal.upcoming', 'Upcoming')}</div>
          {upcoming.length === 0 ? (
            <p className="hint">{t('portal.noUpcoming', 'Nothing scheduled.')}</p>
          ) : (
            <div className="stack">
              {upcoming.map((x) => (
                <div key={x.id} className="card">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <div>
                      <div className="card__title">{x.title}</div>
                      <div className="card__meta">{new Date(x.scheduledAt).toLocaleString()}</div>
                    </div>
                    <StatusPill status={x.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="section-title">{t('portal.past', 'Completed')}</div>
          {past.length === 0 ? (
            <p className="hint">{t('portal.noPast', 'No completed visits yet.')}</p>
          ) : (
            <div className="stack">
              {past.map((x) => (
                <div key={x.id} className="card">
                  <div className="card__title">{x.title}</div>
                  <div className="card__meta">{new Date(x.scheduledAt).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </AppShell>
  );
}
