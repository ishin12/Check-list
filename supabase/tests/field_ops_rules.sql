-- Database-level acceptance tests for 0006_field_ops.sql (Master Spec §26, §32).
-- Run with scripts/test-db.sh against a throwaway Postgres. Every check raises
-- on failure, so the script stops at the first broken rule.

\set ON_ERROR_STOP 1
\o /dev/null
set client_min_messages = warning;
-- Fixtures use dates up to the end of 2026; pin "today" after them (0008 riyadh_today).
set app.today = '2026-12-31';

-- Supabase grants table access to `authenticated`; RLS does the filtering.
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

create or replace function pg_temp.act_as(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p::text, ''), false);
  if p is null then reset role; else set role authenticated; end if;
end $$;

-- Runs p_sql and asserts it fails with a message containing p_expect.
create or replace function pg_temp.expect_fail(p_label text, p_sql text, p_expect text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_expect in sqlerrm) = 0 then
      raise exception '% — failed with the wrong error: %', p_label, sqlerrm;
    end if;
    raise notice 'ok  %', p_label;
    return;
  end;
  raise exception '% — expected failure containing "%" but it succeeded', p_label, p_expect;
end $$;

create or replace function pg_temp.ok(p_label text, p_cond boolean) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'FAIL %', p_label; end if;
  raise notice 'ok  %', p_label;
end $$;

set client_min_messages = notice;

-- ---------------------------------------------------------------------------
-- Fixtures (as service role)
-- ---------------------------------------------------------------------------
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),  -- manager
  ('00000000-0000-0000-0000-00000000000b'),  -- supervisor 1
  ('00000000-0000-0000-0000-00000000000c'),  -- supervisor 2
  ('00000000-0000-0000-0000-00000000000d'),  -- finance
  ('00000000-0000-0000-0000-00000000000e');  -- manager with finance granted
insert into public.profiles (id, role, full_name, finance_access) values
  ('00000000-0000-0000-0000-00000000000a', 'manager',    'Manager', false),
  ('00000000-0000-0000-0000-00000000000b', 'supervisor', 'Sup One', false),
  ('00000000-0000-0000-0000-00000000000c', 'supervisor', 'Sup Two', false),
  ('00000000-0000-0000-0000-00000000000d', 'finance',    'Finance', false),
  ('00000000-0000-0000-0000-00000000000e', 'manager',    'Mgr+Fin', true);

insert into public.clients (id, name) values ('10000000-0000-0000-0000-000000000001', 'Client A');
insert into public.projects (id, code, name, client_id, project_type_id, supervisor_id)
select ('20000000-0000-0000-0000-00000000000' || n)::uuid, 'P-' || n, 'Project ' || n,
       '10000000-0000-0000-0000-000000000001',
       (select id from public.project_types where code = 'maintenance'),
       case n when 1 then '00000000-0000-0000-0000-00000000000b'::uuid
              else '00000000-0000-0000-0000-00000000000c'::uuid end
from generate_series(1, 2) n;

insert into public.employees (id, full_name)
select ('30000000-0000-0000-0000-00000000000' || n)::uuid, 'Worker ' || n from generate_series(1, 9) n;

-- ---------------------------------------------------------------------------
-- Labor allocation
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');

insert into public.labor_allocations (work_date, employee_id, project_id, duration, supervisor_id)
values ('2026-09-01', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1.0,
        '00000000-0000-0000-0000-00000000000b');

select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect_fail('TC-01 1.0 on A then 0.5 on B is rejected', $$
  insert into public.labor_allocations (work_date, employee_id, project_id, duration, supervisor_id)
  values ('2026-09-01', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 0.5,
          '00000000-0000-0000-0000-00000000000c') $$, 'BR-001');
select pg_temp.act_as(null);
select pg_temp.ok('TC-01 original record unchanged',
  (select count(*) = 1 and sum(duration) = 1.0 from public.labor_allocations
   where employee_id = '30000000-0000-0000-0000-000000000001'));

select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
insert into public.labor_allocations (work_date, employee_id, project_id, duration, supervisor_id)
values ('2026-09-01', '30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 0.5,
        '00000000-0000-0000-0000-00000000000b');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
insert into public.labor_allocations (work_date, employee_id, project_id, duration, supervisor_id)
values ('2026-09-01', '30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 0.5,
        '00000000-0000-0000-0000-00000000000c');
select pg_temp.act_as(null);
select pg_temp.ok('TC-02 0.5 + 0.5 on two projects = 1.0',
  (select sum(duration) = 1.0 from public.labor_allocations
   where employee_id = '30000000-0000-0000-0000-000000000002' and work_date = '2026-09-01'));

