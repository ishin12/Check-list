// Edge Function: send-reminder
// Cron-scheduled (hourly). Sends one reminder per signing link when it's within
// `signing_reminder_hours` of expiry and still unsigned. Uses a separate
// approved utility template so the client isn't sent the same "please sign"
// twice with no acknowledgement.
//
// Deploy:
//   supabase functions deploy send-reminder --no-verify-jwt
// Schedule via pg_cron (see SUPABASE_SETUP.md).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { sendTemplate } from '../_shared/whatsapp.ts';

const TEMPLATE = 'ghsoon_najd_sign_reminder';

Deno.serve(async () => {
  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey);

  const { data: settings } = await admin
    .from('app_settings').select('signing_reminder_hours').eq('id', true).maybeSingle();
  const reminderHours = settings?.signing_reminder_hours ?? 24;

  // Links that are unsigned, not yet reminded, and within the reminder window.
  const windowEnd = new Date(Date.now() + reminderHours * 3600_000).toISOString();
  const { data: due } = await admin
    .from('signing_links')
    .select('id, token, expires_at, task_id, tasks(title, clients(name, phone))')
    .is('signed_at', null)
    .is('auto_approved_at', null)
    .is('reminder_sent_at', null)
    .gt('expires_at', new Date().toISOString())
    .lt('expires_at', windowEnd);

  let sent = 0;
  for (const link of (due ?? []) as Array<any>) {
    const client = link.tasks?.clients;
    if (!client?.phone) continue;
    const hoursLeft = Math.max(1, Math.round((new Date(link.expires_at).getTime() - Date.now()) / 3600_000));
    const result = await sendTemplate(
      client.phone,
      TEMPLATE,
      'ar',
      [link.tasks?.title ?? '', String(hoursLeft)],
      { urlSuffix: link.token },
    );
    await admin.from('signing_links').update({
      reminder_sent_at: new Date().toISOString(),
      whatsapp_status: result.ok ? 'sent' : 'failed',
      whatsapp_error: result.ok ? null : result.error,
    }).eq('id', link.id);
    if (result.ok) sent++;
  }

  return new Response(JSON.stringify({ ok: true, reminders_sent: sent }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
});
