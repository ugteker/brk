# Brokerino — Single Source of Truth

> **This file is the canonical, living record of requirements and progress.**
> It supersedes `scope-and-decisions.md` and `status.md` (kept for history only).
> Updated automatically after every completed task or new requirement.

Last updated: 2026-07-10 (UI polish batch: pause/resume, wizard icons, dark theme fix, persona library)

---

## 1. Requirements (cumulative, append-only unless explicitly superseded)

### Product Direction
- Brokerino bots are **AI agents**: they crawl configured sources, feed evidence + a
  system prompt into the **Anthropic Claude API (Sonnet model)**, and produce a
  structured report of stock signals.
- Report output = **long/short signal per symbol**, with **confidence**,
  **rationale**, and **source citations/timecodes**. Informational only —
  **no automated trade execution, brokerage write-back, or live market-data platform.**
- If a bot crawls a podcast, the report must reflect everything discussed and
  indicate which symbols are suggested long vs. short based on the conversation.
- User has an Anthropic Claude API key (API-based account) — integration must call
  the real Anthropic API in production, but stay **testable without a live Claude
  dependency** (inject a fake client in tests).

### Architecture / Backend
- Stack: TypeScript, Fastify, Prisma, **SQLite** for local dev (not Postgres).
- Keep the existing scheduler/worker shape — no separate orchestration stack.
- Existing Prisma model names (`Bot`, `BotRun`, etc.) may remain as-is during the
  transition even as product language shifts from "bot" to "agent".
- The web app must keep proxying `/api` requests to the API during local dev.
- The dashboard must load persisted agents/reports (not stay local-only).

### Frontend
- Primary UI library: **Ant Design** (chosen as "most popular" per user request for
  something "fancy"), replacing the shadcn-style component set for the redesigned
  screens.
- 6-step agent setup flow: identity → sources/ingestion rules → system prompt →
  signal policy/publish rules → schedule/recipients → review and run.
- **Reports browsing view**: once a bot/agent produces a report, users must be able
  to navigate through all related reports for that agent. Each report list item
  must show:
  - Badges for every stock symbol mentioned in that report (long/short colored).
  - The date the report was created.
  - A very short summary/title/headline describing the report.
  - A visual indicator of how confident/reliable the report's signals are
    (e.g. a progress/gauge-style confidence indicator), not just a number.
- **Bot pause/resume**: each bot must have a pause/resume icon control (not a
  text button) so the user can toggle a bot between active and disabled
  directly from the dashboard/detail view.
- **Wizard step headers**: the 6-step agent setup wizard's step headers must
  use icons + short titles (not long squeezed text labels).
- **Dark theme correctness**: dark mode must apply consistently to *all*
  elements, including Ant Design inputs/cards/selects — not just
  Tailwind-styled elements.
- **Theme toggle control**: the theme switch must be a single icon button
  (sun/moon), not a dropdown/select.
- **Trading persona prompt library**: the wizard's System prompt step must
  offer multiple full, ready-to-use system prompts ("personas") with
  different trading characters/risk profiles that the user can pick from,
  each of which also sets a sensible default risk level.

### Process / Workflow (user-directed, applies across this session and future work)
- **All requirements must live in a single markdown source of truth (this file)** —
  do not scatter requirements across chat history only.
- **This file must be updated automatically as progress is made** (after each task,
  not just at the end).
- Since this repo has no git history, implementation proceeds via direct
  session-based execution (TDD per task) rather than full subagent-driven-development
  tooling, which assumes a git repo.

---

## 2. Progress Ledger

Plan reference: `docs/superpowers/plans/2026-07-10-brokerino-agent-ai-redesign.md`
Spec reference: `docs/superpowers/specs/2026-07-10-brokerino-ai-agent-redesign-design.md`

