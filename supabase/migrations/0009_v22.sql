-- ===========================================================================
-- Master Specification v2.2 (approved decisions §36A, TC-13..TC-16)
--
--   * Work Type (§23, §25, §28): a managed list. Chosen once on the visit and
--     applied to that visit's labor rows; every labor row carries one.
--   * Operational Target (§23, §28): a managed list (warehouse, office, leave
--     …). A labor row is against exactly one project OR one target — no fake
--     projects. BR-001 still sums the whole day across both (TC-15).
--   * Month close (§36A): refused while a visit of that month is in progress.
--   * No salary / allowance / cost fields anywhere (TC-16) — nothing added.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Managed lists
-- ---------------------------------------------------------------------------
create table public.work_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name jsonb not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.operational_targets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name jsonb not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.work_types (code, name, sort_order) values
  ('planting',     '{"en":"Planting","ar":"زراعة","ur":"شجرکاری"}', 1),
  ('maintenance',  '{"en":"Maintenance","ar":"صيانة","ur":"دیکھ بھال"}', 2),
  ('irrigation',   '{"en":"Irrigation","ar":"ري","ur":"آبپاشی"}', 3),
  ('modification', '{"en":"Modifications","ar":"تعديلات","ur":"ترامیم"}', 4),
  ('execution',    '{"en":"Execution","ar":"تنفيذ","ur":"تعمیر"}', 5),
  ('transport',    '{"en":"Transport & loading","ar":"نقل وتحميل","ur":"نقل و حمل اور لوڈنگ"}', 6),
  ('general',      '{"en":"General works","ar":"أعمال عامة","ur":"عمومی کام"}', 7),
  ('other',        '{"en":"Other","ar":"أخرى","ur":"دیگر"}', 8);

insert into public.operational_targets (code, name, sort_order) values
  ('warehouse',       '{"en":"Warehouse","ar":"المستودع","ur":"گودام"}', 1),
  ('company_general', '{"en":"Company general works","ar":"أعمال عامة للشركة","ur":"کمپنی کے عمومی کام"}', 2),
  ('office',          '{"en":"Office","ar":"المكتب","ur":"دفتر"}', 3),
  ('training',        '{"en":"Training","ar":"تدريب","ur":"تربیت"}', 4),
  ('leave',           '{"en":"Leave","ar":"إجازة","ur":"چھٹی"}', 5),
  ('absence',         '{"en":"Absence","ar":"غياب","ur":"غیر حاضری"}', 6),
  ('other',           '{"en":"Other","ar":"أخرى","ur":"دیگر"}', 7);

-- Names in English and Arabic; one entry per name (entries are never deleted).
alter table public.work_types add constraint work_types_names
  check (coalesce(btrim(name->>'en'), '') <> '' and coalesce(btrim(name->>'ar'), '') <> '');
alter table public.operational_targets add constraint operational_targets_names
  check (coalesce(btrim(name->>'en'), '') <> '' and coalesce(btrim(name->>'ar'), '') <> '');
create unique index work_types_name_en_unique on public.work_types (lower(btrim(name->>'en')));
create unique index work_types_name_ar_unique on public.work_types (btrim(name->>'ar'));
create unique index operational_targets_name_en_unique on public.operational_targets (lower(btrim(name->>'en')));
create unique index operational_targets_name_ar_unique on public.operational_targets (btrim(name->>'ar'));

alter table public.work_types enable row level security;
alter table public.operational_targets enable row level security;
create policy "work types read"  on public.work_types for select using (auth.uid() is not null);
create policy "work types write" on public.work_types for all using (public.is_manager()) with check (public.is_manager());
create policy "targets read"  on public.operational_targets for select using (auth.uid() is not null);
create policy "targets write" on public.operational_targets for all using (public.is_manager()) with check (public.is_manager());

-- Switched off, never deleted (§25, BR-014).
create trigger trg_work_types_nodelete before delete on public.work_types
  for each row execute function public.forbid_delete();
create trigger trg_targets_nodelete before delete on public.operational_targets
  for each row execute function public.forbid_delete();
create trigger trg_audit_work_types after insert or update on public.work_types
  for each row execute function public.audit_row();
create trigger trg_audit_targets after insert or update on public.operational_targets
  for each row execute function public.audit_row();

-- ---------------------------------------------------------------------------
-- Visits: work type (required once the visit starts)
-- ---------------------------------------------------------------------------
alter table public.visits add column work_type_id uuid references public.work_types (id) on delete restrict;
update public.visits set work_type_id = (select id from public.work_types where code = 'other')
  where work_type_id is null and status <> 'planned';
alter table public.visits add constraint visits_work_type_when_started
  check (status = 'planned' or work_type_id is not null);

-- ---------------------------------------------------------------------------
-- Labor: project OR operational target, and a work type
-- ---------------------------------------------------------------------------
alter table public.labor_allocations
  add column operational_target_id uuid references public.operational_targets (id) on delete restrict,
  add column work_type_id uuid references public.work_types (id) on delete restrict;
