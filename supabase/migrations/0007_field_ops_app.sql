-- Field-ops app support (Phase 2–4 screens).
--
--   * project_tasks.required: an item the supervisor must answer on the visit
--     (Done / Not done / Needs follow-up). Optional checklist items may be skipped.
--   * visit_reports.content: the report as generated when the visit was
--     completed, so later visits never rewrite an issued report (§12, §30).
--   * Supervisors may add checklist / stage / recurring tasks to their visits
--     (the app builds them from the admin's templates); manual tasks stay
--     manager-only (§29).
--   * employee_day_load(): day totals across ALL projects, so a supervisor sees
--     who is already booked elsewhere without seeing other projects' rows.
--   * Staff can read each other's names (history shows who did what).
--   * app_settings.work_days: working weekdays for the unallocated report
--     (0 = Sunday … 6 = Saturday). Default Sat–Thu.

alter table public.project_tasks
  add column required boolean not null default true;

alter table public.visit_reports
  add column content jsonb;

alter table public.app_settings
  add column work_days smallint[] not null default '{0,1,2,3,4,6}';

-- Supervisors add template-driven tasks to projects they supervise.
create policy "ptasks supervisor insert" on public.project_tasks for insert
  with check (public.supervises_project(project_id) and source <> 'manual');

-- Supervisors may delete an untouched optional checklist item they created
-- for the visit (the delete guard still blocks completed tasks).
create policy "ptasks supervisor delete" on public.project_tasks for delete
  using (public.supervises_project(project_id) and source = 'checklist'
         and not required and status = 'open');

-- Supervisors record the client representative on their visit reports.
create policy "reports supervisor update" on public.visit_reports for update
  using (exists (select 1 from public.visits v
                 where v.id = visit_reports.visit_id and public.supervises_project(v.project_id)))
  with check (exists (select 1 from public.visits v
                      where v.id = visit_reports.visit_id and public.supervises_project(v.project_id)));

-- Staff directory: names of supervisors/managers for history and reports.
create policy "profiles staff read" on public.profiles for select
  using (public.is_supervisor() or public.has_finance());

-- Day totals per employee (non-voided), any project.
create or replace function public.employee_day_load(p_from date, p_to date)
returns table (employee_id uuid, work_date date, total numeric)
language sql stable security definer set search_path = public as $$
  select la.employee_id, la.work_date, sum(la.duration)
  from public.labor_allocations la
  where la.work_date between p_from and p_to
    and la.voided_at is null
    and (public.is_manager() or public.is_supervisor() or public.has_finance())
  group by la.employee_id, la.work_date;
$$;

grant execute on function public.employee_day_load(date, date) to authenticated;

-- A supervisor may remove a planned visit on their project (e.g. the crew was
-- refused while starting it). visits_guard still allows this only for
-- planned visits with no labor.
create policy "visits supervisor delete" on public.visits for delete
  using (public.supervises_project(project_id) and status = 'planned');

-- ---------------------------------------------------------------------------
-- Same-visit correction of a "Done" tap.
--
-- A task marked completed during a visit may be set back to open / follow-up
-- only while that visit is still IN_PROGRESS (a mis-tap on the phone). Once
-- the visit is completed, or for tasks completed outside a visit, completed
-- stays final (§27). Recurring items therefore roll forward when the visit
-- completes, so a corrected tap never moves a due date.
-- ---------------------------------------------------------------------------
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
      if old.completed_in_visit_id is null or not exists (
           select 1 from public.visits v
           where v.id = old.completed_in_visit_id and v.status = 'in_progress') then
        raise exception 'A completed task cannot be reopened' using errcode = 'P0001';
      end if;
      new.completed_at = null;
      new.completed_in_visit_id = null;
      return new;
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

create or replace function public.roll_one_recurring(p_item uuid, p_done date) returns void
language sql security definer set search_path = public as $$
  update public.project_recurring_items r
    set last_done_on = p_done,
        next_due_on = (p_done + case r.recurrence
                         when 'weekly'    then interval '7 days'
                         when 'monthly'   then interval '1 month'
                         when 'quarterly' then interval '3 months'
                         when 'biannual'  then interval '6 months'
                       end)::date
    where r.id = p_item;
$$;

-- Completed outside a visit (e.g. by a manager): roll at once.
create or replace function public.roll_recurring_item() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.recurring_item_id is not null and new.completed_in_visit_id is null
     and new.status = 'completed' and old.status is distinct from 'completed' then
    perform public.roll_one_recurring(new.recurring_item_id, coalesce(new.completed_at, now())::date);
  end if;
  return new;
end;
$$;

-- Completed during a visit: roll when the visit completes.
create or replace function public.roll_recurring_on_visit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  t record;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    for t in
      select recurring_item_id, completed_at from public.project_tasks
      where completed_in_visit_id = new.id and status = 'completed' and recurring_item_id is not null
    loop
      perform public.roll_one_recurring(t.recurring_item_id, coalesce(t.completed_at, now())::date);
    end loop;
  end if;
  return new;
end;
$$;

create trigger trg_visits_roll_recurring after update on public.visits
  for each row execute function public.roll_recurring_on_visit();

-- Finance may add a missing allocation to a CLOSED month only (§29 "edit after
-- close" = finance). The guard trigger still requires a reason and audits it.
create policy "labor finance insert closed" on public.labor_allocations for insert
  with check (public.has_finance() and public.is_month_closed(work_date));

-- ---------------------------------------------------------------------------
-- Urdu names for the seeded configuration (§17: Arabic + English + Urdu).
-- Only fills Urdu where it is missing; admin edits are never overwritten.
-- ---------------------------------------------------------------------------
update public.project_types t set name = t.name || jsonb_build_object('ur', v.ur)
from (values
  ('establishment', 'قیام / تعمیر'),
  ('maintenance',   'دیکھ بھال'),
  ('modification',  'ترمیم / اضافہ'),
  ('other',         'دیگر')
) as v(code, ur)
where t.code = v.code and not (t.name ? 'ur');

update public.project_stages s set name = s.name || jsonb_build_object('ur', v.ur)
from (values
  ('site_handover',  'سائٹ کی وصولی اور تیاری'),
  ('preparatory',    'تیاری کے کام'),
  ('irrigation',     'آبپاشی کا نظام'),
  ('planting_ready', 'شجرکاری کی تیاری'),
  ('planting',       'شجرکاری / تعمیر'),
  ('handover',       'معائنہ اور حوالگی')
) as v(code, ur)
where s.code = v.code and not (s.name ? 'ur');

-- Standard maintenance list: add Urdu labels by matching the English label.
update public.templates tpl set tasks = (
  select jsonb_agg(
    case when item->'label' ? 'ur' or m.ur is null then item
         else jsonb_set(item, '{label,ur}', to_jsonb(m.ur)) end
    order by ord)
  from jsonb_array_elements(tpl.tasks) with ordinality as e(item, ord)
  left join (values
    ('Irrigation network check',           'آبپاشی کے نظام کا معائنہ'),
    ('Plant and general condition check',  'پودوں اور عمومی حالت کا معائنہ'),
    ('Pruning',                            'کٹائی'),
    ('Fertilizing',                        'کھاد ڈالنا'),
    ('Spraying / pest control',            'اسپرے / کیڑوں کا تدارک'),
    ('Weeding',                            'جڑی بوٹیوں کی صفائی'),
    ('Cleaning',                           'صفائی'),
    ('Pumps / site equipment check',       'پمپ / سائٹ کے آلات کا معائنہ'),
    ('Special replacements or treatments', 'خصوصی تبدیلیاں یا علاج')
  ) as m(en, ur) on m.en = item->'label'->>'en'
)
where tpl.title->>'en' = 'Maintenance — standard';
