-- Recurring tasks: weekly / monthly / quarterly / biannual.
-- The "next occurrence" is created from the app layer on approval (see
-- src/screens/TaskDetail/TaskDetailScreen.tsx + services/data/tasks.ts).
-- We just need columns to carry the rule and tie a series together.

create type public.task_recurrence as enum (
  'none',
  'weekly',
  'monthly',
  'quarterly',
  'biannual'
);

alter table public.tasks
  add column recurrence public.task_recurrence not null default 'none',
  add column series_id uuid;

-- Backfill: each existing task is its own one-off series.
update public.tasks set series_id = id where series_id is null;

alter table public.tasks alter column series_id set not null;
alter table public.tasks alter column series_id set default gen_random_uuid();

create index on public.tasks (series_id);
