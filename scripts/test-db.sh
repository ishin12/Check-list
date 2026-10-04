#!/usr/bin/env bash
# Applies every migration to a fresh throwaway database and runs the
# database-level business-rule tests (BR-001..015, TC-01..12).
#
# Needs psql and a Postgres you can create databases on; standard PG* env
# vars pick the server (e.g. PGHOST=/tmp PGPORT=5432 PGUSER=postgres).
# Never point this at the production project.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${TEST_DB:-field_ops_test}"
PSQL=(psql -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB"
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/tests/_supabase_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "migrate $(basename "$f")"
  # One transaction per file, like the Supabase SQL editor.
  "${PSQL[@]}" -d "$DB" --single-transaction -f "$f"
done

"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/tests/field_ops_rules.sql"

# TC-12: two sessions load the same worker at the same time. The first holds
# its transaction open; the second must wait, then be rejected.
EMP=30000000-0000-0000-0000-000000000009
PRJ=20000000-0000-0000-0000-000000000001
SUP=00000000-0000-0000-0000-00000000000c
INSERT="insert into public.labor_allocations (work_date, employee_id, project_id, duration, supervisor_id, work_type_id)
        values ('2026-10-10', '$EMP', '$PRJ', %s, '$SUP', (select id from public.work_types where code = 'maintenance'))"
"${PSQL[@]}" -d "$DB" -c "begin; $(printf "$INSERT" 1.0); select pg_sleep(2); commit;" >/dev/null &
FIRST=$!
sleep 0.5
if SECOND_OUT=$("${PSQL[@]}" -d "$DB" -c "$(printf "$INSERT" 0.5)" 2>&1); then
  echo "FAIL TC-12: concurrent second load was accepted"; exit 1
fi
wait "$FIRST"
grep -q "BR-001" <<<"$SECOND_OUT" || { echo "FAIL TC-12: wrong error: $SECOND_OUT"; exit 1; }
TOTAL=$("${PSQL[@]}" -d "$DB" -tAc "select sum(duration) from public.labor_allocations
         where employee_id = '$EMP' and work_date = '2026-10-10' and voided_at is null")
[ "$TOTAL" = "1.0" ] || { echo "FAIL TC-12: day total is $TOTAL"; exit 1; }
echo "ok  TC-12 concurrent loads: one wins, the other is rejected (total 1.0)"

"${PSQL[@]}" -d postgres -c "drop database $DB"
echo "Database tests passed."
