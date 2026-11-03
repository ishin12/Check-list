// Edge Function: set-password
// Manager-only. Sets/resets another user's password via the Auth admin API.
//
// Deploy:
//   supabase functions deploy set-password
//
// Body: { user_id: string, password: string }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

interface Body {
  user_id: string;
  password: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
  if (req.method !== 'POST') return cors(new Response('Method not allowed', { status: 405 }));

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return cors(new Response('Unauthorized', { status: 401 }));

    const body = (await req.json()) as Body;
    if (!body.user_id || !body.password || body.password.length < 8) {
      return cors(new Response('user_id and password (min 8 chars) required', { status: 400 }));
    }

    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify the caller is a manager.
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: callerUser } = await caller.auth.getUser();
    if (!callerUser?.user) return cors(new Response('Unauthorized', { status: 401 }));
    const { data: callerProfile } = await caller
      .from('profiles').select('role').eq('id', callerUser.user.id).maybeSingle();
    if (callerProfile?.role !== 'manager') return cors(new Response('Forbidden', { status: 403 }));

    // Update the target user's password.
    const admin = createClient(url, serviceKey);
    const { error } = await admin.auth.admin.updateUserById(body.user_id, { password: body.password });
    if (error) return cors(new Response(`update failed: ${error.message}`, { status: 500 }));

    // Audit the reset (no password recorded).
    await admin.from('audit_log').insert({
      actor_id: callerUser.user.id,
      action: 'user.password_set',
      entity: 'profile',
      entity_id: body.user_id,
      payload: {},
    });

    return cors(new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));
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
