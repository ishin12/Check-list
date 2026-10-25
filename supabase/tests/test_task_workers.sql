-- Multi-worker tasks (migration 0006). Everything runs in one transaction that
-- is rolled back. Impersonation: set local role + request.jwt.claim.sub.
begin;

-- Backfill: every seeded task has exactly its original worker.
do $$ declare bad int; begin
  select count(*) into bad from public.tasks t
  where (select count(*) from public.task_workers w where w.task_id = t.id) <> 1
     or not exists (select 1 from public.task_workers w
                    where w.task_id = t.id and w.worker_id = t.assigned_worker_id);
  if bad > 0 then raise exception 'backfill: % tasks do not have exactly their lead', bad; end if;
end $$;

-- Manager assigns b1 + b2 to task 1.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select public.set_task_workers('30000000-0000-0000-0000-000000000001',
  array['00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2']::uuid[]);

do $$ declare n int; begin
  select count(*) into n from public.task_workers where task_id = '30000000-0000-0000-0000-000000000001';
  if n <> 2 then raise exception 'expected 2 workers, got %', n; end if;
end $$;

-- b2 sees task 1, its client, notes and the co-worker profile; exactly one notification.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ declare n int; begin
  select count(*) into n from public.tasks where id = '30000000-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'b2 cannot see task 1'; end if;
  select count(*) into n from public.clients where id = '10000000-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'b2 cannot see client 1'; end if;
  select count(*) into n from public.client_notes where client_id = '10000000-0000-0000-0000-000000000001';
  if n < 1 then raise exception 'b2 cannot see client notes'; end if;
  select count(*) into n from public.profiles where id = '00000000-0000-0000-0000-0000000000b1';
  if n <> 1 then raise exception 'b2 cannot see co-worker profile'; end if;
  select count(*) into n from public.notifications
   where user_id = '00000000-0000-0000-0000-0000000000b2' and kind = 'task.assigned'
     and payload->>'task_id' = '30000000-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'b2 expected exactly 1 task.assigned notification, got %', n; end if;
  -- b2 can work on the task (update) but not reassign it
  update public.tasks set description = 'by b2' where id = '30000000-0000-0000-0000-000000000001';
  if not found then raise exception 'b2 cannot update task 1'; end if;
end $$;

-- b2 cannot reassign.
do $$ begin
  begin
    update public.tasks set assigned_worker_id = '00000000-0000-0000-0000-0000000000b2'
      where id = '30000000-0000-0000-0000-000000000001';
    raise exception 'b2 reassigned a task';
  exception when insufficient_privilege then null; end;
end $$;

-- b2 cannot call set_task_workers, nor write task_workers.
do $$ begin
  begin
    perform public.set_task_workers('30000000-0000-0000-0000-000000000001',
      array['00000000-0000-0000-0000-0000000000b2']::uuid[]);
    raise exception 'b2 called set_task_workers';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.task_workers (task_id, worker_id)
      values ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000b2');
    raise exception 'b2 inserted into task_workers';
  exception when insufficient_privilege then null; end;
end $$;

-- b3 still cannot see task 1 or its co-workers.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b3';
do $$ declare n int; begin
  select count(*) into n from public.tasks where id = '30000000-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'b3 can see task 1'; end if;
  select count(*) into n from public.task_workers where task_id = '30000000-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'b3 can see task_workers of task 1'; end if;
  select count(*) into n from public.profiles where id = '00000000-0000-0000-0000-0000000000b1';
  if n <> 0 then raise exception 'b3 can see unrelated worker profile'; end if;
end $$;

-- The client user of client 1 can see the worker list of its task.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$ declare n int; begin
  select count(*) into n from public.task_workers where task_id = '30000000-0000-0000-0000-000000000001';
  if n <> 2 then raise exception 'client cannot see task_workers of its task, got %', n; end if;
end $$;

-- Validation: empty list, non-worker, unknown task.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  begin
    perform public.set_task_workers('30000000-0000-0000-0000-000000000001', array[]::uuid[]);
    raise exception 'empty list accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.set_task_workers('30000000-0000-0000-0000-000000000001',
      array['00000000-0000-0000-0000-0000000000c1']::uuid[]);
    raise exception 'client profile accepted as worker';
  exception when invalid_parameter_value then null; end;
end $$;

-- Changing lead: replace with b3 only -> b3 becomes lead and is notified once; b1,b2 removed.
select public.set_task_workers('30000000-0000-0000-0000-000000000001',
  array['00000000-0000-0000-0000-0000000000b3']::uuid[]);
