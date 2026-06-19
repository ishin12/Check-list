// Edge Function: notify
// Triggered by a Supabase Database Webhook on `notifications` INSERT.
// Looks up the recipient's email from `profiles` and sends a transactional
// email via Resend, then stamps `email_sent_at` so it isn't re-sent.
//
// Deploy:
//   supabase functions deploy notify --no-verify-jwt
//   supabase secrets set RESEND_API_KEY=re_...
//
// Database webhook: Supabase Dashboard → Database → Webhooks → New webhook
//   Table: notifications, Events: INSERT, Type: Supabase Edge Functions,
//   Function: notify.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

interface WebhookPayload {
  type: 'INSERT';
  table: 'notifications';
  record: {
    id: string;
    user_id: string;
    kind: string;
    payload: Record<string, unknown>;
    email_sent_at: string | null;
  };
}

const SUBJECT: Record<string, string> = {
  'task.assigned':   'New task assigned to you',
  'task.submitted':  'A worker submitted a task for approval',
  'task.approved':   'Your task was approved',
  'task.rejected':   'Your task was rejected',
};

Deno.serve(async (req: Request) => {
  try {
    const body = (await req.json()) as WebhookPayload;
    if (body.type !== 'INSERT' || body.table !== 'notifications') {
      return new Response('ignored', { status: 200 });
    }
    const { record } = body;
    if (record.email_sent_at) return new Response('already sent', { status: 200 });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: profile } = await supabase
      .from('profiles').select('email, full_name').eq('id', record.user_id).maybeSingle();
    if (!profile?.email) return new Response('no email', { status: 200 });

    const subject = SUBJECT[record.kind] ?? `Check-list update: ${record.kind}`;
    const title = (record.payload as { title?: string }).title;
    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0E1116;max-width:520px;margin:auto;padding:24px">
        <h1 style="margin:0 0 12px;font-size:20px">${subject}</h1>
        ${title ? `<p style="margin:0 0 8px;color:#475569"><strong>${escapeHtml(title)}</strong></p>` : ''}
        <p style="margin:16px 0 0;color:#475569">Open the app to see details.</p>
      </div>`;

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: Deno.env.get('RESEND_FROM') ?? 'Check-list <noreply@check-list.app>',
        to: profile.email,
        subject,
        html,
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      return new Response(`resend failed: ${text}`, { status: 500 });
    }

    await supabase.from('notifications')
      .update({ email_sent_at: new Date().toISOString() })
      .eq('id', record.id);

    return new Response('ok', { status: 200 });
  } catch (e) {
    return new Response(`error: ${e instanceof Error ? e.message : String(e)}`, { status: 500 });
  }
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
