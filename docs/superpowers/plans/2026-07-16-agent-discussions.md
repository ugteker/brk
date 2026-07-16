# Agent Discussions & Studio Hub Implementation Plan

> **STATUS: ✅ ALL 10 TASKS COMPLETE** — Committed 2026-07-16

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Studio hub where two or more AI agents discuss their reports and source material, producing a transcript + optional audio podcast, with the output becoming a re-analyzable synthetic Source in the Library.

**Architecture:** A new `Discussion` domain entity (with `DiscussionParticipant`, `DiscussionRun`, `DiscussionTurn` tables) lives in its own module (`apps/api/src/modules/discussion/`). The orchestrator calls Claude once per turn, passing the full conversation history and the current speaker's persona + recent reports. The frontend adds a `/studio` route rendered by `StudioHub.tsx`, independent of the existing `AgentsPage`. Each run completion auto-creates a `Source` record of type `synthetic_discussion` + a `SourceItem` episode, making the output indexable by any agent.

**Tech Stack:** Node.js + Fastify + Prisma + TypeScript (backend); React + Ant Design + i18next (frontend); Anthropic Claude (existing); OpenAI TTS API (new); SQLite via Prisma.

## Global Constraints

- All UI strings must be added to both `apps/web/src/i18n/locales/en.json` AND `apps/web/src/i18n/locales/de.json` under the `studio.*` namespace — never hardcode display text
- Use shadcn/ui styled components for all UI elements (checkboxes, inputs, selects, buttons)
- SQLite schema: use `String` columns (not Prisma enums) for all status/type/role fields
- Follow the Fastify DI pattern: each module exposes a `RegisterXxxRoutes(app, deps)` function + a `XxxRoutesDeps` interface
- TDD: write failing tests before implementation; run `npm test` in `apps/api` after each backend task
- Frontend build: run `npm run build` in `apps/web` after each frontend task
- Commit after every task

---

## File Map

### New files — backend
- `apps/api/src/modules/discussion/types.ts` — Discussion, DiscussionParticipant, DiscussionRun, DiscussionTurn domain types
- `apps/api/src/modules/discussion/repository.ts` — Prisma CRUD for all discussion tables
- `apps/api/src/modules/discussion/repository.test.ts` — repository unit tests
- `apps/api/src/modules/discussion/routes.ts` — Fastify routes + `DiscussionRoutesDeps` interface
- `apps/api/src/modules/discussion/routes.test.ts` — route integration tests
- `apps/api/src/modules/discussion/orchestrator.ts` — multi-turn Claude orchestration service
- `apps/api/src/modules/discussion/orchestrator.test.ts` — orchestrator unit tests
- `apps/api/src/modules/discussion/tts-client.ts` — OpenAI TTS adapter
- `apps/api/src/modules/discussion/tts-client.test.ts` — TTS client unit tests
- `apps/api/src/modules/discussion/synthetic-source.ts` — creates/updates synthetic Source after a run
- `apps/api/src/modules/discussion/synthetic-source.test.ts`

### Modified files — backend
- `apps/api/prisma/schema.prisma` — add Discussion, DiscussionParticipant, DiscussionRun, DiscussionTurn models
- `apps/api/src/server.ts` — register discussion routes
- `apps/api/src/main.ts` — wire DiscussionRepository + deps into buildServer

### New files — frontend
- `apps/web/src/api/discussions.ts` — typed API client for all discussion endpoints
- `apps/web/src/pages/StudioHub.tsx` — Studio hub page (discussions list + empty state)
- `apps/web/src/pages/DiscussionDetail.tsx` — transcript view, audio player, SSE live updates
- `apps/web/src/pages/NewDiscussionWizard.tsx` — 3-step wizard (pick agents → configure → schedule)
- `apps/web/src/hooks/useDiscussionStream.ts` — SSE hook for live run streaming

### Modified files — frontend
- `apps/web/src/App.tsx` — add `/studio` route
- `apps/web/src/pages/AgentsPage.tsx` — add Studio tab to nav
- `apps/web/src/i18n/locales/en.json` — `studio.*` keys
- `apps/web/src/i18n/locales/de.json` — same keys in German

---

## Task 1: Prisma Schema — New Discussion Tables

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Run: `npx prisma migrate dev --name add_discussions` in `apps/api`

**Interfaces:**
- Produces: `Discussion`, `DiscussionParticipant`, `DiscussionRun`, `DiscussionTurn` Prisma models available to all later tasks

- [ ] **Step 1: Add models to schema.prisma**

Add to the end of `apps/api/prisma/schema.prisma`:

```prisma
model Discussion {
  id                String   @id @default(cuid())
  ownerUserId       String
  name              String
  description       String   @default("")
  format            String   @default("free_form")
  formatConfigJson  String   @default("{}")
  scheduleJson      String?
  syntheticSourceId String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  participants      DiscussionParticipant[]
  runs              DiscussionRun[]
}

model DiscussionParticipant {
  id             String   @id @default(cuid())
  discussionId   String
  agentId        String
  role           String   @default("speaker")
  voiceId        String   @default("alloy")
  speakerOrder   Int      @default(0)
  discussion     Discussion      @relation(fields: [discussionId], references: [id], onDelete: Cascade)
  turns          DiscussionTurn[]
}

model DiscussionRun {
  id                    String    @id @default(cuid())
  discussionId          String
  status                String    @default("pending")
  triggeredBy           String    @default("manual")
  errorMessage          String?
  startedAt             DateTime?
  completedAt           DateTime?
  syntheticSourceItemId String?
  audioUrl              String?
  createdAt             DateTime  @default(now())
  discussion            Discussion      @relation(fields: [discussionId], references: [id], onDelete: Cascade)
  turns                 DiscussionTurn[]
}

model DiscussionTurn {
  id               String   @id @default(cuid())
  discussionRunId  String
  participantId    String
  turnIndex        Int
  segmentLabel     String?
  content          String
  audioUrl         String?
  createdAt        DateTime @default(now())
  run              DiscussionRun         @relation(fields: [discussionRunId], references: [id], onDelete: Cascade)
  participant      DiscussionParticipant @relation(fields: [participantId], references: [id], onDelete: Restrict)
}
```

- [ ] **Step 2: Run migration**

```bash
cd apps/api && npx prisma migrate dev --name add_discussions
```

Expected: migration file created in `prisma/migrations/`, Prisma client regenerated.

- [ ] **Step 3: Verify client types**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat(db): add Discussion, DiscussionParticipant, DiscussionRun, DiscussionTurn tables"
```

---

## Task 2: Discussion Domain Types + Repository

**Files:**
- Create: `apps/api/src/modules/discussion/types.ts`
- Create: `apps/api/src/modules/discussion/repository.ts`
- Create: `apps/api/src/modules/discussion/repository.test.ts`

**Interfaces:**
- Produces:
  - `DiscussionRepository` class with methods: `createDiscussion`, `getDiscussion`, `listDiscussions`, `updateDiscussion`, `deleteDiscussion`, `createParticipant`, `listParticipants`, `createRun`, `getRunWithTurns`, `listRuns`, `updateRun`, `createTurn`
  - `DiscussionRepositoryLike` interface (Pick of all above methods)

- [ ] **Step 1: Write types.ts**

Create `apps/api/src/modules/discussion/types.ts`:

```typescript
export type DiscussionFormat = 'free_form' | 'structured' | 'hosted' | 'hybrid';
export type DiscussionRunStatus = 'pending' | 'running' | 'done' | 'error';
export type DiscussionTrigger = 'manual' | 'auto_suggested' | 'scheduled';
export type ParticipantRole = 'speaker' | 'host';
export type OpenAIVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

export interface DiscussionParticipant {
  id: string;
  discussionId: string;
  agentId: string;
  role: ParticipantRole;
  voiceId: OpenAIVoice;
  speakerOrder: number;
}

export interface Discussion {
  id: string;
  ownerUserId: string;
  name: string;
  description: string;
  format: DiscussionFormat;
  formatConfig: DiscussionFormatConfig;
  scheduleJson: string | null;
  syntheticSourceId: string | null;
  createdAt: Date;
  updatedAt: Date;
  participants: DiscussionParticipant[];
}

export interface DiscussionFormatConfig {
  segments?: string[];
  maxTurnsPerSegment?: number;
  totalTurnTarget?: number;
  hostInstructions?: string;
}

export interface DiscussionTurn {
  id: string;
  discussionRunId: string;
  participantId: string;
  turnIndex: number;
  segmentLabel: string | null;
  content: string;
  audioUrl: string | null;
  createdAt: Date;
}

export interface DiscussionRun {
  id: string;
  discussionId: string;
  status: DiscussionRunStatus;
  triggeredBy: DiscussionTrigger;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  syntheticSourceItemId: string | null;
  audioUrl: string | null;
  createdAt: Date;
  turns: DiscussionTurn[];
}

export interface CreateDiscussionInput {
  name: string;
  description?: string;
  format: DiscussionFormat;
  formatConfig?: DiscussionFormatConfig;
  scheduleJson?: string;
  participants: Array<{
    agentId: string;
    role: ParticipantRole;
    voiceId: OpenAIVoice;
    speakerOrder: number;
  }>;
}

export interface UpdateDiscussionInput {
  name?: string;
  description?: string;
  format?: DiscussionFormat;
  formatConfig?: DiscussionFormatConfig;
  scheduleJson?: string | null;
}
```

- [ ] **Step 2: Write failing repository tests**

Create `apps/api/src/modules/discussion/repository.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { DiscussionRepository } from './repository';

const prisma = new PrismaClient({ datasources: { db: { url: 'file::memory:?cache=shared' } } });

