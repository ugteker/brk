# Maydoz Deployment (Hetzner + Cloudflare)

This documents how the stack in `docker-compose.yml` gets from a fresh
Hetzner server to a running, internet-reachable app, and how it's kept
up to date via GitHub Actions.

## Deployment topology

Shared host with branch-conditioned rollout and explicit isolation boundaries:

| Branch | GitHub environment | Server path | Concurrency group |
| --- | --- | --- | --- |
| `alpha` | `alpha` | `/opt/ChatTrader-alpha` | `alpha-deploy` |
| `master` | `production` | `/opt/ChatTrader` | `production-deploy` |

Isolation is enforced by branch trigger + environment-scoped secrets + separate
server working directories + separate deploy concurrency groups.

## Architecture

```
Internet ──HTTPS── Cloudflare edge (proxied A record, "Full (strict)" mode)
                        │  HTTPS, Cloudflare Origin Certificate
                        ▼
                    nginx :443 (redirects :80 → :443)  ── same container
                    ├── /       → serves built SPA directly
                    └── /api/*  → node API process (127.0.0.1:3000, same container)
```

- **A single all-in-one container** (`docker-compose.yml` service
  `maydoz`, built from the root `Dockerfile`). `deploy/entrypoint.sh` starts
  two sibling processes inside it: the Node API, and nginx (serving the
  built SPA, terminating TLS on 443, and reverse-proxying `/api/*` to the
  API on `127.0.0.1:3000`). If either exits, the entrypoint shuts the other
  down and the container exits, so Docker's `restart: unless-stopped` policy
  restarts the whole thing cleanly rather than silently limping along with
  one process missing.
  **Trade-off, made deliberately for this small/no-real-traffic-yet
  deployment**: this is far simpler to build, ship, and restart than
  separate containers, at the cost of not following the usual
  "one process per container" convention — the two processes can't be
  scaled, updated, or restarted independently, and a crash in either takes
  the other down with it. If the app grows real traffic or needs
  independent scaling, split them back into separate `docker-compose.yml`
  services (each already has its own build stage in the `Dockerfile` to
  make that split easy later).
- **`www.maydoz.com` is a Cloudflare-proxied A record** pointing at the
  Hetzner server's public IP. Cloudflare's SSL/TLS mode is **Full
  (strict)**: the edge always connects to this origin over HTTPS and
  validates the origin's certificate — which is why nginx's 443 server
  block uses a **Cloudflare Origin Certificate** (see "SSL/TLS setup"
  below) rather than a public CA cert. Port 80 on the origin only serves a
  redirect to https; it isn't used for real traffic once Cloudflare is
  proxying.
- **No cloudflared / tunnel is involved.** The server's port 80/443 are
  reachable directly from the internet (via the A record, proxied through
  Cloudflare's edge) — unlike the original no-domain bootstrap, which used
  a `cloudflared` Quick Tunnel to avoid opening inbound ports. If you later
  want to close the origin's inbound ports entirely, switch to a **named
  Cloudflare Tunnel** instead (see "Upgrading later").
- **Database is SQLite**, stored in the `api-data` named Docker volume,
  mounted at `/app/api/prisma` in the container — survives
  `docker compose up`/rebuilds, but has no separate backup mechanism yet.
  Fine for a single instance / low concurrency; revisit if usage grows.

## SSL/TLS setup (Cloudflare "Full (strict)")

One-time setup in the Cloudflare dashboard for the `maydoz.com` zone:

1. **DNS → Records**: confirm the `www` (and/or root) A record points at
   the Hetzner server's IP with the proxy status **Proxied** (orange
   cloud). A grey-clouded (DNS-only) record bypasses Cloudflare entirely
   and none of this applies.
2. **SSL/TLS → Overview**: set the encryption mode to **Full (strict)**.
3. **SSL/TLS → Origin Server → Create Certificate**: generate a Cloudflare
   Origin Certificate for `maydoz.com` and `*.maydoz.com` (15-year validity
   is fine — Cloudflare's own CA, not renewed via Let's Encrypt/certbot).
   Cloudflare shows the certificate and private key **once** — save both.
