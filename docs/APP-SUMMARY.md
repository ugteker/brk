# ChatTrader — App Summary (for humans & AI agents)

> Read this first to understand what the app is, its USP, architecture, and where to
> find details. Living requirements/progress ledger: `docs/implementation/PROJECT.md`.

Last updated: 2026-07-16

---

> ⚠️ **Platform scope note (2026-07-16):** Trading/stocks is the *initial* use case —
> the platform is intentionally designed to be **source-type agnostic**. It will open to
> ALL types of content sources and domains (news, research, HR, legal, product intel,
> etc.). Avoid hardcoding trading-specific language in UI, copy, or data models.

---

## 1. What is ChatTrader?

ChatTrader turns **spoken/written content** (YouTube videos, podcasts, blogs, web pages,
documents) into **structured, AI-analysed signal reports** delivered by email.

The platform started with financial content / stock signals, but is designed to work for
**any domain**: news monitoring, competitive intelligence, product research, and more.

A user says: *"Summarise this podcast/YouTube channel with this analyst persona every
Monday at 8:00 and email me the result."* — ChatTrader crawls new episodes, fetches
full transcripts, runs them through a Claude system prompt, and produces a structured
report emailed to the user.

For the initial finance use case this means:

- **Long/short signal per stock symbol** with confidence, rationale, and source
  citations/timecodes
- A headline/summary, per-symbol badges, confidence gauge
- Inline TradingView price charts + per-symbol signal history
- Automatic email notification (bilingual EN/DE, deep links back into the app)

**Informational only** — no trade execution, no brokerage integration, no live
market-data platform.

## 2. USP (why this and not X?)

1. **Transcript-first ingestion**: full spoken transcripts from YouTube (InnerTube
   Android-client API) and podcasts — not just show notes — so signals reflect what
   was actually *said*.
2. **Smart, cost-aware crawling**: seen-item cursors for feeds; one-time AI "site
   inspection" for non-feed pages with self-healing re-inspection; per-source
   `maxItems` caps. Content is never reprocessed.
3. **Composable 3-hub model** (see §4): Sources, Agents (personas), Playbooks are
   independent, reusable building blocks — one analyst can watch many sources, one
   source can feed many analysts.
4. **Persona library**: 7 ready-made trading characters (conservative → aggressive,
   contrarian, quant, short-seller, macro) with editable versioned system prompts.
5. **Transparency**: per-report AI stats (model, tokens, est. cost), run history with
   live phase indicators (crawling → analyzing → notifying), crawled-evidence
   previews/downloads, real failure reasons.
6. **Marketplace & sharing**: sources/agents/playbooks can be published publicly and
   cloned/"followed" by other users; per-agent access grants (read/edit/delete).

## 3. Tech stack

| Layer | Tech |
|---|---|
| API | Node.js + TypeScript, Fastify 4, Prisma 6, SQLite (dev + prod volume) |
| AI | `@anthropic-ai/sdk` (Claude Sonnet), DI-able client, fenced-JSON tolerant parsing |
| Web | React 18 + Vite, **Ant Design 6** (+ a few legacy shadcn primitives), Tailwind, i18next (en/de) |
| Auth | JWT in httpOnly cookie; email+password w/ 2-step confirmation, Google OAuth, password reset, admin user management (`ADMIN_EMAIL`) |
| Email | nodemailer SMTP, bilingual templates |
| Tests | Vitest (API ~210+, Web ~72+), Playwright e2e |
| Deploy | Single all-in-one Docker container (API + nginx SPA + cloudflared) on Hetzner, GitHub Actions deploy over SSH |

Monorepo: `apps/api` + `apps/web` (npm scripts proxied from root `package.json`).
Web dev proxies `/api` → API `:3000`; web served on `:4173`.

## 4. Domain model (3-hub architecture)

- **Source** (`Source`, shared library): YouTube video/channel/playlist, podcast RSS,
  or web URL. Has probe ("Test source" with preview items), crawl config, `maxItems`.
- **Agent** (analyst persona): name, character/system prompt (versioned
  `AgentPromptVersion`), language. Owns identity only — *not* schedule or sources.
- **Playbook**: connects Agent + Sources (`PlaybookSource`) + schedule
  (interval/daily/weekly) + recipients + notification toggle. Owns **Runs**
  (`AgentRun` with phases, retries, artifacts) and **Reports** (`AgentRunReport` +
  `AgentSignal`, AI usage stats).
- **Marketplace**: `MarketplacePublication` for sources/agents/playbooks;
  clone/follow flows.
- **Access**: `AgentAccessGrant` (read/edit/delete, optional expiry).
- **User**: email/password and/or Google; roles; admin gated by `ADMIN_EMAIL`.

Primary user flow ("Summarize" / listen flow): pick source → choose agent (or create
inline) → set schedule → reports arrive by email and in the Playbooks hub.

## 5. Key implementation notes for agents working here

- **Single source of truth**: requirements + task ledger in
  `docs/implementation/PROJECT.md` — update it after every completed task.
- **i18n**: every UI string goes into BOTH `apps/web/src/i18n/locales/en.json` and
  `de.json`. Never hardcode display text.
- **UI**: Ant Design components; icon buttons over text buttons; dark theme must work
  via antd `ConfigProvider` algorithm (not just Tailwind `.dark`).
- **Testing**: TDD convention; in-memory fake repositories for API tests;
  `createTestAuthDeps()`/`authCookieHeader()` for protected-route tests.
- **`apps/web/src/pages/AgentsPage.tsx` is a ~200 KB monolith** containing most of the
  app shell, hubs, wizards, and admin swap — biggest refactoring debt.
- Windows dev: stop dev servers before `prisma generate`/`db push` (DLL file lock).
  Web preview serves a static build — rebuild + restart after web changes.