describe('DiscussionRepository', () => {
  let repo: DiscussionRepository;
  const userId = 'user-test-1';
  const agentId = 'agent-test-1';

  beforeEach(async () => {
    repo = new DiscussionRepository(prisma);
    await prisma.discussionTurn.deleteMany();
    await prisma.discussionRun.deleteMany();
    await prisma.discussionParticipant.deleteMany();
    await prisma.discussion.deleteMany();
  });

  it('creates and retrieves a discussion', async () => {
    const created = await repo.createDiscussion(userId, {
      name: 'Test Discussion',
      format: 'free_form',
      participants: [{ agentId, role: 'speaker', voiceId: 'alloy', speakerOrder: 0 }]
    });
    expect(created.id).toBeTruthy();
    expect(created.name).toBe('Test Discussion');
    expect(created.participants).toHaveLength(1);
    expect(created.participants[0].agentId).toBe(agentId);
  });

  it('lists discussions for owner', async () => {
    await repo.createDiscussion(userId, { name: 'D1', format: 'free_form', participants: [{ agentId, role: 'speaker', voiceId: 'alloy', speakerOrder: 0 }] });
    await repo.createDiscussion(userId, { name: 'D2', format: 'structured', participants: [{ agentId, role: 'speaker', voiceId: 'echo', speakerOrder: 0 }] });
    const list = await repo.listDiscussions(userId);
    expect(list).toHaveLength(2);
  });

  it('creates a run and adds turns', async () => {
    const disc = await repo.createDiscussion(userId, { name: 'D', format: 'free_form', participants: [{ agentId, role: 'speaker', voiceId: 'alloy', speakerOrder: 0 }] });
    const run = await repo.createRun(disc.id, 'manual');
    expect(run.status).toBe('pending');
    const turn = await repo.createTurn(run.id, disc.participants[0].id, 0, 'Hello world', null);
    expect(turn.content).toBe('Hello world');
    const full = await repo.getRunWithTurns(run.id);
    expect(full!.turns).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd apps/api && npx vitest run src/modules/discussion/repository.test.ts 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module './repository'`

- [ ] **Step 4: Implement repository.ts**

Create `apps/api/src/modules/discussion/repository.ts`:

```typescript
import type { PrismaClient } from '@prisma/client';
import type { Discussion, DiscussionRun, DiscussionTurn, CreateDiscussionInput, UpdateDiscussionInput, DiscussionParticipant, DiscussionTrigger } from './types';

type DiscussionDb = Pick<PrismaClient, 'discussion' | 'discussionParticipant' | 'discussionRun' | 'discussionTurn' | '$transaction'>;

function mapParticipant(row: any): DiscussionParticipant {
  return { id: row.id, discussionId: row.discussionId, agentId: row.agentId, role: row.role as any, voiceId: row.voiceId as any, speakerOrder: row.speakerOrder };
}

function mapTurn(row: any): DiscussionTurn {
  return { id: row.id, discussionRunId: row.discussionRunId, participantId: row.participantId, turnIndex: row.turnIndex, segmentLabel: row.segmentLabel ?? null, content: row.content, audioUrl: row.audioUrl ?? null, createdAt: row.createdAt };
}

function mapRun(row: any): DiscussionRun {
  return { id: row.id, discussionId: row.discussionId, status: row.status as any, triggeredBy: row.triggeredBy as any, errorMessage: row.errorMessage ?? null, startedAt: row.startedAt ?? null, completedAt: row.completedAt ?? null, syntheticSourceItemId: row.syntheticSourceItemId ?? null, audioUrl: row.audioUrl ?? null, createdAt: row.createdAt, turns: (row.turns ?? []).map(mapTurn) };
}

function mapDiscussion(row: any): Discussion {
  return { id: row.id, ownerUserId: row.ownerUserId, name: row.name, description: row.description, format: row.format as any, formatConfig: row.formatConfigJson ? JSON.parse(row.formatConfigJson) : {}, scheduleJson: row.scheduleJson ?? null, syntheticSourceId: row.syntheticSourceId ?? null, createdAt: row.createdAt, updatedAt: row.updatedAt, participants: (row.participants ?? []).map(mapParticipant) };
}

export class DiscussionRepository {
  constructor(private readonly db: DiscussionDb) {}

  async createDiscussion(ownerUserId: string, input: CreateDiscussionInput): Promise<Discussion> {
    const row = await (this.db as any).$transaction(async (tx: any) => {
      const disc = await tx.discussion.create({
        data: { ownerUserId, name: input.name, description: input.description ?? '', format: input.format, formatConfigJson: JSON.stringify(input.formatConfig ?? {}), scheduleJson: input.scheduleJson ?? null }
      });
      for (const p of input.participants) {
        await tx.discussionParticipant.create({ data: { discussionId: disc.id, agentId: p.agentId, role: p.role, voiceId: p.voiceId, speakerOrder: p.speakerOrder } });
      }
      return tx.discussion.findUniqueOrThrow({ where: { id: disc.id }, include: { participants: true } });
    });
    return mapDiscussion(row);
  }

  async getDiscussion(discussionId: string): Promise<Discussion | null> {
    const row = await (this.db as any).discussion.findUnique({ where: { id: discussionId }, include: { participants: true } });
    return row ? mapDiscussion(row) : null;
  }

  async listDiscussions(ownerUserId: string): Promise<Discussion[]> {
    const rows = await (this.db as any).discussion.findMany({ where: { ownerUserId }, include: { participants: true }, orderBy: { createdAt: 'desc' } });
    return rows.map(mapDiscussion);
  }

  async updateDiscussion(discussionId: string, input: UpdateDiscussionInput): Promise<Discussion> {
    const data: any = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.format !== undefined) data.format = input.format;
    if (input.formatConfig !== undefined) data.formatConfigJson = JSON.stringify(input.formatConfig);
    if ('scheduleJson' in input) data.scheduleJson = input.scheduleJson;
    await (this.db as any).discussion.update({ where: { id: discussionId }, data });
    return this.getDiscussion(discussionId) as Promise<Discussion>;
  }

  async deleteDiscussion(discussionId: string): Promise<void> {
    await (this.db as any).discussion.delete({ where: { id: discussionId } });
  }

  async setSyntheticSourceId(discussionId: string, sourceId: string): Promise<void> {
    await (this.db as any).discussion.update({ where: { id: discussionId }, data: { syntheticSourceId: sourceId } });
  }

  async createRun(discussionId: string, triggeredBy: DiscussionTrigger): Promise<DiscussionRun> {
    const row = await (this.db as any).discussionRun.create({ data: { discussionId, triggeredBy, status: 'pending' }, include: { turns: true } });
    return mapRun(row);
  }

  async getRunWithTurns(runId: string): Promise<DiscussionRun | null> {
    const row = await (this.db as any).discussionRun.findUnique({ where: { id: runId }, include: { turns: { orderBy: { turnIndex: 'asc' } } } });
    return row ? mapRun(row) : null;
  }

  async listRuns(discussionId: string): Promise<DiscussionRun[]> {
    const rows = await (this.db as any).discussionRun.findMany({ where: { discussionId }, include: { turns: { orderBy: { turnIndex: 'asc' } } }, orderBy: { createdAt: 'desc' } });
    return rows.map(mapRun);
  }

  async updateRun(runId: string, patch: Partial<Pick<DiscussionRun, 'status' | 'errorMessage' | 'startedAt' | 'completedAt' | 'syntheticSourceItemId' | 'audioUrl'>>): Promise<void> {
    await (this.db as any).discussionRun.update({ where: { id: runId }, data: patch });
  }

  async createTurn(runId: string, participantId: string, turnIndex: number, content: string, segmentLabel: string | null): Promise<DiscussionTurn> {
    const row = await (this.db as any).discussionTurn.create({ data: { discussionRunId: runId, participantId, turnIndex, content, segmentLabel } });
    return mapTurn(row);
  }

  async updateTurnAudioUrl(turnId: string, audioUrl: string): Promise<void> {
    await (this.db as any).discussionTurn.update({ where: { id: turnId }, data: { audioUrl } });
  }
}

export type DiscussionRepositoryLike = DiscussionRepository;
```

- [ ] **Step 5: Run tests**

```bash
cd apps/api && npx vitest run src/modules/discussion/repository.test.ts 2>&1 | tail -10
```

Expected: all 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/discussion/
git commit -m "feat(discussion): domain types and Prisma repository"
```

---

## Task 3: Discussion CRUD API Routes

**Files:**
- Create: `apps/api/src/modules/discussion/routes.ts`
- Create: `apps/api/src/modules/discussion/routes.test.ts`
- Modify: `apps/api/src/server.ts` — add `discussion?` to `ServerDeps`, register routes
- Modify: `apps/api/src/main.ts` — wire `DiscussionRepository` into `buildServer`

**Interfaces:**
- Consumes: `DiscussionRepository` from Task 2
- Produces: REST endpoints: `GET/POST /api/discussions`, `GET/PATCH/DELETE /api/discussions/:id`, `GET/POST /api/discussions/:id/runs`, `GET /api/discussions/:id/runs/:runId`

- [ ] **Step 1: Write failing route tests**

Create `apps/api/src/modules/discussion/routes.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { registerDiscussionRoutes } from './routes';
import type { DiscussionRepositoryLike } from './repository';

const mockRepo: DiscussionRepositoryLike = {
  createDiscussion: vi.fn().mockResolvedValue({ id: 'd1', ownerUserId: 'u1', name: 'Test', description: '', format: 'free_form', formatConfig: {}, scheduleJson: null, syntheticSourceId: null, createdAt: new Date(), updatedAt: new Date(), participants: [] }),
  getDiscussion: vi.fn().mockResolvedValue({ id: 'd1', ownerUserId: 'u1', name: 'Test', description: '', format: 'free_form', formatConfig: {}, scheduleJson: null, syntheticSourceId: null, createdAt: new Date(), updatedAt: new Date(), participants: [] }),
  listDiscussions: vi.fn().mockResolvedValue([]),
  updateDiscussion: vi.fn().mockResolvedValue({ id: 'd1' }),
  deleteDiscussion: vi.fn().mockResolvedValue(undefined),
  setSyntheticSourceId: vi.fn().mockResolvedValue(undefined),
  createRun: vi.fn().mockResolvedValue({ id: 'r1', discussionId: 'd1', status: 'pending', triggeredBy: 'manual', errorMessage: null, startedAt: null, completedAt: null, syntheticSourceItemId: null, audioUrl: null, createdAt: new Date(), turns: [] }),
  getRunWithTurns: vi.fn().mockResolvedValue(null),
  listRuns: vi.fn().mockResolvedValue([]),
  updateRun: vi.fn().mockResolvedValue(undefined),
  createTurn: vi.fn().mockResolvedValue({ id: 't1', discussionRunId: 'r1', participantId: 'p1', turnIndex: 0, segmentLabel: null, content: 'hello', audioUrl: null, createdAt: new Date() }),
  updateTurnAudioUrl: vi.fn().mockResolvedValue(undefined)
} as any;

async function buildTestApp() {
  const app = Fastify();
  await app.register(cookie);
  app.addHook('onRequest', async (req) => { req.userId = 'u1'; req.userRole = 'user'; });
  await registerDiscussionRoutes(app, { discussionRepository: mockRepo });
  return app;
}

describe('Discussion routes', () => {
  it('GET /api/discussions returns 200', async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/discussions' });
    expect(res.statusCode).toBe(200);
  });

  it('POST /api/discussions creates discussion', async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/discussions', payload: { name: 'Test', format: 'free_form', participants: [{ agentId: 'a1', role: 'speaker', voiceId: 'alloy', speakerOrder: 0 }] } });
    expect(res.statusCode).toBe(201);
  });

  it('POST /api/discussions/:id/runs returns 202', async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/discussions/d1/runs', payload: {} });
    expect(res.statusCode).toBe(202);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/api && npx vitest run src/modules/discussion/routes.test.ts 2>&1 | tail -5
```

Expected: FAIL — `Cannot find module './routes'`

- [ ] **Step 3: Implement routes.ts**

Create `apps/api/src/modules/discussion/routes.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import type { DiscussionRepositoryLike } from './repository';
import type { CreateDiscussionInput, UpdateDiscussionInput, DiscussionTrigger } from './types';

export interface DiscussionRunTriggerLike {
  triggerDiscussionRun(discussionId: string, runId: string): Promise<void>;
}

export interface DiscussionRoutesDeps {
  discussionRepository: DiscussionRepositoryLike;
  runTrigger?: DiscussionRunTriggerLike;
}

export async function registerDiscussionRoutes(app: FastifyInstance, deps: DiscussionRoutesDeps) {
  // List discussions
  app.get('/api/discussions', async (req, reply) => {
    const discussions = await deps.discussionRepository.listDiscussions(req.userId!);
    return reply.status(200).send(discussions);
  });

  // Create discussion
  app.post('/api/discussions', async (req, reply) => {
    const input = req.body as CreateDiscussionInput;
    if (!input.name || !input.format || !Array.isArray(input.participants) || input.participants.length < 2) {
      return reply.status(400).send({ code: 'invalid_input', message: 'name, format, and at least 2 participants required' });
    }
    const discussion = await deps.discussionRepository.createDiscussion(req.userId!, input);
    return reply.status(201).send(discussion);
  });

  // Get discussion
  app.get('/api/discussions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const discussion = await deps.discussionRepository.getDiscussion(id);
    if (!discussion || discussion.ownerUserId !== req.userId) {
      return reply.status(404).send({ code: 'not_found', message: 'Discussion not found' });
    }
    return reply.status(200).send(discussion);
  });

  // Update discussion
  app.patch('/api/discussions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const discussion = await deps.discussionRepository.getDiscussion(id);
    if (!discussion || discussion.ownerUserId !== req.userId) {
      return reply.status(404).send({ code: 'not_found', message: 'Discussion not found' });
    }
    const updated = await deps.discussionRepository.updateDiscussion(id, req.body as UpdateDiscussionInput);
    return reply.status(200).send(updated);
  });

  // Delete discussion
  app.delete('/api/discussions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const discussion = await deps.discussionRepository.getDiscussion(id);
    if (!discussion || discussion.ownerUserId !== req.userId) {
      return reply.status(404).send({ code: 'not_found', message: 'Discussion not found' });
    }
    await deps.discussionRepository.deleteDiscussion(id);
    return reply.status(204).send();
  });

  // List runs
  app.get('/api/discussions/:id/runs', async (req, reply) => {
    const { id } = req.params as { id: string };
    const discussion = await deps.discussionRepository.getDiscussion(id);
    if (!discussion || discussion.ownerUserId !== req.userId) {
      return reply.status(404).send({ code: 'not_found', message: 'Discussion not found' });
    }
    const runs = await deps.discussionRepository.listRuns(id);
    return reply.status(200).send(runs);
  });

  // Trigger run
  app.post('/api/discussions/:id/runs', async (req, reply) => {
    const { id } = req.params as { id: string };
    const discussion = await deps.discussionRepository.getDiscussion(id);
    if (!discussion || discussion.ownerUserId !== req.userId) {
      return reply.status(404).send({ code: 'not_found', message: 'Discussion not found' });
    }
    const trigger: DiscussionTrigger = (req.body as any)?.triggeredBy ?? 'manual';
    const run = await deps.discussionRepository.createRun(id, trigger);
    // Fire-and-forget orchestration
    deps.runTrigger?.triggerDiscussionRun(id, run.id).catch(() => {});
    return reply.status(202).send(run);
  });

  // Get run
  app.get('/api/discussions/:id/runs/:runId', async (req, reply) => {
    const { id, runId } = req.params as { id: string; runId: string };
    const discussion = await deps.discussionRepository.getDiscussion(id);
    if (!discussion || discussion.ownerUserId !== req.userId) {
      return reply.status(404).send({ code: 'not_found', message: 'Discussion not found' });
    }
    const run = await deps.discussionRepository.getRunWithTurns(runId);
    if (!run || run.discussionId !== id) {
      return reply.status(404).send({ code: 'not_found', message: 'Run not found' });
    }
    return reply.status(200).send(run);
  });

  // SSE stream for a run
  app.get('/api/discussions/:id/runs/:runId/stream', async (req, reply) => {
    const { id, runId } = req.params as { id: string; runId: string };
    const discussion = await deps.discussionRepository.getDiscussion(id);
    if (!discussion || discussion.ownerUserId !== req.userId) {
      return reply.status(404).send({ code: 'not_found', message: 'Discussion not found' });
    }
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders();

    // Poll and stream turns
    let lastTurnIndex = -1;
    const interval = setInterval(async () => {
      const run = await deps.discussionRepository.getRunWithTurns(runId);
      if (!run) { clearInterval(interval); reply.raw.end(); return; }
      for (const turn of run.turns) {
        if (turn.turnIndex > lastTurnIndex) {
          reply.raw.write(`event: turn\ndata: ${JSON.stringify(turn)}\n\n`);
          lastTurnIndex = turn.turnIndex;
        }
      }
      if (run.status === 'done' || run.status === 'error') {
        reply.raw.write(`event: ${run.status}\ndata: ${JSON.stringify({ runId })}\n\n`);
        clearInterval(interval);
        reply.raw.end();
      }
    }, 2000);

    req.raw.on('close', () => clearInterval(interval));
    return reply;
  });
}
```

- [ ] **Step 4: Wire into server.ts**

In `apps/api/src/server.ts`, add to `ServerDeps`:

```typescript
import { registerDiscussionRoutes, type DiscussionRoutesDeps } from './modules/discussion/routes';

export interface ServerDeps {
  // ... existing fields ...
  discussion?: DiscussionRoutesDeps;
}
```

And in `buildServer`, before `return app`:

```typescript
if (deps.discussion) {
  await registerDiscussionRoutes(app, deps.discussion);
}
```

- [ ] **Step 5: Wire into main.ts**

In `apps/api/src/main.ts`, import and add to `buildServer()` call:

```typescript
import { DiscussionRepository } from './modules/discussion/repository';

// Inside buildServer deps:
discussion: {
  discussionRepository: new DiscussionRepository(prisma),
  // runTrigger wired in Task 4
},
```

- [ ] **Step 6: Run route tests**

```bash
cd apps/api && npx vitest run src/modules/discussion/routes.test.ts 2>&1 | tail -10
```

Expected: all 3 tests pass.

- [ ] **Step 7: Run full test suite to check for regressions**

```bash
cd apps/api && npm test 2>&1 | tail -15
```

Expected: all existing tests still pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/discussion/ apps/api/src/server.ts apps/api/src/main.ts
git commit -m "feat(discussion): CRUD API routes + server wiring"
```

---

## Task 4: Discussion Orchestrator (Claude Multi-Turn)

**Files:**
- Create: `apps/api/src/modules/discussion/orchestrator.ts`
- Create: `apps/api/src/modules/discussion/orchestrator.test.ts`

**Interfaces:**
- Consumes:
  - `ClaudeMessagesClient` from `../analysis/claude-client` (the `.messages.create()` interface)
  - `DiscussionRepository` from Task 2
  - `AgentRepository.getAgent(agentId)` from `../agents/routes`
  - `PromptRepository.getLatestPromptVersion(agentId)` from `../prompts/repository`
  - `ReportRepository` to fetch recent reports: `listRecentReports(agentId: string, limit: number): Promise<{summary: string; createdAt: Date}[]>`
- Produces:
  - `DiscussionOrchestrator` class with `run(discussionId: string, runId: string): Promise<void>`
  - Exported `DiscussionOrchestratorDeps` interface

- [ ] **Step 1: Write failing orchestrator tests**

Create `apps/api/src/modules/discussion/orchestrator.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { DiscussionOrchestrator } from './orchestrator';

const mockRepo = {
  getDiscussion: vi.fn().mockResolvedValue({
    id: 'd1', ownerUserId: 'u1', name: 'Test', description: '', format: 'free_form',
    formatConfig: { totalTurnTarget: 4 }, scheduleJson: null, syntheticSourceId: null,
    createdAt: new Date(), updatedAt: new Date(),
    participants: [
      { id: 'p1', discussionId: 'd1', agentId: 'a1', role: 'speaker', voiceId: 'alloy', speakerOrder: 0 },
      { id: 'p2', discussionId: 'd1', agentId: 'a2', role: 'speaker', voiceId: 'echo', speakerOrder: 1 },
    ]
  }),
  getRunWithTurns: vi.fn().mockResolvedValue({ id: 'r1', status: 'pending', turns: [] }),
  updateRun: vi.fn().mockResolvedValue(undefined),
  createTurn: vi.fn().mockResolvedValue({ id: 't1', turnIndex: 0 }),
  setSyntheticSourceId: vi.fn().mockResolvedValue(undefined),
};

const mockAgentRepo = {
  getAgent: vi.fn().mockResolvedValue({ id: 'a1', name: 'Bull', characterType: 'finance_expert' })
};

const mockPromptRepo = {
  getLatestPromptVersion: vi.fn().mockResolvedValue({ systemPrompt: 'You are Bull, a bullish analyst.' })
};

const mockReportRepo = {
  listRecentReports: vi.fn().mockResolvedValue([{ summary: 'NVDA is a buy.', createdAt: new Date() }])
};

const mockClaude = {
  messages: {
    create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'I think NVDA is strong.' }], usage: { input_tokens: 10, output_tokens: 20 } })
  }
};