select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_fail('BR-002 only 0.5 or 1.0', $$
  insert into public.labor_allocations (work_date, employee_id, project_id, duration, supervisor_id)
  values ('2026-09-02', '30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 0.7,
          '00000000-0000-0000-0000-00000000000b') $$, 'duration_full_or_half');

insert into public.labor_allocations (work_date, employee_id, project_id, duration, supervisor_id)
select '2026-09-03', ('30000000-0000-0000-0000-00000000000' || n)::uuid,
       '20000000-0000-0000-0000-000000000001', 1.0, '00000000-0000-0000-0000-00000000000b'
from generate_series(1, 8) n;
select pg_temp.ok('TC-03 8 workers at once = 8 records',
  (select count(*) = 8 from public.labor_allocations where work_date = '2026-09-03'));

select pg_temp.expect_fail('Supervisor cannot load crew on a project they do not supervise', $$
  insert into public.labor_allocations (work_date, employee_id, project_id, duration, supervisor_id)
  values ('2026-09-04', '30000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000002', 1.0,
          '00000000-0000-0000-0000-00000000000b') $$, 'row-level security');

-- Voiding frees the day; a void needs a reason.
select pg_temp.act_as(null);
select pg_temp.expect_fail('Void needs a reason', $$
  update public.labor_allocations set voided_at = now()
  where employee_id = '30000000-0000-0000-0000-000000000008' and work_date = '2026-09-03' $$, 'void_needs_reason');

-- ---------------------------------------------------------------------------
-- Month close
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_fail('Supervisor cannot close a month', $$
  insert into public.month_closes (month) values ('2026-09-01') $$, 'row-level security');

select pg_temp.act_as('00000000-0000-0000-0000-00000000000d');
insert into public.month_closes (month) values ('2026-09-01');

select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_fail('TC-07 supervisor edit after close is rejected', $$
  update public.labor_allocations set duration = 0.5
  where employee_id = '30000000-0000-0000-0000-000000000001' and work_date = '2026-09-01' $$, 'BR-009');
select pg_temp.expect_fail('TC-07 supervisor insert into closed month is rejected', $$
  insert into public.labor_allocations (work_date, employee_id, project_id, duration, supervisor_id)
  values ('2026-09-20', '30000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000001', 1.0,
          '00000000-0000-0000-0000-00000000000b') $$, 'BR-009');

select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_fail('Manager without finance cannot edit after close', $$
  update public.labor_allocations set duration = 0.5, change_reason = 'fix'
  where employee_id = '30000000-0000-0000-0000-000000000001' and work_date = '2026-09-01' $$, 'BR-009');

select pg_temp.act_as('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect_fail('Finance edit after close needs a reason', $$
  update public.labor_allocations set duration = 0.5
  where employee_id = '30000000-0000-0000-0000-000000000001' and work_date = '2026-09-01' $$, 'BR-010');
update public.labor_allocations set duration = 0.5, change_reason = 'Worker left at noon'
where employee_id = '30000000-0000-0000-0000-000000000001' and work_date = '2026-09-01';

select pg_temp.act_as('00000000-0000-0000-0000-00000000000e');
update public.labor_allocations set notes = 'checked', change_reason = 'Audit review'
where employee_id = '30000000-0000-0000-0000-000000000002' and work_date = '2026-09-01'
  and project_id = '20000000-0000-0000-0000-000000000001';

select pg_temp.act_as(null);
select pg_temp.ok('TC-08 finance edit applied',
  (select duration = 0.5 from public.labor_allocations
   where employee_id = '30000000-0000-0000-0000-000000000001' and work_date = '2026-09-01'));
select pg_temp.ok('TC-08 audit has old value, new value, reason and user',
  (select count(*) = 1 from public.audit_log
   where entity = 'labor_allocations' and action = 'labor_allocations.update'
     and actor_id = '00000000-0000-0000-0000-00000000000d'
     and payload->'old'->>'duration' = '1.0'
     and payload->'new'->>'duration' = '0.5'
     and payload->'new'->>'change_reason' = 'Worker left at noon'));
select pg_temp.ok('Manager granted finance can edit after close',
  (select notes = 'checked' from public.labor_allocations
   where employee_id = '30000000-0000-0000-0000-000000000002' and work_date = '2026-09-01'
     and project_id = '20000000-0000-0000-0000-000000000001'));
select pg_temp.expect_fail('Month close cannot be undone', $$
  delete from public.month_closes where month = '2026-09-01' $$, 'BR-014');

