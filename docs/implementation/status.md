# Bot Platform Implementation Status

> ⚠️ **Superseded.** This file describes the original bot-definition-and-scheduling
> slice only. For current requirements and live progress on the AI-agent redesign,
> see `docs/implementation/PROJECT.md`.

Last updated: 2026-07-10

## Scope

Current implementation scope is the first sub-project:
- Bot definition
- Scheduling foundations
- Admin API/Frontend scaffolding

## Completed

1. **Project root correction**
   - Code now lives under `G:\brk` (not `G:\brk\github-copilot-resources`).

2. **API workspace created**
   - `G:\brk\apps\api\package.json`
   - `G:\brk\apps\api\tsconfig.json`
   - `G:\brk\apps\api\prisma\schema.prisma`

3. **Bot module (Task 1)**
   - `src/modules/bots/types.ts`
   - `src/modules/bots/validation.ts`
   - `src/modules/bots/repository.ts`
   - Tests:
     - `src/modules/bots/validation.test.ts`
     - `src/modules/bots/repository.test.ts`

4. **Validation and tests**
   - Bot module tests are passing in `G:\brk\apps\api`.

## Completed Since Last Update

5. **Task 2 — Schedule engine**
   - `src/modules/schedules/compute-next-run.ts`
   - `src/modules/schedules/compute-next-run.test.ts`

6. **Task 3 — Run queue**
   - `src/modules/runs/run-queue.service.ts`
   - `src/modules/runs/run-queue.service.test.ts`
   - `src/modules/runs/worker.ts`

7. **Task 4 — Admin API routes**
   - `src/modules/bots/routes.ts`
   - `src/modules/bots/routes.test.ts`
   - `src/server.ts`

8. **Task 5 — Mobile frontend with shadcn-style component primitives**
   - `apps/web/src/components/BotForm.tsx`
   - `apps/web/src/components/BotStatusCard.tsx`
   - `apps/web/src/pages/BotsPage.tsx`
   - `apps/web/src/components/ui/*`
   - `apps/web/src/components/BotForm.test.tsx`
   - `apps/web/e2e/bot-setup.spec.ts`

9. **Task 6 — Scheduler wiring**
   - `src/modules/schedules/scheduler-loop.ts`
   - `src/modules/schedules/scheduler-loop.test.ts`
   - `src/main.ts`

10. **Build and start**
   - API build passes with `npm --prefix G:\\brk\\apps\\api run build`
   - Web build passes with `npm --prefix G:\\brk\\apps\\web run build`
   - API server is running on `http://127.0.0.1:3000`
   - Web preview is running on `http://127.0.0.1:4173`

11. **ChatTrader UX/UI overhaul**
   - App naming updated to **ChatTrader**
   - Default start view is now **Bot Dashboard**
   - Full-featured **7-step wizard-stepper** implemented for bot configuration
   - Added shadcn-style components for new controls:
    - `apps/web/src/components/ui/textarea.tsx`
    - `apps/web/src/components/ui/switch.tsx`
   - Upgraded:
    - `apps/web/src/components/BotForm.tsx`
    - `apps/web/src/pages/BotsPage.tsx`
    - `apps/web/src/components/BotForm.test.tsx`
    - `apps/web/e2e/bot-setup.spec.ts`
    - `apps/web/index.html` title

## Remaining

- No pending implementation tasks in current plan.

## Decisions Locked

- Backend: TypeScript + Fastify + Prisma + PostgreSQL
- Frontend: React + Vite + shadcn/ui (Radix + Tailwind)
- Testing: Vitest + Playwright
- Constraints:
  - source types: `web_urls`, `podcast_feeds`
  - max 20 bots/user
  - max 50 sources/bot
  - min interval 60 minutes
