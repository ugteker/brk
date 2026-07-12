# ChatTrader Deployment Procedure

Step-by-step instructions to deploy ChatTrader to the Hetzner server and keep
it updated. For architecture background, trade-offs, and upgrade paths
(named tunnel, Postgres, splitting the container back up), see
[`deploy/README.md`](../deploy/README.md).

## Prerequisites

- SSH access to the existing Hetzner server (Ubuntu 24.04, Docker already installed).
- A Cloudflare account (used only for the outbound Quick Tunnel — no domain
  or DNS setup required for this procedure).
- Push access to `ugteker/brk` (for the GitHub Actions steps).
- **Not yet done**: the all-in-one Docker image has not been build-tested
  (no Docker daemon in the environment it was authored in). Do step 1 before
  anything else.

## Step 1 — Build-test the image before first deploy

On any machine with Docker running (your laptop or the Hetzner server itself):

```bash
git clone https://github.com/ugteker/brk.git
cd brk
docker build -t ChatTrader:test .
```

Fix anything that fails (this image was written from documentation, not a
verified build — likely trouble spots: Alpine's `nginx` package config path
`/etc/nginx/http.d/default.conf`, or the `cloudflared` binary `COPY --from=`
in the `Dockerfile`). Do not proceed until this build succeeds.

## Step 2 — One-time server setup

SSH into the Hetzner server and clone the repo to a stable path:

```bash
ssh <user>@<hetzner-host>
sudo mkdir -p /opt/ChatTrader && sudo chown $USER:$USER /opt/ChatTrader
git clone https://github.com/ugteker/brk.git /opt/ChatTrader
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
| `AUTH_COOKIE_SECURE` | `true` (app is served over HTTPS via the Cloudflare tunnel) |
| `ANTHROPIC_API_KEY` | Real Anthropic key |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_PORT` / `SMTP_SECURE` | Real SMTP credentials, or leave `SMTP_HOST` blank to disable email |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Optional bootstrap admin account |
| `APP_BASE_URL` / `GOOGLE_CALLBACK_URL` | Leave as-is for now — update after Step 5 once you know the tunnel URL, only needed if using Google sign-in |

Lock down the file permissions:

```bash
chmod 600 .env
```

## Step 4 — First deploy

```bash
docker compose up -d --build
```

## Step 5 — Get the public tunnel URL

```bash
docker compose logs ChatTrader --tail 50 | grep trycloudflare.com
```

This prints a URL like `https://random-words-1234.trycloudflare.com`.
**This URL changes on every container restart/redeploy** — it is not
stable without a registered domain (see `deploy/README.md` for the upgrade
path to a named tunnel).

If you set `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` in Step 3, update
`APP_BASE_URL` and `GOOGLE_CALLBACK_URL` in `.env` to this tunnel URL now,
then re-run Step 4 to pick up the change.

## Step 6 — Verify

```bash
curl https://<the-tunnel-url>/api/agents
```

Expect a `401` (confirms the request reached the API through the proxy —
you're just not authenticated). Then open the tunnel URL in a browser and
confirm the ChatTrader SPA loads and you can sign up/log in.

## Step 7 — Set up GitHub Actions for future deploys

Add these repository secrets under **Settings → Secrets and variables →
Actions** in `ugteker/brk` (ideally scoped to a `production` environment
for an approval gate):

| Secret | Value |
| --- | --- |
| `HETZNER_HOST` | Server IP or hostname |
| `HETZNER_USER` | SSH user with access to `/opt/ChatTrader` and Docker |
| `HETZNER_SSH_KEY` | Private key for that user (add the matching public key to the server's `~/.ssh/authorized_keys`) |
| `HETZNER_APP_ENV` | The entire contents of the production `.env` file from Step 3 |

Once set, every push to `main` will: run the `apps/api`/`apps/web` test
suites, then (if green) SSH into the server, rewrite `.env` from
`HETZNER_APP_ENV`, and redeploy automatically.

## Ongoing deploys

- **Automatic**: push to `main` — GitHub Actions handles it (Step 7).
- **Manual**: SSH to the server and run:
  ```bash
  cd /opt/ChatTrader
  ./deploy/deploy.sh
  ```
  This does `git pull` + `docker compose build` + `docker compose up -d`,
  then prints the current tunnel URL.

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
| Can't find the tunnel URL | `docker compose logs ChatTrader --tail 100` — cloudflared logs its assigned URL a few seconds after startup |
| SPA loads but API calls fail | Confirm the API process is running inside the container: `docker compose exec ChatTrader sh -c "wget -qO- http://127.0.0.1:3000/api/agents"` (expect 401, not a connection error) |
| Container keeps restarting | `docker compose logs ChatTrader` — the entrypoint shuts down all three processes (API/nginx/cloudflared) if any one exits, so check which one failed first |
| Data lost after redeploy | Confirm the `api-data` volume exists: `docker volume ls | grep api-data` — SQLite's `dev.db` lives there, not in the container filesystem |
