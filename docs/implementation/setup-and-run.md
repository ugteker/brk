# Setup and Run

## Prerequisites

- Node.js (v24 currently used)
- npm
- No external database required (API uses local SQLite file via Prisma)
- An Anthropic (Claude) API key for the AI agent analysis pipeline (see below)

## Install (API)

```powershell
Set-Location G:\brk\apps\api
npm install
```

## Install (Web)

```powershell
Set-Location G:\brk\apps\web
npm install
```

## Anthropic Claude API Setup

Brokerino agents crawl their configured sources (web URLs / podcast feeds), then send the
gathered evidence plus the agent's system prompt to the Anthropic Claude API, which returns
structured long/short stock signals with confidence scores and citations.

1. Create or retrieve an API key from the Anthropic Console: https://console.anthropic.com/
2. Set the following environment variables before starting the API:

```powershell
Set-Location G:\brk\apps\api
$env:ANTHROPIC_API_KEY = '<your key>'
npm run start
```

- The Claude **model** used per run is not read from an environment variable — it comes from
  the agent's stored prompt version (`model` field, e.g. `claude-sonnet-4-5`), set via the
  **System prompt** tab in the web UI or `POST /api/agents/:agentId/prompt`.

- If `ANTHROPIC_API_KEY` is not set, agent runs will fail at the Claude call step; scheduled
  runs will be marked `failed` with `errorCode: 'agent_run_failed'` and the failure will be
  visible via `GET /api/agents/:agentId/runs` and in the reports browser (no report is produced).
- Per-agent model/system-prompt overrides are configured via the **System prompt** tab in the
  web UI (`AgentPromptEditor`) or `POST /api/agents/:agentId/prompt`; the API key itself is a
  process-level environment variable, not stored per-agent.
- Tests never call the live Claude API: `ClaudeClient` accepts an injectable messages client,
  and all unit/integration tests supply a stub (see `apps/api/src/modules/analysis/claude-client.test.ts`
  and `apps/api/src/modules/analysis/agent-runner.integration.test.ts`).

## Authentication & SMTP Configuration

All `/api/agents` routes require a logged-in session; the web app shows a
login/signup screen (`AuthPage`) until a session cookie is present. Copy
`apps/api/.env.example` to `apps/api/.env` (or set the equivalent env vars) and configure:

`apps/api/.env` is loaded automatically at startup via `dotenv` (`import 'dotenv/config'` in
`src/main.ts`), so editing the file and restarting the API (`npm run start:api`) is enough —
manually exporting `$env:...` variables is only needed to override a value from `.env`.

- **Session signing**: `JWT_SECRET` (required in production), `JWT_EXPIRES_IN`,
  `AUTH_COOKIE_NAME`, `AUTH_COOKIE_SECURE` (set to `true` behind HTTPS).
- **Bootstrap admin account** (optional): `ADMIN_EMAIL` / `ADMIN_PASSWORD` create a fixed
  account on API startup, in addition to self-service signup via the login screen — useful for
  first access before anyone has signed up.
- **Google social login** (optional): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `GOOGLE_CALLBACK_URL` (must match the redirect URI configured in Google Cloud Console),
  `APP_BASE_URL` (where the browser is redirected after a successful Google login). If these are
  unset, `GET /api/auth/google` returns `503` and the "Sign in with Google" button will fail —
  password-based login/signup still works without them.
- **SMTP** (optional, config-only for now — no email is sent by any feature yet):
  `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`. The mailer
  service (`apps/api/src/modules/auth/mailer.ts`) logs a warning instead of throwing when SMTP
  isn't configured, so the API still starts without it.

Self-service signup/login is always available via `POST /api/auth/signup` /
`POST /api/auth/login` (or the web login screen) regardless of whether Google/SMTP are configured.

## Run the Web App

```powershell
Set-Location G:\brk\apps\web
npm run start
```

Opens the Ant Design-based Brokerino dashboard on `http://localhost:4173`. From there you can:
- Create a new agent via the 6-step wizard (**Create Agent**)
- Select an existing agent to browse its **Reports** (symbol badges, date, headline, confidence)
  or edit its **System prompt**

## Run Targeted Tests

```powershell
Set-Location G:\brk\apps\api
npm run test -- src/modules/agents/validation.test.ts src/modules/agents/repository.test.ts
```

Expected: both tests pass.

## Run Full Test Suites

```powershell
Set-Location G:\brk\apps\api
npm run test
```

```powershell
Set-Location G:\brk\apps\web
npm run test
```

## Run End-to-End Tests

```powershell
Set-Location G:\brk\apps\web
npm run test:e2e
```

E2E specs live under `apps/web/e2e/` (scoped via `playwright.config.ts`'s `testDir` so they
don't collide with Vitest unit tests). These specs render synthetic DOM fixtures rather than
driving the full Vite dev server + live API, so they run without an Anthropic API key.

## Prisma Notes

- Schema file: `G:\brk\apps\api\prisma\schema.prisma`
- Local DB file: `G:\brk\apps\api\prisma\dev.db`
- To initialize/update the local DB schema, run:

```powershell
Set-Location G:\brk\apps\api
npx prisma db push
```

- If Prisma client issues appear, run:

```powershell
Set-Location G:\brk\apps\api
npx prisma generate
```

- **Windows gotcha:** if `prisma generate`/`db push` fails with `EPERM: operation not permitted,
  rename ... query_engine-windows.dll.node.tmp...`, a leftover `node.exe` process (e.g. a
  previous `npm run start`/`vite preview` session) is holding a file lock. Find and stop it:

```powershell
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Select-Object ProcessId, CommandLine
Stop-Process -Id <pid>
```