- **Known limitation**: YouTube auto-generated (ASR) captions are IP-blocked from
  datacenter IPs → some videos yield "no new content" (see PROJECT.md §5).

---

## 6. Improvement proposals (UX / layout / onboarding / empty states)

### Onboarding & first-run experience
1. **Guided first-report wizard** ✅ Done: end-to-end flow on first login — paste URL → auto-probe → pick persona → "Run now". Skip button dismisses to localStorage. Fully i18n (en+de).
2. **Demo/sample content for empty accounts** ✅ Done: `POST /api/admin/seed-demo` creates pre-seeded source + agent + playbook + completed run + report (5 signals). Admin "Seed demo data" button in the menu. Idempotent (409 if already seeded).
3. **Progress checklist upgrade** ✅ Done: 4-step checklist (source added, agent created, playbook scheduled, first report received) — live-checked from real data, auto-dismisses when all done, admin "Preview onboarding" toggle, load-state gating eliminates login flicker.
4. **Marketplace as onboarding** ✅ Done: empty Playbooks hub shows up to 3 marketplace playbooks with Follow button; sky-blue "Source Marketplace" banner; 🧭 empty states in marketplace modal.

### Layout & information architecture
5. **Real routing** ✅ Done: react-router-dom v7 — BrowserRouter + 5 routes (`/`, `/library`, `/agents`, `/playbooks`, `*`→redirect). `AgentsPage` accepts `hub` prop; `setActiveHub()` calls `navigate()`. nginx already supports SPA routing.
6. **Split `AgentsPage.tsx`** ✅ Done: extracted `AppDataContext` providing agents/sources/playbooks/marketplace data + refresh functions to all children. `App.tsx` wraps with `AppDataProvider` inside `AuthGate`. AgentsPage now pulls data from context; old inline load useEffects and duplicate refresh functions removed. Build clean.
7. **Dashboard = outcomes, not config** ✅ Done: added "Feed" tab (default landing, key `feed`) showing latest reports across all playbooks in a card list with signal counts, symbol tags, agent/playbook name, date. Clicking a card navigates to that report in the playbooks hub. Empty state with CTA to Library. Feed tab visible to all users; Sources renamed to "Library" in tab.
8. **Unify "Summarize" and Playbook wizards** ✅ Done: added "Advanced settings" expandable section in follow-source wizard step 1 (schedule + recipients). When collapsed, sane defaults are used automatically.

### UX polish
9. **Push-based live updates** ✅ Done: replaced 4s client-side `setInterval` polling with SSE (`GET /api/agents/:agentId/stream`). Server streams `runs` + `reports` events at 2s cadence during active runs, 20s when idle. Frontend `useAgentStream` hook uses native `EventSource` (auto-reconnects). `AgentsPage.tsx` `pollIntervalRef` removed; bell notification accumulation moved to a `useEffect` watching `runs`.
10. **Notifications center** ✅ Done: in-app bell (`BellOutlined`) in header with `Badge` count; accumulates failed runs via SSE updates; "Clear all" persists dismissed IDs to `localStorage`; fully i18n (en+de).
11. **Error-state empathy** ✅ Done: YouTube `youtube_videos` source cards show an amber ⚠️ note explaining transcript limitations inline.
12. **Mobile pass on the 3-hub layout** ✅ Done: responsive header padding (`clamp`), content padding (`clamp`), modal widths (`min(Npx, 95vw)`), `ct-header-actions` flex-wrap, global CSS for `.ant-modal` max-width + body scroll + tab overflow on `@media (max-width: 767px)`.

## 7. Implementation focus proposals (features / flows)

### Highest leverage
1. **Signal performance tracking (closing the loop)**: record price at signal time and
   evaluate signals after N days/weeks → per-agent/persona hit-rate and P&L-if-followed.
   This turns reports into an accountable track record — the killer feature for trust
   and for ranking marketplace playbooks ("this analyst is 62% accurate on 90-day longs").
2. **Fix/route around the YouTube ASR block** (top known issue): residential proxy or
   third-party transcript API behind a feature flag; fall back gracefully with clear
   user messaging. Without it, the flagship YouTube use case silently degrades.
3. **Cross-report symbol aggregation**: "What do all my analysts think about NVDA?" —
   a symbol-centric view merging signals across agents/playbooks with consensus and
   disagreement highlighting.

### Strong candidates
4. **Digest emails**: daily/weekly rollup across playbooks instead of one email per
   run (notification cadence was removed as inert — reintroduce it for real).
5. **Report Q&A / chat**: "Ask the analyst" follow-up chat grounded in the report's
   evidence (transcripts already persisted as artifacts) — fits the "ChatTrader" name.
6. **Watchlists / symbol subscriptions**: notify only when a followed symbol appears
   in any new report.
7. **Cost guardrails**: per-user monthly token/cost budget with usage dashboard
   (pricing table + per-report stats already exist; add enforcement).
8. **Postgres migration path**: SQLite in a container volume is fine for a trusted
   team but caps marketplace/multi-tenant ambitions; the deploy README already sketches
   the upgrade.

### Later / nice-to-have
9. Additional source types: X/Twitter lists, newsletters (IMAP), SEC filings, earnings-call transcripts.
10. Additional AI providers (OpenAI/Gemini) behind the existing DI-able client seam; model picker per persona.
11. Public read-only report share links (marketing loop for the marketplace).
12. Backtesting personas against historical episodes of a source before scheduling.

---

## 8. Agent Discussions & Studio Hub (designed, pending implementation)

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

---

*When priorities from §6/§7/§8 are picked up, move them into
`docs/implementation/PROJECT.md` as requirements and track progress there.*
