#!/usr/bin/env bash
# Entrypoint for the all-in-one ChatTrader container: runs the API, nginx
# (static SPA + reverse proxy), and the cloudflared Quick Tunnel as three
# sibling processes in a single container. Trade-off, made deliberately:
# this is simpler to build/deploy/restart than three separate containers,
# at the cost of not following the usual "one process per container"
# convention — a crash in any one process brings the whole container down
# (Docker's restart policy then restarts everything together), and the
# three processes can't be scaled or updated independently. Acceptable for
# this single-VPS, no-real-traffic-yet deployment; revisit if that changes.
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

# Sync the SQLite schema against the persisted /app/api/prisma volume before
# starting the API. Uses `prisma db push` (schema sync, not migration
# history) to match this repo's own dev-environment convention (see
# docs/implementation/setup-and-run.md) — on a brand-new volume this creates
# every table from scratch; on an existing volume it applies any schema
# changes shipped since the last deploy. Safe to run on every boot.
echo "[entrypoint] syncing database schema (prisma db push)..."
(cd /app/api && node_modules/.bin/prisma db push --skip-generate --accept-data-loss)

echo "[entrypoint] starting API (tsx /app/api/src/main.ts)..."
(cd /app/api && node_modules/.bin/tsx src/main.ts) &
PIDS+=($!)

echo "[entrypoint] starting nginx..."
nginx -g "daemon off;" &
PIDS+=($!)

echo "[entrypoint] starting cloudflared quick tunnel..."
cloudflared tunnel --no-autoupdate --url http://127.0.0.1:80 &
PIDS+=($!)

# Exit (and let Docker's restart policy take over) as soon as ANY of the
# three processes dies, rather than silently limping along with one of
# them missing.
wait -n "${PIDS[@]}"
echo "[entrypoint] a process exited — shutting down the rest."
cleanup
