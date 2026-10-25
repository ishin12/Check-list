#!/usr/bin/env bash
# Verifier: larger synthetic backfill check (200 tasks / 12 workers) on a fresh DB.
# Usage: TEST_DB=verify_big supabase/tests/verify_backfill.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; DB="${TEST_DB:-verify_big}"
P=(psql -v ON_ERROR_STOP=1 -q -X -d "$DB")
psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
"${P[@]}" -f "$ROOT/supabase/tests/_supabase_stub.sql"
for f in "$ROOT"/supabase/migrations/000[1-4]_*.sql; do "${P[@]}" --single-transaction -f "$f"; done
"${P[@]}" <<'SQL'
insert into auth.users select gen_random_uuid() from generate_series(1,12);
insert into public.profiles(id, role, full_name) select id, 'worker', 'W'||row_number() over () from auth.users;
insert into public.clients(name) select 'C'||g from generate_series(1,15) g;
insert into public.tasks(title, client_id, assigned_worker_id, scheduled_at, status)
select 'T'||g, (select id from public.clients order by id offset (g%15) limit 1),
       (select id from public.profiles order by id offset (g%12) limit 1), now()+ (g||' hours')::interval,
       (array['not_started','in_progress','submitted','approved','rejected'])[1+g%5]::public.task_status
from generate_series(1,200) g;
create table pre_n as select * from public.notifications;
SQL
for pass in 1 2; do
  for f in 0005_storage 0006_task_workers; do
    "${P[@]}" --single-transaction -f "$ROOT/supabase/migrations/$f.sql" 2>&1 | grep -v NOTICE || true
  done
done
"${P[@]}" -tA <<'SQL'
select 'tasks', count(*) from public.tasks;
select 'tw_rows', count(*) from public.task_workers;
select 'tasks_without_exactly_one_matching_row', count(*) from public.tasks t
 where (select count(*) from public.task_workers w where w.task_id=t.id)<>1
    or not exists(select 1 from public.task_workers w where w.task_id=t.id and w.worker_id=t.assigned_worker_id);
select 'notif_before', count(*) from pre_n;
select 'notif_after', count(*) from public.notifications;
select 'notif_new_rows', count(*) from public.notifications n where not exists (select 1 from pre_n p where p.id=n.id);
SQL
