-- Field operations & labor allocation (Master Spec v2.1, Phase 1).
--
-- Adds: configurable project types/stages, projects, employees (crew, no
-- login), visits, project tasks with OPEN / COMPLETED / NEEDS_FOLLOW_UP,
-- per-project recurring items, before/after task photos, labor allocations,
-- month close and visit reports.
--
-- Critical rules are enforced here, not only in the app:
--   BR-001/002/003  labor_allocations_guard: 0.5 or 1.0 only, day total <= 1.0,
--                   serialized per employee+date with an advisory lock (TC-12).
--   BR-009/010      closed month: only finance may change allocations, with a
--                   reason, and the old/new values go to the audit log.
--   BR-007          supervisors see a project's history through
--                   projects.supervisor_id, not through rows they created.
--   BR-008/014      no hard delete of projects, allocations, completed visits
--                   or completed tasks.
--
-- Requires 0005_roles.sql to have been committed first.

-- ---------------------------------------------------------------------------
-- Role helpers
-- ---------------------------------------------------------------------------

-- A manager can also be granted finance (owner decision, 2026-09-27).
alter table public.profiles
  add column finance_access boolean not null default false;

create or replace function public.is_supervisor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active and role in ('supervisor', 'worker')
  );
$$;

create or replace function public.has_finance() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active and (role = 'finance' or finance_access)
  );
$$;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.project_status   as enum ('active', 'on_hold', 'completed', 'closed');
create type public.visit_status     as enum ('planned', 'in_progress', 'completed');
create type public.task_item_status as enum ('open', 'completed', 'needs_follow_up');
create type public.task_item_source as enum ('manual', 'checklist', 'stage', 'recurring');
create type public.photo_kind       as enum ('before', 'after');
create type public.employee_status  as enum ('active', 'inactive');
create type public.signature_status as enum ('unsigned', 'signed');

-- ---------------------------------------------------------------------------
-- Shared triggers: stamp updated_by, block deletes
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_by() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

create or replace function public.forbid_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'BR-014: % rows cannot be deleted; archive, close or void instead', tg_table_name
    using errcode = 'P0001';
end;
$$;

-- Generic audit with old/new values (§30).
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (actor_id, action, entity, entity_id, payload)
  values (
    auth.uid(),
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    (to_jsonb(coalesce(new, old)) ->> 'id')::uuid,   -- null for tables keyed otherwise (month_closes)
    jsonb_build_object(
      'old', case when tg_op = 'INSERT' then null else to_jsonb(old) end,
      'new', case when tg_op = 'DELETE' then null else to_jsonb(new) end
    )
  );
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- Configuration (§25): project types and stages
-- ---------------------------------------------------------------------------
create table public.project_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name jsonb not null,                        -- { en, ar, ur? }
  uses_stages boolean not null default false,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.project_stages (
  id uuid primary key default gen_random_uuid(),
  project_type_id uuid not null references public.project_types (id) on delete restrict,
  code text not null,
  name jsonb not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (project_type_id, code)
);

insert into public.project_types (code, name, uses_stages, sort_order) values
  ('establishment', '{"en":"Establishment / Execution","ar":"تأسيس / تنفيذ"}', true, 1),
  ('maintenance',   '{"en":"Maintenance","ar":"صيانة"}',                         false, 2),
  ('modification',  '{"en":"Modification / Addition","ar":"تعديل / إضافة"}',     false, 3),
  ('other',         '{"en":"Other","ar":"أخرى"}',                                false, 4);

insert into public.project_stages (project_type_id, code, name, sort_order)
select pt.id, s.code, s.name::jsonb, s.ord
from public.project_types pt
cross join (values
  ('site_handover', '{"en":"Site handover & preparation","ar":"استلام وتجهيز الموقع"}', 1),
  ('preparatory',   '{"en":"Preparatory works","ar":"الأعمال التحضيرية"}',            2),
  ('irrigation',    '{"en":"Irrigation network","ar":"شبكة الري"}',                   3),
  ('planting_ready','{"en":"Planting readiness","ar":"جاهزية الزراعة"}',              4),
  ('planting',      '{"en":"Planting / Execution","ar":"الزراعة / التنفيذ"}',         5),
  ('handover',      '{"en":"Inspection & handover","ar":"الفحص والتسليم"}',           6)
) as s(code, name, ord)
where pt.code = 'establishment';

