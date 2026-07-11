# Scope and Decisions (Design + Planning Baseline)

> ⚠️ **Superseded.** This described the original bot-definition-and-scheduling
> slice (Postgres, shadcn/ui). For current requirements and live progress on the
> AI-agent redesign (SQLite, Ant Design, Anthropic Claude), see
> `docs/implementation/PROJECT.md`.

Last updated: 2026-07-10

## Product Slice in Scope

This implementation covers only the first sub-project of the larger platform:
- **Bot definition and scheduling**

Included:
- Mobile-first admin UI for bot setup
- Admin-only backend APIs
- Source configuration for:
  - `web_urls`
  - `podcast_feeds`
- Preferences configuration
- Recipient email configuration
- Schedule configuration:
  - interval mode
  - daily-time-with-timezone mode
- Reliable run enqueue + claim + status tracking

Explicitly excluded:
- Buy/sell model internals
- Full report-content generation logic
- Public multi-tenant SaaS design

## Audience and Access

- Target audience: **small trusted team**
- Access model: **single organization, admin-only bot management**

## Hard Limits and Rules

- Max bots per user: **20**
- Max sources per bot: **50**
- Minimum crawl interval: **60 minutes**
- Run idempotency key: **`(bot_id, scheduled_for)`**
- Bot lifecycle: **disable instead of hard delete**

## Architecture Decisions

- Single backend service for v1 (no separate worker deployment)
- Scheduler loop and worker execution run inside backend process
- PostgreSQL persistence with clear module boundaries for later extraction

Backend module boundaries:
- Bot Management
- Source Management
- Schedule Engine
- Run Queue / Orchestration
- Notification configuration metadata

## Tech Stack Decisions

- **Backend:** Node.js + TypeScript + Fastify + Prisma + PostgreSQL
- **Frontend:** React + Vite + TypeScript
- **Frontend component system:** shadcn/ui (Radix UI + Tailwind CSS)
- **Testing:** Vitest + Playwright

## Quality and Delivery Decisions

- Implementation follows TDD cycle task-by-task
- Keep code rooted at **`G:\brk`**
- Track implementation progress in `docs/implementation/*`

## Planned Task Sequence

1. Bot domain + persistence
2. Schedule engine
3. Run queue
4. Admin API routes
5. Mobile frontend with shadcn/ui
6. Scheduler wiring + acceptance checks
