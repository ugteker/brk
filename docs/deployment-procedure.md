# Maydoz Deployment Procedure

Step-by-step instructions to deploy Maydoz to the Hetzner server and keep
it updated. For architecture background, trade-offs, and upgrade paths
(named tunnel, Postgres, splitting the container back up), see
[`deploy/README.md`](../deploy/README.md).

## Topology decision (alpha vs production)

Chosen topology: **shared host with branch-conditioned rollout + isolation boundaries**.

| Branch | GitHub environment | Server path | Concurrency group |
| --- | --- | --- | --- |
| `alpha` | `alpha` | `/opt/ChatTrader-alpha` | `alpha-deploy` |
| `master` | `production` | `/opt/ChatTrader` | `production-deploy` |

This keeps alpha and production isolated by environment secrets, server path,
and workflow concurrency while staying on one host.

Implementation status:
- `alpha-workflow-routing`: enforced in `.github/workflows/deploy.yml` via
  branch-conditioned deploy jobs, isolated environment selection, isolated
  server path, and isolated concurrency group.
- `alpha-script-parameterization`: **N/A** because `deploy/deploy.sh` is not
  part of the current deploy path (the workflow deploys with inline SSH script).

## Prerequisites

- SSH access to the existing Hetzner server (Ubuntu 24.04, Docker already installed).
- A Cloudflare account with the `maydoz.com` zone added, the `www` A record
  pointed at the Hetzner server's IP and **Proxied** (orange cloud), SSL/TLS
  mode set to **Full (strict)**, and a Cloudflare Origin Certificate
  generated — see `deploy/README.md`'s "SSL/TLS setup" section.
- Push access to `ugteker/brk` (for the GitHub Actions steps).
- The all-in-one Docker image has been build-tested locally end-to-end
  (image builds, and the API/nginx pair start and serve traffic
  correctly). See "Build verification notes" below.

## Step 1 — Build-test the image before first deploy

On any machine with Docker running (your laptop or the Hetzner server itself):

```bash
git clone https://github.com/ugteker/brk.git
cd brk
docker build -t maydoz:test .

# nginx's 443 server block requires cert files present at container start
# (see deploy/nginx.conf) — a throwaway self-signed pair is enough for this
# local smoke test; the real deploy uses a Cloudflare Origin Certificate.
mkdir -p /tmp/maydoz-test-secrets
openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
  -keyout /tmp/maydoz-test-secrets/cloudflare-origin.key \
  -out /tmp/maydoz-test-secrets/cloudflare-origin.pem \
  -subj "/CN=localhost"

docker run -d --name maydoz-test -p 127.0.0.1:8080:80 -p 127.0.0.1:8443:443 \
  -v /tmp/maydoz-test-secrets:/run/secrets:ro \
  -e JWT_SECRET=test-secret -e AUTH_COOKIE_SECURE=false maydoz:test
docker logs maydoz-test   # confirm API/nginx both start
curl -i http://127.0.0.1:8080/            # expect 301 redirect to https
curl -ik https://127.0.0.1:8443/          # expect 200 (SPA); -k skips validation of the self-signed test cert
curl -ik https://127.0.0.1:8443/api/health  # any non-5xx confirms the proxy works
docker rm -f maydoz-test
rm -rf /tmp/maydoz-test-secrets
```

Do not proceed until this build succeeds and both curl checks return.

### Build verification notes
Verified locally on 2026-07-12. Two real bugs were found and fixed in the
process (both already applied to the `Dockerfile`/`deploy/entrypoint.sh` in
this repo, not just noted here):

1. **CRLF line endings in `deploy/entrypoint.sh`.** A Windows git checkout
   had converted the file's line endings to CRLF, which broke its `#!/usr/bin/env bash`
   shebang inside the Linux container (`env: can't execute 'bash\r'`). Fixed
   by normalizing the file to LF and adding `.gitattributes` (`*.sh text
   eol=lf`) so this can't recur regardless of the committer's OS/git config.
2. **ESM import resolution.** `apps/api` is an ESM package
   (`"type": "module"`) whose source imports omit the `.js` extension (e.g.
   `import { buildServer } from './server'`). Node's ESM loader requires
   explicit extensions for compiled output, so running the `tsc`-compiled
   `dist/main.js` directly with plain `node` failed with
   `ERR_MODULE_NOT_FOUND`. Fixed by running the API from source via `tsx`
   at runtime instead (matching `apps/api/package.json`'s own existing
   `start`/`dev` scripts) — `tsc` is still run during the image build as a
   type-check gate, but its `dist/` output isn't what actually runs.