-- Checklist templates get a scope. Items stay in templates.tasks (jsonb) and
-- may now carry "recurrence" and "photoRequired" (see domain/models/types.ts).
alter table public.templates
  add column project_type_id uuid references public.project_types (id) on delete restrict,
  add column stage_id uuid references public.project_stages (id) on delete restrict,
  add column active boolean not null default true;

-- Standard maintenance list from §8. Frequencies are left unset on purpose:
-- they are an open question for the owner (§36 Q5) and are set per project.
insert into public.templates (title, tasks, project_type_id)
select
  '{"en":"Maintenance — standard","ar":"صيانة — القائمة الأساسية"}'::jsonb,
  jsonb_agg(jsonb_build_object(
    'id', gen_random_uuid(), 'order', i.ord - 1, 'required', false,
    'label', jsonb_build_object('en', i.en, 'ar', i.ar)) order by i.ord),
  (select id from public.project_types where code = 'maintenance')
from (values
  (1, 'Irrigation network check',            'فحص شبكة الري'),
  (2, 'Plant and general condition check',   'فحص النباتات والحالة العامة'),
  (3, 'Pruning',                             'التقليم'),
  (4, 'Fertilizing',                         'التسميد'),
  (5, 'Spraying / pest control',             'الرش / المكافحة'),
  (6, 'Weeding',                             'إزالة الحشائش'),
  (7, 'Cleaning',                            'النظافة'),
  (8, 'Pumps / site equipment check',        'فحص المضخات أو المعدات المرتبطة بالموقع'),
  (9, 'Special replacements or treatments',  'استبدالات أو معالجات خاصة')
) as i(ord, en, ar);

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  client_id uuid not null references public.clients (id) on delete restrict,
  project_type_id uuid not null references public.project_types (id) on delete restrict,
  stage_id uuid references public.project_stages (id) on delete restrict,
  status public.project_status not null default 'active',
  supervisor_id uuid references public.profiles (id) on delete restrict,
  notes text,
  closed_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create index on public.projects (supervisor_id, status);
create index on public.projects (client_id);
create index on public.projects (status);

