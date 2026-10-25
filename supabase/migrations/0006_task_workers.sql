-- Multiple workers per task.
--
-- ADDITIVE ONLY and safe to re-run. tasks.assigned_worker_id is untouched: it
-- stays NOT NULL and now means "lead worker". A new join table task_workers
-- holds the full set. A mirror trigger keeps old cached app versions (which
-- only write assigned_worker_id) consistent. Nothing is dropped or rewritten.
-- Rollback statements are at the bottom of this file.

-- ---------------------------------------------------------------------------
-- 1. task_workers
-- ---------------------------------------------------------------------------
create table if not exists public.task_workers (
  task_id uuid not null references public.tasks (id) on delete cascade,
  worker_id uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (task_id, worker_id)
);

create index if not exists task_workers_worker_idx on public.task_workers (worker_id);

alter table public.task_workers enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Backfill: every existing task's lead becomes a task_workers row.
--    (No notification fires: the lead is skipped by the notify trigger.)
-- ---------------------------------------------------------------------------
insert into public.task_workers (task_id, worker_id)
select id, assigned_worker_id from public.tasks
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. Mirror trigger: whenever the lead is set or changed, make sure the lead is
--    also in task_workers.
-- ---------------------------------------------------------------------------
create or replace function public.mirror_task_lead() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.task_workers (task_id, worker_id)
  values (new.id, new.assigned_worker_id)
  on conflict do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. is_task_worker(task): current user is on the task (join table or legacy lead)
--    Supersedes any earlier definition with the same signature.
-- ---------------------------------------------------------------------------
create or replace function public.is_task_worker(p_task uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.task_workers tw
                 where tw.task_id = p_task and tw.worker_id = auth.uid())
      or exists (select 1 from public.tasks t
                 where t.id = p_task and t.assigned_worker_id = auth.uid());
$$;

-- Helpers used by policies (security definer so they never recurse through RLS).
create or replace function public.is_worker_on_client(p_client uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tasks t
                 where t.client_id = p_client and public.is_task_worker(t.id));
$$;

create or replace function public.is_task_of_my_client(p_task uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tasks t
                 where t.id = p_task and t.client_id = public.current_client_id());
$$;

create or replace function public.shares_task_with_me(p_profile uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.task_workers mine
    join public.task_workers theirs on theirs.task_id = mine.task_id
    where mine.worker_id = auth.uid() and theirs.worker_id = p_profile
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. set_task_workers(task, workers[]): manager-only, atomic.
--    Order matters: new rows are inserted first (so a newly added worker who
--    becomes lead is notified once), then the lead is fixed up, then removed
--    workers are deleted.
-- ---------------------------------------------------------------------------
create or replace function public.set_task_workers(p_task uuid, p_workers uuid[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_lead uuid;
  v_ids uuid[];
begin
  if not public.is_manager() then
    raise exception 'only managers can change task workers' using errcode = '42501';
  end if;
  if p_workers is null or coalesce(array_length(p_workers, 1), 0) = 0 then
    raise exception 'at least one worker is required' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_workers) w where w is null) then
    raise exception 'worker ids must not be null' using errcode = '22023';
  end if;

  -- distinct, keeping the caller's order
  select array_agg(w order by o) into v_ids
  from (select w, min(o) as o from unnest(p_workers) with ordinality as u(w, o) group by w) d;

  if exists (
    select 1 from unnest(v_ids) w
    where not exists (select 1 from public.profiles p
                      where p.id = w and p.role = 'worker' and p.active)
  ) then
    raise exception 'every worker must be an active worker profile' using errcode = '22023';
  end if;

  select assigned_worker_id into v_lead from public.tasks where id = p_task for update;
  if not found then
    raise exception 'task not found' using errcode = 'P0002';
  end if;

  insert into public.task_workers (task_id, worker_id, created_at)
  select p_task, w, clock_timestamp()
  from unnest(v_ids) with ordinality as u(w, o)
  order by o
  on conflict do nothing;

  if not (v_lead = any (v_ids)) then
    update public.tasks set assigned_worker_id = v_ids[1] where id = p_task;
  end if;

  delete from public.task_workers
  where task_id = p_task and not (worker_id = any (v_ids));
end;
$$;

revoke all on function public.set_task_workers(uuid, uuid[]) from public, anon;
grant execute on function public.set_task_workers(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Notify a worker who is added to a task (the lead is already notified by
--    the existing tasks insert trigger, so skip them).
-- ---------------------------------------------------------------------------
create or replace function public.notify_task_worker_added() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  t record;
begin
  select id, title, scheduled_at, assigned_worker_id into t
  from public.tasks where id = new.task_id;
  if found and t.assigned_worker_id is distinct from new.worker_id then
    insert into public.notifications (user_id, kind, payload)
    values (new.worker_id, 'task.assigned',
            jsonb_build_object('task_id', t.id, 'title', t.title,
                               'scheduled_at', t.scheduled_at));
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Guard: only managers may change the lead (workers could not before, because
--    the old update policy checked assigned_worker_id = auth.uid() after the
--    update; the widened policies below would otherwise allow it).
--    Calls without a JWT user (service role / direct DB) are not blocked.
-- ---------------------------------------------------------------------------
create or replace function public.guard_task_lead_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_manager() then
    raise exception 'only managers can reassign a task' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Triggers (created only if missing; never dropped).
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_tasks_mirror_lead'
                 and tgrelid = 'public.tasks'::regclass) then
    create trigger trg_tasks_mirror_lead
      after insert or update of assigned_worker_id on public.tasks
      for each row execute function public.mirror_task_lead();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_task_workers_notify'
                 and tgrelid = 'public.task_workers'::regclass) then
    create trigger trg_task_workers_notify
      after insert on public.task_workers
      for each row execute function public.notify_task_worker_added();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_tasks_guard_lead'
                 and tgrelid = 'public.tasks'::regclass) then
    create trigger trg_tasks_guard_lead
      before update on public.tasks
      for each row
      when (old.assigned_worker_id is distinct from new.assigned_worker_id)
      execute function public.guard_task_lead_change();
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Additive RLS policies (permissive policies OR with the existing ones).
--    No write policy on task_workers for non-managers.
-- ---------------------------------------------------------------------------
do $$
declare
  p record;
