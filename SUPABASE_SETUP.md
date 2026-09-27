# Try the demo first (no setup)

The app ships with a built-in **demo mode** that runs against an in-browser
fake backend pre-seeded with sample data. Use it to try every feature before
deciding whether to wire up real Supabase.

```
npm install
npm run dev
```

On `/login` enter any email and tap "Send magic link" — you'll be signed in
instantly as the demo manager. Use the **Demo** chip in the header to switch
between Manager / Worker / Client roles. Everything persists across reloads
(IndexedDB). **Settings → Reset demo data** wipes it back to the seed.

The demo mirrors the real schema and triggers in `supabase/migrations/0001_init.sql`
1:1, so behaviour you see is what you'll get in production.

---

# Going live with Supabase

Once you've validated the app and want real auth, persistence, and email:

The free tier is plenty for this scale (<10 workers, <50 clients, <500 tasks/mo).

## 1. Create the project
1. Sign up at https://supabase.com and create a new project.
2. From **Project Settings → API**, copy the **Project URL** and **anon public** key.
3. In the repo, copy `.env.example` to `.env.local` and paste them in. **Also
   set `VITE_DEMO_MODE=0`** to switch the app off demo mode:
   ```
   VITE_DEMO_MODE=0
   VITE_SUPABASE_URL=https://<your-project>.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```

## 2. Run the migrations (in order)
Open the **SQL Editor** and run each file's contents, in this order:
1. `supabase/migrations/0001_init.sql` — core tables, RLS, audit + notification triggers.
2. `supabase/migrations/0002_recurrence.sql` — recurring tasks.
3. `supabase/migrations/0003_extra_work.sql` — the worker "extra work done" log.
4. `supabase/migrations/0004_signing.sql` — WhatsApp signing links, `app_settings`,
   `approval_method`, and the two public sign RPCs.
5. `supabase/migrations/0005_roles.sql` — adds the `supervisor` and `finance` roles.
   **Run it on its own and let it finish before step 6** (Postgres can't use a new
   enum value in the same transaction that adds it).
6. `supabase/migrations/0006_field_ops.sql` — projects, employees, visits, project
   tasks, recurring items, task photos, labor allocation (≤ 1.0 day per worker,
   enforced in the database), month close and visit reports.

Test the migrations locally before running them on the live project:
```
PGHOST=... PGPORT=... PGUSER=postgres npm run test:db
```
This builds a throwaway database, applies every migration, and runs the
business-rule and acceptance tests in `supabase/tests/`. Never point it at production.

## 3. Create the storage bucket
1. **Storage → New bucket** → name `proofs`, **private** (uncheck "public bucket").
2. Enable RLS; the default "auth.uid() is not null" insert/select policy is enough
   — RLS on `task_proofs` already controls what shows in the UI.

## 4. Make yourself the first manager
Email/password users are created by the `invite-user` function, but you need a
first manager to bootstrap. Create a user in **Authentication → Users → Add user**
(set a password), then in SQL Editor:
```sql
insert into public.profiles (id, role, full_name, email, active)
values ('<your-auth.uid>', 'manager', 'Your Name', 'you@example.com', true);
```

## 5. Deploy the Edge Functions
```
supabase functions deploy notify --no-verify-jwt
supabase functions deploy invite-user
supabase functions deploy set-password
supabase functions deploy send-sign-link
supabase functions deploy send-reminder --no-verify-jwt
supabase functions deploy expire-signing --no-verify-jwt
```
Secrets (set once):
```
supabase secrets set RESEND_API_KEY=re_xxx
supabase secrets set RESEND_FROM='Ghsoon Najd <noreply@your-domain.com>'
supabase secrets set APP_URL=https://app.ghsoonnajd.com    # or the Pages URL
supabase secrets set WHATSAPP_TOKEN=<permanent token>
supabase secrets set WHATSAPP_PHONE_NUMBER_ID=<phone number id>
```
> No `WHATSAPP_TEMPLATE_NAMESPACE` — the Cloud API identifies templates by
> name + language code only.

Create a **Database Webhook** on `notifications` (INSERT) → `notify` so in-app
notifications also email.

WhatsApp client signing is **off** by default (`VITE_FEATURE_WHATSAPP_SIGNING=0`).
While it's off, no signing links are sent, so `send-reminder` and `expire-signing`
have nothing to act on and nothing is auto-approved. Set the flag to `1` in the
build environment to turn it back on.

## 6. Schedule the cron sweeps (pg_cron)
In SQL Editor (enable `pg_cron` + `pg_net` extensions first under Database → Extensions):
```sql
select cron.schedule('expire-signing', '0 * * * *', $$
  select net.http_post(
    url := 'https://<project-ref>.functions.supabase.co/expire-signing',
    headers := '{"Authorization":"Bearer <service-role-key>"}'::jsonb
  );$$);
select cron.schedule('send-reminder', '15 * * * *', $$
  select net.http_post(
    url := 'https://<project-ref>.functions.supabase.co/send-reminder',
    headers := '{"Authorization":"Bearer <service-role-key>"}'::jsonb
  );$$);
```

## 7. WhatsApp templates
Submit and get approved (WhatsApp Manager → Message Templates):
- `ghsoon_najd_sign_request` — UTILITY, body has `{{1}}` name, `{{2}}` visit,
  `{{3}}` days; single **dynamic URL button** with base `https://<host>/sign/`
  and `{{1}}` = token. **No link in the body.**
- `ghsoon_najd_sign_reminder` — UTILITY, body `{{1}}` visit, `{{2}}` hours; same
  dynamic URL button.

## 8. Deploy the frontend
Set in `.env.production` (or the GitHub Pages build env):
```
VITE_DEMO_MODE=0
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```
The GitHub Pages action builds and publishes. The `public/404.html` SPA
fallback makes the real `/sign/<token>` path resolve on refresh.

## Roles in this app
- **Manager** — full access; first one inserted by hand (step 4), the rest invited
  from **Settings → Team & clients** (emails a temporary password).
- **Worker** — sees only their own tasks; invited from the Users screen.
- **Client** — read-only portal; create a `clients` row (with a WhatsApp phone),
  then invite with `role='client'` linked to that client.

## Signing flow at a glance
1. Worker submits a task → `send-sign-link` creates a `signing_links` row and
   sends `ghsoon_najd_sign_request` to the client's WhatsApp.
2. Client taps the link → `/sign/<token>` → signs → task becomes **approved**
   with `approval_method = 'client_signature'`.
3. If no signature within `app_settings.signing_expiry_days` (default 3, editable
   in **Settings → Client signing window**), the hourly `expire-signing` cron
   auto-approves it with `approval_method = 'auto_no_response'` — rendered
   distinctly (gold "no response" pill, gold report band) so it's never mistaken
   for a real signature.
4. 24h before expiry, `send-reminder` sends `ghsoon_najd_sign_reminder` once.
