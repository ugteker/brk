#!/usr/bin/env bash
# Entrypoint for the all-in-one ChatTrader container: runs the API and nginx
# (static SPA + reverse proxy) as sibling processes in a single container.
set -euo pipefail

PIDS=()

cleanup() {
  echo "[entrypoint] shutting down..."
  nginx -s quit 2>/dev/null || true
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  exit 0
}
trap cleanup TERM INT

# Restore the current image's schema.prisma before syncing. The Docker
# volume is mounted at /app/api/prisma, which shadows the entire directory
# (including schema.prisma), so without this step `prisma db push` would
# run with the *old* schema from the volume — the Prisma client was compiled
# from the new schema, causing column-not-found errors at runtime.
cp /app/api/schema.prisma /app/api/prisma/schema.prisma
# Use an absolute DATABASE_URL so both `prisma db push` and the runtime Prisma
# Client resolve to the exact same file. Without this, db push resolves
# file:./dev.db relative to the schema file (/app/api/prisma/dev.db) while the
# runtime client resolves it relative to CWD (/app/api/dev.db), causing
# "table does not exist" on every startup despite db push succeeding.
export DATABASE_URL="file:/app/api/prisma/dev.db"
echo "[entrypoint] syncing database schema (prisma db push)..."
(cd /app/api && node_modules/.bin/prisma db push --skip-generate --accept-data-loss)

echo "[entrypoint] starting API (tsx /app/api/src/main.ts)..."
(cd /app/api && node_modules/.bin/tsx src/main.ts) &
PIDS+=($!)

echo "[entrypoint] starting nginx..."
nginx -g "daemon off;" &
PIDS+=($!)

# Exit (and let Docker's restart policy take over) as soon as the API or
# nginx dies.
wait -n "${PIDS[@]}"
echo "[entrypoint] a critical process (API or nginx) exited — shutting down."
cleanup
