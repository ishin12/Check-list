-- Verifier: adversarial RLS matrix for 0005/0006. Run against the DB built by test:db:
--   psql -X -q -d staging_verify -f supabase/tests/verify_rls.sql
-- Everything is rolled back. Prints one line per probe: who | probe | result.
-- Result is a row count (queries / DML) or ERR:<message>.
begin;
create schema vt;
create table vt.res (n serial, who text, probe text, result text);
create function vt.run(p_uid text, p_who text, p_probe text, p_sql text) returns void
language plpgsql as $$
declare c bigint; r text;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid, ''), true);
  execute case when p_uid is null then 'set local role anon' else 'set local role authenticated' end;
  begin
    if p_sql ~* '^\s*select' then
      execute 'select count(*) from (' || p_sql || ') q' into c; r := c::text;
    else
      execute p_sql; get diagnostics c = row_count; r := c::text;
    end if;
  exception when others then r := 'ERR:' || sqlerrm;
  end;
  reset role;
  insert into vt.res(who, probe, result) values (p_who, p_probe, r);
end $$;

-- extra fixtures (superuser): a second client user + client 2 user, an inactive worker, a client profile
insert into auth.users(id) values ('00000000-0000-0000-0000-0000000000c2'), ('00000000-0000-0000-0000-0000000000b9');
insert into public.profiles(id, role, full_name, client_id, active) values
 ('00000000-0000-0000-0000-0000000000c2','client','Client2','10000000-0000-0000-0000-000000000002',true),
 ('00000000-0000-0000-0000-0000000000b9','worker','Inactive',null,false);
-- storage objects for task 1 (not approved), task 3 (submitted), task 4 (approved), task 2
insert into storage.buckets(id,name,public) values ('proofs','proofs',false) on conflict do nothing;
insert into storage.objects(bucket_id,name) values
 ('proofs','30000000-0000-0000-0000-000000000001/start-x.jpg'),
 ('proofs','30000000-0000-0000-0000-000000000002/start-a.jpeg'),
 ('proofs','30000000-0000-0000-0000-000000000003/finish-c.jpeg'),
 ('proofs','30000000-0000-0000-0000-000000000004/finish-z.jpeg');
insert into public.task_proofs(task_id,kind,storage_path,mime,captured_at) values
 ('30000000-0000-0000-0000-000000000004','finish','30000000-0000-0000-0000-000000000004/finish-z.jpeg','image/jpeg',now());

-- manager sets task 1 -> [b1,b2]
select vt.run('00000000-0000-0000-0000-0000000000a1','a1','set_task_workers(t1,[b1,b2])',
  $q$select public.set_task_workers('30000000-0000-0000-0000-000000000001', array['00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b2']::uuid[])$q$);

-- the matrix: for each identity run the same probes
do $$
declare
  u record; t1 text := '30000000-0000-0000-0000-000000000001';
  c1 text := '10000000-0000-0000-0000-000000000001';
