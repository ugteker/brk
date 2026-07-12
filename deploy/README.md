# ChatTrader Deployment (Hetzner + Cloudflare Tunnel)

This documents how the stack in `docker-compose.yml` gets from a fresh
Hetzner server to a running, internet-reachable app, and how it's kept
up to date via GitHub Actions.

## Architecture

```
Internet ──(Cloudflare edge, Quick Tunnel)── cloudflared (same container, sibling process)
                                                  │
                                      nginx (same container, sibling process)
                                      ├── /       → serves built SPA directly
                                      └── /api/*  → node API process (127.0.0.1:3000, same container)
```

- **A single all-in-one container** (`docker-compose.yml` service
  `ChatTrader`, built from the root `Dockerfile`). `deploy/entrypoint.sh`
  starts three sibling processes inside it: the Node API, nginx (serving the
  built SPA and reverse-proxying `/api/*` to the API on `127.0.0.1:3000`),
  and `cloudflared` in Quick Tunnel mode. If any one of the three exits, the
  entrypoint shuts the others down and the container exits, so Docker's
  `restart: unless-stopped` policy restarts the whole thing cleanly rather
  than silently limping along with one process missing.
  **Trade-off, made deliberately for this small/no-real-traffic-yet
  deployment**: this is far simpler to build, ship, and restart than
  separate containers, at the cost of not following the usual
  "one process per container" convention — the three processes can't be
  scaled, updated, or restarted independently, and a crash in any one of
  them takes the other two down with it. If the app grows real traffic or
  needs independent scaling of the API vs. tunnel, split them back into
  separate `docker-compose.yml` services (each already has its own build
  stage in the `Dockerfile` to make that split easy later).
- **No domain is registered.** `cloudflared` runs in **Quick Tunnel** mode
  (`cloudflared tunnel --url http://127.0.0.1:80`), which dials out to
  Cloudflare and gets assigned a random `https://<random>.trycloudflare.com`
  hostname. No inbound firewall ports need to be opened on the server.
- **This hostname is not stable.** It changes every time the container
  restarts (including on every deploy). Read the current URL with:
  ```
  docker compose logs ChatTrader --tail 50 | grep trycloudflare.com
  ```
  `deploy/deploy.sh` prints it automatically at the end of each deploy.
- **Database is SQLite**, stored in the `api-data` named Docker volume,
  mounted at `/app/api/prisma` in the container — survives
  `docker compose up`/rebuilds, but has no separate backup mechanism yet.
  Fine for a single instance / low concurrency; revisit if usage grows.

## One-time manual setup on the server

Requires SSH access to the existing Ubuntu 24.04 Hetzner server (Docker
already installed).

```bash
ssh <user>@<hetzner-host>
sudo mkdir -p /opt/ChatTrader && sudo chown $USER:$USER /opt/ChatTrader
git clone https://github.com/ugteker/brk.git /opt/ChatTrader
cd /opt/ChatTrader
cp apps/api/.env.example .env
# edit .env with real values: JWT_SECRET (generate: openssl rand -base64 48),
# ANTHROPIC_API_KEY, SMTP_*, ADMIN_EMAIL/ADMIN_PASSWORD, AUTH_COOKIE_SECURE=true.
# APP_BASE_URL / GOOGLE_CALLBACK_URL should point at the tunnel URL once known
# (see below) — update and redeploy after the first run if using Google OAuth.
chmod 600 .env
docker compose up -d --build
docker compose logs ChatTrader --tail 50 | grep trycloudflare.com
```

Verify: `curl https://<the-tunnel-url>/api/agents` (should get a 401 without
a session cookie — confirms the proxy chain works end to end) and open the
tunnel URL in a browser to confirm the SPA loads.

After this, all future deploys are handled by
[`deploy/deploy.sh`](./deploy.sh), either run manually over SSH or
automatically by CI (below).

## GitHub Actions (`.github/workflows/deploy.yml`)

On every push to `main`: runs `apps/api` and `apps/web` test suites, then (if
they pass) SSHes into the Hetzner server, rewrites `/opt/ChatTrader/.env` from
a GitHub secret, and runs `deploy/deploy.sh` (which does `git pull` +
`docker compose build` + `docker compose up -d`).

### Required repository secrets

Set these under **Settings → Secrets and variables → Actions** in
`ugteker/brk` (ideally scoped to a `production` environment for an extra
approval gate):

| Secret | Value |
| --- | --- |
| `HETZNER_HOST` | Server IP or hostname |
| `HETZNER_USER` | SSH user with access to `/opt/ChatTrader` and Docker |
| `HETZNER_SSH_KEY` | Private key for that user (add the matching public key to the server's `~/.ssh/authorized_keys`) |
| `HETZNER_APP_ENV` | The **entire contents** of the production `.env` file (same keys as `apps/api/.env.example`, with real values) |

`HETZNER_APP_ENV` is written to the server via an SSH heredoc, never passed
as a CLI argument or echoed — it won't appear in workflow logs. Whenever a
value in it changes (e.g. rotating `JWT_SECRET`, updating `APP_BASE_URL` to a
new tunnel hostname), update the secret and re-run the workflow (or push any
commit to `main`).

### Rotating secrets

Because `apps/api/.env` has historically held real credentials on developer
machines, rotate at minimum before relying on this pipeline for anything
beyond internal testing:
- `ANTHROPIC_API_KEY`
- `SMTP_USER` / `SMTP_PASSWORD` (Gmail app password)
- `ADMIN_PASSWORD`
- `JWT_SECRET` (was a placeholder value, must not be reused)

## Upgrading later

- **Real domain in Cloudflare** → switch from Quick Tunnel to a **named
  tunnel** (`cloudflared tunnel create`, plus a `cloudflared.yml` config and
  a DNS CNAME) for a stable hostname. Update the `cloudflared` invocation in
  `deploy/entrypoint.sh` accordingly (or, if the tunnel's credentials/config
  need their own lifecycle independent of the app container, split
  `cloudflared` back out into its own `docker-compose.yml` service at that
  point — each of the three processes already has an isolated build stage
  in the root `Dockerfile`, so that split is a compose-file change only, no
  application code changes needed).
- **Postgres instead of SQLite** → swap `apps/api/prisma/schema.prisma`
  `datasource db.provider`, add a `postgres` service to
  `docker-compose.yml`, and update `DATABASE_URL` in `.env`. Out of scope for
  this pass per current decision to keep SQLite.
- **Real traffic / need to scale API and web independently** → split the
  single `ChatTrader` service back into separate `api`/`web`/`cloudflared`
  services (each already has its own build stage in the `Dockerfile`); this
  undoes the single-container simplification made for this initial,
  no-real-traffic deployment.

## Known gaps / not yet verified

- **The all-in-one image has not been build-tested** in this environment
  (no Docker daemon available in the sandbox this was authored in — only
  `docker compose config` was validated, which checks YAML/env wiring but
  not the actual image build). **Before the first real deploy**, run
  `docker compose build` (or `docker build .`) on a machine with Docker
  running and fix anything that comes up (Alpine's `nginx` package config
  paths, `cloudflared` binary compatibility, etc. were written from
  documentation, not a verified build).
