# ChatTrader — App Summary (for humans & AI agents)

> Read this first to understand what the app is, its USP, architecture, and where to
> find details. Living requirements/progress ledger: `docs/implementation/PROJECT.md`.

Last updated: 2026-07-19

---

> ⚠️ **Read this before assuming domain (2026-07-19):** This is a **general-purpose
> content-analysis-and-notification platform**, *not* a trading/finance app. Finance is
> just **one of several agent characters** (see §4). The app ingests content from
> sources, runs it through a user-defined AI agent with a custom character/personality,
> and delivers a report as a notification. The finance/stock-signal behavior only fires
> for the `finance_expert` character and only when the evidence is actually about finance.
> Do **not** reintroduce trading-specific language into UI, copy, data models, or prompts
> for the general path. (Historical note: the project *started* as a trading-only app,
> which is why some legacy naming — the "ChatTrader" brand, the `AgentSignal`/`Watchlist`
> tables, TradingView chart components — is still trading-flavored. Treat that as residue
> to generalize, not as the product's purpose.)

---

## 1. What is ChatTrader?

ChatTrader turns **spoken/written content** (YouTube videos, podcasts, blogs, web pages,
news feeds, documents) into **structured, AI-analysed reports** delivered as
notifications (email today, plus an in-app feed and notification bell).

The flow is three steps:

1. **Pick up data from a source** — podcast/RSS feed, web URL, or YouTube
   video/channel/playlist (full transcripts, not just show notes). New items are crawled
   automatically on a schedule.
2. **Run analysis with an agent the user creates** — AI curation is the primary creation
   path: the user describes the analyst they need in a freeform conversation, then edits
   and explicitly confirms the curator's profile review. Manual setup remains available.
   Each agent has a **custom character/personality** (a system prompt), reads the crawled
   evidence, and produces a report *in the voice and shape of its character*.
3. **Deliver the report as a notification** — a structured report is emailed to the user
   (and surfaced in the in-app Feed / notification bell), shaped by the agent's character.

A user says: *"Summarise this podcast/YouTube channel with this character every Monday at
8:00 and notify me."* — ChatTrader crawls new episodes, fetches full transcripts, runs
them through the character's Claude system prompt, and produces a structured report.

**Characters are general.** Out of the box the platform ships six character types (see §4):
`summarizer`, `teacher`, `trainer`, `philosopher`, `influencer`, and `finance_expert`.
Every report shares a common structure (headline, key takeaways, entities, tone, time
horizon, novelty, a presentation card), plus a **character-specific section**.

**Finance is one character, not the product.** The `finance_expert` character additionally
emits per-symbol long/short "signals" with confidence and citations, and unlocks
finance-only extras (TradingView charts, symbol watchlists). A hard guardrail in the
prompt layer prevents *non-finance* characters from producing investment advice, tickers,
or long/short calls unless the evidence itself is explicitly about finance.

**Informational only** — no trade execution, no brokerage integration, no live
market-data platform.

## 2. USP (why this and not X?)

1. **Character-driven analysis**: the same source can be analysed by very different
   personalities — a teacher extracting lessons, a summarizer distilling takeaways, a
   philosopher drawing implications, a finance analyst calling signals. One reusable
   report engine, many voices.
2. **Transcript-first ingestion**: full spoken transcripts from YouTube (InnerTube
   Android-client API) and podcasts — not just show notes — so analysis reflects what
   was actually *said*.
3. **Smart, cost-aware crawling**: seen-item cursors for feeds; one-time AI "site
   inspection" for non-feed pages with self-healing re-inspection; per-source
   `maxItems` caps. Content is never reprocessed.
4. **Composable 3-hub model** (see §4): Sources, Agents (characters), Playbooks are
   independent, reusable building blocks — one agent can watch many sources, one
   source can feed many agents.
5. **Character library**: ready-made personalities (general characters + a set of finance
   personas from conservative → aggressive) with editable, versioned system prompts.
6. **Transparency**: per-report AI stats (model, tokens, est. cost), run history with
   live phase indicators (crawling → analyzing → notifying), crawled-evidence
   previews/downloads, real failure reasons.
7. **Marketplace & sharing**: sources/agents/playbooks can be published publicly and
   cloned/"followed" by other users; per-agent access grants (read/edit/delete).

## 3. Tech stack

| Layer | Tech |
|---|---|
| API | Node.js + TypeScript, Fastify 4, Prisma 6, SQLite with WAL mode (dev + prod volume) |
| AI | `@anthropic-ai/sdk` (Claude Sonnet), DI-able client, fenced-JSON tolerant parsing |
| Web | React 18 + Vite, **Ant Design 6** (+ a few legacy shadcn primitives), Tailwind, i18next (en/de) |
| Auth | JWT in httpOnly cookie; email+password w/ 2-step confirmation, Google OAuth, password reset, admin user management (`ADMIN_EMAIL`) |
| Email | nodemailer SMTP, bilingual templates |
| Tests | API Vitest, Playwright web smoke tests |
| Deploy | Single all-in-one Docker container (API + nginx SPA + cloudflared) on Hetzner, GitHub Actions deploy over SSH; API supports multi-process clustering via `WEB_CONCURRENCY` |

Monorepo: `apps/api` + `apps/web` (npm scripts proxied from root `package.json`).
Web dev proxies `/api` → API `:3000`; web served on `:4173`.

The API can scale to multiple processes: set `WEB_CONCURRENCY` to N (default 1 = single process like before) to fork N HTTP worker processes sharing port 3000, plus one dedicated scheduler process for background jobs (digest loop, discussion scheduler, admin bootstrap). SQLite runs in WAL mode with a 5-second busy timeout on all processes at startup, enabling safe concurrent writes without contention. Process management via Node's `cluster` module with automatic respawn on crash (e.g., same role if a worker dies).

## 4. Domain model (3-hub architecture)

- **Source** (`Source`, shared library): YouTube video/channel/playlist, podcast RSS,
  or web URL. Has probe ("Test source" with preview items), crawl config, `maxItems`.
  New sources can be found by name (`GET /api/sources/search`: iTunes podcast search +
  YouTube channel search via optional `YOUTUBE_API_KEY` or scraping fallback) with
  curated/marketplace suggestions (`GET /api/sources/suggestions`); pasting a URL
  directly remains the fallback path.
  A synthetic `synthetic_discussion` source type is produced by the Studio hub (§8).
- **Agent** (character/personality): name, character type + system prompt (versioned
  `AgentPromptVersion`), language. AI curation is the primary creation path, while manual
  setup remains available. Existing agents can be refined with **Improve with AI**. The
  curator gathers the profile through freeform conversation, shows an editable review, and
  requires explicit confirmation to create or save the agent. Avatars are unavailable.
  Agents own identity only — *not* schedule or sources.
- **Playbook**: connects Agent + Sources (`PlaybookSource`) + schedule
  (interval/daily/weekly) + recipients + notification toggle + digest cadence. Owns
  **Runs** (`AgentRun` with phases, retries, artifacts) and **Reports**
  (`AgentRunReport`, AI usage stats).
- **Marketplace**: `MarketplacePublication` for sources/agents/playbooks;
  clone/follow flows.
- **Access**: `AccessGrant` (read/edit/delete, optional expiry).
- **User**: email/password and/or Google; roles; admin gated by `ADMIN_EMAIL`.

### Report shape (unified, character-driven)

A report is a **unified structure** (`apps/api/src/modules/reports/`):

- **Common fields** (all characters): headline, key takeaways, result type, extracted
  entities, tone, time horizon, novelty, and a presentation "card".
- **Character-specific section** — a discriminated union, one shape per character:
  - `summarizer` (default on the API side), `teacher`, `trainer`, `philosopher`,
    `influencer` — general sections, no trading language.
  - `finance_expert` — additionally carries per-symbol **signals**
    (`AgentSignal`: symbol, long/short side, confidence, rationale, citations). This is
    the *only* character allowed to emit signals; the prompt layer enforces it.

Primary user flow ("Summarize" / listen flow): pick a source → use the curator to create
and explicitly confirm an agent (or use manual setup) → set schedule → reports arrive as
notifications and in the Feed hub. The source-first guided setup gives the curator advisory
source context only. Choosing **Set up later** preserves the source without creating an
agent, playbook, or run. Advanced runtime configuration is outside the guided setup scope.

## 5. Key implementation notes for agents working here

- **Single source of truth**: requirements + task ledger in
  `docs/implementation/PROJECT.md` — update it after every completed task.
- **Don't hardcode the finance domain**: new report/UI/copy work goes through the
  general (character-agnostic) path. Only `finance_expert`-gated code may reference
  signals/tickers/long-short. When touching prompts, respect the non-finance guardrail
  in `apps/api/src/modules/analysis/character-prompt-strategy.ts`.
- **i18n**: every UI string goes into BOTH `apps/web/src/i18n/locales/en.json` and
  `de.json`. Never hardcode display text.
- **UI**: Ant Design components; icon buttons over text buttons; dark theme must work
  via antd `ConfigProvider` algorithm (not just Tailwind `.dark`).
- **Testing**: TDD convention; in-memory fake repositories for API tests;
  `createTestAuthDeps()`/`authCookieHeader()` for protected-route tests.
- **`apps/web/src/pages/AgentsPage.tsx` is a large monolith** containing much of the
  app shell, hubs, wizards, and admin swap — biggest refactoring debt.
- Windows dev: stop dev servers before `prisma generate`/`db push` (DLL file lock).
  Web preview serves a static build — rebuild + restart after web changes.
- **Known limitation**: YouTube auto-generated (ASR) captions are IP-blocked from
  datacenter IPs → some videos yield "no new content" (see PROJECT.md §5 and the
  `YOUTUBE_PROXY_URL` residential-proxy workaround in `docs/deployment-procedure.md`).

---

## 6. Improvement proposals (UX / layout / onboarding / empty states)

### Onboarding & first-run experience
- Signup creates no resources by default. New users land in the Feed (default landing) where they see recent reports; the Library remains the discovery surface presenting curated starter picks and sample reports.
- Library behavior: presents curated Starter Picks cards and Sample Report previews, with explicit per-source membership controls. Each starter card exposes an "Add to library" action to record explicit membership; adding a source does not auto-create agents or playbooks.
- Agent creation flow: when saving an agent/curator from the Library or Wizard, selecting an AI persona is required and the save step validates a chosen persona. Persona selection cannot be skipped.
- Removed ephemeral first-run onboarding state: the prior auto-guided account bootstrap is replaced by the Feed-first discovery surface and a manual/explicit setup path. Demo/sample seed remains available as an admin action (`POST /api/admin/seed-demo`) but is not executed on signup.
- All new Library UI strings and controls are i18n-ready (en/de).

### Layout & information architecture
5. **Real routing** ✅ Done: react-router-dom v7 — BrowserRouter + routes (`/`, `/library`, `/agents`, `/playbooks`, `/studio`, `*`→redirect). `AgentsPage` accepts `hub` prop; `setActiveHub()` calls `navigate()`. nginx already supports SPA routing.
6. **Split `AgentsPage.tsx`** ✅ Done: extracted `AppDataContext` providing agents/sources/playbooks/marketplace data + refresh functions to all children. `App.tsx` wraps with `AppDataProvider` inside `AuthGate`. AgentsPage now pulls data from context; old inline load useEffects and duplicate refresh functions removed. Build clean.
7. **Dashboard = outcomes, not config** ✅ Done: added "Feed" tab (default landing, key `feed`) showing latest reports across all playbooks in a card list with the report's key takeaways/entities, character/playbook name, date. Clicking a card navigates to that report in the playbooks hub. Empty state with CTA to Library.
8. **Unify "Summarize" and Playbook wizards** ✅ Done: added "Advanced settings" expandable section in follow-source wizard step 1 (schedule + recipients). When collapsed, sane defaults are used automatically.

### UX polish
9. **Push-based live updates** ✅ Done: replaced client-side polling with SSE (`GET /api/agents/:agentId/stream`). Server streams `runs` + `reports` events at 2s cadence during active runs, 20s when idle. Frontend `useAgentStream` hook uses native `EventSource` (auto-reconnects).
10. **Notifications center** ✅ Done: in-app bell (`BellOutlined`) in header with `Badge` count; accumulates failed runs via SSE updates; "Clear all" persists dismissed IDs to `localStorage`; fully i18n (en+de).
11. **Error-state empathy** ✅ Done: YouTube `youtube_videos` source cards show an amber ⚠️ note explaining transcript limitations inline.
12. **Mobile pass on the hub layout** ✅ Done: responsive header/content padding (`clamp`), modal widths (`min(Npx, 95vw)`), flex-wrap header actions, global CSS for modal max-width + body scroll + tab overflow on small screens.

## 7. Implementation focus proposals (features / flows)

### General (character-agnostic)
1. **Cross-report entity aggregation**: "What do all my agents say about <entity/topic>?"
   — an entity-centric view merging a topic's mentions across agents/playbooks with
   consensus and disagreement highlighting (generalizes the older symbol-centric idea to
   any extracted entity).
2. **Digest emails** ✅ Done: daily/weekly rollup across playbooks instead of one email
   per run (per-playbook `digestFrequency`).
3. **Report Q&A / chat** ✅ Done: "Ask the agent" follow-up chat grounded in the report's
   evidence (transcripts persisted as artifacts).
4. **Cost guardrails** ✅ Done: per-user monthly token/cost budget with usage dashboard
   and enforcement before the Claude call.
5. **Fix/route around the YouTube ASR block** (top known issue): residential proxy
   (`YOUTUBE_PROXY_URL`) or third-party transcript API behind a feature flag; fall back
   gracefully with clear user messaging.
6. **Postgres migration path**: SQLite in a container volume is fine for a trusted
   team but caps marketplace/multi-tenant ambitions; the deploy README sketches the
   upgrade.

### Finance-character-specific (only when the `finance_expert` character is in use)
7. **Signal performance tracking (closing the loop)**: record price at signal time and
   evaluate signals after N days/weeks → per-agent hit-rate and P&L-if-followed. Turns
   finance reports into an accountable track record and a ranking signal for marketplace
   playbooks.
8. **Watchlists / symbol subscriptions** ✅ Done: notify only when a followed symbol
   appears in any new report (finance-only, backed by the `WatchlistEntry` table).

### Later / nice-to-have
9. Additional source types: X/Twitter lists, newsletters (IMAP), SEC filings, earnings-call transcripts.
10. Additional AI providers (OpenAI/Gemini) behind the existing DI-able client seam; model picker per character.
11. Public read-only report share links (marketing loop for the marketplace).
12. Backtesting characters against historical episodes of a source before scheduling.
13. More built-in character types beyond the current six.

---

## 8. Agent Discussions & Studio Hub

> Full spec: `docs/superpowers/specs/2026-07-16-agent-discussions-design.md`

A **Studio hub** (5th nav tab, `/studio`) where two or more AI Agents discuss their
reports and source material. Each discussion run produces a text transcript and an
optional audio podcast (OpenAI TTS, distinct voice per agent). The discussion output
becomes a **synthetic Source** in the Library — fully re-analyzable by other agents,
enabling a recursive knowledge network.

**Key design decisions:**
- `Discussion` is a first-class domain entity (not a Playbook subtype)
- Formats: free_form / structured / hosted / hybrid — user-configurable
- Triggers: manual, auto-suggested (when 2 agents share a source), or scheduled
- Synthetic source type `synthetic_discussion` — each run appends a SourceItem (episode)
- Fully recursive: agents can analyze synthetic sources, then discuss those analyses
- TTS via OpenAI (`tts-1`), voice assigned per participant
- Auto-suggestion notifications when agents share analyzed sources
- Scheduler reuses existing Playbook cron infrastructure

### 8.1 Studio Evidence & Discussion Agenda

Extends the base Studio/Discussion feature above so runs are grounded in real,
per-participant evidence rather than a fixed "last 3 reports" heuristic:

- **Per-participant report selection**: users can pick specific report IDs for each
  participant/agent independently when creating a discussion. A participant left
  without a selection automatically falls back to that agent's latest reports, up to
  a configurable limit (`config.discussion.latestReportLimit`, env
  `DISCUSSION_LATEST_REPORT_LIMIT`, default 3). Mixed explicit/fallback selection
  across participants in the same discussion is supported.
- **Automatic bounded transcript evidence**: resolved reports' raw source-material
  excerpts are always included in the director/turn prompts (no user opt-in),
  bounded per report so prompts stay a predictable size. Missing raw material for a
  report is a warning, not a run failure.
- **Shared agenda**: an optional "Questions or topics" agenda continues to flow
  through the existing `Discussion.description` field (no schema change needed).
- **Run evidence snapshots**: each run freezes its resolved report IDs, source item
  IDs, explicit/fallback origin per participant, the agenda, and any transcript
  warnings, so older runs remain readable even if reports change or the fallback
  limit is later reconfigured. Legacy runs created before this existed simply have a
  `null` snapshot.
- **Validation**: if a participant resolves to zero reports (no explicit selection
  and no reports available), the run is rejected with a clear validation error
  before any turns are generated — both as an early API-level check
  (`POST /api/discussions/:id/runs` → 422 `no_report_resolved`) and defensively
  inside the orchestrator itself.
- **Frontend**: the New Discussion wizard's "Material" step lets users pick reports
  per participant and enter the shared agenda; the discussion run detail view has an
  "Evidence" tab showing the resolved reports/origin/source items/warnings per run.

---

*When priorities from §6/§7/§8 are picked up, move them into
`docs/implementation/PROJECT.md` as requirements and track progress there.

---

Foundation: the following shared-catalog foundation behaviors are implemented and verified in code (library/agent-selection UI not included):

- Canonical shared Sources with user membership controls (sources are first-class, shareable entities; memberships grant read/edit per-source).
- Immutable AgentPromptVersion snapshots persisted for every saved prompt edit (historical prompt versions are stored and not rewritten).
- Manual Playbooks (user-created schedules connecting Agents and Sources) are pinned to AgentPromptVersion snapshots so runs reference the exact prompt version used.
- Curated catalog metadata and frozen demo seed payloads are stored for reproducible demos where applicable.
- Phosphor-first vendored icon set included and used for primary iconography (icons vendored into the repo rather than fetched at runtime).
- Validate/preview/import tooling exists as repo scripts; the API exposes a read-only catalog listing endpoint at `GET /api/catalog` (see `apps/api/src/modules/catalog/routes.ts`).

See `docs/implementation/PROJECT.md` for the ledger entry and tooling notes. (This section intentionally avoids naming uncommitted migration files or non-existent admin endpoints.)*

---

## Seeded Library + Source-aware Agent Selection (2026-07-24)

- Library now leads with the ghost add-source card, then curated starter picks and sample reports, so new users do not land on an empty experience.
- Source-agent connection is explicit and manual by default: using an agent from selection creates/reuses a **manual** playbook pinned to the selected immutable `AgentPromptVersion` (no automatic recurrence is enabled).
- Agent selection uses compact source-aware cards with deterministic ranking, dedupe between curated and owned matches, and paged **Best matches** reveal.
- Curate-your-own is AI-first in this flow; manual create entry points were removed from the source-follow selection surface.
- Variant curation is supported from curated/public versions via `baseAgentVersionId`, producing an independent private version with `basedOnAgentVersionId` provenance.
- Saved agent versions can be updated only through an explicit opt-in action (`POST /api/catalog/agent-versions/:agentVersionId/update`), with optional manual-playbook repinning.
