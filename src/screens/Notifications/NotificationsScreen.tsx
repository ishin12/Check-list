import { useEffect, useState } from 'react';
import { useLanguage } from '@/app/providers/LanguageContext';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { AppShell } from '@/components/AppShell';
import { AppHeader } from '@/components/AppHeader';
import { useAuth } from '@/app/providers/AuthContext';
import { getSupabase } from '@/services/supabase/client';
import { useDirectory } from '@/app/providers/DirectoryContext';
import type { AppNotification } from '@/domain/models/ops';
import { formatDateAndTime } from '@/lib/datetime';

export function NotificationsScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { user } = useAuth();
  const { workers } = useDirectory();
  const [items, setItems] = useState<AppNotification[]>([]);

  useEffect(() => {
    if (!user) return;
    const sb = getSupabase();
    void (async () => {
      const { data } = await sb.from('notifications')
        .select('*').eq('user_id', user.id)
        .order('created_at', { ascending: false }).limit(100);
      setItems((data ?? []).map((r) => ({
        id: r.id, userId: r.user_id, kind: r.kind, payload: r.payload ?? {},
        readAt: r.read_at ?? undefined, emailSentAt: r.email_sent_at ?? undefined,
        createdAt: r.created_at,
      })));
    })();
    const sub = sb.channel('notif')
      .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
          (payload) => {
            const r = payload.new as { id: string; user_id: string; kind: string; payload: Record<string, unknown>; created_at: string };
            setItems((prev) => [{
              id: r.id, userId: r.user_id, kind: r.kind, payload: r.payload ?? {},
              createdAt: r.created_at,
            }, ...prev]);
          })
      .subscribe();
    return () => { void sb.removeChannel(sub); };
  }, [user]);

  async function markAllRead() {
    if (!user) return;
    await getSupabase().from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id).is('read_at', null);
    setItems((prev) => prev.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })));
  }

  return (
    <AppShell>
      <AppHeader title={t('notifications.title', 'Inbox')}>
        <button className="icon-btn" onClick={markAllRead} aria-label={t('notifications.markAllRead', 'Mark all read')}>✓</button>
      </AppHeader>
      <main className="app-main">
        {items.length === 0 ? (
          <div className="empty">
            <div className="empty__icon">◉</div>
            <p>{t('notifications.empty', 'No notifications yet.')}</p>
          </div>
        ) : (
          <div className="stack">
            {items.map((n) => {
              const payload = n.payload as { title?: string; worker_id?: string; worker_ids?: string[] };
              const ids = payload.worker_ids?.length ? payload.worker_ids : payload.worker_id ? [payload.worker_id] : [];
              const workerName = ids
                .map((id) => workers.get(id)?.fullName ?? workers.get(id)?.email)
                .filter(Boolean)
                .join(', ');
              return (
                <div key={n.id} className={`card ${n.readAt ? '' : 'card--unread'}`}>
                  <div className="card__title">{renderKind(n.kind, t)}</div>
                  <div className="card__meta">{formatDateAndTime(n.createdAt, language)}</div>
                  {payload.title ? (
                    <div className="card__meta">
                      {payload.title}{workerName ? ` · ${workerName}` : ''}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </AppShell>
  );
}

function renderKind(kind: string, t: TFunction): string {
  switch (kind) {
    case 'task.assigned':   return t('notifications.kind.assigned', 'New task assigned to you');
    case 'task.submitted':  return t('notifications.kind.submitted', 'Task submitted for approval');
    case 'task.approved':   return t('notifications.kind.approved', 'Your task was approved');
    case 'task.rejected':   return t('notifications.kind.rejected', 'Your task was rejected');
    default: return kind;
  }
}
