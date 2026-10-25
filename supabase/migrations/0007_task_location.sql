-- 0007: optional Google Maps location on jobs (tasks).
-- ADDITIVE and re-runnable: nullable columns, constraints added only if missing,
-- no data is read, updated or deleted. Existing tasks keep a null location.
--
-- Access: the existing RLS policies on public.tasks are row-level, so they
-- already cover the new columns. Workers can update tasks they are on, which
-- includes these columns; that is accepted because the UI only lets managers
-- edit the location.

alter table public.tasks add column if not exists location_url text;
alter table public.tasks add column if not exists location_lat double precision;
alter table public.tasks add column if not exists location_lng double precision;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tasks'::regclass and conname = 'tasks_location_coords_chk'
  ) then
    alter table public.tasks add constraint tasks_location_coords_chk check (
      (location_lat is null and location_lng is null)
      or (location_lat is not null and location_lng is not null
          and location_lat between -90 and 90
          and location_lng between -180 and 180)
    );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tasks'::regclass and conname = 'tasks_location_url_chk'
  ) then
    alter table public.tasks add constraint tasks_location_url_chk check (
      location_url is null
      or (char_length(location_url) <= 2000 and location_url like 'https://%')
    );
  end if;
end $$;

-- ROLLBACK (manual, only if needed):
--   alter table public.tasks drop constraint if exists tasks_location_coords_chk;
--   alter table public.tasks drop constraint if exists tasks_location_url_chk;
-- The three columns can be left in place harmlessly. Dropping them
-- (location_url, location_lat, location_lng) destroys data and requires owner approval.
