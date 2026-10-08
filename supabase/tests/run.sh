#!/usr/bin/env bash
# Runs the migrations and behavioural tests against a throwaway database on a
# local Postgres 16 + PostGIS 3 server.
#   PGHOST/PGPORT/PGUSER select the server (defaults: localhost:5432, postgres).
set -euo pipefail
cd "$(dirname "$0")/.."

DB="lushdate_test_$$"
export PGUSER="${PGUSER:-postgres}"
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT

psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/supabase_shim.sql
for migration in migrations/*.sql; do
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$migration"
done
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/lushdate_test.sql
