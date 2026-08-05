# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Maydoz is a **general-purpose content-analysis-and-notification platform**, not a
trading app. Finance is just one of several agent "characters" (see Domain model below).
The app ingests content from sources (YouTube, podcasts, web pages, RSS), runs it through
a user-defined AI agent with a custom character/personality via Claude, and delivers a
structured report as a notification. Full product context: `docs/APP-SUMMARY.md` (read
this first for domain/architecture) and `docs/implementation/PROJECT.md` (living
requirements/task ledger — **update it after completed tasks**).

Do not reintroduce trading-specific language into the general (non-`finance_expert`) path.
Legacy trading-flavored naming (`AgentSignal`, `Watchlist`, "Maydoz" brand) is residue
from the app's original scope, not the current product purpose.

## Monorepo layout

`apps/api` (Fastify + Prisma + SQLite) and `apps/web` (React + Vite + Ant Design), npm
scripts proxied from the root `package.json`. Web dev proxies `/api` → API on `:3000`; web
runs on `:4173`.

## Commands

Run from repo root, or `cd` into `apps/api` / `apps/web` and drop the `:api`/`:web` suffix.

```bash
npm run build:api / build:web     # tsc build (api) / vite build (web)
npm run start:api / start:web     # run built output
npm run test:api                  # vitest run (apps/api)
npm run test:web                  # playwright test --grep @smoke (apps/web)
```

API dev loop (from `apps/api`):
```bash
npm run dev                        # tsx watch src/main.ts (auto prisma generate first)
npx vitest run path/to/file.test.ts              # single test file
npx vitest run -t "test name substring"          # single test by name
npx vitest                                        # watch mode
```

Web dev loop (from `apps/web`):
```bash
npm run dev                        # vite dev server, HMR, :4173
npx playwright test --grep @smoke -g "test name"  # single smoke test
```

Catalog tooling (character/source catalog import, from `apps/api`):
```bash
npm run catalog:validate
npm run catalog:preview
npm run catalog:import:dry-run
npm run catalog:import            # --apply
```

**Windows dev note**: stop dev servers before `prisma generate` / `prisma db push` (SQLite
DLL file lock). The web preview (`start:web`) serves a static build — rebuild and restart
after making web changes; it does not hot-reload.

**Anthropic API key**: set `ANTHROPIC_API_KEY` for the API process, or agent runs fail at
the Claude call step (run marked `failed`, no report produced). Tests never call the live
Claude API — `ClaudeClient` takes an injectable messages client; tests supply a stub
(`apps/api/src/modules/analysis/claude-client.test.ts`).

## Architecture (API — `apps/api/src/modules/`)

**3-hub domain model**: Source, Agent, Playbook are independent, reusable building blocks —
one agent can watch many sources, one source can feed many agents.

- **`source/`** — Source library entries (YouTube video/channel/playlist, podcast RSS, web
  URL). Probing/preview, crawl config, per-source `maxItems`, seen-item cursors so content
  is never reprocessed.
- **`crawler/`, `analysis/source-adapters/`** — fetch new items per source type. YouTube
  transcripts come from the InnerTube Android-client API (full spoken transcript, not show
  notes) — see the ASR/IP-block note in `docs/deployment-procedure.md`
  (`YOUTUBE_PROXY_URL` residential-proxy workaround). Non-feed pages get a one-time AI
  "site inspection" (`site-inspector-client.ts`) with self-healing re-inspection, capped to
  once per 24h.
- **`agents/`** — Agent identity: name, character type, versioned system prompt
  (`AgentPromptVersion`), language. Agents own identity only — not schedule or sources.
- **`agent-curation/`** — the AI curator: freeform-conversation agent creation/refinement
  ("Improve with AI"), producing an editable profile review that the user must explicitly
  confirm before create/save.
- **`analysis/`** — the core pipeline: `agent-runner.ts` orchestrates a run, gathers
  evidence, calls `claude-client.ts` (`analyze()`), which sends the character's system
  prompt (built in `character-prompt-strategy.ts` — enforces the non-finance guardrail,
  see below) plus evidence plus a `submit_report` tool schema to Claude, and parses the
  structured result.
