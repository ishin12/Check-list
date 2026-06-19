# Supabase setup (one-time)

The app now requires a Supabase project for auth, data, and media storage. The
free tier is plenty for this scale (<10 workers, <50 clients, <500 tasks/mo).

## 1. Create the project
1. Sign up at https://supabase.com and create a new project.
2. From **Project Settings → API**, copy the **Project URL** and **anon public** key.
3. In the repo, copy `.env.example` to `.env.local` and paste them in:
   ```
   VITE_SUPABASE_URL=https://<your-project>.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```

## 2. Run the migration
1. Open the **SQL Editor** in the Supabase dashboard.
2. Paste the contents of `supabase/migrations/0001_init.sql` and run it.
   This creates every table, RLS policy, audit trigger, and the
   `task.assigned` / `task.submitted` notification triggers.

## 3. Create the storage bucket
1. Go to **Storage → New bucket**.
2. Name it `proofs`. Leave it **private** (uncheck "public bucket").
3. Add a policy: `authenticated` users can `insert` / `select` objects whose
   path begins with a `task_id` they own (worker on assigned tasks, manager
   always). The simplest start is to enable RLS on the bucket and use the
   default "auth.uid() is not null" policy — RLS on `task_proofs` already gates
   what shows up in the UI.

## 4. Make yourself the first manager
After you sign in for the first time (magic link), a row gets inserted into
`auth.users` but **not** into `public.profiles`. Open the SQL Editor and run:
```sql
insert into public.profiles (id, role, full_name, email, active)
values ('<your-auth.uid>', 'manager', 'Your Name', 'you@example.com', true);
```
You can find your `auth.uid()` in **Authentication → Users**.

## 5. (Optional) Email notifications via Resend
The in-app inbox works out of the box via the `notifications` table + Realtime.
For email, deploy the `notify` Edge Function:
```
supabase functions deploy notify --no-verify-jwt
supabase secrets set RESEND_API_KEY=re_xxx
supabase secrets set RESEND_FROM='Check-list <noreply@your-domain.com>'
```
Then in **Database → Webhooks**, create a webhook on `notifications` for
INSERT events pointing at the `notify` function. Now every in-app notification
also fans out to email.

## 6. (Optional) Invite-from-the-app via Edge Function
The manager's `/users` screen calls a small Edge Function to invite workers
and clients without dropping into SQL:
```
supabase functions deploy invite-user
supabase secrets set APP_URL=https://your-app-url.example
```
Once deployed, you can invite team members straight from **Settings → Team & clients**.

## 7. Run the app
```
npm install
npm run dev
```

## Roles in this app
- **Manager** — full access; created by inserting a `profiles` row with `role='manager'`.
- **Worker** — sees only their own tasks; create by inviting via the dashboard,
  then inserting `role='worker'` into `profiles` once they appear in `auth.users`.
- **Client** — read-only portal; create a `clients` row first, then a
  `profiles` row with `role='client'` and `client_id` pointing at it.