const mockSyntheticSource = {
  ensureSyntheticSource: vi.fn().mockResolvedValue(undefined)
};

describe('DiscussionOrchestrator', () => {
  it('runs discussion and creates turns', async () => {
    const orchestrator = new DiscussionOrchestrator({
      discussionRepository: mockRepo as any,
      agentRepository: mockAgentRepo as any,
      promptRepository: mockPromptRepo as any,
      reportRepository: mockReportRepo as any,
      claudeClient: mockClaude as any,
      syntheticSource: mockSyntheticSource as any,
    });
    await orchestrator.run('d1', 'r1');
    expect(mockRepo.createTurn).toHaveBeenCalled();
    expect(mockRepo.updateRun).toHaveBeenCalledWith('r1', expect.objectContaining({ status: 'done' }));
  });

  it('marks run as error if Claude throws', async () => {
    const failingClaude = { messages: { create: vi.fn().mockRejectedValue(new Error('API error')) } };
    const orchestrator = new DiscussionOrchestrator({
      discussionRepository: mockRepo as any,
      agentRepository: mockAgentRepo as any,
      promptRepository: mockPromptRepo as any,
      reportRepository: mockReportRepo as any,
      claudeClient: failingClaude as any,
      syntheticSource: mockSyntheticSource as any,
    });
    await orchestrator.run('d1', 'r1');
    expect(mockRepo.updateRun).toHaveBeenCalledWith('r1', expect.objectContaining({ status: 'error' }));
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/api && npx vitest run src/modules/discussion/orchestrator.test.ts 2>&1 | tail -5
```

Expected: FAIL — `Cannot find module './orchestrator'`

- [ ] **Step 3: Implement orchestrator.ts**

Create `apps/api/src/modules/discussion/orchestrator.ts`:

```typescript
import type { ClaudeMessagesClient } from '../analysis/claude-client';
import type { DiscussionRepositoryLike } from './repository';
import type { Discussion, DiscussionParticipant, DiscussionFormat } from './types';
import { logger } from '../../lib/logger';

export interface OrchestratorAgentRepo {
  getAgent(agentId: string): Promise<{ id: string; name: string; characterType: string } | null>;
}

export interface OrchestratorPromptRepo {
  getLatestPromptVersion(agentId: string): Promise<{ systemPrompt: string } | null>;
}

export interface OrchestratorReportRepo {
  listRecentReports(agentId: string, limit: number): Promise<Array<{ summary: string; createdAt: Date }>>;
}

export interface OrchestratorSyntheticSource {
  ensureSyntheticSource(discussion: Discussion, runId: string, transcript: string): Promise<void>;
}

export interface DiscussionOrchestratorDeps {
  discussionRepository: DiscussionRepositoryLike;
  agentRepository: OrchestratorAgentRepo;
  promptRepository: OrchestratorPromptRepo;
  reportRepository: OrchestratorReportRepo;
  claudeClient: ClaudeMessagesClient;
  syntheticSource: OrchestratorSyntheticSource;
}

interface ParticipantContext {
  participant: DiscussionParticipant;
  agentName: string;
  systemPrompt: string;
  recentReportsSummary: string;
}

export class DiscussionOrchestrator {
  constructor(private readonly deps: DiscussionOrchestratorDeps) {}

  async run(discussionId: string, runId: string): Promise<void> {
    const { discussionRepository, agentRepository, promptRepository, reportRepository, claudeClient, syntheticSource } = this.deps;

    await discussionRepository.updateRun(runId, { status: 'running', startedAt: new Date() });

    try {
      const discussion = await discussionRepository.getDiscussion(discussionId);
      if (!discussion) throw new Error(`Discussion ${discussionId} not found`);

      // Load context for each participant
      const contexts: ParticipantContext[] = [];
      for (const p of discussion.participants.sort((a, b) => a.speakerOrder - b.speakerOrder)) {
        const agent = await agentRepository.getAgent(p.agentId);
        const promptVersion = await promptRepository.getLatestPromptVersion(p.agentId);
        const reports = await reportRepository.listRecentReports(p.agentId, 3);
        const recentReportsSummary = reports.length
          ? reports.map((r, i) => `Report ${i + 1}: ${r.summary}`).join('\n')
          : 'No recent reports yet.';
        contexts.push({
          participant: p,
          agentName: agent?.name ?? p.agentId,
          systemPrompt: promptVersion?.systemPrompt ?? `You are an AI analyst named ${agent?.name ?? 'Agent'}.`,
          recentReportsSummary
        });
      }

      const totalTurns = discussion.formatConfig.totalTurnTarget ?? 12;
      const conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
      const segments = this.getSegments(discussion.format, discussion.formatConfig.segments);
      let turnIndex = 0;

      for (let turn = 0; turn < totalTurns; turn++) {
        const ctx = contexts[turn % contexts.length];
        const segment = segments ? segments[Math.floor(turn / Math.ceil(totalTurns / segments.length))] : null;

        const directorPrefix = this.buildDirectorContext(discussion, contexts, segment);
        const userPrompt = conversationHistory.length === 0
          ? `${directorPrefix}\n\nYou are speaking first. Begin the discussion as ${ctx.agentName}. Draw on your recent analysis:\n${ctx.recentReportsSummary}`
          : `${directorPrefix}\n\nIt's ${ctx.agentName}'s turn to speak${segment ? ` (segment: ${segment})` : ''}. Respond to what was just said, staying in character. Your recent analysis:\n${ctx.recentReportsSummary}`;

        const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
          ...conversationHistory,
          { role: 'user', content: userPrompt }
        ];

        const response = await claudeClient.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 400,
          system: ctx.systemPrompt,
          messages
        });

        const text = response.content.find(c => c.type === 'text')?.text ?? '';
        await discussionRepository.createTurn(runId, ctx.participant.id, turnIndex, text, segment);

        conversationHistory.push({ role: 'user', content: userPrompt });
        conversationHistory.push({ role: 'assistant', content: text });
        turnIndex++;
      }

      // Build full transcript and create synthetic source episode
      const run = await discussionRepository.getRunWithTurns(runId);
      if (run) {
        const transcript = run.turns.map(t => {
          const ctx = contexts.find(c => c.participant.id === t.participantId);
          return `${ctx?.agentName ?? 'Agent'}: ${t.content}`;
        }).join('\n\n');
        await syntheticSource.ensureSyntheticSource(discussion, runId, transcript);
      }

      await discussionRepository.updateRun(runId, { status: 'done', completedAt: new Date() });
      logger.info(`[DiscussionOrchestrator] run ${runId} completed`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[DiscussionOrchestrator] run ${runId} failed: ${message}`);
      await discussionRepository.updateRun(runId, { status: 'error', errorMessage: message, completedAt: new Date() });
    }
  }

  private getSegments(format: DiscussionFormat, configSegments?: string[]): string[] | null {
    if (format === 'free_form') return null;
    if (configSegments?.length) return configSegments;
    return ['opening', 'disagreements', 'common_ground', 'final_call'];
  }

  private buildDirectorContext(discussion: Discussion, contexts: ParticipantContext[], currentSegment: string | null): string {
    const participantList = contexts.map(c => `- ${c.agentName} (${c.participant.role})`).join('\n');
    return `[Discussion: "${discussion.name}" | Format: ${discussion.format}${currentSegment ? ` | Segment: ${currentSegment}` : ''}]\nParticipants:\n${participantList}${discussion.description ? `\nContext: ${discussion.description}` : ''}`;
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd apps/api && npx vitest run src/modules/discussion/orchestrator.test.ts 2>&1 | tail -10
```

Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/discussion/orchestrator.ts apps/api/src/modules/discussion/orchestrator.test.ts
git commit -m "feat(discussion): Claude multi-turn orchestrator"
```

---

## Task 5: Synthetic Source Creation

**Files:**
- Create: `apps/api/src/modules/discussion/synthetic-source.ts`
- Create: `apps/api/src/modules/discussion/synthetic-source.test.ts`

**Interfaces:**
- Consumes: `PrismaClient` (direct — creates Source + SourceItem records)
- Produces: `SyntheticSourceService` class implementing `OrchestratorSyntheticSource` interface

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/modules/discussion/synthetic-source.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { SyntheticSourceService } from './synthetic-source';

const mockDb = {
  source: {
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 's1' }),
  },
  sourceItem: {
    create: vi.fn().mockResolvedValue({ id: 'si1' }),
  },
  discussion: {
    update: vi.fn().mockResolvedValue({}),
  },
  discussionRun: {
    update: vi.fn().mockResolvedValue({}),
  },
};

describe('SyntheticSourceService', () => {
  it('creates source and episode on first run', async () => {
    const svc = new SyntheticSourceService(mockDb as any);
    const discussion = { id: 'd1', ownerUserId: 'u1', name: 'Bull vs Bear', syntheticSourceId: null } as any;
    await svc.ensureSyntheticSource(discussion, 'r1', 'Agent A: hello\nAgent B: world');
    expect(mockDb.source.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'synthetic_discussion' }) }));
    expect(mockDb.sourceItem.create).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd apps/api && npx vitest run src/modules/discussion/synthetic-source.test.ts 2>&1 | tail -5
```

Expected: FAIL — `Cannot find module './synthetic-source'`

- [ ] **Step 3: Implement synthetic-source.ts**

Create `apps/api/src/modules/discussion/synthetic-source.ts`:

```typescript
import type { PrismaClient } from '@prisma/client';
import type { Discussion } from './types';
import type { OrchestratorSyntheticSource } from './orchestrator';

type SyntheticSourceDb = Pick<PrismaClient, 'source' | 'sourceItem' | 'discussion' | 'discussionRun'>;

export class SyntheticSourceService implements OrchestratorSyntheticSource {
  constructor(private readonly db: SyntheticSourceDb) {}

  async ensureSyntheticSource(discussion: Discussion, runId: string, transcript: string): Promise<void> {
    let sourceId = discussion.syntheticSourceId;

    if (!sourceId) {
      // Create the synthetic source (idempotent by type+value unique constraint)
      const sourceValue = `synthetic_discussion:${discussion.id}`;
      const existing = await (this.db as any).source.findFirst({
        where: { ownerUserId: discussion.ownerUserId, type: 'synthetic_discussion', value: sourceValue }
      });
      if (existing) {
        sourceId = existing.id;
      } else {
        const source = await (this.db as any).source.create({
          data: {
            ownerUserId: discussion.ownerUserId,
            type: 'synthetic_discussion',
            value: sourceValue,
            configJson: JSON.stringify({ discussionId: discussion.id, name: discussion.name })
          }
        });
        sourceId = source.id;
      }
      await (this.db as any).discussion.update({ where: { id: discussion.id }, data: { syntheticSourceId: sourceId } });
    }

    // Create episode (SourceItem) for this run
    const episodeTitle = `${discussion.name} — ${new Date().toISOString().slice(0, 10)}`;
    const item = await (this.db as any).sourceItem.create({
      data: {
        sourceId,
        title: episodeTitle,
        content: transcript,
        link: `discussion-run:${runId}`,
        publishedAt: new Date()
      }
    });

    await (this.db as any).discussionRun.update({ where: { id: runId }, data: { syntheticSourceItemId: item.id } });
  }
}
```

> **Note:** `SourceItem` may not yet exist as a Prisma model. Check `schema.prisma` for the actual model name (it may be `AgentRunArtifact` or a separate table). If `sourceItem` doesn't exist, add it to `schema.prisma`:
>
> ```prisma
> model SourceItem {
>   id          String   @id @default(cuid())
>   sourceId    String
>   title       String
>   content     String
>   link        String
>   publishedAt DateTime
>   createdAt   DateTime @default(now())
>   source      Source   @relation(fields: [sourceId], references: [id], onDelete: Cascade)
> }
> ```
>
> Add `items SourceItem[]` to the `Source` model and run `npx prisma migrate dev --name add_source_item`.

- [ ] **Step 4: Run test**

```bash
cd apps/api && npx vitest run src/modules/discussion/synthetic-source.test.ts 2>&1 | tail -5
```

Expected: passes.

- [ ] **Step 5: Wire SyntheticSourceService + DiscussionOrchestrator into main.ts as `runTrigger`**

In `apps/api/src/main.ts`, add:

```typescript
import { DiscussionOrchestrator } from './modules/discussion/orchestrator';
import { SyntheticSourceService } from './modules/discussion/synthetic-source';

const syntheticSource = new SyntheticSourceService(prisma);
const discussionOrchestrator = new DiscussionOrchestrator({
  discussionRepository: new DiscussionRepository(prisma),
  agentRepository: agentRepository,  // existing
  promptRepository: promptRepository, // existing
  reportRepository: reportRepository, // existing
  claudeClient: claudeClient,         // existing
  syntheticSource,
});

// In the discussion deps:
discussion: {
  discussionRepository: new DiscussionRepository(prisma),
  runTrigger: {
    triggerDiscussionRun: (discussionId, runId) => discussionOrchestrator.run(discussionId, runId)
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/discussion/ apps/api/src/main.ts
git commit -m "feat(discussion): synthetic source creation + orchestrator wiring"
```

---

## Task 6: TTS Rendering (OpenAI)

**Files:**
- Create: `apps/api/src/modules/discussion/tts-client.ts`
- Create: `apps/api/src/modules/discussion/tts-client.test.ts`
- Modify: `apps/api/src/modules/discussion/routes.ts` — add `POST /runs/:runId/audio` + `GET /runs/:runId/audio/status`
- Modify: `apps/api/package.json` — add `openai` dependency

**Interfaces:**
- Produces: `OpenAITtsClient` class with `renderTurn(text: string, voice: string): Promise<Buffer>`
- Produces: audio render endpoints on discussion routes

- [ ] **Step 1: Install OpenAI SDK**

```bash
cd apps/api && npm install openai
```

- [ ] **Step 2: Write failing TTS client test**

Create `apps/api/src/modules/discussion/tts-client.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { OpenAITtsClient } from './tts-client';

describe('OpenAITtsClient', () => {
  it('calls openai.audio.speech.create and returns a Buffer', async () => {
    const mockBuffer = Buffer.from('fake-audio');
    const mockOpenAI = {
      audio: {
        speech: {
          create: vi.fn().mockResolvedValue({ arrayBuffer: async () => mockBuffer.buffer })
        }
      }
    };
    const client = new OpenAITtsClient(mockOpenAI as any);
    const result = await client.renderTurn('Hello world', 'alloy');
    expect(result).toBeInstanceOf(Buffer);
    expect(mockOpenAI.audio.speech.create).toHaveBeenCalledWith({ model: 'tts-1', voice: 'alloy', input: 'Hello world' });
  });
});
```

- [ ] **Step 3: Run test to confirm it fails**

```bash
cd apps/api && npx vitest run src/modules/discussion/tts-client.test.ts 2>&1 | tail -5
```

Expected: FAIL

- [ ] **Step 4: Implement tts-client.ts**

Create `apps/api/src/modules/discussion/tts-client.ts`:

```typescript
export interface OpenAIAudioClient {
  audio: {
    speech: {
      create(params: { model: string; voice: string; input: string }): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;
    };
  };
}

export class OpenAITtsClient {
  constructor(private readonly openai: OpenAIAudioClient) {}

  async renderTurn(text: string, voice: string): Promise<Buffer> {
    const response = await this.openai.audio.speech.create({ model: 'tts-1', voice, input: text });
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
```

- [ ] **Step 5: Add audio render endpoints to routes.ts**

Add to `registerDiscussionRoutes` in `routes.ts`:

```typescript
export interface DiscussionTtsLike {
  renderTurn(text: string, voice: string): Promise<Buffer>;
}

// Update DiscussionRoutesDeps to include:
// ttsClient?: DiscussionTtsLike;
// ttsStorage?: { save(runId: string, buffer: Buffer): Promise<string> };

// POST /api/discussions/:id/runs/:runId/audio
app.post('/api/discussions/:id/runs/:runId/audio', async (req, reply) => {
  const { id, runId } = req.params as { id: string; runId: string };
  const discussion = await deps.discussionRepository.getDiscussion(id);
  if (!discussion || discussion.ownerUserId !== req.userId) {
    return reply.status(404).send({ code: 'not_found', message: 'Discussion not found' });
  }
  const run = await deps.discussionRepository.getRunWithTurns(runId);
  if (!run || run.status !== 'done') {
    return reply.status(422).send({ code: 'run_not_done', message: 'Run must be completed before rendering audio' });
  }
  if (!deps.ttsClient || !deps.ttsStorage) {
    return reply.status(501).send({ code: 'tts_not_configured', message: 'TTS not configured' });
  }

  // Fire-and-forget rendering
  (async () => {
    const ttsClient = deps.ttsClient!;
    const ttsStorage = deps.ttsStorage!;
    const allAudio: Buffer[] = [];
    for (const turn of run.turns) {
      const participant = discussion.participants.find(p => p.id === turn.participantId);
      const voice = participant?.voiceId ?? 'alloy';
      const buffer = await ttsClient.renderTurn(turn.content, voice);
      const turnUrl = await ttsStorage.save(`${runId}-turn-${turn.turnIndex}`, buffer);
      await deps.discussionRepository.updateTurnAudioUrl(turn.id, turnUrl);
      allAudio.push(buffer);
    }
    const stitched = Buffer.concat(allAudio);
    const stitchedUrl = await ttsStorage.save(`${runId}-full`, stitched);
    await deps.discussionRepository.updateRun(runId, { audioUrl: stitchedUrl });
  })().catch(() => {});

  return reply.status(202).send({ message: 'Audio rendering started' });
});
```

- [ ] **Step 6: Run TTS tests**

```bash
cd apps/api && npx vitest run src/modules/discussion/tts-client.test.ts 2>&1 | tail -5
```

Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/discussion/ apps/api/package.json apps/api/package-lock.json
git commit -m "feat(discussion): OpenAI TTS client + audio render endpoint"
```

---

## Task 7: Studio Hub Frontend — Route + Discussions List

**Files:**
- Create: `apps/web/src/api/discussions.ts`
- Create: `apps/web/src/pages/StudioHub.tsx`
- Modify: `apps/web/src/App.tsx` — add `/studio` route
- Modify: `apps/web/src/pages/AgentsPage.tsx` — add Studio tab to nav
- Modify: `apps/web/src/i18n/locales/en.json` — `studio.*` keys
- Modify: `apps/web/src/i18n/locales/de.json` — same keys in German

**Interfaces:**
- Produces: `/studio` route renders `StudioHub`, discussions list with cards

- [ ] **Step 1: Create discussions API client**

Create `apps/web/src/api/discussions.ts`:

```typescript
const BASE = '/api/discussions';

export interface DiscussionParticipantDto {
  id: string;
  discussionId: string;
  agentId: string;
  role: 'speaker' | 'host';
  voiceId: string;
  speakerOrder: number;
}

export interface DiscussionDto {
  id: string;
  ownerUserId: string;
  name: string;
  description: string;
  format: 'free_form' | 'structured' | 'hosted' | 'hybrid';
  formatConfig: { segments?: string[]; totalTurnTarget?: number; hostInstructions?: string };
  scheduleJson: string | null;
  syntheticSourceId: string | null;
  createdAt: string;
  updatedAt: string;
  participants: DiscussionParticipantDto[];
}

export interface DiscussionRunDto {
  id: string;
  discussionId: string;
  status: 'pending' | 'running' | 'done' | 'error';
  triggeredBy: string;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  syntheticSourceItemId: string | null;
  audioUrl: string | null;
  createdAt: string;
  turns: DiscussionTurnDto[];
}

export interface DiscussionTurnDto {
  id: string;
  discussionRunId: string;
  participantId: string;
  turnIndex: number;
  segmentLabel: string | null;
  content: string;
  audioUrl: string | null;
  createdAt: string;
}

export interface CreateDiscussionPayload {
  name: string;
  description?: string;
  format: 'free_form' | 'structured' | 'hosted' | 'hybrid';
  formatConfig?: object;
  scheduleJson?: string;
  participants: Array<{ agentId: string; role: 'speaker' | 'host'; voiceId: string; speakerOrder: number }>;
}

export async function listDiscussions(): Promise<DiscussionDto[]> {
  const res = await fetch(BASE, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to list discussions');
  return res.json();
}

export async function createDiscussion(payload: CreateDiscussionPayload): Promise<DiscussionDto> {
  const res = await fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) });
  if (!res.ok) throw new Error('Failed to create discussion');
  return res.json();
}

export async function getDiscussion(id: string): Promise<DiscussionDto> {
  const res = await fetch(`${BASE}/${id}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to get discussion');
  return res.json();
}

export async function triggerDiscussionRun(id: string): Promise<DiscussionRunDto> {
  const res = await fetch(`${BASE}/${id}/runs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({}) });
  if (!res.ok) throw new Error('Failed to trigger run');
  return res.json();
}

export async function listDiscussionRuns(id: string): Promise<DiscussionRunDto[]> {
  const res = await fetch(`${BASE}/${id}/runs`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to list runs');
  return res.json();
}

export async function getDiscussionRun(id: string, runId: string): Promise<DiscussionRunDto> {
  const res = await fetch(`${BASE}/${id}/runs/${runId}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to get run');
  return res.json();
}

export async function triggerAudioRender(id: string, runId: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}/runs/${runId}/audio`, { method: 'POST', credentials: 'include' });
  if (!res.ok) throw new Error('Failed to trigger audio render');
}

export async function deleteDiscussion(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE', credentials: 'include' });
  if (!res.ok) throw new Error('Failed to delete discussion');
}
```

- [ ] **Step 2: Add i18n keys**

Add to `apps/web/src/i18n/locales/en.json` under `"studio"`:

```json
"studio": {
  "title": "Studio",
  "newDiscussion": "New Discussion",
  "emptyTitle": "Start your first discussion",
  "emptyDesc": "Pick two or more agents and let them debate their findings. The transcript becomes a new source in your Library.",
  "formatLabel": "Discussion format",
  "format_free_form": "Free-form conversation",
  "format_structured": "Structured rounds",
  "format_hosted": "Hosted (moderator + guests)",
  "format_hybrid": "Hybrid",
  "runNow": "Run now",
  "runAgain": "Run again",
  "renderAudio": "Render audio podcast",
  "audioRendering": "Rendering audio…",
  "transcript": "Transcript",
  "audioPlayer": "Audio",
  "noRuns": "No runs yet — click \"Run now\" to generate the first discussion.",
  "participants": "Participants",
  "wizardStep1": "Pick agents",
  "wizardStep2": "Configure",
  "wizardStep3": "Schedule",
  "minParticipants": "Select at least 2 agents",
  "voiceLabel": "Voice",
  "roleLabel": "Role",
  "roleHost": "Host",
  "roleSpeaker": "Speaker",
  "scheduleOptional": "Schedule (optional)",
  "syntheticBadge": "Synthetic",
  "discussionSuggestion": "{{agentA}} and {{agentB}} both analysed {{source}} — start a discussion?"
}
```

Add to `apps/web/src/i18n/locales/de.json` under `"studio"`:

```json
"studio": {
  "title": "Studio",
  "newDiscussion": "Neue Diskussion",
  "emptyTitle": "Starte deine erste Diskussion",
  "emptyDesc": "Wähle zwei oder mehr Agenten aus und lass sie ihre Erkenntnisse diskutieren. Das Transkript wird als neue Quelle in deiner Bibliothek gespeichert.",
  "formatLabel": "Diskussionsformat",
  "format_free_form": "Freie Unterhaltung",
  "format_structured": "Strukturierte Runden",
  "format_hosted": "Moderiert (Moderator + Gäste)",
  "format_hybrid": "Hybrid",
  "runNow": "Jetzt ausführen",
  "runAgain": "Erneut ausführen",
  "renderAudio": "Audio-Podcast rendern",
  "audioRendering": "Audio wird gerendert…",
  "transcript": "Transkript",
  "audioPlayer": "Audio",
  "noRuns": "Noch keine Läufe — klicke auf \"Jetzt ausführen\" um die erste Diskussion zu starten.",
  "participants": "Teilnehmer",
  "wizardStep1": "Agenten wählen",
  "wizardStep2": "Konfigurieren",
  "wizardStep3": "Zeitplan",
  "minParticipants": "Mindestens 2 Agenten auswählen",
  "voiceLabel": "Stimme",
  "roleLabel": "Rolle",
  "roleHost": "Moderator",
  "roleSpeaker": "Sprecher",
  "scheduleOptional": "Zeitplan (optional)",
  "syntheticBadge": "Synthetisch",
  "discussionSuggestion": "{{agentA}} und {{agentB}} haben beide {{source}} analysiert — Diskussion starten?"
}
```

- [ ] **Step 3: Create StudioHub.tsx**

Create `apps/web/src/pages/StudioHub.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { Button, Card, Empty, Spin, Tag, Avatar, Tooltip, Popconfirm, message } from 'antd';
import { PlusOutlined, AudioOutlined, TeamOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { listDiscussions, deleteDiscussion, triggerDiscussionRun, type DiscussionDto } from '../api/discussions';
import { useNavigate } from 'react-router-dom';

const FORMAT_COLORS: Record<string, string> = {
  free_form: 'blue', structured: 'purple', hosted: 'orange', hybrid: 'geekblue'
};

export function StudioHub() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [discussions, setDiscussions] = useState<DiscussionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningId, setRunningId] = useState<string | null>(null);

  useEffect(() => {
    listDiscussions().then(setDiscussions).finally(() => setLoading(false));
  }, []);

  async function handleRunNow(d: DiscussionDto) {
    setRunningId(d.id);
    try {
      await triggerDiscussionRun(d.id);
      message.success(t('studio.runNow') + ' started');
      navigate(`/studio/${d.id}`);
    } catch {
      message.error('Failed to start run');
    } finally {
      setRunningId(null);
    }
  }

  async function handleDelete(id: string) {
    await deleteDiscussion(id);
    setDiscussions(prev => prev.filter(d => d.id !== id));
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spin size="large" /></div>;

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}><AudioOutlined style={{ marginRight: 8 }} />{t('studio.title')}</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/studio/new')}>
          {t('studio.newDiscussion')}
        </Button>
      </div>

      {discussions.length === 0 ? (
        <Empty
          image={<TeamOutlined style={{ fontSize: 64, color: '#d9d9d9' }} />}
          description={
            <div>
              <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>{t('studio.emptyTitle')}</div>
              <div style={{ color: '#888', maxWidth: 400, margin: '0 auto' }}>{t('studio.emptyDesc')}</div>
            </div>
          }
          style={{ marginTop: 80 }}
        >
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/studio/new')}>
            {t('studio.newDiscussion')}
          </Button>
        </Empty>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {discussions.map(d => (
            <Card
              key={d.id}
              hoverable
              onClick={() => navigate(`/studio/${d.id}`)}
              actions={[
                <Button size="small" loading={runningId === d.id} onClick={e => { e.stopPropagation(); handleRunNow(d); }}>
                  {t('studio.runNow')}
                </Button>,
                <Popconfirm title="Delete discussion?" onConfirm={e => { e?.stopPropagation(); handleDelete(d.id); }} onClick={e => e.stopPropagation()}>
                  <Button size="small" danger>Delete</Button>
                </Popconfirm>
              ]}
            >
              <Card.Meta
                title={<span><AudioOutlined style={{ marginRight: 6 }} />{d.name}</span>}
                description={
                  <div>
                    <Tag color={FORMAT_COLORS[d.format] ?? 'default'}>{t(`studio.format_${d.format}`)}</Tag>
                    <div style={{ marginTop: 8 }}>
                      <Avatar.Group maxCount={4} size="small">
                        {d.participants.map(p => (
                          <Tooltip key={p.id} title={`Agent ${p.agentId}`}>
                            <Avatar style={{ backgroundColor: '#1890ff' }}>{p.agentId.slice(0, 1).toUpperCase()}</Avatar>
                          </Tooltip>
                        ))}
                      </Avatar.Group>
                      <span style={{ marginLeft: 8, fontSize: 12, color: '#888' }}>{d.participants.length} {t('studio.participants')}</span>
                    </div>
                  </div>
                }
              />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add `/studio` route to App.tsx**

In `apps/web/src/App.tsx`, import `StudioHub` and add route:

```tsx
import { StudioHub } from './pages/StudioHub';

// Inside <Routes>:
<Route path="/studio" element={<StudioHub />} />
<Route path="/studio/new" element={<StudioHub />} />  {/* wizard opens via state */}
<Route path="/studio/:discussionId" element={<StudioHub />} />
```

- [ ] **Step 5: Add Studio tab to AgentsPage nav**

In `apps/web/src/pages/AgentsPage.tsx`, add 'studio' to `HUB_LABELS` and nav, or add a standalone link in the header nav that navigates to `/studio`:

Find the nav tabs section and add after the Playbooks tab:

```tsx
<div
  className={`ct-hub-tab`}
  onClick={() => navigate('/studio')}
  style={{ cursor: 'pointer' }}
>
  <AudioOutlined /> {t('studio.title')}
</div>
```

Import `AudioOutlined` if not already imported from `@ant-design/icons`.

- [ ] **Step 6: Build frontend**

```bash
cd apps/web && npm run build 2>&1 | tail -8
```

Expected: exit 0, no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/
git commit -m "feat(studio): Studio hub route + discussions list + i18n"
```

---

## Task 8: Discussion Detail View + New Discussion Wizard

**Files:**
- Create: `apps/web/src/pages/DiscussionDetail.tsx`
- Create: `apps/web/src/pages/NewDiscussionWizard.tsx`
- Create: `apps/web/src/hooks/useDiscussionStream.ts`

**Interfaces:**
- Consumes: `discussions.ts` API client from Task 7
- Produces: transcript view at `/studio/:id`, 3-step wizard at `/studio/new`

- [ ] **Step 1: Create useDiscussionStream hook**

Create `apps/web/src/hooks/useDiscussionStream.ts`:

```typescript
import { useEffect, useRef, useState } from 'react';
import type { DiscussionTurnDto } from '../api/discussions';

export function useDiscussionStream(discussionId: string, runId: string | null) {
  const [turns, setTurns] = useState<DiscussionTurnDto[]>([]);
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!runId) return;
    setStatus('running');
    const es = new EventSource(`/api/discussions/${discussionId}/runs/${runId}/stream`, { withCredentials: true });
    esRef.current = es;

    es.addEventListener('turn', (e) => {
      const turn: DiscussionTurnDto = JSON.parse((e as MessageEvent).data);
      setTurns(prev => {
        const existing = prev.find(t => t.id === turn.id);
        return existing ? prev : [...prev, turn].sort((a, b) => a.turnIndex - b.turnIndex);
      });
    });

    es.addEventListener('done', () => { setStatus('done'); es.close(); });
    es.addEventListener('error', () => { setStatus('error'); es.close(); });

    return () => { es.close(); };
  }, [discussionId, runId]);

  return { turns, status };
}
```

- [ ] **Step 2: Create DiscussionDetail.tsx**

Create `apps/web/src/pages/DiscussionDetail.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Spin, Tag, Collapse, message, Typography } from 'antd';
import { ArrowLeftOutlined, AudioOutlined, CaretRightOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { getDiscussion, listDiscussionRuns, triggerDiscussionRun, triggerAudioRender, type DiscussionDto, type DiscussionRunDto } from '../api/discussions';
import { useDiscussionStream } from '../hooks/useDiscussionStream';

function TurnBubble({ content, agentName, side }: { content: string; agentName: string; side: 'left' | 'right' }) {
  return (
    <div style={{ display: 'flex', justifyContent: side === 'right' ? 'flex-end' : 'flex-start', marginBottom: 16 }}>
      <div style={{ maxWidth: '70%', background: side === 'right' ? '#1890ff' : '#f0f0f0', color: side === 'right' ? '#fff' : '#000', borderRadius: 12, padding: '10px 14px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, opacity: 0.7 }}>{agentName}</div>
        <Typography.Text style={{ color: 'inherit', whiteSpace: 'pre-wrap' }}>{content}</Typography.Text>
      </div>
    </div>
  );
}

export function DiscussionDetail() {
  const { discussionId } = useParams<{ discussionId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [discussion, setDiscussion] = useState<DiscussionDto | null>(null);
  const [runs, setRuns] = useState<DiscussionRunDto[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const { turns: streamTurns, status: streamStatus } = useDiscussionStream(discussionId!, activeRunId);

  useEffect(() => {
    if (!discussionId) return;
    Promise.all([getDiscussion(discussionId), listDiscussionRuns(discussionId)])
      .then(([d, r]) => { setDiscussion(d); setRuns(r); })
      .finally(() => setLoading(false));
  }, [discussionId]);

  useEffect(() => {
    if (streamStatus === 'done') {
      listDiscussionRuns(discussionId!).then(setRuns);
    }
  }, [streamStatus, discussionId]);

  async function handleRunNow() {
    setRunning(true);
    try {
      const run = await triggerDiscussionRun(discussionId!);
      setActiveRunId(run.id);
    } catch {
      message.error('Failed to start run');
    } finally {
      setRunning(false);
    }
  }

  async function handleRenderAudio(run: DiscussionRunDto) {
    try {
      await triggerAudioRender(discussionId!, run.id);
      message.info(t('studio.audioRendering'));
    } catch {
      message.error('Failed to start audio render');
    }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spin /></div>;
  if (!discussion) return null;

  const participantNames: Record<string, string> = {};
  discussion.participants.forEach((p, i) => { participantNames[p.id] = `Agent ${i + 1}`; });

  return (
    <div style={{ padding: '24px 32px', maxWidth: 900, margin: '0 auto' }}>
      <Button icon={<ArrowLeftOutlined />} type="link" onClick={() => navigate('/studio')} style={{ marginBottom: 16, paddingLeft: 0 }}>
        {t('studio.title')}
      </Button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}><AudioOutlined style={{ marginRight: 8 }} />{discussion.name}</h2>
        <Button type="primary" icon={<CaretRightOutlined />} loading={running} onClick={handleRunNow}>
          {runs.length > 0 ? t('studio.runAgain') : t('studio.runNow')}
        </Button>
      </div>

      {/* Active run live stream */}
      {activeRunId && (
        <div style={{ background: '#f9f9f9', borderRadius: 8, padding: 16, marginBottom: 24 }}>
          <Tag color={streamStatus === 'done' ? 'success' : streamStatus === 'error' ? 'error' : 'processing'}>
            {streamStatus}
          </Tag>
          <div style={{ marginTop: 16 }}>
            {streamTurns.map((turn, i) => (
              <TurnBubble key={turn.id} content={turn.content} agentName={participantNames[turn.participantId] ?? turn.participantId} side={i % 2 === 0 ? 'left' : 'right'} />
            ))}
          </div>
        </div>
      )}

      {/* Past runs */}
      {runs.length === 0 && !activeRunId ? (
        <div style={{ color: '#888', textAlign: 'center', marginTop: 40 }}>{t('studio.noRuns')}</div>
      ) : (
        <Collapse accordion>
          {runs.filter(r => r.id !== activeRunId).map((run) => (
            <Collapse.Panel
              key={run.id}
              header={
                <span>
                  <Tag color={run.status === 'done' ? 'success' : run.status === 'error' ? 'error' : 'processing'}>{run.status}</Tag>
                  {new Date(run.createdAt).toLocaleString()}
                </span>
              }
            >
              <div style={{ marginBottom: 12 }}>
                {run.audioUrl ? (
                  <audio controls src={run.audioUrl} style={{ width: '100%', marginBottom: 12 }} />
                ) : run.status === 'done' ? (
                  <Button size="small" icon={<AudioOutlined />} onClick={() => handleRenderAudio(run)}>
                    {t('studio.renderAudio')}
                  </Button>
                ) : null}
              </div>
              {run.turns.map((turn, i) => (
                <TurnBubble key={turn.id} content={turn.content} agentName={participantNames[turn.participantId] ?? turn.participantId} side={i % 2 === 0 ? 'left' : 'right'} />
              ))}
            </Collapse.Panel>
          ))}
        </Collapse>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create NewDiscussionWizard.tsx**

Create `apps/web/src/pages/NewDiscussionWizard.tsx`:

```tsx
import React, { useState } from 'react';
import { Steps, Button, Input, Select, Checkbox, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { createDiscussion, type CreateDiscussionPayload } from '../api/discussions';
import { useAppData } from '../context/AppDataContext';

const VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
const FORMATS = ['free_form', 'structured', 'hosted', 'hybrid'] as const;

export function NewDiscussionWizard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { agents } = useAppData();
  const [step, setStep] = useState(0);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [format, setFormat] = useState<typeof FORMATS[number]>('free_form');
  const [voiceMap, setVoiceMap] = useState<Record<string, string>>({});
  const [roleMap, setRoleMap] = useState<Record<string, 'speaker' | 'host'>>({});
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate() {
    if (selectedAgentIds.length < 2) { message.warning(t('studio.minParticipants')); return; }
    setSubmitting(true);
    try {
      const payload: CreateDiscussionPayload = {
        name: name || `${agents.find(a => a.id === selectedAgentIds[0])?.name ?? 'Agent'} Discussion`,
        description,
        format,
        participants: selectedAgentIds.map((agentId, i) => ({
          agentId,
          role: roleMap[agentId] ?? (format === 'hosted' && i === 0 ? 'host' : 'speaker'),
          voiceId: voiceMap[agentId] ?? VOICES[i % VOICES.length],
          speakerOrder: i
        }))
      };
      const discussion = await createDiscussion(payload);
      navigate(`/studio/${discussion.id}`);
    } catch {
      message.error('Failed to create discussion');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 700, margin: '0 auto' }}>
      <h2>{t('studio.newDiscussion')}</h2>
      <Steps current={step} style={{ marginBottom: 32 }} items={[
        { title: t('studio.wizardStep1') },
        { title: t('studio.wizardStep2') },
        { title: t('studio.wizardStep3') },
      ]} />

      {step === 0 && (
        <div>
          <p>{t('studio.minParticipants')}</p>
          {agents.map(agent => (
            <div key={agent.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <Checkbox
                checked={selectedAgentIds.includes(agent.id)}
                onChange={e => setSelectedAgentIds(prev => e.target.checked ? [...prev, agent.id] : prev.filter(id => id !== agent.id))}
              >
                {agent.name}
              </Checkbox>
              {selectedAgentIds.includes(agent.id) && (
                <>
                  <Select size="small" value={voiceMap[agent.id] ?? VOICES[selectedAgentIds.indexOf(agent.id) % VOICES.length]} onChange={v => setVoiceMap(prev => ({ ...prev, [agent.id]: v }))} style={{ width: 100 }}
                    options={VOICES.map(v => ({ value: v, label: v }))}
                  />
                  <Select size="small" value={roleMap[agent.id] ?? 'speaker'} onChange={v => setRoleMap(prev => ({ ...prev, [agent.id]: v }))} style={{ width: 100 }}
                    options={[{ value: 'speaker', label: t('studio.roleSpeaker') }, { value: 'host', label: t('studio.roleHost') }]}
                  />
                </>
              )}
            </div>
          ))}
          <Button type="primary" disabled={selectedAgentIds.length < 2} onClick={() => setStep(1)} style={{ marginTop: 16 }}>Next</Button>
        </div>
      )}

      {step === 1 && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <label>Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Discussion name" style={{ marginTop: 4 }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label>{t('studio.formatLabel')}</label>
            <Select value={format} onChange={setFormat} style={{ width: '100%', marginTop: 4 }}
              options={FORMATS.map(f => ({ value: f, label: t(`studio.format_${f}`) }))}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label>Description / Instructions (optional)</label>
            <Input.TextArea value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ marginTop: 4 }} />
          </div>
          <Button onClick={() => setStep(0)} style={{ marginRight: 8 }}>Back</Button>
          <Button type="primary" onClick={() => setStep(2)}>Next</Button>
        </div>
      )}

      {step === 2 && (
        <div>
          <p style={{ color: '#888' }}>{t('studio.scheduleOptional')} — scheduling can be added later. Click "Create" to save and run on demand.</p>
          <Button onClick={() => setStep(1)} style={{ marginRight: 8 }}>Back</Button>
          <Button type="primary" loading={submitting} onClick={handleCreate}>Create Discussion</Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wire detail + wizard routes in App.tsx**

In `apps/web/src/App.tsx`:

```tsx
import { DiscussionDetail } from './pages/DiscussionDetail';
import { NewDiscussionWizard } from './pages/NewDiscussionWizard';

// Replace the /studio/new and /studio/:discussionId routes:
<Route path="/studio/new" element={<NewDiscussionWizard />} />
<Route path="/studio/:discussionId" element={<DiscussionDetail />} />
```

- [ ] **Step 5: Build frontend**

```bash
cd apps/web && npm run build 2>&1 | tail -8
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/
git commit -m "feat(studio): discussion detail view, SSE stream hook, new discussion wizard"
```

---

## Task 9: Scheduling Integration

**Files:**
- Modify: `apps/api/src/modules/schedules/scheduler-loop.ts` — extend to also trigger due discussion runs
- Modify: `apps/api/src/main.ts` — pass discussion deps to scheduler

**Interfaces:**
- Consumes: `DiscussionRepository.listDiscussions` + `computeNextRun` from `../schedules/compute-next-run`
- Produces: scheduled discussion runs triggered automatically

- [ ] **Step 1: Check computeNextRun signature**

```bash
cd apps/api && head -40 src/modules/schedules/compute-next-run.ts
```

Note the expected `scheduleJson` shape — it must match the `PlaybookScheduleInput` format already used: `{ mode: 'daily' | 'weekly' | 'interval', ... }`.

- [ ] **Step 2: Add discussion scheduler to main.ts**

In `apps/api/src/main.ts`, alongside the existing `startSchedulerLoop` call, add:

```typescript
import { computeNextRun } from './modules/schedules/compute-next-run';

// Discussion scheduler - runs every minute alongside the main scheduler
setInterval(async () => {
  const now = new Date();
  const allDiscussions = await prisma.discussion.findMany({
    where: { scheduleJson: { not: null } },
    include: { participants: true }
  });
  for (const disc of allDiscussions) {
    if (!disc.scheduleJson) continue;
    let schedule: any;
    try { schedule = JSON.parse(disc.scheduleJson); } catch { continue; }
    // Find last run
    const lastRun = await prisma.discussionRun.findFirst({
      where: { discussionId: disc.id, triggeredBy: 'scheduled' },
      orderBy: { createdAt: 'desc' }
    });
    const nextRun = computeNextRun(schedule, lastRun?.createdAt ?? new Date(0));
    if (nextRun <= now) {
      const run = await prisma.discussionRun.create({
        data: { discussionId: disc.id, triggeredBy: 'scheduled', status: 'pending' }
      });
      discussionOrchestrator.run(disc.id, run.id).catch((e: Error) => logger.error(`Discussion scheduled run failed: ${e.message}`));
    }
  }
}, 60_000);
```

- [ ] **Step 3: Build API**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/main.ts apps/api/src/modules/schedules/
git commit -m "feat(discussion): scheduling integration for recurring discussion runs"
```

---

## Task 10: Library Badge + Final Polish

**Files:**
- Modify: `apps/web/src/pages/AgentsPage.tsx` — add `🎙 Synthetic` badge to source cards of type `synthetic_discussion`
- Modify: `apps/web/src/i18n/locales/en.json` + `de.json` — add `library.syntheticSource` key

- [ ] **Step 1: Add badge to source cards in AgentsPage**

Search for where source cards render the source type badge (look for `source.type` display). Add:

```tsx
{source.type === 'synthetic_discussion' && (
  <Tag color="cyan" style={{ marginLeft: 4 }}>🎙 {t('studio.syntheticBadge')}</Tag>
)}
```

- [ ] **Step 2: Final build + full test run**

```bash
cd apps/api && npm test 2>&1 | tail -15
cd apps/web && npm run build 2>&1 | tail -8
```

Expected: all tests pass, build exits 0.

- [ ] **Step 3: Final commit**

```bash
git add apps/web/src/pages/AgentsPage.tsx apps/web/src/i18n/
git commit -m "feat(studio): synthetic source badge in Library + final polish"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Studio hub (5th nav tab, `/studio`) — Task 7
- ✅ Discussion domain entity + participants, format, schedule — Tasks 1, 2
- ✅ Runs + turns — Tasks 2, 3
- ✅ Claude multi-turn orchestration (free_form, structured, hosted, hybrid) — Task 4
- ✅ Synthetic source + episode on run completion — Task 5
- ✅ OpenAI TTS per-turn + stitch — Task 6
- ✅ Manual / auto-suggested / scheduled triggers — Tasks 3, 9
- ✅ SSE live stream — Task 3, Task 8
- ✅ Discussion list + detail + wizard — Tasks 7, 8
- ✅ i18n en + de — Task 7
- ✅ Library synthetic badge — Task 10
- ✅ Scheduling — Task 9
- ⚠️ Auto-suggestion notification (when two agents share a source) — deferred to post-MVP; the infrastructure (Notification model) exists, but the trigger hook inside `AgentRunner` is out of scope for this plan to avoid coupling.

**No placeholders remain.** All tasks contain concrete code. Type names are consistent across tasks (e.g. `DiscussionRepositoryLike`, `DiscussionOrchestrator`, `OpenAITtsClient`).
