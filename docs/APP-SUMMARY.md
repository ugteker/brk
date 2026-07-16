# ChatTrader — App Summary (for humans & AI agents)

> Read this first to understand what the app is, its USP, architecture, and where to
> find details. Living requirements/progress ledger: `docs/implementation/PROJECT.md`.

Last updated: 2026-07-16

---

## 1. What is ChatTrader?

ChatTrader turns **spoken/written financial content** (YouTube videos, podcasts, blogs,
web pages) into **structured, emailed stock-signal reports** using AI analysts
(Anthropic Claude, Sonnet).

A user says: *"Summarize this podcast/YouTube channel with this analyst persona every
Monday at 8:00 and email me the result."* — ChatTrader crawls new episodes, fetches
full transcripts, runs them through a Claude system prompt, and produces a report with:

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
1. **Guided first-report wizard ("time-to-first-report")**: a single end-to-end flow on
   first login — paste a YouTube/podcast URL → auto-probe → pick persona → "Run now" —
   producing a real report in <2 minutes. Today the user must understand 3 hubs first.
2. **Demo/sample content for empty accounts**: pre-seeded example source + read-only
   sample report so new users see the *output value* (signal badges, chart, confidence)
   before configuring anything. "Try with this example" CTA on every empty state.
3. **Progress checklist upgrade**: the existing "Getting started" card should track
   real completion state (source added ✓, agent created ✓, playbook scheduled ✓,
   first report ✓) rather than being a static dismissible card.
4. **Marketplace as onboarding**: surface popular public playbooks on the empty
   dashboard — "Follow this playbook" is the fastest possible activation path.

### Layout & information architecture
5. **Real routing**: replace state-swapped views with URL routes (react-router) —
   deep links currently need query-param hacks; back button and refresh don't preserve
   context. This also unlocks shareable report/symbol URLs.
6. **Split `AgentsPage.tsx`**: extract hubs, wizards, admin, and symbol page into
   separate route-level components. Required before any larger UX work is safe.
7. **Dashboard = outcomes, not config**: make the landing view a *reports feed*
   (latest signals across all playbooks, portfolio-style symbol overview) instead of
   entity lists. Users come back for signals, not settings.
8. **Unify "Summarize" and Playbook wizards**: two overlapping creation flows exist;
   keep the lightweight Summarize dialog as the primary path and make the full wizard
   an "advanced" mode.

### UX polish
9. **Push-based live updates**: replace 4s polling with SSE/WebSocket for run phases
   and new reports (cheaper + snappier).
10. **Notifications center**: in-app bell with run failures/successes — email is
    currently the only channel; failed runs are easy to miss.
11. **Error-state empathy**: when a YouTube source hits the ASR-caption block, tell
    the user *in the source card* ("transcripts unavailable for this channel from our
    server — show notes only") instead of silent "no new content" runs.
12. **Mobile pass on the 3-hub layout**: original app was mobile-first; the hub grid
    and inline charts need a dedicated small-screen audit.

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

*When priorities from §6/§7 are picked up, move them into
`docs/implementation/PROJECT.md` as requirements and track progress there.*