-- ---------------------------------------------------------------------------
-- Visits, tasks, follow-up
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
insert into public.visits (id, project_id, visit_date, supervisor_id)
values ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '2026-10-01',
        '00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_fail('Visit cannot skip IN_PROGRESS', $$
  update public.visits set status = 'completed' where id = '40000000-0000-0000-0000-000000000001' $$, 'cannot move');
update public.visits set status = 'in_progress' where id = '40000000-0000-0000-0000-000000000001';

select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
insert into public.project_tasks (id, project_id, visit_id, description) values
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   '40000000-0000-0000-0000-000000000001', 'Fertilizing'),
  ('50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001',
   '40000000-0000-0000-0000-000000000001', 'Pruning');

select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
update public.project_tasks set status = 'needs_follow_up', last_visit_id = '40000000-0000-0000-0000-000000000001'
where id = '50000000-0000-0000-0000-000000000001';
update public.project_tasks set status = 'completed', completed_in_visit_id = '40000000-0000-0000-0000-000000000001'
where id = '50000000-0000-0000-0000-000000000002';
update public.visits set status = 'completed' where id = '40000000-0000-0000-0000-000000000001';

select pg_temp.ok('TC-04 visit completed, follow-up task still open',
  (select status = 'needs_follow_up' from public.project_tasks where id = '50000000-0000-0000-0000-000000000001')
  and (select status = 'completed' from public.visits where id = '40000000-0000-0000-0000-000000000001'));
select pg_temp.expect_fail('Follow-up cannot go back to open', $$
  update public.project_tasks set status = 'open' where id = '50000000-0000-0000-0000-000000000001' $$, 'cannot go back');
select pg_temp.expect_fail('Completed task cannot be reopened', $$
  update public.project_tasks set status = 'open' where id = '50000000-0000-0000-0000-000000000002' $$, 'cannot be reopened');

select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_fail('Completed task cannot be deleted', $$
  delete from public.project_tasks where id = '50000000-0000-0000-0000-000000000002' $$, 'BR-014');
select pg_temp.expect_fail('Completed visit cannot be deleted', $$
  delete from public.visits where id = '40000000-0000-0000-0000-000000000001' $$, 'BR-014');
select pg_temp.expect_fail('Project with a follow-up task cannot close', $$
  update public.projects set status = 'completed' where id = '20000000-0000-0000-0000-000000000001' $$, 'cannot be closed');

-- ---------------------------------------------------------------------------
-- TC-05 supervisor change keeps history
-- ---------------------------------------------------------------------------
update public.projects set supervisor_id = '00000000-0000-0000-0000-00000000000c'
where id = '20000000-0000-0000-0000-000000000001';

select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
select pg_temp.ok('TC-05 new supervisor sees previous visits',
  (select count(*) = 1 from public.visits where project_id = '20000000-0000-0000-0000-000000000001'));
select pg_temp.ok('TC-05 new supervisor sees previous and open tasks',
  (select count(*) = 2 from public.project_tasks where project_id = '20000000-0000-0000-0000-000000000001'));
select pg_temp.ok('TC-05 new supervisor sees the project labor',
  (select count(*) > 0 from public.labor_allocations where project_id = '20000000-0000-0000-0000-000000000001'));
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select pg_temp.ok('Old supervisor no longer sees the project',
  (select count(*) = 0 from public.projects where id = '20000000-0000-0000-0000-000000000001'));

-- ---------------------------------------------------------------------------
-- TC-06 recurring item due, rolled only when actually done
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
insert into public.project_recurring_items (id, project_id, description, recurrence, next_due_on)
values ('60000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
        'Irrigation check', 'monthly', '2026-10-05');
insert into public.project_tasks (id, project_id, source, recurring_item_id, description)
values ('50000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'recurring',
        '60000000-0000-0000-0000-000000000001', 'Irrigation check');
select pg_temp.ok('TC-06 not done until updated',
  (select last_done_on is null and next_due_on = '2026-10-05'
   from public.project_recurring_items where id = '60000000-0000-0000-0000-000000000001'));
update public.project_tasks set status = 'completed', completed_at = '2026-10-06 09:00+00'
where id = '50000000-0000-0000-0000-000000000003';
select pg_temp.ok('BR-011 last done and next due are rolled',
  (select last_done_on = '2026-10-06' and next_due_on = '2026-11-06'
   from public.project_recurring_items where id = '60000000-0000-0000-0000-000000000001'));

-- ---------------------------------------------------------------------------
-- TC-10 no hard delete
-- ---------------------------------------------------------------------------
select pg_temp.expect_fail('TC-10 project cannot be deleted', $$
  delete from public.projects where id = '20000000-0000-0000-0000-000000000002' $$, 'BR-014');
