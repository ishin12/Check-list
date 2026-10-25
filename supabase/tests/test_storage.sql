-- Storage bucket + policy tests. Everything runs in a transaction that is
-- rolled back. Uses seed rows from staging_seed.sql.
begin;

-- Bucket exists and is private.
do $$ begin
  if not exists (select 1 from storage.buckets where id = 'proofs' and public = false and file_size_limit = 52428800) then
    raise exception 'proofs bucket missing or not private';
  end if;
end $$;

-- Extra data (superuser): an approved task for client 1 with a finish proof.
insert into public.tasks (id, title, client_id, assigned_worker_id, scheduled_at, status)
values ('30000000-0000-0000-0000-0000000000f1', 'Approved c1', '10000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-0000000000b1', now(), 'approved');
insert into public.task_proofs (task_id, kind, storage_path, mime, captured_at) values
  ('30000000-0000-0000-0000-0000000000f1', 'finish', '30000000-0000-0000-0000-0000000000f1/finish-x.jpeg', 'image/jpeg', now()),
  ('30000000-0000-0000-0000-0000000000f1', 'start',  '30000000-0000-0000-0000-0000000000f1/start-x.jpeg',  'image/jpeg', now());
insert into storage.objects (bucket_id, name) values
  ('proofs', '30000000-0000-0000-0000-0000000000f1/finish-x.jpeg'),
  ('proofs', '30000000-0000-0000-0000-0000000000f1/start-x.jpeg'),
  ('proofs', '30000000-0000-0000-0000-000000000002/start-a.jpeg');   -- task 2 (worker b2)

-- Helper behaviour.
do $$ begin
  if public.proof_object_task_id('not-a-uuid/x.jpg') is not null then raise exception 'bad uuid not null'; end if;
  if public.proof_object_task_id(null) is not null then raise exception 'null name not null'; end if;
  if public.proof_object_task_id('30000000-0000-0000-0000-000000000003/a.jpg') is distinct from '30000000-0000-0000-0000-000000000003'::uuid
    then raise exception 'good uuid not parsed'; end if;
end $$;

-- Worker b1: can insert under task 3, cannot under task 2, cannot read b2's objects.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
insert into storage.objects (bucket_id, name) values ('proofs', '30000000-0000-0000-0000-000000000003/finish-new.jpeg');
do $$ declare ok boolean := false; n int; begin
  begin
    insert into storage.objects (bucket_id, name) values ('proofs', '30000000-0000-0000-0000-000000000002/finish-evil.jpeg');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'b1 could insert into b2 task folder'; end if;
  ok := false;
  begin
    insert into storage.objects (bucket_id, name) values ('proofs', 'garbage/finish-evil.jpeg');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'b1 could insert under a non-uuid folder'; end if;
  select count(*) into n from storage.objects where name like '30000000-0000-0000-0000-000000000002/%';
  if n <> 0 then raise exception 'b1 can read b2 objects (%)', n; end if;
  select count(*) into n from storage.objects where name = '30000000-0000-0000-0000-000000000003/finish-new.jpeg';
  if n <> 1 then raise exception 'b1 cannot read own object'; end if;
end $$;
reset role;

-- Worker b2: cannot insert into task 3's folder.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ declare ok boolean := false; begin
  begin
    insert into storage.objects (bucket_id, name) values ('proofs', '30000000-0000-0000-0000-000000000003/finish-evil.jpeg');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'b2 could insert into task 3 folder'; end if;
end $$;
reset role;

-- Manager: can insert anywhere and read everything.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into storage.objects (bucket_id, name) values ('proofs', '30000000-0000-0000-0000-000000000002/finish-mgr.jpeg');
do $$ declare n int; begin
  select count(*) into n from storage.objects where bucket_id = 'proofs';
  if n < 5 then raise exception 'manager sees only % objects', n; end if;
end $$;
reset role;

-- Client c1: sees only the finish object of its approved task.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$ declare n int; ok boolean := false; begin
  select count(*) into n from storage.objects;
  if n <> 1 then raise exception 'client sees % objects, expected 1', n; end if;
  if not exists (select 1 from storage.objects where name = '30000000-0000-0000-0000-0000000000f1/finish-x.jpeg')
    then raise exception 'client cannot see approved finish object'; end if;
  begin
    insert into storage.objects (bucket_id, name) values ('proofs', '30000000-0000-0000-0000-0000000000f1/finish-y.jpeg');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'client could insert'; end if;
end $$;
reset role;

-- Anonymous: nothing.
set local role anon;
reset request.jwt.claim.sub;
do $$ declare n int; ok boolean := false; begin
  select count(*) into n from storage.objects;
  if n <> 0 then raise exception 'anon sees % objects', n; end if;
  begin
    insert into storage.objects (bucket_id, name) values ('proofs', '30000000-0000-0000-0000-000000000003/finish-anon.jpeg');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'anon could insert'; end if;
end $$;
reset role;

rollback;
\echo storage tests ok

-- A proof row whose path points into another task's folder must not let the
-- planting task's client read that object.
begin;
insert into storage.objects (bucket_id, name) values
  ('proofs', '30000000-0000-0000-0000-000000000002/finish-other.jpeg');
update public.tasks set status = 'approved' where id = '30000000-0000-0000-0000-000000000003';
insert into public.task_proofs (task_id, kind, storage_path, mime, captured_at)
values ('30000000-0000-0000-0000-000000000003', 'finish',
        '30000000-0000-0000-0000-000000000002/finish-other.jpeg', 'image/jpeg', now());
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$ begin
  if exists (select 1 from storage.objects
             where name = '30000000-0000-0000-0000-000000000002/finish-other.jpeg') then
    raise exception 'FAIL: client read another task''s object via a planted proof row';
  end if;
end $$;
rollback;