begin
  for p in
    select * from (values
      ('tasks', 'tasks task-worker select',
       'create policy "tasks task-worker select" on public.tasks for select using (public.is_task_worker(id))'),
      ('tasks', 'tasks task-worker update',
       'create policy "tasks task-worker update" on public.tasks for update using (public.is_task_worker(id)) with check (public.is_task_worker(id))'),
      ('clients', 'clients task-worker read',
       'create policy "clients task-worker read" on public.clients for select using (public.is_worker_on_client(id))'),
      ('task_proofs', 'proofs task-worker rw',
       'create policy "proofs task-worker rw" on public.task_proofs for all using (public.is_task_worker(task_id)) with check (public.is_task_worker(task_id))'),
      ('client_notes', 'notes task-worker rw',
       'create policy "notes task-worker rw" on public.client_notes for all using (public.is_worker_on_client(client_id)) with check (public.is_worker_on_client(client_id))'),
      ('signing_links', 'links task-worker rw',
       'create policy "links task-worker rw" on public.signing_links for all using (public.is_task_worker(task_id)) with check (public.is_task_worker(task_id))'),
      ('task_workers', 'task_workers manager all',
       'create policy "task_workers manager all" on public.task_workers for all using (public.is_manager()) with check (public.is_manager())'),
      ('task_workers', 'task_workers read',
       'create policy "task_workers read" on public.task_workers for select using (public.is_task_worker(task_id) or public.is_task_of_my_client(task_id))'),
      ('profiles', 'profiles coworker read',
       'create policy "profiles coworker read" on public.profiles for select using (public.shares_task_with_me(id))')
    ) as v(tbl, pol, ddl)
  loop
    if not exists (select 1 from pg_policies
                   where schemaname = 'public' and tablename = p.tbl and policyname = p.pol) then
      execute p.ddl;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 9. get_signing_task: same signature and columns; worker_name now lists every
