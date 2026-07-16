#!/usr/bin/env bash
# Entrypoint for the all-in-one ChatTrader container: runs the API, nginx
# (static SPA + reverse proxy), and the cloudflared Quick Tunnel as three
# sibling processes in a single container. Trade-off, made deliberately:
# this is simpler to build/deploy/restart than three separate containers,
# at the cost of not following the usual "one process per container"
# convention — a crash in the API or nginx brings the whole container down
# (Docker's restart policy then restarts everything together), and the
# processes can't be scaled or updated independently. Acceptable for this
# single-VPS, no-real-traffic-yet deployment; revisit if that changes.
#
# cloudflared is deliberately NOT part of that "any crash brings down the
# container" contract (see run_cloudflared below): Cloudflare's free Quick
# Tunnel endpoint is rate-limited, and a hard container restart loop
# (nginx/API dying too) turns a single transient tunnel failure into a
# rapid-fire retry storm that gets the whole container rate-limited
# (HTTP 429) for an extended period. cloudflared instead gets its own
# backoff-retry loop and never triggers a full container teardown by itself.
set -euo pipefail

PIDS=()

cleanup() {
  echo "[entrypoint] shutting down..."
  nginx -s quit 2>/dev/null || true
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  [ -n "${CLOUDFLARED_LOOP_PID:-}" ] && kill "$CLOUDFLARED_LOOP_PID" 2>/dev/null || true
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

run_cloudflared() {
  local delay=5
  while true; do
    echo "[entrypoint] starting cloudflared quick tunnel..."
    cloudflared tunnel --no-autoupdate --url http://127.0.0.1:80
    echo "[entrypoint] cloudflared exited — retrying in ${delay}s (app is still reachable directly on the server without it)"
    sleep "$delay"
    # Exponential backoff up to 5 minutes, to avoid hammering Cloudflare's
    # rate-limited Quick Tunnel endpoint if it keeps failing.
    delay=$(( delay < 300 ? delay * 2 : 300 ))
  done
}
run_cloudflared &
CLOUDFLARED_LOOP_PID=$!

# Exit (and let Docker's restart policy take over) as soon as the API or
# nginx dies — cloudflared is intentionally excluded, see the header
# comment above.
wait -n "${PIDS[@]}"
echo "[entrypoint] a critical process (API or nginx) exited — shutting down."
cleanup
