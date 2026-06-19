-- Check-list field-ops schema.
-- Run via the Supabase SQL editor or `supabase db push` after linking.
-- All tables have RLS enabled; managers see everything, workers see only their
-- own assignments, clients see only their own records (read-only).

-- ---------------------------------------------------------------------------
-- Extensions & enums
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

create type public.user_role as enum ('manager', 'worker', 'client');
create type public.task_status as enum (
  'not_started',
  'in_progress',
  'submitted',
  'approved',
  'rejected'
);
create type public.proof_kind as enum ('start', 'finish');
create type public.note_status as enum ('open', 'resolved');

-- ---------------------------------------------------------------------------
-- profiles  (mirrors auth.users with role + linkage to client record)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'worker',
  full_name text,
  email text,
  phone text,
  client_id uuid,                       -- set when role = 'client'
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index on public.profiles (role);
create index on public.profiles (client_id);

-- Convenience function — true if current auth.uid() is a manager.
create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'manager' and active
  );
$$;

create or replace function public.current_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_client_id() returns uuid
language sql stable security definer set search_path = public as $$
  select client_id from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  address text,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.clients (name);

-- ---------------------------------------------------------------------------
-- templates  (bilingual checklist templates — JSON for now)
-- ---------------------------------------------------------------------------
create table public.templates (
  id uuid primary key default gen_random_uuid(),
  title jsonb not null,                 -- { en: '...', ar: '...' }
  tasks jsonb not null default '[]'::jsonb,
  version int not null default 1,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- tasks  (a scheduled visit assigned to a worker for a client)
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  template_id uuid references public.templates (id) on delete set null,
  client_id uuid not null references public.clients (id) on delete cascade,
  assigned_worker_id uuid not null references public.profiles (id) on delete restrict,
  scheduled_at timestamptz not null,
  scheduled_end timestamptz,
  status public.task_status not null default 'not_started',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  decision_at timestamptz,
  decision_note text,
  -- checklist results captured during the run (mirrors job.results)
  results jsonb not null default '[]'::jsonb,
  signature jsonb
);

create index on public.tasks (assigned_worker_id, scheduled_at);
create index on public.tasks (client_id, scheduled_at);
create index on public.tasks (status);

-- ---------------------------------------------------------------------------
-- task_proofs  (photo / video captured at start or finish)
-- ---------------------------------------------------------------------------
create table public.task_proofs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  kind public.proof_kind not null,
  storage_path text not null,           -- proofs/{task_id}/{kind}-{uuid}.{ext}
  mime text not null,
  captured_at timestamptz not null,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references public.profiles (id) on delete set null
);

create index on public.task_proofs (task_id);

-- ---------------------------------------------------------------------------
-- client_notes  (action points; open notes carry forward to the next visit)
-- ---------------------------------------------------------------------------
create table public.client_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  body text not null,
  status public.note_status not null default 'open',
  created_in_task_id uuid references public.tasks (id) on delete set null,
  resolved_in_task_id uuid references public.tasks (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index on public.client_notes (client_id, status);

-- ---------------------------------------------------------------------------
-- notifications  (in-app inbox; email is sent by the notify Edge Function)
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,                   -- e.g. 'task.assigned', 'task.submitted'
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  email_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index on public.notifications (user_id, read_at, created_at desc);

-- ---------------------------------------------------------------------------
-- audit_log
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);

create index on public.audit_log (entity, entity_id, at desc);
create index on public.audit_log (actor_id, at desc);

-- ---------------------------------------------------------------------------
-- Triggers: updated_at + audit log + task-assigned notification
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_clients_touch before update on public.clients
  for each row execute function public.touch_updated_at();
create trigger trg_templates_touch before update on public.templates
  for each row execute function public.touch_updated_at();
create trigger trg_tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

create or replace function public.audit_tasks() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_action text;
begin
  v_action := case
    when tg_op = 'INSERT' then 'task.created'
    when tg_op = 'UPDATE' and new.status is distinct from old.status then 'task.' || new.status::text
    when tg_op = 'UPDATE' then 'task.updated'
    when tg_op = 'DELETE' then 'task.deleted'
  end;
  insert into public.audit_log (actor_id, action, entity, entity_id, payload)
  values (auth.uid(), v_action, 'task', coalesce(new.id, old.id),
          jsonb_build_object('status', coalesce(new.status::text, old.status::text)));
  return coalesce(new, old);
