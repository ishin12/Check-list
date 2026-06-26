// Edge Function: invite-user
// Manager-only. Creates a profile + invites the user via Supabase Auth so they
// receive a magic-link sign-up email.
//
// Deploy:
//   supabase functions deploy invite-user
//
// Called from the Users admin screen with the caller's JWT in the
// Authorization header — we verify the caller is a manager before inviting.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

interface InviteBody {
  email: string;
  role: 'manager' | 'worker' | 'client';
  full_name?: string;
  phone?: string;
  client_id?: string;
}

function tempPassword(): string {
  // 12-char random temp password, emailed to the new user.
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return 'Gn' + btoa(String.fromCharCode(...bytes)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
}

async function sendWelcomeEmail(to: string, name: string, password: string): Promise<void> {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return;
  const appUrl = Deno.env.get('APP_URL') ?? '';
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('RESEND_FROM') ?? 'Ghsoon Najd <onboarding@resend.dev>',
      to,
      subject: 'Your Ghsoon Najd account',
      html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px;color:#003C1B">
        <h1 style="font-size:20px">Welcome${name ? ', ' + name : ''}</h1>
        <p>An account was created for you. Sign in and change your password right away.</p>
        <p><strong>Email:</strong> ${to}<br/><strong>Temporary password:</strong> ${password}</p>
        <p><a href="${appUrl}" style="display:inline-block;background:#00C481;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open the app</a></p>
      </div>`,
    }),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
  if (req.method !== 'POST') return cors(new Response('Method not allowed', { status: 405 }));

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return cors(new Response('Unauthorized', { status: 401 }));
    }
    const body = (await req.json()) as InviteBody;
    if (!body.email || !body.role) {
      return cors(new Response('email and role required', { status: 400 }));
    }

    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify caller is a manager.
    const callerClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: callerUser } = await callerClient.auth.getUser();
    if (!callerUser?.user) return cors(new Response('Unauthorized', { status: 401 }));
    const { data: callerProfile } = await callerClient
      .from('profiles').select('role').eq('id', callerUser.user.id).maybeSingle();
    if (callerProfile?.role !== 'manager') {
      return cors(new Response('Forbidden', { status: 403 }));
    }

    // Create the user with a temporary password (admin API, service-role key).
    const admin = createClient(url, serviceKey);
    const password = tempPassword();
    const { data: invited, error: invErr } = await admin.auth.admin.createUser({
      email: body.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: body.full_name ?? null, must_change_password: true },
    });
    if (invErr || !invited?.user) {
      return cors(new Response(`create failed: ${invErr?.message ?? 'unknown'}`, { status: 500 }));
    }
    await sendWelcomeEmail(body.email, body.full_name ?? '', password);

    // Upsert the profile row so the role is set the moment they sign in.
    const profileRow = {
      id: invited.user.id,
      role: body.role,
      full_name: body.full_name ?? null,
      email: body.email,
      phone: body.phone ?? null,
      client_id: body.client_id ?? null,
      active: true,
    };
    const { error: upErr } = await admin.from('profiles').upsert(profileRow);
    if (upErr) return cors(new Response(`profile insert failed: ${upErr.message}`, { status: 500 }));

    return cors(new Response(JSON.stringify({ user_id: invited.user.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
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
