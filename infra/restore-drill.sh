#!/usr/bin/env bash
# Backup → restore → verify drill (Sprint 15, F15.7). PRD: "a backup restore has been
# tested"; TA: one-day recovery target.
#
# Dumps SOURCE_DATABASE_URL in custom format, restores it into a fresh database on the same
# server, verifies the copy (row counts, triggers, migrations, ledger invariants), reports
# timings, and drops the copy. pg_dump/pg_restore come from the postgres:17 image so the
# client always matches the server major version.
#
#   SOURCE_DATABASE_URL=postgres://raise:raise@localhost:5432/raise infra/restore-drill.sh
#
# Staging/production PITR is a different procedure (managed host); see
# docs/runbooks/backup-restore.md. This drill proves our dumps restore into a working app
# database and that integrity guards survive the round trip.
set -euo pipefail

SRC="${SOURCE_DATABASE_URL:?set SOURCE_DATABASE_URL}"
PG_IMAGE="${PG_IMAGE:-postgres:17-alpine}"
STAMP="$(date +%s)"
DB_NAME="${SRC##*/}"
DB_NAME="${DB_NAME%%\?*}"
TARGET_DB="raise_restore_${STAMP}"
TARGET="${SRC%/*}/${TARGET_DB}"
ADMIN="${SRC%/*}/postgres"
WORK="$(mktemp -d)"

pg() { docker run --rm --network host -v "$WORK:/work" "$PG_IMAGE" "$@"; }

cleanup() {
  pg psql "$ADMIN" -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS \"$TARGET_DB\" WITH (FORCE)" >/dev/null || true
}
trap 'cleanup; rm -rf "$WORK"' EXIT

echo "== backup: ${DB_NAME}"
t0=$(date +%s%N)
pg pg_dump --format=custom --no-owner --file=/work/backup.dump "$SRC"
t1=$(date +%s%N)
size=$(du -h "$WORK/backup.dump" | cut -f1)
echo "   dump ${size} in $(( (t1 - t0) / 1000000 )) ms"

echo "== restore into ${TARGET_DB}"
pg psql "$ADMIN" -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE \"$TARGET_DB\""
pg pg_restore --no-owner --exit-on-error --dbname="$TARGET" /work/backup.dump
t2=$(date +%s%N)
echo "   restored in $(( (t2 - t1) / 1000000 )) ms"

echo "== verify"
SOURCE_DATABASE_URL="$SRC" TARGET_DATABASE_URL="$TARGET" \
  pnpm --filter @raise/api exec tsx src/scripts/restore-verify.ts
t3=$(date +%s%N)
echo "== drill passed: total $(( (t3 - t0) / 1000000 )) ms (recovery target: 1 day)"
