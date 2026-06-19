import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '@/components/AppShell';
import { AppHeader } from '@/components/AppHeader';
import { useAuth } from '@/app/providers/AuthContext';
import { getSupabase } from '@/services/supabase/client';
import type { AppNotification } from '@/domain/models/ops';

export function NotificationsScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
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
        <button className="icon-btn" onClick={markAllRead} aria-label="Mark all read">✓</button>
      </AppHeader>
      <main className="app-main">
        {items.length === 0 ? (
          <div className="empty">
            <div className="empty__icon">◉</div>
            <p>{t('notifications.empty', 'No notifications yet.')}</p>
          </div>
        ) : (
          <div className="stack">
            {items.map((n) => (
              <div key={n.id} className={`card ${n.readAt ? '' : 'card--unread'}`}>
                <div className="card__title">{renderKind(n.kind)}</div>
                <div className="card__meta">{new Date(n.createdAt).toLocaleString()}</div>
                {(n.payload as { title?: string }).title ? (
                  <div className="card__meta">{(n.payload as { title: string }).title}</div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}

function renderKind(kind: string): string {
  switch (kind) {
    case 'task.assigned':   return 'New task assigned to you';
    case 'task.submitted':  return 'Task submitted for approval';
    case 'task.approved':   return 'Your task was approved';
    case 'task.rejected':   return 'Your task was rejected';
    default: return kind;
  }
}
