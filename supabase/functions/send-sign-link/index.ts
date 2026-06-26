// Edge Function: send-sign-link
// Creates a signing link for a task and sends the WhatsApp "please sign"
// template to the client. Awaits the Cloud API response and persists the
// message id / status so the caller can surface a delivery failure.
//
// Deploy:
//   supabase functions deploy send-sign-link
//
// Body: { task_id: string }
// Caller must be the assigned worker or a manager.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { sendTemplate } from '../_shared/whatsapp.ts';

const TEMPLATE = 'ghsoon_najd_sign_request';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
  if (req.method !== 'POST') return cors(new Response('Method not allowed', { status: 405 }));

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return cors(new Response('Unauthorized', { status: 401 }));

    const { task_id } = (await req.json()) as { task_id: string };
    if (!task_id) return cors(new Response('task_id required', { status: 400 }));

    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const appUrl = Deno.env.get('APP_URL') ?? '';

    // Verify the caller may act on this task (worker on it, or manager).
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: callerUser } = await caller.auth.getUser();
    if (!callerUser?.user) return cors(new Response('Unauthorized', { status: 401 }));

    const admin = createClient(url, serviceKey);

    const { data: task } = await admin
      .from('tasks')
      .select('id, title, scheduled_at, assigned_worker_id, client_id, clients(name, phone)')
      .eq('id', task_id)
      .maybeSingle();
    if (!task) return cors(new Response('task not found', { status: 404 }));

    const { data: callerProfile } = await admin
      .from('profiles').select('role').eq('id', callerUser.user.id).maybeSingle();
    const isManager = callerProfile?.role === 'manager';
    if (!isManager && task.assigned_worker_id !== callerUser.user.id) {
      return cors(new Response('Forbidden', { status: 403 }));
    }

    const client = (task as { clients?: { name?: string; phone?: string } }).clients;
    const phone = client?.phone;
    if (!phone) {
      return cors(new Response(JSON.stringify({ ok: false, reason: 'no_phone' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }));
    }

    // Read the configurable signing window.
    const { data: settings } = await admin
      .from('app_settings').select('signing_expiry_days').eq('id', true).maybeSingle();
    const expiryDays = settings?.signing_expiry_days ?? 3;

    // Create the link row first (status queued).
    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 8);
    const expiresAt = new Date(Date.now() + expiryDays * 86400_000).toISOString();
    const { data: link, error: linkErr } = await admin
      .from('signing_links')
      .insert({ task_id, token, expires_at: expiresAt, whatsapp_status: 'queued' })
      .select('id')
      .single();
    if (linkErr) return cors(new Response(`link insert failed: ${linkErr.message}`, { status: 500 }));

    // Send the template (await — no fire-and-forget).
    const scheduled = new Date(task.scheduled_at as string).toLocaleDateString('ar');
    const result = await sendTemplate(
      phone,
      TEMPLATE,
      'ar',
      [client?.name ?? '', task.title as string, String(expiryDays)],
      { urlSuffix: token },
    );

    // Persist outcome on the link row.
    await admin.from('signing_links').update({
      whatsapp_message_id: result.messageId ?? null,
      whatsapp_status: result.ok ? 'sent' : 'failed',
      whatsapp_error: result.ok ? null : result.error,
    }).eq('id', link.id);

    await admin.from('audit_log').insert({
      actor_id: callerUser.user.id,
      action: 'task.sign_link_sent',
      entity: 'task',
      entity_id: task_id,
      payload: { status: result.ok ? 'sent' : 'failed' },
    });

    const signUrl = `${appUrl.replace(/\/$/, '')}/sign/${token}`;
    return cors(new Response(JSON.stringify({
      ok: result.ok,
      sign_url: signUrl,
      whatsapp_status: result.ok ? 'sent' : 'failed',
      error: result.ok ? undefined : result.error,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  } catch (e) {
    return cors(new Response(`error: ${e instanceof Error ? e.message : String(e)}`, { status: 500 }));
  }
});

function cors(resp: Response): Response {
  resp.headers.set('Access-Control-Allow-Origin', '*');
  resp.headers.set('Access-Control-Allow-Headers', 'authorization, content-type');
  resp.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  return resp;
}