-- True when the caller is the project's current supervisor (BR-007: access
-- follows the project, so a replacement supervisor sees the whole history).
create or replace function public.supervises_project(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_supervisor() and exists (
    select 1 from public.projects where id = p_project and supervisor_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Employees (crew). Supervisors are users, not employees, and are not counted
-- in labor allocation (owner decision, 2026-09-27).
-- ---------------------------------------------------------------------------
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  full_name text not null,
  phone text,
  status public.employee_status not null default 'active',
  notes text,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create index on public.employees (status, full_name);

-- ---------------------------------------------------------------------------
-- Visits
-- ---------------------------------------------------------------------------
create table public.visits (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  visit_date date not null default current_date,
  supervisor_id uuid not null references public.profiles (id) on delete restrict,
  status public.visit_status not null default 'planned',
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create index on public.visits (project_id, visit_date desc);
create index on public.visits (supervisor_id, visit_date desc);
create index on public.visits (status);

-- PLANNED -> IN_PROGRESS -> COMPLETED only (§27).
create or replace function public.visits_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if not ((old.status = 'planned' and new.status = 'in_progress')
         or (old.status = 'in_progress' and new.status = 'completed')) then
      raise exception 'Visit cannot move from % to %', old.status, new.status using errcode = 'P0001';
    end if;
    if new.status = 'in_progress' then new.started_at = coalesce(new.started_at, now()); end if;
    if new.status = 'completed' then new.completed_at = coalesce(new.completed_at, now()); end if;
  end if;
  if tg_op = 'DELETE' then
    if old.status <> 'planned'
       or exists (select 1 from public.labor_allocations where visit_id = old.id) then
      raise exception 'BR-014: only a planned visit with no labor can be deleted' using errcode = 'P0001';
    end if;
    return old;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Project tasks: one record per task, re-shown in every visit until closed
-- (§24 single source of truth, BR-005/006).
-- ---------------------------------------------------------------------------
create table public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  visit_id uuid references public.visits (id) on delete restrict,   -- visit it was raised for (null = next visit)
  source public.task_item_source not null default 'manual',
  template_id uuid references public.templates (id) on delete set null,
  template_item_id text,                                             -- id inside templates.tasks
  recurring_item_id uuid,                                            -- fk added below
  description text not null,
  status public.task_item_status not null default 'open',
  photo_required boolean not null default false,
  note text,
  completed_at timestamptz,
  completed_in_visit_id uuid references public.visits (id) on delete restrict,
  last_visit_id uuid references public.visits (id) on delete restrict,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create index on public.project_tasks (project_id, status);
create index on public.project_tasks (visit_id);

-- OPEN -> COMPLETED, OPEN -> NEEDS_FOLLOW_UP -> COMPLETED (§27).
create or replace function public.project_tasks_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'completed' then
      raise exception 'BR-014: a completed task cannot be deleted' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if old.status = 'completed' then
      raise exception 'A completed task cannot be reopened' using errcode = 'P0001';
    end if;
    if old.status = 'needs_follow_up' and new.status = 'open' then
      raise exception 'A follow-up task cannot go back to open' using errcode = 'P0001';
    end if;
    if new.status = 'completed' then
      new.completed_at = coalesce(new.completed_at, now());
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Recurring maintenance items per project (BR-011, §8)
-- ---------------------------------------------------------------------------
create table public.project_recurring_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  template_id uuid references public.templates (id) on delete set null,
  template_item_id text,
  description text not null,
  recurrence public.task_recurrence not null,
  last_done_on date,
  next_due_on date not null,
  photo_required boolean not null default false,
  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint recurring_not_none check (recurrence <> 'none')
);

create index on public.project_recurring_items (project_id, next_due_on) where active;

alter table public.project_tasks
  add constraint project_tasks_recurring_item_id_fkey
  foreign key (recurring_item_id) references public.project_recurring_items (id) on delete restrict;

-- When a recurring task is completed, roll the item's last/next dates.
-- A missed item is never marked done automatically (§31).
create or replace function public.roll_recurring_item() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_done date;
begin
  if new.recurring_item_id is not null
     and new.status = 'completed' and old.status is distinct from 'completed' then
    v_done := coalesce(new.completed_at, now())::date;
    update public.project_recurring_items r
      set last_done_on = v_done,
          next_due_on = (v_done + case r.recurrence
                           when 'weekly'    then interval '7 days'
                           when 'monthly'   then interval '1 month'
                           when 'quarterly' then interval '3 months'
                           when 'biannual'  then interval '6 months'
                         end)::date
      where r.id = new.recurring_item_id;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Task photos: before/after, optional unless configured (BR-012, §11)
-- ---------------------------------------------------------------------------
create table public.task_photos (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.project_tasks (id) on delete restrict,
  visit_id uuid references public.visits (id) on delete restrict,
  project_id uuid not null references public.projects (id) on delete restrict,
  kind public.photo_kind,
  storage_path text not null,               -- object storage, never base64 (§33)
  mime text not null,
  captured_at timestamptz not null,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references public.profiles (id) on delete set null default auth.uid(),
  voided_at timestamptz,
  void_reason text
);

create index on public.task_photos (task_id);
create index on public.task_photos (project_id, captured_at desc);

-- ---------------------------------------------------------------------------
-- Month close (§23, BR-009)
-- ---------------------------------------------------------------------------
create table public.month_closes (
  month date primary key,                   -- first day of the month
  closed_at timestamptz not null default now(),
  closed_by uuid not null references public.profiles (id) on delete restrict default auth.uid(),
  constraint month_is_first_day check (extract(day from month) = 1)
);

create or replace function public.is_month_closed(p_date date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.month_closes where month = date_trunc('month', p_date)::date);
$$;

-- ---------------------------------------------------------------------------
-- Labor allocations (§6, BR-001..004, BR-009/010, TC-01..03, TC-07/08, TC-12)
-- ---------------------------------------------------------------------------
create table public.labor_allocations (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  employee_id uuid not null references public.employees (id) on delete restrict,
  project_id uuid not null references public.projects (id) on delete restrict,
  visit_id uuid references public.visits (id) on delete restrict,
  duration numeric(2,1) not null,
  supervisor_id uuid not null references public.profiles (id) on delete restrict,
  notes text,
  change_reason text,                       -- required for edits after month close
  voided_at timestamptz,
  voided_by uuid references public.profiles (id) on delete set null,
  void_reason text,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint duration_full_or_half check (duration in (0.5, 1.0)),          -- BR-002
  constraint void_needs_reason check (voided_at is null or void_reason is not null)
);

create index on public.labor_allocations (employee_id, work_date) where voided_at is null;
create index on public.labor_allocations (project_id, work_date);
create index on public.labor_allocations (work_date);
-- The same worker cannot be added twice to one visit.
create unique index labor_one_per_visit
  on public.labor_allocations (visit_id, employee_id) where voided_at is null and visit_id is not null;

create or replace function public.labor_allocations_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_total numeric;
  v_closed boolean;
begin
  -- Month close (BR-009/010). Service role (auth.uid() is null) is exempt.
  v_closed := (tg_op = 'INSERT' and public.is_month_closed(new.work_date))
           or (tg_op = 'UPDATE' and (public.is_month_closed(old.work_date)
                                     or public.is_month_closed(new.work_date)));
  if v_closed and auth.uid() is not null then
    if not public.has_finance() then
      raise exception 'BR-009: labor for this month is closed' using errcode = 'P0001';
    end if;
    if coalesce(btrim(new.change_reason), '') = ''
       or (tg_op = 'UPDATE' and new.change_reason is not distinct from old.change_reason) then
      raise exception 'BR-010: a reason is required to change labor after month close' using errcode = 'P0001';
    end if;
  end if;

  if new.voided_at is null then
    -- Serialize concurrent writers for this employee+date (TC-12), then
    -- re-read committed rows. No last-write-wins.
    perform pg_advisory_xact_lock(hashtextextended(new.employee_id::text || ':' || new.work_date::text, 0));

    select coalesce(sum(duration), 0) into v_total
    from public.labor_allocations
    where employee_id = new.employee_id
      and work_date = new.work_date
      and voided_at is null
      and id <> new.id;

    if v_total + new.duration > 1.0 then                                     -- BR-001/003
      raise exception 'BR-001: employee already has % day(s) on %; adding % would exceed 1.0',
        v_total, new.work_date, new.duration using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at = now();
    new.updated_by = auth.uid();
    if new.voided_at is not null and old.voided_at is null then
      new.voided_by = auth.uid();
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Visit reports (§12, §15). PDF is rendered by the app from recorded data.
-- ---------------------------------------------------------------------------
create table public.visit_reports (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null unique references public.visits (id) on delete restrict,
  report_number bigint generated always as identity unique,
  signature_status public.signature_status not null default 'unsigned',
  signer_name text,
  signature jsonb,
  signed_at timestamptz,
  generated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null default auth.uid()
);

-- ---------------------------------------------------------------------------
-- Project close (§31): not while tasks are open or need follow-up.
-- Override is an open owner question (§36 Q3), so none is offered yet.
-- ---------------------------------------------------------------------------
create or replace function public.projects_guard() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if old.status in ('completed', 'closed') then
      raise exception 'Project is % and cannot change status', old.status using errcode = 'P0001';
    end if;
    if new.status in ('completed', 'closed') then
      if exists (select 1 from public.project_tasks
                 where project_id = new.id and status <> 'completed') then
        raise exception 'Project has open or follow-up tasks and cannot be closed' using errcode = 'P0001';
      end if;
      new.closed_at = coalesce(new.closed_at, now());
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Wire up triggers
-- ---------------------------------------------------------------------------
create trigger trg_projects_guard before update on public.projects
  for each row execute function public.projects_guard();
create trigger trg_projects_touch before update on public.projects
  for each row execute function public.touch_updated_by();
create trigger trg_projects_nodelete before delete on public.projects
  for each row execute function public.forbid_delete();

create trigger trg_employees_touch before update on public.employees
  for each row execute function public.touch_updated_by();
create trigger trg_employees_nodelete before delete on public.employees
  for each row execute function public.forbid_delete();

create trigger trg_visits_guard before update or delete on public.visits
  for each row execute function public.visits_guard();
create trigger trg_visits_touch before update on public.visits
  for each row execute function public.touch_updated_by();

create trigger trg_project_tasks_guard before update or delete on public.project_tasks
  for each row execute function public.project_tasks_guard();
create trigger trg_project_tasks_touch before update on public.project_tasks
  for each row execute function public.touch_updated_by();
create trigger trg_project_tasks_roll after update on public.project_tasks
  for each row execute function public.roll_recurring_item();

create trigger trg_recurring_touch before update on public.project_recurring_items
  for each row execute function public.touch_updated_by();

create trigger trg_labor_guard before insert or update on public.labor_allocations
  for each row execute function public.labor_allocations_guard();
create trigger trg_labor_nodelete before delete on public.labor_allocations
  for each row execute function public.forbid_delete();

create trigger trg_month_closes_nodelete before delete or update on public.month_closes
  for each row execute function public.forbid_delete();

create trigger trg_visit_reports_nodelete before delete on public.visit_reports
  for each row execute function public.forbid_delete();

create trigger trg_audit_projects after insert or update or delete on public.projects
  for each row execute function public.audit_row();
create trigger trg_audit_employees after insert or update on public.employees
  for each row execute function public.audit_row();
create trigger trg_audit_visits after insert or update or delete on public.visits
  for each row execute function public.audit_row();
create trigger trg_audit_project_tasks after insert or update or delete on public.project_tasks
  for each row execute function public.audit_row();
create trigger trg_audit_labor after insert or update on public.labor_allocations
  for each row execute function public.audit_row();
create trigger trg_audit_month_closes after insert on public.month_closes
  for each row execute function public.audit_row();

-- History must survive client deletion (BR-008/014): stop cascading.
alter table public.tasks drop constraint tasks_client_id_fkey,
  add constraint tasks_client_id_fkey
  foreign key (client_id) references public.clients (id) on delete restrict;

-- ---------------------------------------------------------------------------
-- Row Level Security (§29)
-- ---------------------------------------------------------------------------
alter table public.project_types           enable row level security;
alter table public.project_stages          enable row level security;
alter table public.projects                enable row level security;
alter table public.employees               enable row level security;
alter table public.visits                  enable row level security;
alter table public.project_tasks           enable row level security;
alter table public.project_recurring_items enable row level security;
alter table public.task_photos             enable row level security;
alter table public.month_closes            enable row level security;
alter table public.labor_allocations       enable row level security;
alter table public.visit_reports           enable row level security;

-- Config: everyone signed in reads; manager writes.
create policy "types read"  on public.project_types for select using (auth.uid() is not null);
create policy "types write" on public.project_types for all
  using (public.is_manager()) with check (public.is_manager());
create policy "stages read"  on public.project_stages for select using (auth.uid() is not null);
create policy "stages write" on public.project_stages for all
  using (public.is_manager()) with check (public.is_manager());
create policy "templates finance read" on public.templates for select using (public.has_finance());
create policy "templates supervisor read" on public.templates for select using (public.is_supervisor());

-- Projects: manager all; finance read; supervisor reads the ones assigned now.
create policy "projects manager all" on public.projects for all
  using (public.is_manager()) with check (public.is_manager());
create policy "projects finance read" on public.projects for select using (public.has_finance());
create policy "projects supervisor read" on public.projects for select
  using (public.is_supervisor() and supervisor_id = auth.uid());

-- Clients: supervisors and finance read the clients of their visible projects.
create policy "clients finance read" on public.clients for select using (public.has_finance());
create policy "clients supervisor read" on public.clients for select
  using (exists (select 1 from public.projects p
                 where p.client_id = clients.id and public.supervises_project(p.id)));

-- Employees: manager all; supervisors and finance read (crew picker, reports).
create policy "employees manager all" on public.employees for all
  using (public.is_manager()) with check (public.is_manager());
create policy "employees read" on public.employees for select
  using (public.is_supervisor() or public.has_finance());

-- Visits: supervisor works on visits of projects they supervise.
create policy "visits manager all" on public.visits for all
  using (public.is_manager()) with check (public.is_manager());
create policy "visits finance read" on public.visits for select using (public.has_finance());
create policy "visits supervisor read" on public.visits for select
  using (public.supervises_project(project_id));
create policy "visits supervisor insert" on public.visits for insert
  with check (public.supervises_project(project_id) and supervisor_id = auth.uid());
create policy "visits supervisor update" on public.visits for update
  using (public.supervises_project(project_id))
  with check (public.supervises_project(project_id));

-- Project tasks: supervisor reads and updates (executes) their projects' tasks.
create policy "ptasks manager all" on public.project_tasks for all
  using (public.is_manager()) with check (public.is_manager());
create policy "ptasks finance read" on public.project_tasks for select using (public.has_finance());
create policy "ptasks supervisor read" on public.project_tasks for select
  using (public.supervises_project(project_id));
create policy "ptasks supervisor update" on public.project_tasks for update
  using (public.supervises_project(project_id))
  with check (public.supervises_project(project_id));

create policy "recurring manager all" on public.project_recurring_items for all
  using (public.is_manager()) with check (public.is_manager());
create policy "recurring read" on public.project_recurring_items for select
  using (public.has_finance() or public.supervises_project(project_id));

create policy "photos manager all" on public.task_photos for all
  using (public.is_manager()) with check (public.is_manager());
create policy "photos finance read" on public.task_photos for select using (public.has_finance());
create policy "photos supervisor rw" on public.task_photos for all
  using (public.supervises_project(project_id))
  with check (public.supervises_project(project_id));

-- Month close: everyone reads; only finance closes.
create policy "month read"  on public.month_closes for select using (auth.uid() is not null);
create policy "month close" on public.month_closes for insert with check (public.has_finance());

-- Labor: manager all; finance reads and corrects (trigger enforces reason);
-- supervisor records their own crew on projects they supervise.
create policy "labor manager all" on public.labor_allocations for all
  using (public.is_manager()) with check (public.is_manager());
create policy "labor finance rw" on public.labor_allocations for select using (public.has_finance());
create policy "labor finance update" on public.labor_allocations for update
  using (public.has_finance()) with check (public.has_finance());
create policy "labor supervisor read" on public.labor_allocations for select
  using (supervisor_id = auth.uid() or public.supervises_project(project_id));
create policy "labor supervisor insert" on public.labor_allocations for insert
  with check (supervisor_id = auth.uid() and public.supervises_project(project_id));
create policy "labor supervisor update" on public.labor_allocations for update
  using (supervisor_id = auth.uid() and public.supervises_project(project_id))
  with check (supervisor_id = auth.uid() and public.supervises_project(project_id));

create policy "reports manager all" on public.visit_reports for all
  using (public.is_manager()) with check (public.is_manager());
create policy "reports read" on public.visit_reports for select
  using (public.has_finance() or exists (
    select 1 from public.visits v where v.id = visit_reports.visit_id and public.supervises_project(v.project_id)));
create policy "reports supervisor insert" on public.visit_reports for insert
  with check (exists (
    select 1 from public.visits v where v.id = visit_reports.visit_id and public.supervises_project(v.project_id)));

-- Audit log: finance reads too (post-close edits land here).
create policy "audit finance read" on public.audit_log for select using (public.has_finance());
