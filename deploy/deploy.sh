#!/usr/bin/env bash
# Deploys the current checkout on the Hetzner server. Intended to be run
# from the repo root, either manually over SSH or by the GitHub Actions
# workflow (.github/workflows/deploy.yml).
#
# Prerequisites on the server:
#   - Docker + Docker Compose plugin installed
#   - Repo cloned at a stable path (e.g. /opt/brokerino)
#   - A root-level .env file already in place (git-ignored; see
#     apps/api/.env.example for the template, and deploy/README.md for how
#     GitHub Actions materializes it from repo secrets before this script runs)

set -euo pipefail

cd "$(dirname "$0")/.."

echo "== git pull =="
git pull --ff-only

echo "== docker compose build =="
docker compose build

echo "== docker compose up -d =="
docker compose up -d --remove-orphans

echo "== current cloudflared tunnel URL (may take a few seconds to appear) =="
sleep 5
docker compose logs chattrader --tail 50 | grep -o 'https://[a-zA-Z0-9.-]*\.trycloudflare\.com' | tail -n 1 || \
  echo "(tunnel URL not found yet in logs — run 'docker compose logs chattrader' manually)"