| Task | Status | Notes |
|---|---|---|
| Task 1: Persist prompt versions, artifacts, run reports | ✅ Done | Prisma models `BotPromptVersion`, `BotRunArtifact`, `BotRunReport`, `BotSignal` added; `PromptRepository`, `ArtifactRepository`, `ReportRepository` implemented with tests (7 tests passing). `prisma generate` + `db push` run successfully against local SQLite dev.db. |
| Task 2: Claude analysis pipeline + source adapters | ✅ Done | `@anthropic-ai/sdk` added to `apps/api`. Implemented `WebUrlAdapter`, `PodcastFeedAdapter` (transcript-first, show-notes fallback with `fidelity: 'low'`), `buildAnalysisRequest`/`renderEvidenceForPrompt`, `parseClaudeResponse` (with validation errors), `ClaudeClient` (DI-able Anthropic messages client). 11 tests passing. |
| Task 3: Wire scheduled runs to agent execution + `/api/agents` routes | ✅ Done | Added `AgentRunner` (crawls sources via adapters, saves artifacts, calls Claude, saves report); added `Bot.getBot()` to repository/interface; rewired `worker.ts`/`scheduler-loop.ts` to run the agent pipeline instead of auto-succeeding; added `/api/agents/:botId/report/latest`, `/api/agents/:botId/reports` (list), `/api/agents/:botId/prompt/latest`, `POST /api/agents/:botId/prompt`; wired all of it in `main.ts`/`server.ts`. Full API suite: **41/41 tests passing**, `tsc` build clean. |
| Task 4: Rebuild web experience with Ant Design | ✅ Done | `antd` + `@ant-design/icons` installed. Added `listReportsForBot` to `ReportRepository` + `/api/agents/:botId/reports` route to support the **reports browsing view** requirement (badges per symbol, date, headline, confidence indicator). Built `apps/web/src/api/agents.ts` client, `AgentSignalReport`, `AgentReportsBrowser`, `AgentPromptEditor` components (all tested; jsdom needed `matchMedia`/`ResizeObserver` polyfills in `src/test-setup.ts`). Rebuilt `BotForm.tsx` as a 6-step Ant Design wizard (Agent identity → Sources & ingestion → System prompt → Signal policy & publish rules → Schedule & recipients → Review & run) that creates the bot then saves its prompt version. Rebuilt `BotsPage.tsx` with Ant Design `Layout`/`Card`/`Tabs`: selecting a bot now shows its **Reports** tab (`AgentReportsBrowser`, fulfilling the reports-browsing requirement) and **System prompt** tab (`AgentPromptEditor`). Updated `BotStatusCard` to Ant Design; wrapped app in `ConfigProvider` + `antd/dist/reset.css` in `main.tsx`. `ThemePicker` intentionally left as a native `<select>` to preserve its `fireEvent.change` test contract. Full web suite: **16/16 passing**; full API suite: **41/41 passing**; `vite build` clean on both. |
| Task 5: End-to-end verification + setup docs | ✅ Done | Added `apps/api/src/modules/analysis/agent-runner.integration.test.ts` — exercises the real `BotRepository`/`PromptRepository`/`ArtifactRepository`/`ReportRepository` classes (backed by an in-memory fake Prisma client, following the repo's existing mocking convention) wired into `AgentRunner` with a stubbed Claude messages client, proving a full crawl → Claude → persisted-report round trip. Added `apps/web/playwright.config.ts` (`testDir: './e2e'`) to stop Playwright from colliding with Vitest unit tests, and `apps/web/e2e/agent-flow.spec.ts` (synthetic-DOM flow: dashboard → create agent → system prompt step → report card with badge/date/headline/confidence), matching the existing `bot-setup.spec.ts` convention. Updated `docs/implementation/setup-and-run.md` with Anthropic API key setup (`ANTHROPIC_API_KEY`), a note that Claude model comes from the stored prompt version (not an env var), web app run instructions, full/targeted test commands, and the Windows Prisma file-lock workaround. Final verification: **API 42/42 tests passing**, `tsc -p tsconfig.build.json` clean; **Web 16/16 unit tests passing**, `vite build` clean, **2/2 Playwright e2e specs passing**. |
| Task 6: UI polish — pause/resume, wizard icons, dark theme fix, persona library | ✅ Done | **Backend**: added `enableBot` (mirrors `disableBot`) to `BotRepositoryLike`, Prisma `BotRepository`, `InMemoryBotRepository`, and a new `POST /api/bots/:botId/enable` route (10/10 `src/modules/bots` tests passing). **Frontend theme fix**: added `apps/web/src/theme/ThemeContext.tsx` (`ThemeProvider`/`useTheme`, persists to `localStorage`, respects `prefers-color-scheme`) and wired `main.tsx`'s antd `ConfigProvider` to switch `algorithm` between `defaultAlgorithm`/`darkAlgorithm` based on theme state — this is what actually fixes antd inputs/cards staying light in dark mode (previously only a Tailwind `.dark` class was toggled, which antd ignores). `ThemePicker.tsx` rebuilt as a single icon-only circular button (`SunOutlined`/`MoonOutlined`) instead of a dropdown. **Wizard step icons**: `BotForm.tsx`'s `STEPS` changed from plain strings to `{title, icon}` pairs (`UserOutlined`, `LinkOutlined`, `MessageOutlined`, `SafetyCertificateOutlined`, `ClockCircleOutlined`, `CheckCircleOutlined`) with short titles (Identity/Sources/Prompt/Policy/Schedule/Review) and `Steps` using `titlePlacement="vertical"` to stop the squeezed-header layout. **Persona library**: new `apps/web/src/data/prompt-personas.ts` with 7 full, ready-to-use Claude system prompts (Conservative Analyst/low, Balanced Analyst/medium [default], Aggressive Momentum Trader/high, Contrarian Value Investor/medium, Quant/Data-Driven Analyst/medium, Short-Seller/Skeptic/high, Macro/Thematic Strategist/medium) — wired into the System prompt step via a new "Persona" `Select` that swaps the prompt text and defaults the Signal Policy step's risk level to the persona's suggested level (still user-overridable). **Pause/resume UI**: `apps/web/src/api/bots.ts` gained `enableBot`/`disableBot` client calls; `BotsPage.tsx` now shows a pause/resume icon button (`PauseCircleOutlined`/`PlayCircleOutlined`) on each dashboard bot card and in the selected-bot detail header, wired to the new API calls with a refetch after toggling. Updated `BotForm.test.tsx` to wrap all `BotsPage` renders in `<ThemeProvider>` and switched the theme-toggle test from `fireEvent.change` on a select to `fireEvent.click` on the icon button. Final verification: **Web 16/16 unit tests passing**, `vite build` clean; **API 10/10 `bots` module tests passing**; both dev servers (API `:3000`, web preview `:4173`) restarted and confirmed responding (`200`) after the change. |
| Task 7: Remove-agent feature | ✅ Done | **Backend**: `BotRepository.deleteBot()` cascade-deletes signals→reports→artifacts→runs→prompt versions→schedules→sources→bot inside a `$transaction` (required because all `Bot`-related FKs use `onDelete: Restrict`); added to `BotRepositoryLike`, `InMemoryBotRepository`, and a new `DELETE /api/bots/:botId` route (204 / 404). **Frontend**: `apps/web/src/api/bots.ts` gained `deleteBot()`; `BotsPage.tsx` shows a `Popconfirm`-guarded `DeleteOutlined` icon button on each dashboard bot card and in the selected-bot detail header, resetting selection and refetching after deletion. Final verification: **API 47/47 passing** (at time of feature), **Web 17/17 passing**, `vite build` clean. |
| Task 8: Authentication (username/password + Google) + configurable SMTP | ✅ Done | **Scope decisions (autonomous, user unavailable to confirm at the time — flagged for review)**: JWT-in-httpOnly-cookie sessions; all existing `/api/bots`+`/api/agents` routes gated behind auth; SMTP implemented as backend config + mailer service only (no email-sending feature wired to a trigger yet); config sourced from `.env`/env vars (`apps/api/.env.example`). **Backend**: new `apps/api/src/config.ts` (lazy-getter accessors — required so `vi.stubEnv()` per-test isolation works — covering `auth.jwtSecret/jwtExpiresIn/cookieName/cookieSecure`, `auth.google.*`, `auth.bootstrapAdmin.*`, `smtp.*`, `appBaseUrl`); Prisma `User` model (email unique, optional `passwordHash`/`googleId`); `modules/auth/{types,password,jwt,repository,in-memory-user-repository,google-oauth,mailer,routes}.ts`; routes: `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `GET /api/auth/google` (redirect), `GET /api/auth/google/callback` (find-or-create-or-link by googleId/email, sets session cookie). `server.ts` registers `@fastify/cookie` (pinned to `^9` for Fastify v4 compat) and an `onRequest` guard hook blocking all unauthenticated `/api/*` calls except `/api/auth/*`. `main.ts` wires `UserRepository`/`GoogleOAuthHttpClient` and an optional `ADMIN_EMAIL`/`ADMIN_PASSWORD` bootstrap-admin account on startup (additive to self-service signup, not a replacement for it). Google OAuth implemented via raw `fetch` (no OAuth library dependency). `toAuthUser()` never exposes `passwordHash`, only `hasPassword`/`hasGoogleLinked` booleans. New `test-utils/auth.ts` (`createTestAuthDeps()`/`authCookieHeader()`) is now the standard convention for any protected-route test. **Frontend**: `apps/web/src/api/auth.ts` (signup/login/logout/getCurrentUser/`GOOGLE_SIGN_IN_URL`); `apps/web/src/auth/AuthContext.tsx` (`AuthProvider`/`useAuth`, checks `/api/auth/me` on mount); `apps/web/src/pages/AuthPage.tsx` (Ant Design card with a Login/Sign up `Segmented` toggle, email+password form, and a "Sign in/up with Google" button linking to `/api/auth/google`); `App.tsx` now wraps the app in `AuthProvider` and gates `BotsPage` vs `AuthPage` on session state (with a loading spinner while `/me` resolves); `BotsPage.tsx` header now shows the logged-in user's name/email and a logout icon button. `vite.config.ts` given a matching `preview.proxy` (in addition to `server.proxy`) so `/api` calls are proxied to the API in both `vite dev` and the `vite preview` deployment mode used by this repo's dev servers. Final verification: **API 21 files / 62 tests passing**, `tsc -p tsconfig.build.json --noEmit` clean; **Web 5 files / 21 tests passing**, `vite build` clean; live end-to-end curl flow through the web proxy confirmed signup → login → `/me` → protected `/api/bots` (200) → logout (204) → protected route blocked (401). |
| Task 9: Rename "Bot" → "Agent" everywhere | ✅ Done | Full codebase rename, user-requested. **Backend**: Prisma models `Bot→Agent`, `BotSource→AgentSource`, `BotSchedule→AgentSchedule`, `BotRun→AgentRun`, `BotPromptVersion→AgentPromptVersion`, `BotRunArtifact→AgentRunArtifact`, `BotRunReport→AgentRunReport`, `BotSignal→AgentSignal` (dev.db reset via `prisma db push --force-reset`, no production data at stake); module folder `modules/bots``modules/agents` (CRUD: `AgentRepository`, `registerAgentRoutes`, routes now `/api/agents`, `/api/agents/:agentId`, etc.); the **pre-existing** `modules/agents` (prompt/report routes) renamed to `modules/agent-prompts` with `registerAgentPromptRoutes`/`AgentPromptRoutesDeps` to avoid a naming collision with the newly-renamed CRUD module — both still mount under the same `/api/agents/*` URL space without conflict. **Frontend**: `BotForm.tsx→AgentForm.tsx`, `BotsPage.tsx→AgentsPage.tsx`, `BotStatusCard.tsx→AgentStatusCard.tsx`; `api/bots.ts` merged into `api/agents.ts` (single client module for both CRUD and prompt/report calls). All identifiers (`createBot→createAgent`, `listBots→listAgents`, `selectedBot→selectedAgent`, etc.) and UI copy ("Bot dashboard"→"Agent dashboard", "Create Bot"→"Create Agent") renamed via a word-boundary-safe scripted pass (careful to exclude false positives like `both`/`marginBottom`). Playwright e2e spec `bot-setup.spec.ts` renamed to `agent-setup.spec.ts`. Final verification: **API 21 files / 62 tests passing**, `tsc -p tsconfig.build.json --noEmit` clean; **Web 5 files / 21 tests passing**, `vite build` clean. |

## 4. All Tasks Complete

All 5 planned tasks for the Brokerino AI-agent redesign are done and verified, plus three
follow-up batches (Tasks 6-8):
1. Persisted prompt versions, artifacts, and run reports (Prisma models + repositories).
2. Claude analysis pipeline + source adapters (web URL, podcast feed).
3. Scheduled runs wired to real agent execution + `/api/agents/*` routes.
4. Ant Design web rebuild: 6-step agent wizard, reports browser (symbol badges/date/headline/confidence),
   system prompt editor, all wired into `BotsPage`.
5. End-to-end integration test, Playwright e2e flow, and setup docs for Anthropic API key usage.
6. UI polish: bot pause/resume icon controls, wizard step icons + short titles, a working dark
   theme (antd `ConfigProvider` algorithm switching), an icon-only sun/moon theme toggle, and a
   7-persona trading system-prompt library selectable in the wizard.
7. Remove-agent feature: cascade-delete backend route + confirm-guarded delete icon in the UI.
8. Authentication: username/password + Google social login, signup for both methods, JWT
   session cookies, all API routes gated behind auth, and backend-configurable SMTP settings
   (mailer service ready for future email-sending features).

Any further work (e.g., a real live-server e2e run, dead shadcn primitive cleanup, chunk-size
optimization for the `vite build` warning, or actually wiring the SMTP mailer to a triggered
email such as password-reset or signup verification) is optional follow-up, not required by the
original spec.

## 3. Environment Notes
- Repo `G:\brk` is **not git-initialized** — no commits, no branches. Implementation
  proceeds directly in this working tree.
- Local dev servers (API `tsx src/main.ts`, web `vite preview`) must be stopped
  before running `prisma generate`/`db push` on Windows (file lock on the Prisma
  query engine DLL) — restart them after schema changes when needed.