4. Base64-encode each and store as repository secrets (see "Required
   repository secrets" below):
   ```bash
   base64 -w 0 origin-cert.pem   # → CLOUDFLARE_ORIGIN_CERT_B64
   base64 -w 0 origin-key.pem    # → CLOUDFLARE_ORIGIN_KEY_B64
   ```
   CI decodes these into `$DEPLOY_PATH/secrets/cloudflare-origin.{pem,key}`
   on the server before every `docker compose up` (mode 600), which nginx's
   443 server block reads via the existing `./secrets:/run/secrets:ro`
   mount (see `deploy/nginx.conf`).
5. (Optional) **SSL/TLS → Edge Certificates**: enable **Always Use HTTPS**
   so plain-http links get redirected at Cloudflare's edge too, not just at
   the origin.

**Without both secrets set, the deploy step fails fast** (a preflight check
in `.github/workflows/deploy.yml`) rather than shipping an nginx config
that can't start — nginx would otherwise crash-loop the whole container
since `ssl_certificate`/`ssl_certificate_key` point at files that don't exist.

### SQLite & WAL

SQLite runs in **WAL (Write-Ahead Logging) mode** with a 5-second busy timeout on startup, enabling safe concurrent access by multiple processes. WAL mode requires a local filesystem — the named volume `api-data` on the VPS is local, so this works fine. **Do not** move the database onto NFS, CIFS, or any network-shared filesystem; WAL file locking does not work correctly over the network and will cause data corruption. If the app grows to require shared database access across hosts, migrate to PostgreSQL.

The Prisma client is pinned to a single connection per process (`connection_limit=1` appended to `DATABASE_URL` at startup). Because `PRAGMA busy_timeout` is per-connection, pinning to one connection guarantees the startup PRAGMA covers every query that process will ever make. Horizontal concurrency is provided by the `node:cluster` processes rather than by a per-process connection pool — this is the community-standard approach for Prisma + SQLite.

## One-time manual setup on the server

Requires SSH access to the existing Ubuntu 24.04 Hetzner server (Docker
already installed).

```bash
ssh <user>@<hetzner-host>
# Production checkout
sudo mkdir -p /opt/ChatTrader && sudo chown $USER:$USER /opt/ChatTrader
git clone https://github.com/ugteker/brk.git /opt/ChatTrader

# Alpha checkout (isolated path, same host)
sudo mkdir -p /opt/ChatTrader-alpha && sudo chown $USER:$USER /opt/ChatTrader-alpha
git clone https://github.com/ugteker/brk.git /opt/ChatTrader-alpha

cd /opt/ChatTrader
cp apps/api/.env.example .env
# edit .env with real values: JWT_SECRET (generate: openssl rand -base64 48),
# ANTHROPIC_API_KEY, SMTP_*, ADMIN_EMAIL/ADMIN_PASSWORD, AUTH_COOKIE_SECURE=true,
# APP_BASE_URL=https://www.maydoz.com, GOOGLE_CALLBACK_URL (if using Google OAuth).
chmod 600 .env

# nginx's 443 server block needs these before the container will even start —
# see "SSL/TLS setup" above for how to generate them.
mkdir -p secrets
cp /path/to/origin-cert.pem secrets/cloudflare-origin.pem
cp /path/to/origin-key.pem secrets/cloudflare-origin.key
chmod 600 secrets/cloudflare-origin.pem secrets/cloudflare-origin.key

docker compose up -d --build
docker compose logs maydoz --tail 50
```

Verify: `curl https://www.maydoz.com/api/agents` (should get a 401 without
a session cookie — confirms the proxy chain works end to end) and open
`https://www.maydoz.com` in a browser to confirm the SPA loads.

After this, all future deploys are handled automatically by CI (see GitHub Actions below), or can be triggered manually — see the "Ongoing deploys" section.

## Verifying the realtime stream in production

The app has exactly one production SSE transport: the authenticated global
stream at `GET /api/realtime/stream` (see `deploy/nginx.conf`'s
`location = /api/realtime/stream`, matched before the generic `/api/` proxy).
After a deploy, verify it end to end:

```bash
# Use a real browser session cookie; expect headers immediately and ': keepalive'
# within 15 seconds when idle.
curl -N --cookie "brokerino_session=<value>" \
  "https://www.maydoz.com/api/realtime/stream?cursor=0"
```

Also run the two-tab browser acceptance test: in tab A, create/clone a
source, trigger a run/report, and start a discussion; in tab B (same
account, already open on the affected view — the source list, the
agent/run/report view, or the discussion), confirm the view updates live
without a manual reload.

## GitHub Actions (`.github/workflows/deploy.yml`)

Release/deploy policy:
- Push to `alpha` deploys to the **alpha** environment/path (`/opt/ChatTrader-alpha`).
- Push to `master` deploys to the **production** environment/path (`/opt/ChatTrader`).
- Promotion flow remains: `alpha` -> Pull Request -> merge into `master`.

Routing/isolation implementation status:
- `alpha-workflow-routing`: implemented in `.github/workflows/deploy.yml` with
  branch-conditioned jobs, environment-scoped secrets (`alpha` vs `production`),
  isolated server paths, and separate deploy concurrency groups.
- `alpha-script-parameterization`: **N/A**. `deploy/deploy.sh` is no longer in
  the active deployment path (workflow deploys over SSH with inline script), so
  there is no script surface left to parameterize for alpha/prod routing.

On every push to `alpha` or `master`: runs `apps/api` and `apps/web` test
suites, then (if they pass) SSHes into the Hetzner server, rewrites the
branch-mapped checkout's `.env` from a GitHub secret, and redeploys that branch.

### Required repository secrets

Set these under **Settings → Environments** in `ugteker/brk`:
- Environment `alpha` (for branch `alpha`)
- Environment `production` (for branch `master`)

Use the same key names in both environments:

| Secret | Value |
| --- | --- |
| `HETZNER_HOST` | Server IP or hostname |
| `HETZNER_USER` | SSH user with access to `/opt/ChatTrader` and Docker |
| `HETZNER_SSH_KEY` | Private key for that user (add the matching public key to the server's `~/.ssh/authorized_keys`) |
| `HETZNER_APP_ENV` | The **entire contents** of the production `.env` file (same keys as `apps/api/.env.example`, with real values). For Google service-account auth set `GOOGLE_TTS_CREDENTIALS=/run/secrets/google-tts-service-account.json` here. |
| `HETZNER_GOOGLE_TTS_SA_JSON_B64` | Optional. Base64-encoded Google service-account JSON key; CI decodes this into `$DEPLOY_PATH/secrets/google-tts-service-account.json` on the server before `docker compose up`. |
| `CLOUDFLARE_ORIGIN_CERT_B64` | **Required.** Base64-encoded Cloudflare Origin Certificate (see "SSL/TLS setup" above); CI decodes this into `$DEPLOY_PATH/secrets/cloudflare-origin.pem`. Deploy fails fast if missing. |
| `CLOUDFLARE_ORIGIN_KEY_B64` | **Required.** Base64-encoded private key matching the Origin Certificate; CI decodes this into `$DEPLOY_PATH/secrets/cloudflare-origin.key`. Deploy fails fast if missing. |

### Recommended branch protection

To enforce the release flow above, configure branch protection for both `alpha` and `master`:
- Require a pull request before merging.
- Require status checks to pass before merging (at minimum the deploy workflow's `test` job).
- Restrict direct pushes where possible.

Suggested GitHub UI path:
1. Go to **Settings -> Branches -> Branch protection rules** (or **Rulesets**).
2. Target branch: `alpha` (repeat for `master`).
3. Enable **Require a pull request before merging**.
4. Enable **Require status checks to pass before merging** and select check **`test`** from workflow **Deploy**.
5. Enable **Restrict who can push to matching branches** (optional but recommended).

`HETZNER_APP_ENV` is written to the server via an SSH heredoc, never passed
as a CLI argument or echoed — it won't appear in workflow logs. Whenever a
value in it changes (e.g. rotating `JWT_SECRET` or `APP_BASE_URL`), update
the secret and re-run the workflow (or push any commit to the target
branch: `alpha` or `master`).

For Google TTS service-account auth, set `HETZNER_GOOGLE_TTS_SA_JSON_B64` to:
```bash
base64 -w 0 google-service-account.json
```
Then set `GOOGLE_TTS_CREDENTIALS=/run/secrets/google-tts-service-account.json`
inside `HETZNER_APP_ENV`. This keeps the JSON key out of git and out of the image.

If these are missing in the target environment (`alpha` or `production`), the SSH deploy step fails
early with `Error: missing server host` because `HETZNER_HOST`/`HETZNER_USER`/
`HETZNER_SSH_KEY` resolve as empty.

### Rotating secrets

Because `apps/api/.env` has historically held real credentials on developer
machines, rotate at minimum before relying on this pipeline for anything
beyond internal testing:
- `ANTHROPIC_API_KEY`
- `SMTP_USER` / `SMTP_PASSWORD` (Gmail app password)
- `ADMIN_PASSWORD`
- `JWT_SECRET` (was a placeholder value, must not be reused)

## Upgrading later

- **Close the origin's inbound ports entirely** → switch from the current
  direct-IP + Cloudflare-proxy setup to a **named Cloudflare Tunnel**
  (`cloudflared tunnel create`, plus a `cloudflared.yml` config and a DNS
  CNAME to `<tunnel-id>.cfargotunnel.com`) so `cloudflared` dials out to
  Cloudflare instead of the server accepting inbound connections on 80/443.
  This reintroduces `cloudflared` as a sibling process (or its own
  `docker-compose.yml` service — each process already has an isolated
  build stage in the root `Dockerfile`, so that split is a compose-file
  change only) and removes the need for the Origin Certificate, since
  Cloudflare terminates TLS at the tunnel instead.
- This deployment stack is production-oriented (built SPA served by nginx). For local frontend iteration with instant UI updates, run `npm run dev` in `apps/web` (Vite HMR) instead of the container/preview path.
- **Postgres instead of SQLite** → swap `apps/api/prisma/schema.prisma`
  `datasource db.provider`, add a `postgres` service to
  `docker-compose.yml`, and update `DATABASE_URL` in `.env`. Out of scope for
  this pass per current decision to keep SQLite.
- **Real traffic / need to scale API and web independently** → split the
  single `maydoz` service back into separate `api`/`web` services (each
  already has its own build stage in the `Dockerfile`); this undoes the
  single-container simplification made for this initial, no-real-traffic
  deployment.

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