- **`playbook/`** — connects Agent + Sources (`PlaybookSource`) + schedule
  (interval/daily/weekly) + recipients + notification/digest settings. Owns `AgentRun`
  (phases, retries, artifacts) and `AgentRunReport` (with AI usage stats).
- **`schedules/`** — scheduler loop (polls for due playbook runs) and next-run computation.
- **`reports/`** — unified report shape: common fields (headline, key takeaways, entities,
  tone, time horizon, novelty, presentation card) shared by all characters, plus a
  discriminated-union character-specific section. Only `finance_expert` may emit
  `AgentSignal` (symbol, long/short, confidence, citations, rationale) — this is enforced
  in the prompt layer, not just the type system. Also owns report Q&A/chat (grounded in
  persisted evidence artifacts).
- **`discussion/`** — Studio hub: synthetic multi-agent discussions
  (`orchestrator.ts` runs turns between agent personas), materialized as a
  `synthetic_discussion` source.
- **`catalog/`, `tools/catalog/`** — the character/source starter catalog and its
  validate/preview/import CLI tools (see Commands above).
- **`auth/`, `access/`, `admin/`** — JWT-in-httpOnly-cookie auth (email+password, Google
  OAuth), `AccessGrant`-based read/edit/delete sharing, admin gated by `ADMIN_EMAIL`.
- **`realtime/`** — SSE endpoints (`GET /api/agents/:agentId/stream`) pushing run/report
  updates instead of client polling.
- **`usage/`** — per-user monthly token/cost budget and usage dashboard data.
- **`watchlist/`, `artifacts/`, `runs/`, `prompts/`, `agent-prompts/`** — supporting
  domains for the above (finance watchlists, run/report artifacts, prompt versioning).

**Non-finance guardrail**: when touching prompt construction, respect the check in
`analysis/character-prompt-strategy.ts` that prevents non-`finance_expert` characters from
producing investment advice, tickers, or long/short calls unless the evidence is itself
explicitly about finance.

**Deployment/scaling**: single Docker container (API + nginx SPA + cloudflared) on
Hetzner. API supports multi-process clustering via `WEB_CONCURRENCY` (N HTTP workers +
one dedicated scheduler process for background jobs), sharing one SQLite DB in WAL mode
(5s busy timeout) for safe concurrent writes.

## Architecture (Web — `apps/web/src/`)

- **`App.tsx`** — routes (`/`, `/library`, `/agents`, `/playbooks`, `/studio`) via
  react-router-dom v7, wraps the tree in `AppDataProvider` (inside `AuthGate`).
- **`context/`** — `AppDataContext` supplies agents/sources/playbooks/marketplace data +
  refresh functions to all pages, so pages don't each own duplicate load/refresh logic.
- **`pages/hub/`** — the four hub tabs (Feed `/`, Library `/library`, Agents `/agents`,
  Playbooks `/playbooks`), all rendered by **`HubPage.tsx`** (~1700-line orchestrator:
  state, effects, handlers, composition; formerly the ~4800-line `AgentsPage.tsx`
  monolith). Extracted pieces live alongside it: `FeedTab.tsx`, `types.ts`,
  `helpers.tsx`, `components/` (LibraryTab, AdminWorkspace, FollowWizardModal,
  ReportDrawer, AgentPickerModal, ScheduleEditModal) and `hooks/` (useHubNavigation,
  useReportsFeed, useScheduleDraft). React Router keeps ONE HubPage instance mounted
  across all four routes; the active hub is derived from the URL. When changing hub
  behavior, prefer editing/extending the extracted component over growing HubPage.
- **`realtime/`** — `useAgentStream` hook wrapping native `EventSource` (auto-reconnect)
  for the SSE run/report updates.
- UI is Ant Design (v6) + a few legacy shadcn primitives + Tailwind; dark theme must work
  through antd's `ConfigProvider` algorithm, not just Tailwind `.dark`. Icon buttons over
  text buttons.
- **i18n**: every UI string goes into BOTH `apps/web/src/i18n/locales/en.json` and
  `de.json`. Never hardcode display text.

## Testing conventions

- TDD: tests are written alongside/after prod code per feature, not retrofitted.
- API: in-memory fake repositories for unit tests; `createTestAuthDeps()` /
  `authCookieHeader()` helpers for exercising protected routes without real JWT/DB setup.
- Web: Playwright smoke tests tagged `@smoke`.
