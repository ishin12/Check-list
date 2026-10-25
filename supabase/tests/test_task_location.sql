-- Task location (migration 0007). Runs in one transaction that is rolled back.
begin;

do $$ declare n int; begin
  select count(*) into n from public.tasks
   where location_url is not null or location_lat is not null or location_lng is not null;
  if n <> 0 then raise exception 'existing tasks must have null location, % do not', n; end if;
end $$;

-- Valid: coordinates + url, then clear.
update public.tasks set location_url = 'https://www.google.com/maps/search/?api=1&query=24.7,46.7',
  location_lat = 24.7, location_lng = 46.7
  where id = '30000000-0000-0000-0000-000000000001';
update public.tasks set location_url = null, location_lat = null, location_lng = null
  where id = '30000000-0000-0000-0000-000000000001';
-- Valid: url only (short link without coordinates).
update public.tasks set location_url = 'https://maps.app.goo.gl/abc123'
  where id = '30000000-0000-0000-0000-000000000001';

-- Invalid cases: each must raise check_violation.
do $$
declare
  stmts text[] := array[
    'update public.tasks set location_lat = 91, location_lng = 10',
    'update public.tasks set location_lat = -91, location_lng = 10',
    'update public.tasks set location_lat = 10, location_lng = 181',
    'update public.tasks set location_lat = 10',
    'update public.tasks set location_lng = 10',
    'update public.tasks set location_url = ''http://maps.google.com/?q=1,2''',
    'update public.tasks set location_url = ''https://'' || repeat(''a'', 2000)'
  ];
  s text;
begin
  foreach s in array stmts loop
    begin
      execute s || ' where id = ''30000000-0000-0000-0000-000000000002''';
      raise exception 'accepted invalid location: %', s;
    exception when check_violation then
      null; -- expected
    end;
  end loop;
end $$;

rollback;
