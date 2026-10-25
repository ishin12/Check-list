-- Verifier: old-app compatibility, signing RPC, notification counts, proof-path leak probe.
--   psql -X -q -d staging_verify -f supabase/tests/verify_compat.sql
-- Rolled back. Prints results.
begin;
\echo '--- get_signing_task(staging-token-1) AFTER 0006'
select * from public.get_signing_task('staging-token-1');

-- 0004's body verbatim, for before/after comparison.
create function public.vt_old_get_signing_task(p_token text)
returns table (task_title text, client_name text, worker_name text, scheduled_at timestamptz, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select t.title, c.name, p.full_name, t.scheduled_at, sl.expires_at
  from public.signing_links sl join public.tasks t on t.id = sl.task_id
  join public.clients c on c.id = t.client_id
  left join public.profiles p on p.id = t.assigned_worker_id
  where sl.token = p_token and sl.signed_at is null and sl.auto_approved_at is null and sl.expires_at > now();
$$;
\echo '--- 0004 body result (must equal the above)'
select * from public.vt_old_get_signing_task('staging-token-1');
select (select count(*) from (select * from public.get_signing_task('staging-token-1')
        except select * from public.vt_old_get_signing_task('staging-token-1')) x) as rows_differing_single_worker;
\echo '--- anon can call it'
set local role anon;
select task_title, worker_name from public.get_signing_task('staging-token-1');
reset role;

\echo '--- manager multi-assign task 3 -> [b3,b1,b2]; worker_name'
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select public.set_task_workers('30000000-0000-0000-0000-000000000003',
  array['00000000-0000-0000-0000-0000000000b3','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b2']::uuid[]);
reset role;
select worker_name from public.get_signing_task('staging-token-1');
select assigned_worker_id as lead_after from public.tasks where id='30000000-0000-0000-0000-000000000003';
\echo '--- notifications for those (expect b3? b2? once each; b1 none since lead kept)'
select user_id, count(*) from public.notifications where kind='task.assigned'
  and payload->>'task_id'='30000000-0000-0000-0000-000000000003' group by 1 order by 1;

\echo '=== OLD APP: manager inserts task with only assigned_worker_id'
select count(*) as notif_before from public.notifications \gset
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into public.tasks(id,title,client_id,assigned_worker_id,scheduled_at)
values ('30000000-0000-0000-0000-0000000000f1','old-app task','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b2',now());
reset role;
select 'task_workers rows for new task' as chk, worker_id from public.task_workers where task_id='30000000-0000-0000-0000-0000000000f1';
select 'notifications added by insert (expect exactly 1, to b2)' as chk, user_id, kind from public.notifications
 where payload->>'task_id'='30000000-0000-0000-0000-0000000000f1';

\echo '=== OLD APP: lead b2 updates status/results/started_at on own task'
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
update public.tasks set status='in_progress', started_at=now(), results='[{"taskId":"t1","checked":true}]'
 where id='30000000-0000-0000-0000-0000000000f1';
update public.tasks set status='submitted', finished_at=now() where id='30000000-0000-0000-0000-0000000000f1';
select status, results from public.tasks where id='30000000-0000-0000-0000-0000000000f1';
reset role;
select 'submitted notification payload' as chk, payload from public.notifications
 where kind='task.submitted' and payload->>'task_id'='30000000-0000-0000-0000-0000000000f1' limit 1;

\echo '=== OLD APP: manager reassigns by updating assigned_worker_id only (b2 -> b3)'
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
update public.tasks set assigned_worker_id='00000000-0000-0000-0000-0000000000b3' where id='30000000-0000-0000-0000-0000000000f1';
reset role;
select 'task_workers after old-style reassign' as chk, worker_id from public.task_workers
 where task_id='30000000-0000-0000-0000-0000000000f1' order by 2;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
select 'old lead b2 still sees task? (1 = stale access)' as chk, count(*) from public.tasks where id='30000000-0000-0000-0000-0000000000f1';
reset role;

\echo '=== RPC: removing the lead, lead moves to first remaining'
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select public.set_task_workers('30000000-0000-0000-0000-0000000000f1', array['00000000-0000-0000-0000-0000000000b1']::uuid[]);
reset role;
select t.assigned_worker_id as lead, (select array_agg(worker_id) from public.task_workers w where w.task_id=t.id) as workers
 from public.tasks t where t.id='30000000-0000-0000-0000-0000000000f1';

\echo '=== PROBE: worker inserts task_proofs on own task pointing at ANOTHER client''s object path'
-- b3 is on task 4 (client 3, approved). Victim object belongs to task 2 (client 2).
insert into storage.buckets(id,name,public) values ('proofs','proofs',false) on conflict do nothing;
insert into storage.objects(bucket_id,name) values ('proofs','30000000-0000-0000-0000-000000000002/secret.jpg');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
-- b1 is on task 1 (client 1). Plant a finish proof row on task 1 with the victim's path.
insert into public.task_proofs(task_id,kind,storage_path,mime,captured_at)
values ('30000000-0000-0000-0000-000000000001','finish','30000000-0000-0000-0000-000000000002/secret.jpg','image/jpeg',now());
reset role;
set local request.jwt.claim.sub = ''; update public.tasks set status='approved' where id='30000000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';  -- client 1 user
select 'client1 can read client2 object via planted proof row (1 = LEAK)' as chk, count(*)
 from storage.objects where name='30000000-0000-0000-0000-000000000002/secret.jpg';
reset role;

\echo '=== PROBE: non-lead co-worker can rewrite task columns (client_id, status)'
update public.tasks set status='in_progress' where id='30000000-0000-0000-0000-000000000001';
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select public.set_task_workers('30000000-0000-0000-0000-000000000001', array['00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b2']::uuid[]);
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
update public.tasks set status='approved', client_id='10000000-0000-0000-0000-000000000003'
 where id='30000000-0000-0000-0000-000000000001';
select 'b2 (non-lead) set status approved + moved client? rows' as chk, count(*) from public.tasks where status='approved' and client_id='10000000-0000-0000-0000-000000000003' and id='30000000-0000-0000-0000-000000000001';
reset role;
rollback;
