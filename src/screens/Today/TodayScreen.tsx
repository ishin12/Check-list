import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/app/providers/LanguageContext';
import { Link } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { AppShell } from '@/components/AppShell';
import { StatusPill } from '@/components/StatusPill';
import { useAuth } from '@/app/providers/AuthContext';
import { listTasks } from '@/services/data/tasks';
import { dailySummary, timeOnTaskMinutes } from '@/domain/job/taskFlow';
import { TaskWhoLine } from '@/components/TaskWhoLine';
import type { FieldTask } from '@/domain/models/ops';
import { localToday } from '@/lib/dates';
import { formatTime } from '@/lib/datetime';
import { Chevron } from '@/components/Chevron';
import '@/styles/screens/field.css';

function startOfDay(d = new Date()): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}
function endOfDay(d = new Date()): string {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.toISOString();
}

export function TodayScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<FieldTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const ts = await listTasks({
          workerId: user.role === 'worker' ? user.id : undefined,
          from: startOfDay(),
          to: endOfDay(),
        });
        setTasks(ts);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const today = localToday();
  const summary = user ? dailySummary(user.id, today, tasks) : null;
  const next = tasks.find((x) => x.status !== 'approved' && x.status !== 'rejected') ?? tasks[0];

  return (
    <AppShell>
      <AppHeader title={t('today.title', 'Today')} />
      <main className="app-main">
        {loading ? <p className="hint">Loading…</p> : null}
        {error ? <div className="banner banner--error">{error}</div> : null}

        {summary ? (
          <div className="hero hero--brand today-hero">
            <div className="hero__title">
              {t('today.greeting', 'Hi {{name}}', { name: user?.fullName ?? user?.email ?? '' })}
            </div>
            <div className="hero__desc">
              {summary.taskCount === 0
                ? t('today.empty', 'No visits scheduled today. Enjoy the calm.')
                : t('today.summary', '{{count}} visits · {{done}} done · {{min}} min on task', {
                    count: summary.taskCount,
                    done: summary.completedCount,
                    min: summary.totalMinutes,
                  })}
            </div>
            {summary.taskCount > 0 ? (
              <div
                className="today-hero__track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={summary.taskCount}
                aria-valuenow={summary.completedCount}
                aria-label={t('today.title', 'Today')}
              >
                <div
                  className="today-hero__fill"
                  style={{ inlineSize: `${(summary.completedCount / summary.taskCount) * 100}%` }}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {next ? (
          <Link to={`/tasks/${next.id}`} className="card card--tap card--accent visit visit--lead">
            <div className="visit__body">
              <span className="sr-only">{t('today.upNext', 'Up next')}</span>
              <div className="visit__top">
                <span className="visit__time">
                  {formatTime(next.scheduledAt, language, { hour: '2-digit', minute: '2-digit' })}
                </span>
                <StatusPill status={next.status} />
              </div>
              <div className="card__title">{next.title}</div>
              <TaskWhoLine task={next} hideWorker={user?.role === 'worker'} />
              {next.startedAt ? (
                <div className="card__meta">{t('common.minutesShort', { count: timeOnTaskMinutes(next) })}</div>
              ) : null}
            </div>
            <span className="visit__go"><Chevron kind="forward" /></span>
          </Link>
        ) : null}

        {tasks.length > 1 ? (
          <>
            <div className="section-title">{t('today.rest', 'Rest of today')}</div>
            <div className="stack">
              {tasks.filter((x) => x.id !== next?.id).map((x) => (
                <Link key={x.id} to={`/tasks/${x.id}`} className="card card--tap visit">
                  <div className="visit__body">
                    <div className="visit__top">
                      <span className="visit__time">
                        {formatTime(x.scheduledAt, language, { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <StatusPill status={x.status} approvalMethod={x.approvalMethod} />
                    </div>
                    <div className="card__title">{x.title}</div>
                    <TaskWhoLine task={x} hideWorker={user?.role === 'worker'} />
                  </div>
                </Link>
              ))}
            </div>
          </>
        ) : null}
      </main>
    </AppShell>
  );
}
