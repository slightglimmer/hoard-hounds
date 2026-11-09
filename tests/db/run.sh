#!/bin/bash
# Database security tests. Each test file runs on a freshly built local database
# (the Supabase stub, then every migration in order, then the demo seed).
#
# Needs a local PostgreSQL 15+ you can reach with psql. Point at it with the usual
# variables, for example: PGHOST=/tmp/hhpg PGPORT=5499 PGUSER=postgres tests/db/run.sh
# Never point this at your real Supabase database: it drops and recreates "hh_test".
set -u
DIR=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$DIR/../.." && pwd)
DB=${HH_TEST_DB:-hh_test}
PSQL="psql -v ON_ERROR_STOP=1 -q -X"
pass=0; fail=0
for test in "$DIR"/[1-9]*.sql; do
  $PSQL -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null 2>&1 || { echo "Can't reach PostgreSQL"; exit 2; }
  args=(-f "$DIR/00_supabase_stub.sql")
  for m in "$ROOT"/supabase/migrations/*.sql; do args+=(-f "$m"); done
  args+=(-f "$ROOT/supabase/seed_demo.sql")
  if ! $PSQL -d $DB "${args[@]}" >/dev/null 2>"$DIR/.setup-errors.txt"; then
    echo "Setup failed:"; cat "$DIR/.setup-errors.txt"; exit 1
  fi
  out=$(psql -q -X -d $DB -f "$test" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //')
  p=$(echo "$out" | grep -c '^PASS'); f=$(echo "$out" | grep -cE '^FAIL|ERROR')
  printf '%-28s PASS %3d  FAIL %d\n' "$(basename "$test")" "$p" "$f"
  echo "$out" | grep -E '^FAIL|ERROR' | sed 's/^/    /'
  pass=$((pass + p)); fail=$((fail + f))
done
rm -f "$DIR/.setup-errors.txt"
echo "TOTAL                        PASS $pass  FAIL $fail"
[ "$fail" -eq 0 ]