select pg_temp.expect_fail('Labor cannot be deleted', $$
  delete from public.labor_allocations where work_date = '2026-09-03' $$, 'BR-014');
select pg_temp.expect_fail('Employee cannot be deleted', $$
  delete from public.employees where id = '30000000-0000-0000-0000-000000000009' $$, 'BR-014');
select pg_temp.expect_fail('Client with projects cannot be deleted', $$
  delete from public.clients where id = '10000000-0000-0000-0000-000000000001' $$, 'foreign key');

update public.projects set status = 'completed' where id = '20000000-0000-0000-0000-000000000002';
select pg_temp.expect_fail('Completed project cannot be reopened', $$
  update public.projects set status = 'active' where id = '20000000-0000-0000-0000-000000000002' $$, 'cannot change status');
select pg_temp.ok('Completed project stays searchable',
  (select count(*) = 1 from public.projects where status = 'completed' and name ilike '%project 2%'));

-- ---------------------------------------------------------------------------
-- 0007: supervisor task inserts, day-load RPC, staff directory
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');  -- supervises P1 and P2 now
select pg_temp.expect_fail('Supervisor cannot add manual tasks', $$
  insert into public.project_tasks (project_id, description, source)
  values ('20000000-0000-0000-0000-000000000001', 'Something new', 'manual') $$, 'row-level security');
insert into public.project_tasks (id, project_id, description, source, required)
values ('50000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000001', 'Weeding', 'checklist', false);
select pg_temp.ok('Supervisor adds checklist tasks from templates',
  (select count(*) = 1 from public.project_tasks where id = '50000000-0000-0000-0000-000000000009'));
delete from public.project_tasks where id = '50000000-0000-0000-0000-000000000009';
select pg_temp.ok('C03 supervisor cannot remove a checklist item (BR-014, 0008)',
  (select count(*) = 1 from public.project_tasks where id = '50000000-0000-0000-0000-000000000009'));

select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');  -- supervises nothing now
select pg_temp.ok('Day load shows bookings on projects the supervisor cannot see',
  (select total = 1.0 from public.employee_day_load('2026-09-03', '2026-09-03')
   where employee_id = '30000000-0000-0000-0000-000000000001'));
select pg_temp.ok('Staff can read colleague names',
  (select count(*) >= 4 from public.profiles));

select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
insert into public.visits (id, project_id, visit_date, supervisor_id)
values ('40000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000001', '2026-10-20',
        '00000000-0000-0000-0000-00000000000c');
delete from public.visits where id = '40000000-0000-0000-0000-000000000009';
select pg_temp.ok('Supervisor removes a planned visit with no labor',
  (select count(*) = 0 from public.visits where id = '40000000-0000-0000-0000-000000000009'));