--    assigned worker (falls back to the lead's name).
-- ---------------------------------------------------------------------------
create or replace function public.get_signing_task(p_token text)
returns table (
  task_title text,
  client_name text,
  worker_name text,
  scheduled_at timestamptz,
  expires_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select t.title, c.name,
         coalesce(
           (select string_agg(wp.full_name, ', ' order by tw.created_at, wp.full_name)
            from public.task_workers tw
            join public.profiles wp on wp.id = tw.worker_id
            where tw.task_id = t.id),
           p.full_name),
         t.scheduled_at, sl.expires_at
  from public.signing_links sl
  join public.tasks t on t.id = sl.task_id
  join public.clients c on c.id = t.client_id
  left join public.profiles p on p.id = t.assigned_worker_id
  where sl.token = p_token
    and sl.signed_at is null
    and sl.auto_approved_at is null
    and sl.expires_at > now();
$$;

-- ---------------------------------------------------------------------------
-- 9b. notify_task_submitted: same notification, payload gains worker_ids (every
--     assigned worker) next to the existing worker_id (lead). Trigger unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.notify_task_submitted() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'submitted' and old.status is distinct from 'submitted' then
    insert into public.notifications (user_id, kind, payload)
    select p.id, 'task.submitted',
           jsonb_build_object('task_id', new.id, 'title', new.title,
                              'worker_id', new.assigned_worker_id,
                              'worker_ids', coalesce(
                                (select jsonb_agg(tw.worker_id order by tw.created_at)
                                 from public.task_workers tw where tw.task_id = new.id),
                                jsonb_build_array(new.assigned_worker_id)))
    from public.profiles p where p.role = 'manager' and p.active;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. ROLLBACK (run manually, in this order; NOT part of the migration)
-- ---------------------------------------------------------------------------
-- drop policy if exists "tasks task-worker select" on public.tasks;
-- drop policy if exists "tasks task-worker update" on public.tasks;
-- drop policy if exists "clients task-worker read" on public.clients;
-- drop policy if exists "proofs task-worker rw" on public.task_proofs;
-- drop policy if exists "notes task-worker rw" on public.client_notes;
-- drop policy if exists "links task-worker rw" on public.signing_links;
-- drop policy if exists "task_workers manager all" on public.task_workers;
-- drop policy if exists "task_workers read" on public.task_workers;
-- drop policy if exists "profiles coworker read" on public.profiles;
-- drop trigger if exists trg_tasks_guard_lead on public.tasks;
-- drop trigger if exists trg_tasks_mirror_lead on public.tasks;
-- drop trigger if exists trg_task_workers_notify on public.task_workers;
-- drop function if exists public.set_task_workers(uuid, uuid[]);
-- drop function if exists public.guard_task_lead_change();
-- drop function if exists public.notify_task_worker_added();
-- drop function if exists public.mirror_task_lead();
-- drop function if exists public.shares_task_with_me(uuid);
-- drop function if exists public.is_task_of_my_client(uuid);
-- drop function if exists public.is_worker_on_client(uuid);
-- -- is_task_worker: if migration 0005 is applied, re-create ITS legacy-only body
-- -- instead of dropping; otherwise: drop function if exists public.is_task_worker(uuid);
-- -- Original get_signing_task body (verbatim from 0004_signing.sql):
-- create or replace function public.get_signing_task(p_token text)
-- returns table (
--   task_title text,
--   client_name text,
--   worker_name text,
--   scheduled_at timestamptz,
--   expires_at timestamptz
-- )
-- language sql stable security definer set search_path = public as $$
--   select t.title, c.name, p.full_name, t.scheduled_at, sl.expires_at
--   from public.signing_links sl
--   join public.tasks t on t.id = sl.task_id
--   join public.clients c on c.id = t.client_id
--   left join public.profiles p on p.id = t.assigned_worker_id
--   where sl.token = p_token
--     and sl.signed_at is null
--     and sl.auto_approved_at is null
--     and sl.expires_at > now();
-- $$;
-- -- Original notify_task_submitted body (verbatim from 0001_init.sql):
-- create or replace function public.notify_task_submitted() returns trigger
-- language plpgsql security definer set search_path = public as $$
-- begin
--   if new.status = 'submitted' and old.status is distinct from 'submitted' then
--     insert into public.notifications (user_id, kind, payload)
--     select p.id, 'task.submitted',
--            jsonb_build_object('task_id', new.id, 'title', new.title,
--                               'worker_id', new.assigned_worker_id)
--     from public.profiles p where p.role = 'manager' and p.active;
--   end if;
--   return new;
-- end;
-- $$;
-- -- KEEP public.task_workers (data) until the owner approves: drop table public.task_workers;
