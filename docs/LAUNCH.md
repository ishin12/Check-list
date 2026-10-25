# Launch runbook: photos, multi-worker, location, Urdu

Production = Supabase project `qyznhoimffltdigickjl` + GitHub Pages build of
branch `claude/elegant-lovelace-I02rh` (every push to it auto-deploys).
Work branch: `claude/youthful-turing-9jo5ad`.

## 0. Before you start
- Owner confirmation to touch production.
- Database access (connection string or SQL editor) and a Supabase access token
  for deploying `send-sign-link`. Never paste secrets into chat or the repo.

## 1. Backup (always, even with no live data)
```sh
supabase db dump --db-url "$PROD_DB_URL" -f backup-$(date +%Y%m%d-%H%M)-schema.sql
supabase db dump --db-url "$PROD_DB_URL" --data-only -f backup-$(date +%Y%m%d-%H%M)-data.sql
```
Record row counts:
```sql
select 'profiles', count(*) from profiles union all select 'clients', count(*) from clients
union all select 'templates', count(*) from templates union all select 'tasks', count(*) from tasks
union all select 'task_proofs', count(*) from task_proofs union all select 'client_notes', count(*) from client_notes
union all select 'notifications', count(*) from notifications union all select 'audit_log', count(*) from audit_log
union all select 'signing_links', count(*) from signing_links;
select id, public from storage.buckets;
select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects';
```
If a `proofs` bucket already exists, download its objects first.

## 2. Migrations (in order, each in one transaction)
`0005_storage.sql`, `0006_task_workers.sql`, `0007_task_location.sql`.
Then re-run the row-count query: counts must be identical (notifications and
audit_log may only grow). Check `select count(*) from task_workers` = tasks count.

## 3. Edge function
`supabase functions deploy send-sign-link` (adds the multi-worker permission check).
WhatsApp templates are unchanged.

## 4. Deploy the app
Merge `claude/youthful-turing-9jo5ad` into `claude/elegant-lovelace-I02rh` and push;
the Pages workflow builds and deploys. Old cached PWA copies keep working against
the new schema (assigned_worker_id is still written and mirrored).

## 5. Smoke test on the live site
Log in as manager → view jobs → create a job with two test workers and a map link
→ open "Open in Google Maps" → switch to Urdu and back → as a test worker upload a
start photo from a phone. Use test accounts/clients only; do not trigger WhatsApp
sends to real numbers. Delete the test job, its photos and test accounts after.

## Rollback
- App: revert the merge commit on `claude/elegant-lovelace-I02rh` and push (auto-redeploys).
- Edge function: redeploy `send-sign-link` from the previous commit.
- DB: run the ROLLBACK blocks at the bottom of 0007, 0006, 0005 (in that order).
  They drop only the new policies, triggers, functions and constraints and restore
  the original `get_signing_task` / `notify_task_submitted`. The `proofs` bucket,
  the `task_workers` table and the location columns are kept (they hold data);
  dropping them needs owner approval. The old app ignores them.
- Last resort: restore from the step-1 backup.