-- Same-visit correction and roll-on-visit-completion
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
insert into public.project_recurring_items (id, project_id, description, recurrence, next_due_on)
values ('60000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'Weekly check', 'weekly', '2026-10-20');
insert into public.visits (id, project_id, visit_date, supervisor_id, status)
values ('40000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', '2026-10-21',
        '00000000-0000-0000-0000-00000000000c', 'planned');
update public.visits set status = 'in_progress' where id = '40000000-0000-0000-0000-000000000005';
insert into public.project_tasks (id, project_id, visit_id, source, recurring_item_id, description)
values ('50000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001',
        '40000000-0000-0000-0000-000000000005', 'recurring', '60000000-0000-0000-0000-000000000002', 'Weekly check');
update public.project_tasks set status = 'completed', completed_in_visit_id = '40000000-0000-0000-0000-000000000005',
  completed_at = '2026-10-21 09:00+00' where id = '50000000-0000-0000-0000-000000000005';
select pg_temp.ok('Recurring item waits for the visit to complete',
  (select last_done_on is null from public.project_recurring_items where id = '60000000-0000-0000-0000-000000000002'));
update public.project_tasks set status = 'needs_follow_up' where id = '50000000-0000-0000-0000-000000000005';
select pg_temp.ok('A Done tap can be corrected while the visit is in progress',
  (select status = 'needs_follow_up' and completed_in_visit_id is null and completed_at is null
   from public.project_tasks where id = '50000000-0000-0000-0000-000000000005'));
update public.project_tasks set status = 'completed', completed_in_visit_id = '40000000-0000-0000-0000-000000000005',
  completed_at = '2026-10-21 09:30+00' where id = '50000000-0000-0000-0000-000000000005';
update public.visits set status = 'completed' where id = '40000000-0000-0000-0000-000000000005';
select pg_temp.ok('Visit completion rolls the recurring item',
  (select last_done_on = '2026-10-21' and next_due_on = '2026-10-28'
   from public.project_recurring_items where id = '60000000-0000-0000-0000-000000000002'));
select pg_temp.expect_fail('After the visit completes, Done is final', $$
  update public.project_tasks set status = 'open' where id = '50000000-0000-0000-0000-000000000005' $$, 'cannot be reopened');

-- Finance adds to a closed month (with reason) but not to an open one
select pg_temp.act_as('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect_fail('Finance cannot add labor to an open month', $$
  insert into public.labor_allocations (work_date, employee_id, project_id, duration, supervisor_id)
  values ('2026-10-15', '30000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000001', 1.0,
          '00000000-0000-0000-0000-00000000000c') $$, 'row-level security');
select pg_temp.expect_fail('Finance adding to a closed month needs a reason', $$
  insert into public.labor_allocations (work_date, employee_id, project_id, duration, supervisor_id)
  values ('2026-09-15', '30000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000001', 1.0,
          '00000000-0000-0000-0000-00000000000c') $$, 'BR-010');
insert into public.labor_allocations (work_date, employee_id, project_id, duration, supervisor_id, change_reason)
values ('2026-09-15', '30000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000001', 1.0,
        '00000000-0000-0000-0000-00000000000c', 'Missed on the day');
select pg_temp.ok('Finance adds a missing allocation to a closed month with a reason',
  (select count(*) = 1 from public.labor_allocations where work_date = '2026-09-15'));

-- Review fixes
select pg_temp.act_as(null);
insert into public.labor_allocations (work_date, employee_id, project_id, duration, supervisor_id)
values ('2026-10-12', '30000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000001', 1.0,
        '00000000-0000-0000-0000-00000000000c');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000d');   -- finance
update public.labor_allocations set voided_at = now(), void_reason = 'test'
where work_date = '2026-10-12';
select pg_temp.ok('Finance cannot void labor in an open month',
  (select count(*) = 1 from public.labor_allocations where work_date = '2026-10-12' and voided_at is null));

select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');   -- manager
insert into public.visits (id, project_id, visit_date, supervisor_id, status)
values ('40000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000001', '2026-10-22',
        '00000000-0000-0000-0000-00000000000c', 'planned');
update public.visits set status = 'in_progress' where id = '40000000-0000-0000-0000-000000000006';
insert into public.project_tasks (id, project_id, visit_id, description)
values ('50000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000001',
        '40000000-0000-0000-0000-000000000006', 'Mulching');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');   -- supervisor of P1
update public.project_tasks set status = 'needs_follow_up' where id = '50000000-0000-0000-0000-000000000006';
update public.project_tasks set status = 'completed', completed_in_visit_id = '40000000-0000-0000-0000-000000000006'
where id = '50000000-0000-0000-0000-000000000006';
update public.project_tasks set status = 'open' where id = '50000000-0000-0000-0000-000000000006';
select pg_temp.ok('Correcting Done on a follow-up keeps it as follow-up',
  (select status = 'needs_follow_up' from public.project_tasks where id = '50000000-0000-0000-0000-000000000006'));

insert into public.project_tasks (id, project_id, source, description, status, completed_in_visit_id)
values ('50000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000001', 'checklist', 'Edging',
        'completed', '40000000-0000-0000-0000-000000000006');
select pg_temp.ok('Supervisor-inserted tasks start open',
  (select status = 'open' and completed_in_visit_id is null from public.project_tasks where id = '50000000-0000-0000-0000-000000000007'));

select pg_temp.expect_fail('Supervisor cannot hand a visit to someone else', $$
  update public.visits set supervisor_id = '00000000-0000-0000-0000-00000000000b'
  where id = '40000000-0000-0000-0000-000000000006' $$, 'only assign a visit to themselves');
select pg_temp.expect_fail('Supervisor cannot move the date of a started visit', $$
  update public.visits set visit_date = '2026-10-01' where id = '40000000-0000-0000-0000-000000000006' $$, 'cannot be changed');
update public.visits set status = 'completed' where id = '40000000-0000-0000-0000-000000000006';
select pg_temp.expect_fail('A completed visit is read-only to supervisors', $$
  update public.visits set notes = 'late edit' where id = '40000000-0000-0000-0000-000000000006' $$, 'completed visit cannot be changed');

insert into public.visit_reports (id, visit_id, content)
values ('70000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000006', '{"done":[]}');
update public.visit_reports set signer_name = 'Khaled' where id = '70000000-0000-0000-0000-000000000001';
select pg_temp.ok('Supervisor records the client representative',
  (select signer_name = 'Khaled' from public.visit_reports where id = '70000000-0000-0000-0000-000000000001'));
select pg_temp.expect_fail('An issued report cannot be rewritten', $$
  update public.visit_reports set content = '{"done":["fake"]}' where id = '70000000-0000-0000-0000-000000000001' $$, 'cannot be rewritten');

-- ---------------------------------------------------------------------------
-- 0008 — UAT fixes (C03, I01, I04)
-- ---------------------------------------------------------------------------

-- C03 / BR-014: tasks are never deleted, by anyone.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');   -- manager
select pg_temp.expect_fail('C03 manager cannot delete a task', $$
  delete from public.project_tasks where id = '50000000-0000-0000-0000-000000000007' $$, 'BR-014');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');   -- supervisor
delete from public.project_tasks where id = '50000000-0000-0000-0000-000000000007';
select pg_temp.act_as(null);
select pg_temp.ok('C03 supervisor delete removes nothing (no delete policy)',
  (select count(*) = 1 from public.project_tasks where id = '50000000-0000-0000-0000-000000000007'));
select pg_temp.expect_fail('C03 not even the service role can delete a task', $$
  delete from public.project_tasks where id = '50000000-0000-0000-0000-000000000007' $$, 'BR-014');

-- I04 / BR-008: no new or restarted visits on a completed / closed project.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
insert into public.projects (id, code, name, client_id, project_type_id, supervisor_id) values
  ('20000000-0000-0000-0000-000000000003', 'P-3', 'Project 3', '10000000-0000-0000-0000-000000000001',
   (select id from public.project_types where code = 'maintenance'), '00000000-0000-0000-0000-00000000000b'),
  ('20000000-0000-0000-0000-000000000004', 'P-4', 'Project 4', '10000000-0000-0000-0000-000000000001',
   (select id from public.project_types where code = 'maintenance'), '00000000-0000-0000-0000-00000000000b');
insert into public.visits (id, project_id, visit_date, supervisor_id, status)
values ('40000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000004', '2026-10-23',
        '00000000-0000-0000-0000-00000000000b', 'planned');
update public.projects set status = 'closed' where id in ('20000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000004');
select pg_temp.expect_fail('I04 a closed project takes no new visit', $$
  insert into public.visits (project_id, visit_date, supervisor_id)
  values ('20000000-0000-0000-0000-000000000003', '2026-10-23', '00000000-0000-0000-0000-00000000000b') $$, 'BR-008');
select pg_temp.expect_fail('I04 a planned visit on a closed project cannot be started', $$
  update public.visits set status = 'in_progress' where id = '40000000-0000-0000-0000-000000000007' $$, 'BR-008');
select pg_temp.expect_fail('I04 a closed project cannot be deleted', $$
  delete from public.projects where id = '20000000-0000-0000-0000-000000000003' $$, 'BR-014');
select pg_temp.ok('I04 a closed project stays searchable',
  (select count(*) = 2 from public.projects where status = 'closed' and name like 'Project %'));

-- I01 / §9: every stage has a checklist and gates progress.
select pg_temp.ok('I01 each establishment stage has a checklist',
  (select count(distinct t.stage_id) = 6 from public.templates t
   join public.project_stages s on s.id = t.stage_id
   join public.project_types pt on pt.id = s.project_type_id and pt.code = 'establishment'));
insert into public.projects (id, code, name, client_id, project_type_id, stage_id, supervisor_id)
values ('20000000-0000-0000-0000-000000000005', 'E-1', 'Est 1', '10000000-0000-0000-0000-000000000001',
        (select id from public.project_types where code = 'establishment'),
        (select s.id from public.project_stages s join public.project_types pt on pt.id = s.project_type_id
         where pt.code = 'establishment' and s.code = 'site_handover'),
        '00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_fail('I01 cannot advance before the stage checklist is done', $$
  update public.projects set stage_id = (select s.id from public.project_stages s join public.project_types pt on pt.id = s.project_type_id
    where pt.code = 'establishment' and s.code = 'preparatory')
  where id = '20000000-0000-0000-0000-000000000005' $$, 'STAGE-GATE');
select pg_temp.expect_fail('I01 cannot skip stages either', $$
  update public.projects set stage_id = (select s.id from public.project_stages s join public.project_types pt on pt.id = s.project_type_id
    where pt.code = 'establishment' and s.code = 'irrigation')
  where id = '20000000-0000-0000-0000-000000000005' $$, 'STAGE-GATE');

insert into public.visits (id, project_id, visit_date, supervisor_id, status)
values ('40000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000005', '2026-10-24',
        '00000000-0000-0000-0000-00000000000b', 'planned');
update public.visits set status = 'in_progress' where id = '40000000-0000-0000-0000-000000000008';
insert into public.project_tasks (project_id, visit_id, source, template_id, template_item_id, description)
select '20000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000008', 'stage', t.id, item ->> 'id', item -> 'label' ->> 'en'
from public.templates t
join public.project_stages s on s.id = t.stage_id and s.code = 'site_handover'
join public.project_types pt on pt.id = s.project_type_id and pt.code = 'establishment'
cross join lateral jsonb_array_elements(t.tasks) item
where (item ->> 'required')::boolean;
-- Two of three done: still blocked.
update public.project_tasks set status = 'completed', completed_in_visit_id = '40000000-0000-0000-0000-000000000008'
where project_id = '20000000-0000-0000-0000-000000000005' and template_item_id in ('sh-receive', 'sh-condition');
select pg_temp.expect_fail('I01 one missing required item still blocks', $$
  update public.projects set stage_id = (select s.id from public.project_stages s join public.project_types pt on pt.id = s.project_type_id
    where pt.code = 'establishment' and s.code = 'preparatory')
  where id = '20000000-0000-0000-0000-000000000005' $$, 'Site handover');
update public.project_tasks set status = 'completed', completed_in_visit_id = '40000000-0000-0000-0000-000000000008'
where project_id = '20000000-0000-0000-0000-000000000005' and template_item_id = 'sh-obstacles';
select pg_temp.expect_fail('L2 items done on a visit still in progress do not count yet', $$
  update public.projects set stage_id = (select s.id from public.project_stages s join public.project_types pt on pt.id = s.project_type_id
    where pt.code = 'establishment' and s.code = 'preparatory')
  where id = '20000000-0000-0000-0000-000000000005' $$, 'STAGE-GATE');
update public.visits set status = 'completed' where id = '40000000-0000-0000-0000-000000000008';
update public.projects set stage_id = (select s.id from public.project_stages s join public.project_types pt on pt.id = s.project_type_id
  where pt.code = 'establishment' and s.code = 'preparatory')
where id = '20000000-0000-0000-0000-000000000005';
select pg_temp.ok('I01 advances once the required items are done',
  (select s.code = 'preparatory' from public.projects p join public.project_stages s on s.id = p.stage_id
   where p.id = '20000000-0000-0000-0000-000000000005'));
select pg_temp.ok('I01 optional "agricultural wool" item does not gate',
  (select public.stage_missing_items('20000000-0000-0000-0000-000000000005',
     (select s.id from public.project_stages s join public.project_types pt on pt.id = s.project_type_id
      where pt.code = 'establishment' and s.code = 'preparatory')) = 3));
update public.projects set stage_id = (select s.id from public.project_stages s join public.project_types pt on pt.id = s.project_type_id
  where pt.code = 'establishment' and s.code = 'site_handover')
where id = '20000000-0000-0000-0000-000000000005';
select pg_temp.ok('I01 management can move a project back a stage',
  (select s.code = 'site_handover' from public.projects p join public.project_stages s on s.id = p.stage_id
   where p.id = '20000000-0000-0000-0000-000000000005'));

-- D-05: a follow-up set by mistake is correctable on the same visit only.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
insert into public.visits (id, project_id, visit_date, supervisor_id, status)
values ('40000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000001', '2026-10-25',
        '00000000-0000-0000-0000-00000000000b', 'planned');
update public.visits set status = 'in_progress' where id = '40000000-0000-0000-0000-000000000009';
insert into public.project_tasks (id, project_id, visit_id, description)
values ('50000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000001',
        '40000000-0000-0000-0000-000000000009', 'Hedge trimming');
update public.project_tasks set status = 'needs_follow_up', last_visit_id = '40000000-0000-0000-0000-000000000009'
where id = '50000000-0000-0000-0000-000000000010';
update public.project_tasks set status = 'open' where id = '50000000-0000-0000-0000-000000000010';
select pg_temp.ok('D-05 a mistaken follow-up is corrected to not done on the same visit',
  (select status = 'open' and not was_follow_up from public.project_tasks where id = '50000000-0000-0000-0000-000000000010'));
update public.project_tasks set status = 'needs_follow_up', last_visit_id = '40000000-0000-0000-0000-000000000009'
where id = '50000000-0000-0000-0000-000000000010';
update public.project_tasks set status = 'completed', completed_in_visit_id = '40000000-0000-0000-0000-000000000009'
where id = '50000000-0000-0000-0000-000000000010';
update public.project_tasks set status = 'open' where id = '50000000-0000-0000-0000-000000000010';
select pg_temp.ok('D-05 follow-up then done then not done, all on one visit, ends open',
  (select status = 'open' from public.project_tasks where id = '50000000-0000-0000-0000-000000000010'));
update public.project_tasks set status = 'needs_follow_up', last_visit_id = '40000000-0000-0000-0000-000000000009'
where id = '50000000-0000-0000-0000-000000000010';
update public.visits set status = 'completed' where id = '40000000-0000-0000-0000-000000000009';
select pg_temp.expect_fail('D-05 after the visit, a follow-up cannot go back to open (BR-006)', $$
  update public.project_tasks set status = 'open' where id = '50000000-0000-0000-0000-000000000010' $$, 'cannot go back to open');

-- D-07 / D-13
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
insert into public.projects (id, code, name, client_id, project_type_id, supervisor_id)
values ('20000000-0000-0000-0000-000000000006', 'P-6', 'Project 6', '10000000-0000-0000-0000-000000000001',
        (select id from public.project_types where code = 'maintenance'), '00000000-0000-0000-0000-00000000000b');
insert into public.visits (id, project_id, visit_date, supervisor_id, status)
values ('40000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000006',
        '2026-12-31', '00000000-0000-0000-0000-00000000000b', 'planned');
update public.visits set status = 'in_progress' where id = '40000000-0000-0000-0000-000000000010';
select pg_temp.expect_fail('D-07 a project with a visit in progress cannot be closed', $$
  update public.projects set status = 'closed' where id = '20000000-0000-0000-0000-000000000006' $$, 'visit in progress');
insert into public.visits (id, project_id, visit_date, supervisor_id, status)
values ('40000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000006',
        '2027-01-03', '00000000-0000-0000-0000-00000000000b', 'planned');
select pg_temp.ok('D-13 a future visit can be planned', true);
select pg_temp.expect_fail('D-13 a future visit cannot be started early', $$
  update public.visits set status = 'in_progress' where id = '40000000-0000-0000-0000-000000000011' $$, 'before its date');

-- D-29: done on a visit = done on the visit's date.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
insert into public.project_recurring_items (id, project_id, description, recurrence, next_due_on)
values ('60000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000006',
        'Spraying', 'monthly', '2026-12-01');
insert into public.visits (id, project_id, visit_date, supervisor_id, status)
values ('40000000-0000-0000-0000-000000000012', '20000000-0000-0000-0000-000000000006', '2026-12-20',
        '00000000-0000-0000-0000-00000000000b', 'planned');
update public.visits set status = 'in_progress' where id = '40000000-0000-0000-0000-000000000012';
insert into public.project_tasks (id, project_id, visit_id, source, recurring_item_id, description)
values ('50000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000006',
        '40000000-0000-0000-0000-000000000012', 'recurring', '60000000-0000-0000-0000-00000000000a', 'Spraying');
update public.project_tasks set status = 'completed', completed_in_visit_id = '40000000-0000-0000-0000-000000000012',
  completed_at = '2026-12-22 21:30+00'   -- entered late: 23 Dec in Riyadh
where id = '50000000-0000-0000-0000-000000000011';
update public.visits set status = 'completed' where id = '40000000-0000-0000-0000-000000000012';
select pg_temp.ok('D-29 periodic item done on a visit rolls from the visit date',
  (select last_done_on = '2026-12-20' and next_due_on = '2027-01-20'
   from public.project_recurring_items where id = '60000000-0000-0000-0000-00000000000a'));

-- M1 / M4 / L7
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
insert into public.employees (full_name, code) values ('Imran Khan', 'W-003');
select pg_temp.expect_fail('M1 employee numbers are unique (case-insensitive)', $$
  insert into public.employees (full_name, code) values ('Imran Khan', 'w-003') $$, 'employees_code_unique');
select pg_temp.expect_fail('M4 a manager cannot deactivate their own account', $$
  update public.profiles set active = false where id = '00000000-0000-0000-0000-00000000000a' $$, 'your own account');
update public.profiles set active = false where id = '00000000-0000-0000-0000-00000000000c';
select pg_temp.ok('L7 team changes are audited',
  (select count(*) >= 1 from public.audit_log where entity = 'profiles' and entity_id = '00000000-0000-0000-0000-00000000000c'));

select pg_temp.act_as(null);
\o
\echo 'All field-ops rule checks passed.'
