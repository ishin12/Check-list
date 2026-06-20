-- Free-form log of extra work a worker did on a task, beyond the template.
-- Stored inline because entries are tightly coupled to the task and we never
-- query them in isolation. Shape: jsonb array of
-- { id, body, addedAt, addedBy, addedByName? }.

alter table public.tasks
  add column extra_work jsonb not null default '[]'::jsonb;