alter table public.labor_allocations alter column project_id drop not null;

update public.labor_allocations la
   set work_type_id = coalesce(
     (select v.work_type_id from public.visits v where v.id = la.visit_id),
     (select id from public.work_types where code = 'other'))
 where work_type_id is null;

alter table public.labor_allocations alter column work_type_id set not null;
alter table public.labor_allocations add constraint labor_project_or_target
  check (num_nonnulls(project_id, operational_target_id) = 1);
alter table public.labor_allocations add constraint labor_visit_needs_project
  check (visit_id is null or project_id is not null);
create index on public.labor_allocations (operational_target_id, work_date);
create index on public.labor_allocations (work_type_id, work_date);

-- A visit's crew takes the visit's work type; it is never entered per worker
-- (§17, TC-13). New rows may not use a switched-off list entry.
create or replace function public.labor_v22_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_visit public.visits;
begin
  if new.visit_id is not null then
    select * into v_visit from public.visits where id = new.visit_id;
    if v_visit.project_id is distinct from new.project_id then
      raise exception 'Labor on a visit must be on that visit''s project' using errcode = 'P0001';
    end if;
    if v_visit.work_type_id is null then
      raise exception 'WORK-TYPE: choose the work type of the visit first' using errcode = 'P0001';
    end if;
    new.work_type_id := v_visit.work_type_id;
  end if;
  if new.work_type_id is null then
    raise exception 'WORK-TYPE: a work type is required' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' or new.work_type_id is distinct from old.work_type_id then
    if not exists (select 1 from public.work_types where id = new.work_type_id and active) then
      raise exception 'WORK-TYPE: this work type is switched off' using errcode = 'P0001';
    end if;
  end if;
  if new.operational_target_id is not null
     and (tg_op = 'INSERT' or new.operational_target_id is distinct from old.operational_target_id)
     and not exists (select 1 from public.operational_targets where id = new.operational_target_id and active) then
    raise exception 'TARGET: this operational target is switched off' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger trg_labor_v22 before insert or update on public.labor_allocations
  for each row execute function public.labor_v22_guard();

-- Visits: a started visit needs a work type; it cannot start in a closed
-- month; a change of work type flows to its crew rows (still subject to the
-- month-close rules of the labor guard).
create or replace function public.visits_v22_guard() returns trigger
language plpgsql as $$
begin
  if new.status = 'in_progress' and (tg_op = 'INSERT' or old.status <> 'in_progress') then
    if new.work_type_id is null then
      raise exception 'WORK-TYPE: choose the work type of the visit first' using errcode = 'P0001';
    end if;
    if public.is_month_closed(new.visit_date) and auth.uid() is not null then
      raise exception 'BR-009: labor for this month is closed' using errcode = 'P0001';
    end if;
  end if;
  if new.work_type_id is not null
     and (tg_op = 'INSERT' or new.work_type_id is distinct from old.work_type_id)
     and not exists (select 1 from public.work_types where id = new.work_type_id and active) then
    raise exception 'WORK-TYPE: this work type is switched off' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger trg_visits_v22 before insert or update on public.visits
  for each row execute function public.visits_v22_guard();

create or replace function public.visits_work_type_flow() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.work_type_id is distinct from old.work_type_id and new.work_type_id is not null then
    update public.labor_allocations
       set work_type_id = new.work_type_id
     where visit_id = new.id and voided_at is null and work_type_id is distinct from new.work_type_id;
  end if;
  return new;
end;
$$;

create trigger trg_visits_work_type_flow after update on public.visits
  for each row execute function public.visits_work_type_flow();

-- Supervisors record crew days on their own projects, or on an operational
-- target (no project) for themselves.
drop policy if exists "labor supervisor insert" on public.labor_allocations;
create policy "labor supervisor insert" on public.labor_allocations for insert
  with check (supervisor_id = auth.uid()
              and (public.supervises_project(project_id)
                   or (public.is_supervisor() and project_id is null and operational_target_id is not null)));
drop policy if exists "labor supervisor update" on public.labor_allocations;
create policy "labor supervisor update" on public.labor_allocations for update
  using (supervisor_id = auth.uid()
         and (public.supervises_project(project_id) or (public.is_supervisor() and project_id is null)))
  with check (supervisor_id = auth.uid()
              and (public.supervises_project(project_id)
                   or (public.is_supervisor() and project_id is null and operational_target_id is not null)));

-- ---------------------------------------------------------------------------
-- Month close (§36A): not while a visit of that month is in progress. It is
-- completed first by its supervisor or a manager.
-- ---------------------------------------------------------------------------
create or replace function public.month_close_open_visits_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  select count(*) into v_count from public.visits
   where status = 'in_progress'
     and visit_date >= new.month and visit_date < (new.month + interval '1 month')::date;
  if v_count > 0 then
    raise exception 'MONTH-OPEN-VISITS: % visit(s) in this month are still in progress', v_count using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger trg_month_close_open_visits before insert on public.month_closes
  for each row execute function public.month_close_open_visits_guard();
