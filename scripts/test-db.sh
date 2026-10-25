#!/usr/bin/env bash
# Builds a throwaway local staging database: Supabase stub, the original
# migrations (0001-0004), synthetic seed data, then every later migration
# twice (to prove they are safe to re-run), then the SQL tests.
#
# Needs psql and a local Postgres you can create databases on; standard PG*
# env vars pick the server. Never point this at the production project.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${TEST_DB:-checklist_staging}"
PSQL=(psql -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB"
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/tests/_supabase_stub.sql"

run() { echo "migrate $(basename "$1")"; "${PSQL[@]}" -d "$DB" --single-transaction -f "$1"; }
for f in "$ROOT"/supabase/migrations/000[1-4]_*.sql; do run "$f"; done
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/tests/staging_seed.sql"
# Snapshot every pre-existing row so we can prove the new migrations change none.
TABLES="profiles clients templates tasks task_proofs client_notes notifications audit_log app_settings signing_links"
"${PSQL[@]}" -d "$DB" -c "create schema snap"
for t in $TABLES; do
  "${PSQL[@]}" -d "$DB" -c "create table snap.$t as select to_jsonb(x) as row from public.$t x"
done
NEW=$(ls "$ROOT"/supabase/migrations/*.sql | sort | awk -F/ '$NF > "0005"')
for pass in 1 2; do
  for f in $NEW; do run "$f"; done
done

# Regression: same row counts, and every old row still present with identical
# values for its original columns (new columns may only be added).
for t in $TABLES; do
  "${PSQL[@]}" -d "$DB" -tAc "
    do \$\$ declare b int; a int; missing int; begin
      select count(*) into b from snap.$t;
      select count(*) into a from public.$t;
      select count(*) into missing from snap.$t s
        where not exists (select 1 from public.$t x where to_jsonb(x) @> s.row);
      if '$t' not in ('audit_log', 'notifications') and a <> b then
        raise exception '$t: row count % -> %', b, a; end if;
      if missing > 0 then raise exception '$t: % pre-existing rows changed or lost', missing; end if;
      raise notice '$t: % rows before, % after, 0 changed', b, a;
    end \$\$;"
done

for t in "$ROOT"/supabase/tests/test_*.sql; do
  [ -e "$t" ] || continue
  echo "test $(basename "$t")"
  "${PSQL[@]}" -d "$DB" -f "$t"
done
echo "db ok"