Local-sandbox-only note: build-testing in a corporate-proxied dev machine
may require temporarily trusting a local root CA for `apk`/`npm` HTTPS
fetches (not needed on Hetzner, which has normal internet access) — see
`deploy/README.md` if you hit TLS errors during `docker build` on such a
machine.

## Step 2 — One-time server setup

SSH into the Hetzner server and clone the repo to a stable path:

```bash
ssh <user>@<hetzner-host>
sudo mkdir -p /opt/ChatTrader && sudo chown $USER:$USER /opt/ChatTrader
git clone https://github.com/ugteker/brk.git /opt/ChatTrader
sudo mkdir -p /opt/ChatTrader-alpha && sudo chown $USER:$USER /opt/ChatTrader-alpha
git clone https://github.com/ugteker/brk.git /opt/ChatTrader-alpha
cd /opt/ChatTrader
```

## Step 3 — Create the production `.env`

```bash
cp apps/api/.env.example .env
```

Edit `.env` with real values:

| Key | What to set |
| --- | --- |
| `JWT_SECRET` | Long random value, e.g. `openssl rand -base64 48` — never reuse the dev placeholder |
| `AUTH_COOKIE_SECURE` | `true` (app is served over HTTPS via Cloudflare) |
| `ANTHROPIC_API_KEY` | Real Anthropic key |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_PORT` / `SMTP_SECURE` | Real SMTP credentials, or leave `SMTP_HOST` blank to disable email |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Optional bootstrap admin account |
| `APP_BASE_URL` / `GOOGLE_CALLBACK_URL` | `https://www.maydoz.com` / `https://www.maydoz.com/api/auth/google/callback` (only the callback is needed if using Google sign-in) |

Lock down the file permissions:

```bash
chmod 600 .env
```

## Step 4 — Place the Cloudflare Origin Certificate

nginx's 443 server block (`deploy/nginx.conf`) refuses to start without
these files present — see `deploy/README.md`'s "SSL/TLS setup" section for
how to generate them in the Cloudflare dashboard.

```bash
mkdir -p secrets
cp /path/to/origin-cert.pem secrets/cloudflare-origin.pem
cp /path/to/origin-key.pem secrets/cloudflare-origin.key
chmod 600 secrets/cloudflare-origin.pem secrets/cloudflare-origin.key
```

## Step 5 — First deploy

```bash
docker compose up -d --build
```

## Step 6 — Verify

```bash
curl https://www.maydoz.com/api/agents
```