end;
$$;

create trigger trg_tasks_audit
  after insert or update or delete on public.tasks
  for each row execute function public.audit_tasks();

create or replace function public.notify_task_assigned() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, kind, payload)
  values (new.assigned_worker_id, 'task.assigned',
          jsonb_build_object('task_id', new.id, 'title', new.title,
                             'scheduled_at', new.scheduled_at));
  return new;
end;
$$;

create trigger trg_tasks_notify_assigned
  after insert on public.tasks
  for each row execute function public.notify_task_assigned();

create or replace function public.notify_task_submitted() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'submitted' and old.status is distinct from 'submitted' then
    insert into public.notifications (user_id, kind, payload)
    select p.id, 'task.submitted',
           jsonb_build_object('task_id', new.id, 'title', new.title,
                              'worker_id', new.assigned_worker_id)
    from public.profiles p where p.role = 'manager' and p.active;
  end if;
  return new;
end;
$$;

create trigger trg_tasks_notify_submitted
  after update on public.tasks
  for each row execute function public.notify_task_submitted();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.clients        enable row level security;
alter table public.templates      enable row level security;
alter table public.tasks          enable row level security;
alter table public.task_proofs    enable row level security;
alter table public.client_notes   enable row level security;
alter table public.notifications  enable row level security;
alter table public.audit_log      enable row level security;

-- profiles: every user reads their own row; manager reads/writes all
create policy "profiles self read" on public.profiles for select
  using (id = auth.uid() or public.is_manager());
create policy "profiles manager write" on public.profiles for all
  using (public.is_manager()) with check (public.is_manager());

-- clients: manager full; worker read clients they have a task for;
-- client reads only their own record
create policy "clients manager all" on public.clients for all
  using (public.is_manager()) with check (public.is_manager());
create policy "clients worker read" on public.clients for select
  using (exists (select 1 from public.tasks t
                 where t.client_id = clients.id
                   and t.assigned_worker_id = auth.uid()));
create policy "clients self read" on public.clients for select
  using (id = public.current_client_id());

-- templates: manager full; workers read
create policy "templates manager all" on public.templates for all
  using (public.is_manager()) with check (public.is_manager());
create policy "templates worker read" on public.templates for select
  using (public.current_role() = 'worker');

-- tasks: manager full; worker reads/updates own; client reads own
create policy "tasks manager all" on public.tasks for all
  using (public.is_manager()) with check (public.is_manager());
create policy "tasks worker rw" on public.tasks for select
  using (assigned_worker_id = auth.uid());
create policy "tasks worker update" on public.tasks for update
  using (assigned_worker_id = auth.uid())
  with check (assigned_worker_id = auth.uid());
create policy "tasks client read" on public.tasks for select
  using (client_id = public.current_client_id());

-- task_proofs: manager full; worker rw own; client read approved finish proofs
create policy "proofs manager all" on public.task_proofs for all
  using (public.is_manager()) with check (public.is_manager());
create policy "proofs worker rw" on public.task_proofs for all
  using (exists (select 1 from public.tasks t
                 where t.id = task_proofs.task_id
                   and t.assigned_worker_id = auth.uid()))
  with check (exists (select 1 from public.tasks t
                      where t.id = task_proofs.task_id
                        and t.assigned_worker_id = auth.uid()));
create policy "proofs client read" on public.task_proofs for select
  using (kind = 'finish' and exists (
    select 1 from public.tasks t
    where t.id = task_proofs.task_id
      and t.status = 'approved'
      and t.client_id = public.current_client_id()));

-- client_notes: manager full; worker rw on tasks they own; client read own
create policy "notes manager all" on public.client_notes for all
  using (public.is_manager()) with check (public.is_manager());
create policy "notes worker rw" on public.client_notes for all
  using (exists (select 1 from public.tasks t
                 where t.client_id = client_notes.client_id
                   and t.assigned_worker_id = auth.uid()))
  with check (exists (select 1 from public.tasks t
                      where t.client_id = client_notes.client_id
                        and t.assigned_worker_id = auth.uid()));
create policy "notes client read" on public.client_notes for select
  using (client_id = public.current_client_id());

-- notifications: each user reads their own; system writes via triggers
create policy "notifications self read" on public.notifications for select
  using (user_id = auth.uid());
create policy "notifications self update" on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- audit_log: manager-only read
create policy "audit manager read" on public.audit_log for select
  using (public.is_manager());
