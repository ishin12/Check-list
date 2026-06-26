// Edge Function: expire-signing
// Cron-scheduled (hourly). Auto-approves tasks whose signing link expired with
// no client signature. Marks approval_method = 'auto_no_response' so the UI and
// reports render it distinctly from a real client signature.
//
// Deploy:
//   supabase functions deploy expire-signing --no-verify-jwt
// Schedule via pg_cron (see SUPABASE_SETUP.md).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

Deno.serve(async () => {
  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey);

  const { data: settings } = await admin
    .from('app_settings').select('signing_expiry_days').eq('id', true).maybeSingle();
  const days = settings?.signing_expiry_days ?? 3;

  const { data: expired } = await admin
    .from('signing_links')
    .select('id, task_id')
    .is('signed_at', null)
    .is('auto_approved_at', null)
    .lt('expires_at', new Date().toISOString());

  let count = 0;
  for (const link of (expired ?? []) as Array<{ id: string; task_id: string }>) {
    await admin.from('signing_links').update({ auto_approved_at: new Date().toISOString() }).eq('id', link.id);
    await admin.from('tasks').update({
      status: 'approved',
      approval_method: 'auto_no_response',
      decision_at: new Date().toISOString(),
      decision_note: `Auto-approved after ${days} days — client did not respond`,
    }).eq('id', link.task_id).eq('status', 'submitted');
    await admin.from('audit_log').insert({
      actor_id: null,
      action: 'task.auto_approved',
      entity: 'task',
      entity_id: link.task_id,
      payload: { days },
    });
    count++;
  }

  return new Response(JSON.stringify({ ok: true, auto_approved: count }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
});
