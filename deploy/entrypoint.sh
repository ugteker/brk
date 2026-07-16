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