begin
  for u in select * from (values
    ('a1','00000000-0000-0000-0000-0000000000a1'),
    ('b1','00000000-0000-0000-0000-0000000000b1'),
    ('b2','00000000-0000-0000-0000-0000000000b2'),
    ('b3','00000000-0000-0000-0000-0000000000b3'),
    ('c1','00000000-0000-0000-0000-0000000000c1'),
    ('c2','00000000-0000-0000-0000-0000000000c2'),
    ('anon',null)) v(w,id)
  loop
    perform vt.run(u.id,u.w,'select task1', format('select 1 from public.tasks where id=%L', t1));
    perform vt.run(u.id,u.w,'select all tasks', 'select 1 from public.tasks');
    perform vt.run(u.id,u.w,'update task1 description', format('update public.tasks set description=%L where id=%L', 'by '||u.w, t1));
    perform vt.run(u.id,u.w,'select client1', format('select 1 from public.clients where id=%L', c1));
    perform vt.run(u.id,u.w,'select all clients', 'select 1 from public.clients');
    perform vt.run(u.id,u.w,'select client_notes c1', format('select 1 from public.client_notes where client_id=%L', c1));
    perform vt.run(u.id,u.w,'insert client_note c1', format('insert into public.client_notes(client_id,body) values (%L,%L)', c1, 'n by '||u.w));
    perform vt.run(u.id,u.w,'select task_proofs t1', format('select 1 from public.task_proofs where task_id=%L', t1));
    perform vt.run(u.id,u.w,'insert task_proof t1', format($f$insert into public.task_proofs(task_id,kind,storage_path,mime,captured_at) values (%L,'start',%L,'image/jpeg',now())$f$, t1, t1||'/start-'||u.w||'.jpg'));
    perform vt.run(u.id,u.w,'select signing_links t1', format('select 1 from public.signing_links where task_id=%L', t1));
    perform vt.run(u.id,u.w,'insert signing_link t1', format($f$insert into public.signing_links(task_id,token,expires_at) values (%L,%L,now()+interval '1 day')$f$, t1, 'tok-'||u.w));
    perform vt.run(u.id,u.w,'select task_workers (all)', 'select 1 from public.task_workers');
    perform vt.run(u.id,u.w,'select task_workers t1', format('select 1 from public.task_workers where task_id=%L', t1));
    perform vt.run(u.id,u.w,'insert task_workers self->t2', format($f$insert into public.task_workers(task_id,worker_id) values ('30000000-0000-0000-0000-000000000002',%L)$f$, u.id));
    perform vt.run(u.id,u.w,'insert task_workers self->t1', format($f$insert into public.task_workers(task_id,worker_id) values (%L,%L)$f$, t1, u.id));
    if u.w <> 'a1' then perform vt.run(u.id,u.w,'delete task_workers t1', format('delete from public.task_workers where task_id=%L', t1)); end if;
    if u.w <> 'a1' then perform vt.run(u.id,u.w,'set_task_workers t2->self', format($f$select public.set_task_workers('30000000-0000-0000-0000-000000000002', array[%L]::uuid[])$f$, u.id)); end if;
    if u.w <> 'a1' then perform vt.run(u.id,u.w,'update lead of t1 to self', format('update public.tasks set assigned_worker_id=%L where id=%L', u.id, t1)); end if;
    perform vt.run(u.id,u.w,'select all profiles', 'select 1 from public.profiles');
    perform vt.run(u.id,u.w,'select profile b1', $q$select 1 from public.profiles where id='00000000-0000-0000-0000-0000000000b1'$q$);
    perform vt.run(u.id,u.w,'select profile b3', $q$select 1 from public.profiles where id='00000000-0000-0000-0000-0000000000b3'$q$);
    perform vt.run(u.id,u.w,'select storage t1 folder', format($f$select 1 from storage.objects where bucket_id='proofs' and name like %L$f$, t1||'/%'));
    perform vt.run(u.id,u.w,'select storage ALL', $q$select 1 from storage.objects where bucket_id='proofs'$q$);
    perform vt.run(u.id,u.w,'insert storage t1 folder', format($f$insert into storage.objects(bucket_id,name) values ('proofs',%L)$f$, t1||'/finish-'||u.w||'.jpg'));
    perform vt.run(u.id,u.w,'insert storage t2 folder', format($f$insert into storage.objects(bucket_id,name) values ('proofs',%L)$f$, '30000000-0000-0000-0000-000000000002/start-'||u.w||'.jpg'));
    perform vt.run(u.id,u.w,'insert storage non-uuid folder', format($f$insert into storage.objects(bucket_id,name) values ('proofs',%L)$f$, 'evil/'||u.w||'.jpg'));
    perform vt.run(u.id,u.w,'insert storage root file', format($f$insert into storage.objects(bucket_id,name) values ('proofs',%L)$f$, u.w||'.jpg'));
    perform vt.run(u.id,u.w,'delete storage t1 folder', format($f$delete from storage.objects where bucket_id='proofs' and name like %L$f$, t1||'/start-x%'));
  end loop;
end $$;

-- b2 removed from task 1 (manager), then b2 re-probes
select vt.run('00000000-0000-0000-0000-0000000000a1','a1','set_task_workers(t1,[b1])',
  $q$select public.set_task_workers('30000000-0000-0000-0000-000000000001', array['00000000-0000-0000-0000-0000000000b1']::uuid[])$q$);