Expect a `401` (confirms the request reached the API through the proxy —
you're just not authenticated). Then open `https://www.maydoz.com` in a
browser and confirm the Maydoz SPA loads and you can sign up/log in.

## Step 7 — Set up GitHub Actions for future deploys

Add these under **Settings → Environments → Environment secrets**
in `ugteker/brk`.

Create both environments and add the same key names in each:
- `alpha` environment (used by branch `alpha`)
- `production` environment (used by branch `master`)

| Secret | Value |
| --- | --- |
| `HETZNER_HOST` | Server IP or hostname |
| `HETZNER_USER` | SSH user with access to `/opt/ChatTrader` and Docker |
| `HETZNER_SSH_KEY` | Private key for that user (add the matching public key to the server's `~/.ssh/authorized_keys`) |
| `HETZNER_APP_ENV` | The entire contents of the production `.env` file from Step 3 |
| `CLOUDFLARE_ORIGIN_CERT_B64` | **Required.** Base64-encoded Cloudflare Origin Certificate from Step 4 (`base64 -w 0 origin-cert.pem`) |
| `CLOUDFLARE_ORIGIN_KEY_B64` | **Required.** Base64-encoded private key from Step 4 (`base64 -w 0 origin-key.pem`) |

If these are not present in the target environment (`alpha` or `production`), deployment fails in
`appleboy/ssh-action` with `Error: missing server host` because host/user/key
inputs resolve empty.

Release/deploy policy:
- Push to `alpha` deploys to alpha (`/opt/ChatTrader-alpha`).
- Push to `master` deploys to production (`/opt/ChatTrader`).
- Promotion flow remains: `alpha` -> Pull Request -> merge into `master`.

Recommended repository protection for both `alpha` and `master`:
- Require a pull request before merge.
- Require status checks before merge (at minimum the deploy workflow `test` job).
- Restrict direct pushes where possible.

Suggested GitHub UI path:
1. Go to **Settings -> Branches -> Branch protection rules** (or **Rulesets**).
2. Target branch: `alpha` (repeat for `master`).
3. Enable **Require a pull request before merging**.
4. Enable **Require status checks to pass before merging** and select check **`test`** from workflow **Deploy**.
5. Enable **Restrict who can push to matching branches** (optional but recommended).

Once set, every push to `alpha` or `master` will: run the
`apps/api`/`apps/web` test suites, then (if green) SSH into the server,
rewrite `.env` from `HETZNER_APP_ENV`, and redeploy to the branch-mapped
path/environment.

## Ongoing deploys

- **Automatic alpha deploy**: push to `alpha` (deploys from `/opt/ChatTrader-alpha`).
- **Automatic production deploy**: merge PRs from `alpha` to `master` (or push directly to `master`) — deploys from `/opt/ChatTrader`.
- **Manual**: SSH to the server and run:
  ```bash
  cd /opt/ChatTrader
  git pull --ff-only origin master
  docker compose build
  docker compose up -d --remove-orphans
  docker compose logs maydoz --tail 50
  ```
  This pulls the latest code, rebuilds the image, and restarts the container.
  For alpha, use `/opt/ChatTrader-alpha` and `origin alpha`.

## Rotating secrets

Update the value in `.env` on the server (or in the `HETZNER_APP_ENV`
GitHub secret) and redeploy. At minimum, rotate these before relying on
this for anything beyond internal testing, since real-looking values have
existed in developers' local `apps/api/.env` files:
`ANTHROPIC_API_KEY`, `SMTP_USER`/`SMTP_PASSWORD`, `ADMIN_PASSWORD`,
`JWT_SECRET`.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Site unreachable over https / SSL handshake fails | Confirm `secrets/cloudflare-origin.pem` and `.key` exist on the server (`ls -la secrets/` in `$DEPLOY_PATH`) — nginx's 443 server block won't start without them. Also check Cloudflare's SSL/TLS mode is **Full (strict)** and the A record is **Proxied** (orange cloud), not DNS-only. |
| SPA loads but API calls fail | Confirm the API process is running inside the container: `docker compose exec maydoz sh -c "wget -qO- http://127.0.0.1:3000/api/agents"` (expect 401, not a connection error) |
| Container keeps restarting | `docker compose logs maydoz` — the entrypoint shuts down the other process (API or nginx) if either exits, so check which one failed first. A missing/invalid Cloudflare Origin Certificate makes nginx fail immediately on startup — look for `cannot load certificate` in the logs. |
| Data lost after redeploy | Confirm the `api-data` volume exists: `docker volume ls | grep api-data` — SQLite's `dev.db` lives there, not in the container filesystem |
| Manual episode-picker run always shows "no content", but works fine locally | YouTube blocks caption/transcript requests from known datacenter/VPS IP ranges (Hetzner included) — confirmed via server logs showing `playabilityStatus: "LOGIN_REQUIRED"` on every client impersonation, even with realistic headers and multiple client impersonations (ANDROID/IOS/WEB). A signed-in session's `YOUTUBE_COOKIE` alone did **not** fix this (modern YouTube bot-detection is IP-reputation-based, not just session-based) — the fix that worked was routing YouTube requests through a residential IP via `YOUTUBE_PROXY_URL` (see "YouTube proxy dependency" below). Check the Runs view: the warning message always includes the failing episode's clickable URL, and `docker compose logs maydoz | grep youtube-adapter` shows exactly which stage failed (missing API key / per-client rejection reason / fallback scrape failure). |

### YouTube proxy dependency

The YouTube caption-fetch feature depends on `YOUTUBE_PROXY_URL` being set to a
working residential-IP HTTP proxy — direct requests from Hetzner get blocked
by YouTube with `LOGIN_REQUIRED` regardless of headers/cookies.

Current setup: a self-hosted [Tinyproxy](https://tinyproxy.github.io/) instance
runs on a home Linux mini server, exposed via port-forwarding + DuckDNS
(`YOUTUBE_PROXY_URL=http://<user>:<pass>@<duckdns-host>:8888`). Tinyproxy's
`Allow` directive restricts access to the Hetzner server's IP only.

This is a **soft dependency** — if the mini server or home internet connection
goes down, YouTube crawls will start failing again (other features are
unaffected). To verify the proxy is reachable:

```bash
# From any machine (confirms the port is open, not that auth succeeds):
Test-NetConnection -ComputerName <duckdns-host> -Port 8888   # PowerShell
nc -zv <duckdns-host> 8888                                    # Linux/macOS

# On the mini server (confirms Tinyproxy itself is healthy):
sudo systemctl status tinyproxy
```

If Tinyproxy fails to start after a config edit, check for **duplicate
`Port`/`Listen` directives** (the default config already defines these
uncommented) — `grep -n -E "^Port|^Listen" /etc/tinyproxy/tinyproxy.conf`
should show each only once.
