-- Optional default Google Maps location per client. Jobs keep a location snapshot.
alter table public.clients add column if not exists location_url text;
alter table public.clients add column if not exists location_lat double precision;
alter table public.clients add column if not exists location_lng double precision;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.clients'::regclass and conname = 'clients_location_coords_chk') then
    alter table public.clients add constraint clients_location_coords_chk check (
      (location_lat is null and location_lng is null)
      or (location_lat is not null and location_lng is not null and location_lat between -90 and 90 and location_lng between -180 and 180)
    );
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.clients'::regclass and conname = 'clients_location_url_chk') then
    alter table public.clients add constraint clients_location_url_chk check (
      location_url is null or (char_length(location_url) <= 2000 and location_url like 'https://%')
    );
  end if;
end $$;
