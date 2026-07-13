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
  `chattrader`, built from the root `Dockerfile`). `deploy/entrypoint.sh`
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
  docker compose logs chattrader --tail 50 | grep trycloudflare.com
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
sudo mkdir -p /opt/brokerino && sudo chown $USER:$USER /opt/brokerino
git clone https://github.com/ugteker/brk.git /opt/brokerino
cd /opt/brokerino
cp apps/api/.env.example .env
# edit .env with real values: JWT_SECRET (generate: openssl rand -base64 48),
# ANTHROPIC_API_KEY, SMTP_*, ADMIN_EMAIL/ADMIN_PASSWORD, AUTH_COOKIE_SECURE=true.
# APP_BASE_URL / GOOGLE_CALLBACK_URL should point at the tunnel URL once known
# (see below) — update and redeploy after the first run if using Google OAuth.
chmod 600 .env
docker compose up -d --build
docker compose logs chattrader --tail 50 | grep trycloudflare.com
```

Verify: `curl https://<the-tunnel-url>/api/agents` (should get a 401 without
a session cookie — confirms the proxy chain works end to end) and open the
tunnel URL in a browser to confirm the SPA loads.

After this, all future deploys are handled by
[`deploy/deploy.sh`](./deploy.sh), either run manually over SSH or
automatically by CI (below).

## GitHub Actions (`.github/workflows/deploy.yml`)

Release/deploy policy:
- Deployment is triggered by pushes to `main` only.
- `alpha` does **not** deploy directly.
- Promotion flow is: `alpha` -> Pull Request -> merge into `main` -> auto deploy.

On every push to `main`: runs `apps/api` and `apps/web` test suites, then (if
they pass) SSHes into the Hetzner server, rewrites `/opt/brokerino/.env` from
a GitHub secret, and runs `deploy/deploy.sh` (which does `git pull --ff-only origin main` +
`docker compose build` + `docker compose up -d`).

### Required repository secrets

Set these under **Settings → Secrets and variables → Actions** in
`ugteker/brk` (ideally scoped to a `production` environment for an extra
approval gate):

| Secret | Value |
| --- | --- |
| `HETZNER_HOST` | Server IP or hostname |
| `HETZNER_USER` | SSH user with access to `/opt/brokerino` and Docker |
| `HETZNER_SSH_KEY` | Private key for that user (add the matching public key to the server's `~/.ssh/authorized_keys`) |
| `HETZNER_APP_ENV` | The **entire contents** of the production `.env` file (same keys as `apps/api/.env.example`, with real values) |

### Recommended branch protection

To enforce the release flow above, configure branch protection for `main`:
- Require a pull request before merging.
- Require status checks to pass before merging (at minimum the deploy workflow's `test` job).
- Restrict direct pushes to `main` where possible.

Suggested GitHub UI path:
1. Go to **Settings -> Branches -> Branch protection rules** (or **Rulesets**).
2. Target branch: `main`.
3. Enable **Require a pull request before merging**.
4. Enable **Require status checks to pass before merging** and select check **`test`** from workflow **Deploy**.
5. Enable **Restrict who can push to matching branches** (optional but recommended).

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
  single `chattrader` service back into separate `api`/`web`/`cloudflared`
  services (each already has its own build stage in the `Dockerfile`); this
  undoes the single-container simplification made for this initial,
  no-real-traffic deployment.

## Known gaps / build verification history

- **The all-in-one image has been build-tested locally** (build + run +
  curl-verified SPA and `/api/*` proxy routing). Two real bugs were found
  and fixed along the way:
  1. `deploy/entrypoint.sh` had CRLF line endings from a Windows checkout,
     breaking its bash shebang inside the Linux container — fixed, and a
     `.gitattributes` (`*.sh text eol=lf`) added so this can't recur.
  2. The API's compiled `dist/main.js` failed under Node's ESM loader
     (`apps/api` is `"type": "module"` but its source imports omit `.js`
     extensions, which compiled ESM output requires) — fixed by running the
     API from source via `tsx` at runtime, matching
     `apps/api/package.json`'s existing `start`/`dev` scripts. `tsc` still
     runs during the build as a type-check gate; its output just isn't what
     ships/runs.
- Not yet verified: a real deploy against the actual Hetzner server (this
  was only tested on a local machine). Follow
  `docs/deployment-procedure.md` for that.