select vt.run('00000000-0000-0000-0000-0000000000b2','b2-removed','select task1', $q$select 1 from public.tasks where id='30000000-0000-0000-0000-000000000001'$q$);
select vt.run('00000000-0000-0000-0000-0000000000b2','b2-removed','update task1', $q$update public.tasks set description='x' where id='30000000-0000-0000-0000-000000000001'$q$);
select vt.run('00000000-0000-0000-0000-0000000000b2','b2-removed','select client1', $q$select 1 from public.clients where id='10000000-0000-0000-0000-000000000001'$q$);
select vt.run('00000000-0000-0000-0000-0000000000b2','b2-removed','profile b1', $q$select 1 from public.profiles where id='00000000-0000-0000-0000-0000000000b1'$q$);
select vt.run('00000000-0000-0000-0000-0000000000b2','b2-removed','storage t1 folder', $q$select 1 from storage.objects where name like '30000000-0000-0000-0000-000000000001/%'$q$);
select vt.run('00000000-0000-0000-0000-0000000000b2','b2-removed','task_workers t1', $q$select 1 from public.task_workers where task_id='30000000-0000-0000-0000-000000000001'$q$);
-- set_task_workers validation (manager)
select vt.run('00000000-0000-0000-0000-0000000000a1','a1','set_task_workers null array', $q$select public.set_task_workers('30000000-0000-0000-0000-000000000001', null)$q$);
select vt.run('00000000-0000-0000-0000-0000000000a1','a1','set_task_workers empty', $q$select public.set_task_workers('30000000-0000-0000-0000-000000000001', array[]::uuid[])$q$);
select vt.run('00000000-0000-0000-0000-0000000000a1','a1','set_task_workers [null]', $q$select public.set_task_workers('30000000-0000-0000-0000-000000000001', array[null]::uuid[])$q$);
select vt.run('00000000-0000-0000-0000-0000000000a1','a1','set_task_workers inactive', $q$select public.set_task_workers('30000000-0000-0000-0000-000000000001', array['00000000-0000-0000-0000-0000000000b9']::uuid[])$q$);
select vt.run('00000000-0000-0000-0000-0000000000a1','a1','set_task_workers manager id', $q$select public.set_task_workers('30000000-0000-0000-0000-000000000001', array['00000000-0000-0000-0000-0000000000a1']::uuid[])$q$);
select vt.run('00000000-0000-0000-0000-0000000000a1','a1','set_task_workers client id', $q$select public.set_task_workers('30000000-0000-0000-0000-000000000001', array['00000000-0000-0000-0000-0000000000c1']::uuid[])$q$);
select vt.run('00000000-0000-0000-0000-0000000000a1','a1','set_task_workers unknown uuid', $q$select public.set_task_workers('30000000-0000-0000-0000-000000000001', array[gen_random_uuid()])$q$);
select vt.run('00000000-0000-0000-0000-0000000000a1','a1','set_task_workers unknown task', $q$select public.set_task_workers(gen_random_uuid(), array['00000000-0000-0000-0000-0000000000b1']::uuid[])$q$);
select vt.run('00000000-0000-0000-0000-0000000000a1','a1','set_task_workers dup ids', $q$select public.set_task_workers('30000000-0000-0000-0000-000000000001', array['00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b1']::uuid[])$q$);
select vt.run(null,'anon','set_task_workers', $q$select public.set_task_workers('30000000-0000-0000-0000-000000000001', array['00000000-0000-0000-0000-0000000000b1']::uuid[])$q$);
select vt.run(null,'anon','is_task_worker', $q$select public.is_task_worker('30000000-0000-0000-0000-000000000001')$q$);
-- c1 / task_workers of approved task 4 (client 3) and of client-1 task; also c1 on approved own task
update public.tasks set status='approved' where id='30000000-0000-0000-0000-000000000003';
select vt.run('00000000-0000-0000-0000-0000000000c1','c1','task_workers of task3 (own, approved)', $q$select 1 from public.task_workers where task_id='30000000-0000-0000-0000-000000000003'$q$);
select vt.run('00000000-0000-0000-0000-0000000000c1','c1','task_workers of other clients tasks', $q$select 1 from public.task_workers where task_id in ('30000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000004')$q$);
select vt.run('00000000-0000-0000-0000-0000000000c1','c1','storage task3 finish (approved own)', $q$select 1 from storage.objects where name='30000000-0000-0000-0000-000000000003/finish-c.jpeg'$q$);
select vt.run('00000000-0000-0000-0000-0000000000c1','c1','storage task4 finish (other client)', $q$select 1 from storage.objects where name='30000000-0000-0000-0000-000000000004/finish-z.jpeg'$q$);
select vt.run('00000000-0000-0000-0000-0000000000c1','c1','storage task1 (not approved)', $q$select 1 from storage.objects where name like '30000000-0000-0000-0000-000000000001/%'$q$);

select who, probe, result from vt.res order by n;
rollback;