reset role;  -- managers cannot read others' notifications; check as superuser
do $$ declare n int; l uuid; begin
  select assigned_worker_id into l from public.tasks where id = '30000000-0000-0000-0000-000000000001';
  if l <> '00000000-0000-0000-0000-0000000000b3' then raise exception 'lead not moved to b3'; end if;
  select count(*) into n from public.notifications
   where user_id = '00000000-0000-0000-0000-0000000000b3' and kind = 'task.assigned'
     and payload->>'task_id' = '30000000-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'b3 expected 1 notification, got %', n; end if;
  select count(*) into n from public.task_workers where task_id = '30000000-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'expected 1 worker row, got %', n; end if;
end $$;

-- Removing b2 removes access (b2 was removed above).
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ declare n int; begin
  select count(*) into n from public.tasks where id = '30000000-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'b2 still sees task 1 after removal'; end if;
end $$;

-- A task inserted the old way (assigned_worker_id only) gets its task_workers row
-- and exactly one notification for the lead.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into public.tasks (id, title, client_id, assigned_worker_id, scheduled_at)
values ('30000000-0000-0000-0000-0000000000f1', 'Legacy insert',
        '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', now());
reset role;
do $$ declare n int; begin
  select count(*) into n from public.task_workers
   where task_id = '30000000-0000-0000-0000-0000000000f1' and worker_id = '00000000-0000-0000-0000-0000000000b2';
  if n <> 1 then raise exception 'legacy insert missing task_workers row'; end if;
  select count(*) into n from public.notifications
   where user_id = '00000000-0000-0000-0000-0000000000b2'
     and payload->>'task_id' = '30000000-0000-0000-0000-0000000000f1';
  if n <> 1 then raise exception 'legacy insert: expected 1 notification, got %', n; end if;
end $$;

-- Legacy lead change by a manager is mirrored.
set local role authenticated;
update public.tasks set assigned_worker_id = '00000000-0000-0000-0000-0000000000b1'
  where id = '30000000-0000-0000-0000-0000000000f1';
do $$ declare n int; begin
  select count(*) into n from public.task_workers
   where task_id = '30000000-0000-0000-0000-0000000000f1' and worker_id = '00000000-0000-0000-0000-0000000000b1';
  if n <> 1 then raise exception 'lead change not mirrored'; end if;
end $$;
reset role;

-- Submitting a multi-worker task: manager notification carries every worker id.
reset role;
update public.tasks set status = 'submitted' where id = '30000000-0000-0000-0000-000000000002';
select public.set_task_workers('30000000-0000-0000-0000-000000000002', array['00000000-0000-0000-0000-0000000000b2']::uuid[]);
do $$ declare n int; begin
  select count(*) into n from public.notifications
   where kind = 'task.submitted' and payload->>'task_id' = '30000000-0000-0000-0000-000000000002'
     and jsonb_array_length(payload->'worker_ids') = 1;
  if n < 1 then raise exception 'task.submitted payload missing worker_ids'; end if;
end $$;

-- Signing RPC still returns one row (as anon) and lists names.
select public.set_task_workers('30000000-0000-0000-0000-000000000003',
  array['00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2']::uuid[]);
reset role;
set local role anon;
do $$ declare n int; w text; begin
  select count(*), max(worker_name) into n, w from public.get_signing_task('staging-token-1');
  if n <> 1 then raise exception 'get_signing_task returned % rows', n; end if;
  if w not like '%Wasim Worker%' or w not like '%Bilal Worker%' then
    raise exception 'worker_name does not list both: %', w; end if;
end $$;

rollback;

-- Workers cannot approve/reject a task or move it to another client; the lead
-- can still run the job as before.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  begin
    update public.tasks set status = 'approved' where id = '30000000-0000-0000-0000-000000000002';
    raise exception 'FAIL: worker approved a task';
  exception when insufficient_privilege then null; end;
  begin
    update public.tasks set client_id = '10000000-0000-0000-0000-000000000001'
      where id = '30000000-0000-0000-0000-000000000002';
    raise exception 'FAIL: worker changed the client';
  exception when insufficient_privilege then null; end;
  update public.tasks set status = 'submitted' where id = '30000000-0000-0000-0000-000000000002';
  if not found then raise exception 'FAIL: lead could not submit'; end if;
end $$;
rollback;
