# Unified Realtime and Source Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fragile resource-specific live updates with one persistent,
cluster-safe SSE feed for a user's Runs, Reports, Discussions, Sources, and
Marketplace actions, and keep source-picker modal actions visible.

**Architecture:** `RealtimeEvent` is a durable SQLite outbox keyed by monotonic
integer ID and user. Producers write domain state and an event in one Prisma
transaction. A cursor-based global SSE route reads the outbox with heartbeats;
one React provider persists its cursor and routes typed events to consumers.

**Tech Stack:** Fastify 4, Prisma 6 / SQLite, native browser EventSource, React
18, TypeScript, Vitest, Ant Design, Tailwind, nginx.

**Spec:** `docs/superpowers/specs/2026-07-22-unified-realtime-and-source-picker-design.md`

## Global Constraints

- Keep SQLite and the existing Node cluster architecture; do not use an
  in-memory event emitter or add WebSockets.
- Events are user-scoped and durable; write the domain mutation and its event
  in the same Prisma transaction.
- `RealtimeEvent.id` is a monotonic integer SSE cursor. Persist the client
  cursor in `localStorage` as `chattrader:realtime-cursor:<userId>`.
- Accept `cursor` and `Last-Event-ID`; use the larger valid positive integer.
- Retain events for 24 hours; send `resync` for stale cursors.
- Send a heartbeat comment at least every 15 seconds of inactivity.
- Preserve REST mutation success/error feedback; realtime only synchronizes
  other visible tabs/devices.
- TDD is optional. Tests are mandatory for all new backend behavior and pure
  frontend logic; `cd apps/web && npm run build` must pass.
- Every commit uses conventional format and includes:
  `Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>`.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `apps/api/prisma/schema.prisma` | `RealtimeEvent` persistent outbox model |
| `apps/api/src/modules/realtime/types.ts` | Topics, event DTOs, cursor constants |
| `apps/api/src/modules/realtime/repository.ts` | Transaction-safe outbox append/query/cleanup |
| `apps/api/src/modules/realtime/routes.ts` | Authenticated cursor SSE endpoint |
| `apps/api/src/modules/realtime/routes.test.ts` | SSE auth/cursor/headers/resync coverage |
| `apps/api/src/modules/realtime/repository.test.ts` | Event ordering, isolation, cleanup coverage |
| `apps/api/src/modules/realtime/cleanup-loop.ts` | Worker-only 24h retention timer |
| source/agent/playbook/run/report/discussion repositories | Atomic domain mutation + topic event producers |
| `apps/api/src/server.ts`, `apps/api/src/main.ts` | Route and worker-cleanup wiring |
| `apps/web/src/api/realtime.ts` | Event DTO and stream URL helpers |
| `apps/web/src/realtime/cursor.ts` | Pure cursor validation/persistence helpers |
| `apps/web/src/context/RealtimeContext.tsx` | One EventSource and typed subscriptions |
| `apps/web/src/context/AppDataContext.tsx` | Marketplace refreshers + global source/marketplace subscribers |
| `apps/web/src/pages/AgentsPage.tsx` | Replace agent SSE/source polling with subscriptions |
| `apps/web/src/pages/DiscussionDetail.tsx` | Replace discussion SSE with subscription/refetch |
| `apps/web/src/components/SourceSearchPicker.tsx` | Bounded internal result scroller |
| `deploy/nginx.conf`, `deploy/README.md` | Explicit SSE proxy path and production verification |

### Task 1: Add the durable RealtimeEvent outbox

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/modules/realtime/types.ts`
- Create: `apps/api/src/modules/realtime/repository.ts`
- Test: `apps/api/src/modules/realtime/repository.test.ts`

**Interfaces:**
- Produces:

```ts
export const REALTIME_RETENTION_MS = 24 * 60 * 60 * 1000;
export type RealtimeTopic =
  | 'source.changed'
  | 'marketplace.changed'
  | 'run.changed'
  | 'report.changed'
  | 'discussion.changed';

export interface RealtimeEventDto {
  id: number;
  topic: RealtimeTopic;
  entityId: string | null;
  createdAt: string;
}

export interface RealtimeEventWriter {
  append(tx: RealtimeEventTransaction, input: {
    userId: string; topic: RealtimeTopic; entityId?: string;
  }): Promise<void>;
}
```

- [ ] **Step 1: Add the schema model**

Append after `DiscussionTurn` in `apps/api/prisma/schema.prisma`:

```prisma
model RealtimeEvent {
  id        Int      @id @default(autoincrement())
  userId    String
  topic     String
  entityId  String?
  createdAt DateTime @default(now())

  @@index([userId, id])
  @@index([createdAt])
}
```

- [ ] **Step 2: Write repository tests**

Use an injected Prisma-shaped fake. Cover:

```ts
it('returns only one users events after a cursor in id order', async () => {
  // rows: user-a #1, user-b #2, user-a #3
  await expect(repository.listAfter('user-a', 1)).resolves.toEqual([
    { id: 3, topic: 'source.changed', entityId: 'source-1', createdAt: expect.any(String) }
  ]);
});

it('deletes events older than the 24-hour cutoff', async () => {
  await repository.deleteOlderThan(new Date('2026-07-21T12:00:00.000Z'));
  expect(db.realtimeEvent.deleteMany).toHaveBeenCalledWith({
    where: { createdAt: { lt: new Date('2026-07-21T12:00:00.000Z') } }
  });
});
```

Also assert `append` calls `tx.realtimeEvent.create` with `entityId: null`
when omitted and never opens its own transaction.

- [ ] **Step 3: Implement types and repository**

Create `types.ts` with the interface above plus:

```ts
export const REALTIME_POLL_MS = 1_000;
export const REALTIME_HEARTBEAT_MS = 15_000;
export const REALTIME_RETENTION_MS = 24 * 60 * 60 * 1000;
```

`repository.ts` must accept a narrow Prisma shape containing `realtimeEvent`.
Implement:

```ts
append(tx, input) // tx.realtimeEvent.create({ data: { userId, topic, entityId: entityId ?? null } })
listAfter(userId, cursor) // where { userId, id: { gt: cursor } }, orderBy { id: 'asc' }
oldestIdForUser(userId) // findFirst({ where: { userId }, orderBy: { id: 'asc' } })
deleteOlderThan(cutoff) // deleteMany({ where: { createdAt: { lt: cutoff } } })
```

Map `Date` values to ISO strings only at the HTTP boundary; repository records
keep `Date`.

- [ ] **Step 4: Generate Prisma client and run focused tests**

Run:

```powershell
cd apps/api
npx prisma generate
npx vitest run src/modules/realtime/repository.test.ts
```

Expected: all repository tests pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/prisma/schema.prisma apps/api/src/modules/realtime
git commit -m "feat(realtime): add durable user event outbox`n`nCo-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

### Task 2: Deliver the global cursor-based SSE stream

**Files:**
- Create: `apps/api/src/modules/realtime/routes.ts`
- Test: `apps/api/src/modules/realtime/routes.test.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/main.ts`
- Create: `apps/api/src/modules/realtime/cleanup-loop.ts`
- Test: `apps/api/src/modules/realtime/cleanup-loop.test.ts`

**Interfaces:**
- Consumes: `RealtimeEventRepository`, constants and DTOs from Task 1.
- Produces: authenticated `GET /api/realtime/stream` and worker-only cleanup.

- [ ] **Step 1: Write route and cleanup tests**

Build the server with a fake `realtime` dependency. Test:

```ts
it('rejects an unauthenticated stream request with 401', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/realtime/stream' });
  expect(response.statusCode).toBe(401);
});

it('uses the greater valid cursor from query and Last-Event-ID', async () => {
  // query cursor=4, Last-Event-ID=8 => listAfter(userId, 8)
});

it('returns resync before normal events when cursor predates the retained feed', async () => {
  // oldest retained id=20, cursor=7 => event: resync
});

it('sets unbuffered SSE headers', async () => {
  expect(response.headers['x-accel-buffering']).toBe('no');
  expect(response.headers['cache-control']).toContain('no-transform');
});
```

For the timer helper use fake timers and assert:

```ts
it('runs cleanup immediately and once per hour', async () => {
  const stop = startRealtimeCleanupLoop({ repository, now: () => fixedNow });
  expect(repository.deleteOlderThan).toHaveBeenCalledWith(
    new Date(fixedNow.getTime() - REALTIME_RETENTION_MS)
  );
  await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
  expect(repository.deleteOlderThan).toHaveBeenCalledTimes(2);
  stop();
});
```

- [ ] **Step 2: Implement cursor parsing and event serialization**

In `routes.ts`, export pure helpers:

```ts
export function parsePositiveCursor(value: unknown): number | null;
export function resolveCursor(queryCursor: unknown, lastEventId: unknown): number;
export function formatSse(event: string, data: unknown, id?: number): string;
```

`parsePositiveCursor` accepts only decimal safe integers `>= 0`; malformed,
negative, float, and repeated query values return `null`. `resolveCursor`
returns `Math.max(query ?? 0, header ?? 0)`.

`formatSse('change', dto, 42)` must exactly produce:

```text
id: 42
event: change
data: {"id":42,"topic":"source.changed","entityId":"source-1","createdAt":"..."}

```

- [ ] **Step 3: Implement stream lifecycle**

`registerRealtimeRoutes(app, { repository })` must:

1. Read `req.userId!`; server auth already guarantees it.
2. `reply.hijack()`, write status 200 and the four SSE headers.
3. Compute cursor from `req.query.cursor` and `req.headers['last-event-id']`.
4. Query `oldestIdForUser`; when `cursor > 0 && oldestId !== null &&
   cursor < oldestId - 1`, write `event: resync`.
5. Read and write all `listAfter(userId, cursor)` results, updating cursor.
6. Loop with a close promise: poll at `REALTIME_POLL_MS`; when no event has
   been written for `REALTIME_HEARTBEAT_MS`, write `: keepalive\n\n`.
7. Stop cleanly on `req.raw.once('close', ...)`; never throw after the socket
   has closed.

Do not use `setInterval` with an async callback; use an awaited loop plus
`Promise.race` against the close promise so queries cannot overlap.

- [ ] **Step 4: Wire server and worker cleanup**

Add optional `realtime?: { repository: RealtimeEventRepository }` to
`ServerDeps` and register the route only when supplied. In `main.ts`, construct
one `RealtimeEventRepository(prisma)`, pass it to `buildServer`, and in the
existing `plan.startSchedulers` branch call:

```ts
startRealtimeCleanupLoop({ repository: realtimeEventRepository });
```

The cleanup loop must catch/log individual cleanup failures and continue.

- [ ] **Step 5: Run focused tests**

```powershell
cd apps/api
npx vitest run src/modules/realtime/routes.test.ts src/modules/realtime/cleanup-loop.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/modules/realtime apps/api/src/server.ts apps/api/src/main.ts
git commit -m "feat(realtime): expose cluster-safe global SSE stream`n`nCo-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

### Task 3: Write atomic Source and Marketplace events

**Files:**
- Modify: `apps/api/src/modules/source/repository.ts`
- Modify: `apps/api/src/modules/source/routes.ts`
- Modify: `apps/api/src/modules/source/routes.test.ts`
- Modify: `apps/api/src/modules/agents/repository.ts`
- Modify: `apps/api/src/modules/agents/routes.ts`
- Modify: `apps/api/src/modules/playbook/repository.ts`
- Modify: `apps/api/src/modules/playbook/routes.ts`
- Test: repository tests adjacent to the affected modules

**Interfaces:**
- Consumes: `RealtimeEventWriter` from Task 1.
- Produces: `source.changed` and `marketplace.changed` events for every
  affected owner/clone target.

- [ ] **Step 1: Extend repository database types**

Each affected `*Db` type must include `realtimeEvent`; each repository
constructor receives a `RealtimeEventWriter`. For every mutation, use:

```ts
await this.db.$transaction(async (tx) => {
  const changed = await tx.source.update(/* existing mutation */);
  await this.realtime.append(tx, {
    userId: changed.ownerUserId,
    topic: 'source.changed',
    entityId: changed.id
  });
  return changed;
});
```

Use the same transaction callback for create, update, delete, share, publish,
unpublish and clone. For delete, fetch `ownerUserId` before deleting inside the
transaction and append before commit. For a clone, append `source.changed` and
`marketplace.changed` to the cloning user only when `cloned === true`.

- [ ] **Step 2: Add route/repository tests**

Extend the existing in-memory source fake with a recording
`RealtimeEventWriter`. Assert:

```ts
it('emits source.changed for a newly created source owner', async () => {
  await app.inject({ method: 'POST', url: '/api/sources', headers: auth, payload });
  expect(events).toContainEqual(expect.objectContaining({
    userId: TEST_USER_ID, topic: 'source.changed'
  }));
});

it('emits source.changed and marketplace.changed after a successful marketplace clone', async () => {
  // assert both topics target the clone requester
});
```

For Agent/Playbook source marketplace clones, assert their resource topic
(`marketplace.changed`) and the cloned-resource owner event. Do not emit events
on failed validation, access-denied, not-found, or already-cloned requests.

- [ ] **Step 3: Implement Agent and Playbook marketplace events**

Apply the exact transaction pattern to:

- Agent create/update/delete/publish/unpublish/marketplace clone.
- Playbook create/update/delete/publish/unpublish/marketplace clone.

Use `marketplace.changed` for publication lifecycle and clone actions; use the
resource's own change topic only where a visible user-owned list exists.

- [ ] **Step 4: Run focused tests**

```powershell
cd apps/api
npx vitest run src/modules/source/routes.test.ts src/modules/agents/routes.test.ts src/modules/playbook/routes.test.ts
```

Expected: all selected tests pass, including new event assertions.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/modules/source apps/api/src/modules/agents apps/api/src/modules/playbook
git commit -m "feat(realtime): publish source and marketplace changes atomically`n`nCo-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

### Task 4: Write atomic Run, Report, and Discussion events

**Files:**
- Modify: `apps/api/src/modules/runs/prisma-run-store.ts`
- Modify: `apps/api/src/modules/reports/repository.ts`
- Modify: `apps/api/src/modules/discussion/repository.ts`
- Modify: `apps/api/src/modules/discussion/orchestrator.ts`
- Modify: `apps/api/src/main.ts`
- Test: `apps/api/src/modules/runs/prisma-run-store.test.ts`
- Test: `apps/api/src/modules/reports/repository.test.ts`
- Test: `apps/api/src/modules/discussion/repository.test.ts`

**Interfaces:**
- Consumes: `RealtimeEventWriter`.
- Produces: owner-targeted `run.changed`, `report.changed`, and
  `discussion.changed` events.

- [ ] **Step 1: Add failing producer tests**

Add assertions that:

```ts
// PrismaRunStore: claim, phase and completion emit run.changed for Agent.ownerUserId.
// ReportRepository.saveRunReport emits report.changed for Agent.ownerUserId.
// DiscussionRepository.createRun/updateRun/createTurn emits discussion.changed
// for Discussion.ownerUserId.
```

Use fake transactions that record operation order. Assert domain write then
`realtimeEvent.create` happen through the same `tx` object. Assert no event is
created when the domain operation throws.

- [ ] **Step 2: Implement Run and Report transaction wrappers**

Extend `RunDb` with `agent` and `realtimeEvent`. In each state-changing run
method, resolve the run's `agent.ownerUserId`, update the run, then append
`run.changed` in one `$transaction` callback.

Extend `ReportDb` with `agent` and `$transaction`. In `saveRunReport`, create
the report and append `report.changed` for the owning agent user in the same
transaction. Preserve the current `include` shape passed to `toRecord`.

- [ ] **Step 3: Implement Discussion producer events**

Extend `DiscussionDb` with `realtimeEvent`; make `createRun`, `updateRun`,
`createTurn`, `updateTurnAudioUrl`, and `setRunEvidenceSnapshot` use a
transaction that resolves `Discussion.ownerUserId` via the run/discussion and
appends `discussion.changed` with the discussion ID.

Do not change orchestrator business flow. It already calls repository methods;
the repository boundary guarantees every visible run/turn/status transition
emits an event across worker processes.

- [ ] **Step 4: Wire writer constructors**

In `main.ts`, pass the shared `RealtimeEventRepository` into
`PrismaRunStore`, `ReportRepository`, and `DiscussionRepository`. Update all
test fakes and constructor calls with a no-op/recording writer.

- [ ] **Step 5: Run focused tests**

```powershell
cd apps/api
npx vitest run src/modules/runs/prisma-run-store.test.ts src/modules/reports/repository.test.ts src/modules/discussion/repository.test.ts src/modules/discussion/routes.test.ts
```

Expected: all selected tests pass.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/modules/runs apps/api/src/modules/reports apps/api/src/modules/discussion apps/api/src/main.ts
git commit -m "feat(realtime): publish run report and discussion changes atomically`n`nCo-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

### Task 5: Add the single browser realtime provider

**Files:**
- Create: `apps/web/src/api/realtime.ts`
- Create: `apps/web/src/realtime/cursor.ts`
- Create: `apps/web/src/realtime/cursor.test.ts`
- Create: `apps/web/src/context/RealtimeContext.tsx`
- Modify: `apps/web/src/context/AppDataContext.tsx`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Produces:

```ts
export type RealtimeTopic =
  | 'source.changed' | 'marketplace.changed' | 'run.changed'
  | 'report.changed' | 'discussion.changed';
export interface RealtimeChange { id: number; topic: RealtimeTopic; entityId: string | null; createdAt: string; }
export function useRealtimeSubscription(
  topics: readonly RealtimeTopic[],
  handler: (change: RealtimeChange | { topic: 'resync' }) => void
): void;
```

- [ ] **Step 1: Write pure cursor tests**

`cursor.test.ts` must cover:

```ts
expect(cursorStorageKey('user-1')).toBe('chattrader:realtime-cursor:user-1');
expect(readCursor(storage, 'user-1')).toBe(42); // valid persisted decimal
expect(readCursor(storage, 'user-1')).toBe(0);  // malformed, negative, absent
expect(streamUrl('user-1', 42)).toBe('/api/realtime/stream?cursor=42');
```

Use an injected `Storage`-shaped fake; never access `window.localStorage` at
module evaluation time.

- [ ] **Step 2: Implement cursor and EventSource helpers**

`api/realtime.ts` owns DTO parsing. Reject malformed event JSON and unknown
topics rather than dispatching them.

`cursor.ts` exports `cursorStorageKey`, `readCursor`, and `writeCursor`.
`writeCursor` must only advance a cursor; it must never overwrite a higher
stored ID with a lower event ID.

- [ ] **Step 3: Implement RealtimeContext**

`RealtimeProvider` uses `useAuth().user?.id`. When absent, close any stream and
clear subscriptions. When present:

1. Read the user's persisted cursor.
2. Create one `EventSource(streamUrl(cursor), { withCredentials: true })`.
3. Listen for `change`; parse, persist its ID, dispatch to matching topic
   subscribers.
4. Listen for `resync`; dispatch `{ topic: 'resync' }` to all subscribers.
5. On `error`, set `reconnecting=true` but **do not close** EventSource.
   Clear the indicator on the next valid `change` or `resync`.
6. Close only on provider unmount, logout, or user change.

Implement `useRealtimeSubscription` with a ref for the latest handler and a
stable subscription effect so page re-renders do not reconnect the stream.

- [ ] **Step 4: Refresh global app data by topic**

Extract `refreshMarketplace()` in `AppDataContext` from its current inline
initial-load code and expose it. Inside `RealtimeProvider` (nested inside
`AppDataProvider`) subscribe:

```ts
['source.changed']      => refreshSources()
['marketplace.changed'] => refreshMarketplace()
```

Keep `refreshAgents` and `refreshPlaybooks` available for Task 6. Mount:

```tsx
<AppDataProvider>
  <RealtimeProvider>
    <AppShell><AnimatedRoutes /></AppShell>
  </RealtimeProvider>
</AppDataProvider>
```

- [ ] **Step 5: Test and build**

Run:

```powershell
cd apps/web
npx vitest run src/realtime/cursor.test.ts
npm run build
```

If this frontend package has no `test` script, run its configured Vitest binary
only when available; do not add a new test runner. The build must pass.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/api/realtime.ts apps/web/src/realtime apps/web/src/context apps/web/src/App.tsx
git commit -m "feat(web): add persistent global realtime SSE provider`n`nCo-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

### Task 6: Migrate pages and bound source-search results

**Files:**
- Modify: `apps/web/src/pages/AgentsPage.tsx`
- Modify: `apps/web/src/pages/DiscussionDetail.tsx`
- Delete: `apps/web/src/hooks/useAgentStream.ts`
- Delete: `apps/web/src/hooks/useDiscussionStream.ts`
- Modify: `apps/web/src/components/SourceSearchPicker.tsx`
- Modify: `apps/web/src/i18n/locales/en.json`
- Modify: `apps/web/src/i18n/locales/de.json`

**Interfaces:**
- Consumes: `useRealtimeSubscription` from Task 5.
- Produces: no resource-specific EventSource connections or source detail
  interval polling.

- [ ] **Step 1: Replace AgentsPage streams**

Remove `useAgentStream` and retain the existing REST loaders for runs/reports.
Subscribe to `run.changed` and `report.changed`; if `entityId` belongs to the
selected/execution agent, reload its runs/reports and preserve existing bell
notification behavior. Replace the five-second
`setSourceDetailRefreshKey` interval with a `source.changed` subscription that
refreshes only the selected source detail.

Do not refetch on unrelated user events; compare entity IDs before running
loaders.

- [ ] **Step 2: Replace DiscussionDetail stream**

Remove `useDiscussionStream`. Subscribe to `discussion.changed`; when the
event entity is the displayed `discussionId`, reload the current run with
`getDiscussionRun` and merge turns by turn ID/index. Retain the current
loading/error/done UI states based on the fetched run status. A `resync`
performs the same refresh once.

- [ ] **Step 3: Bound picker results**

In `SourceSearchPicker.tsx`, keep the input and fallback outside the result
container. Wrap both the mapped search results and mapped suggestions in:

```tsx
<div
  className="max-h-[min(22rem,calc(100vh-24rem))] space-y-2 overflow-y-auto overscroll-contain pr-1"
  aria-live="polite"
>
  {/* ResultCard list */}
</div>
```

Keep alert/no-results text above the internal scroller. Add i18n keys only if
an accessible region label is introduced; keep EN/DE key sets identical.

- [ ] **Step 4: Build**

```powershell
cd apps/web
npm run build
```

Expected: build succeeds. Manually verify: six suggestions or a long search
list scroll only within the picker; library modal footer and wizard submit
action remain visible.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/pages/AgentsPage.tsx apps/web/src/pages/DiscussionDetail.tsx apps/web/src/components/SourceSearchPicker.tsx apps/web/src/hooks apps/web/src/i18n/locales
git commit -m "feat(web): consume unified realtime events and contain source results`n`nCo-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

### Task 7: Remove legacy streams and verify production transport

**Files:**
- Modify: `apps/api/src/modules/agent-prompts/routes.ts`
- Modify: `apps/api/src/modules/discussion/routes.ts`
- Modify: related route tests
- Modify: `deploy/nginx.conf`
- Modify: `deploy/README.md`

**Interfaces:**
- Consumes: global endpoint from Task 2.
- Produces: one production SSE transport path only.

- [ ] **Step 1: Remove legacy SSE endpoints and tests**

Delete `/api/agents/:agentId/stream` from agent-prompts routes and
`/api/discussions/:id/runs/:runId/stream` from discussion routes. Delete only
their stream-specific tests; retain all REST route tests. Ensure no frontend
imports reference either removed hook/URL.

- [ ] **Step 2: Make nginx stream handling explicit**

Place this location before the generic `/api/` location:

```nginx
location = /api/realtime/stream {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Cookie $http_cookie;
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_cache off;
    proxy_read_timeout 1h;
    proxy_send_timeout 1h;
}
```

Keep the generic `/api/` proxy settings unchanged for REST traffic.

- [ ] **Step 3: Document VPS verification**

In `deploy/README.md`, add exact operational checks:

```bash
# Use a real browser session cookie; expect headers immediately and ': keepalive'
# within 15 seconds when idle.
curl -N --cookie "chattrader_session=<value>" \
  "https://<tunnel-host>/api/realtime/stream?cursor=0"
```

Document the two-tab browser acceptance test: create/clone a source, trigger a
run/report, and start a discussion in tab A; confirm the affected view in tab B
updates without reload.

- [ ] **Step 4: Run full validation**

```powershell
cd apps/api
npx vitest run
cd ../web
npm run build
```

Expected: API suite and web build pass. Also run `git diff --check`.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/modules/agent-prompts/routes.ts apps/api/src/modules/discussion/routes.ts apps/api/src/modules/agent-prompts apps/api/src/modules/discussion deploy/nginx.conf deploy/README.md
git commit -m "fix(realtime): retire legacy streams and harden production proxy`n`nCo-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

### Task 8: Correct Library report cards and expose agent management in details

**Files:**
- Modify: `apps/api/src/modules/reports/repository.ts`
- Modify: `apps/api/src/modules/source/routes.ts`
- Modify: `apps/api/src/modules/source/routes.test.ts`
- Modify: `apps/web/src/api/sources.ts`
- Modify: `apps/web/src/pages/AgentsPage.tsx`
- Modify: `apps/web/src/i18n/locales/en.json`
- Modify: `apps/web/src/i18n/locales/de.json`
- Test: `apps/api/src/modules/reports/repository.test.ts`
- Test: `apps/web/src/pages/AgentsPage.three-hub.test.tsx`

**Interfaces:**
- Consumes: the source-scoped artifact rule already implemented by
  `ReportRepository.listReportsForSource(sourceValue)`.
- Produces:

```ts
// apps/api/src/modules/reports/repository.ts
countReportsForSourceValues(sourceValues: string[]): Promise<Record<string, number>>;

// apps/api/src/modules/source/routes.ts response addition
type SourceRecordWithReportCount = SourceRecord & { reportCount: number };
```

`SourceRecord.reportCount` is an optional `number` in the web API type until
all deployments have the new response, and card UI treats missing as `0`.

- [ ] **Step 1: Write the failing count tests**

In `apps/api/src/modules/reports/repository.test.ts`, add a test for a new
batched method. Build report rows with artifacts whose `payloadJson` contains
the same evidence shape as the existing source-scoped test:

```ts
it('counts each report only for source values referenced by its evidence artifacts', async () => {
  const result = await repository.countReportsForSourceValues([
    'https://example.com/feed-a.xml',
    'https://example.com/feed-b.xml'
  ]);

  expect(result).toEqual({
    'https://example.com/feed-a.xml': 2,
    'https://example.com/feed-b.xml': 1
  });
});
```

The fixture must include an unrelated report owned by one of the same agents;
assert it is absent from both counts. Include a report with two matching
artifacts for `feed-a` and assert it contributes `1`, not `2`.

In `apps/api/src/modules/source/routes.test.ts`, use a recording
`reportRepository` fake:

```ts
it('adds source-scoped report counts to the library list', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/sources', headers: authCookieHeader() });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: sourceA.id, reportCount: 2 }),
    expect.objectContaining({ id: sourceB.id, reportCount: 0 })
  ]));
  expect(countReportsForSourceValues).toHaveBeenCalledWith([
    sourceA.value, sourceB.value
  ]);
});
```

Also assert that an absent `reportRepository` returns `reportCount: 0` rather
than failing the library endpoint.

- [ ] **Step 2: Implement the batched source-report counter**

Add this narrow capability to `ReportRepository`:

```ts
async countReportsForSourceValues(sourceValues: string[]): Promise<Record<string, number>> {
  const counts = Object.fromEntries(sourceValues.map((value) => [value, 0]));
  if (sourceValues.length === 0) return counts;

  const rows = await this.db.agentRunReport.findMany({
    where: {
      agentRun: {
        artifacts: {
          some: { payloadJson: { contains: '"sourceId":' } }
        }
      }
    },
    select: {
      id: true,
      agentRun: {
        select: {
          artifacts: { select: { payloadJson: true } }
        }
      }
    }
  });

  const requested = new Set(sourceValues);
  for (const report of rows) {
    const reportSourceValues = new Set<string>();
    for (const artifact of report.agentRun.artifacts) {
      const match = artifact.payloadJson.match(/"sourceId"\s*:\s*"((?:\\.|[^"])*)"/);
      if (!match) continue;
      try {
        const value = JSON.parse(`"${match[1]}"`) as unknown;
        if (typeof value === 'string' && requested.has(value)) reportSourceValues.add(value);
      } catch {
        // Malformed legacy artifact JSON cannot identify a source and is ignored.
      }
    }
    for (const value of reportSourceValues) counts[value] += 1;
  }
  return counts;
}
```

Extend `ReportDb` to permit the nested `agentRun.artifacts` selection. Keep
`listReportsForSource` unchanged: it remains the detail-view source of truth.

- [ ] **Step 3: Attach counts to `GET /api/sources`**

Extend `SourceScopedReportRepositoryLike`:

```ts
countReportsForSourceValues(sourceValues: string[]): Promise<Record<string, number>>;
```

Replace the current `GET /api/sources` success branch with:

```ts
const rows = await deps.sourceRepository.listSources(req.userRole === 'admin' ? undefined : req.userId!);
const counts = deps.reportRepository
  ? await deps.reportRepository.countReportsForSourceValues(rows.map((source) => source.value))
  : {};
return reply.status(200).send(rows.map((source) => ({
  ...source,
  reportCount: counts[source.value] ?? 0
})));
```

Update every route-test fake with `countReportsForSourceValues: vi.fn(async () => ({}))`
where it supplies `reportRepository`.

- [ ] **Step 4: Run API tests**

```powershell
cd apps/api
npx vitest run src/modules/reports/repository.test.ts src/modules/source/routes.test.ts
```

Expected: focused report and source suites pass, including source count,
unrelated-report exclusion, duplicate-artifact dedupe, and no-repository
fallback assertions.

- [ ] **Step 5: Update frontend source type and card rendering**

In `apps/web/src/api/sources.ts`, add to `SourceRecord`:

```ts
reportCount?: number;
```

In the Library card loop in `AgentsPage.tsx`, delete:

```ts
const cardAgentIds = new Set(cardAgentLinks.map(({ agent }) => agent.id));
const cardReports = feedReports.filter((report) => cardAgentIds.has(report.agentId));
const latestCardReport = cardReports[0];
```

Replace it with:

```ts
const cardReportCount = source.reportCount ?? 0;
const hasCardReports = cardReportCount > 0;
```

Use `hasCardReports` for the card class/icon/arrow and use
`cardReportCount` for `library.openReports` and `library.reportsAvailable`.
Do not show a stale date from another source: replace the secondary line for
the positive case with `t('library.sourceReportsAvailableHint')`.

Add identical locale keys:

```json
// en.json
"sourceReportsAvailableHint": "Open to view reports for this source"

// de.json
"sourceReportsAvailableHint": "Öffnen, um Berichte zu dieser Quelle zu sehen"
```

- [ ] **Step 6: Add the detail-view Agent plus action**

In the selected-source card, add an “Agents” subsection before the tabbed
content. Derive linked agents exactly as the cover card does:

```ts
const linkedAgentLinks = linkedPlaybooks
  .map((playbook) => {
    const agent = agents.find((candidate) => candidate.id === playbook.agentId);
    return agent ? { playbook, agent } : null;
  })
  .filter((link): link is { playbook: PlaybookRecord; agent: AgentSummary } => Boolean(link));
```

Render the linked agents with the existing cover-card avatar, tooltip and
owner-only remove `Popconfirm`. Reuse:

```tsx
onConfirm={() => void onRemoveAgentFromSource(playbook, selectedSource.id)}
```

Then render the same plus button:

```tsx
<TouchSafeTooltip title={t('library.addAgent')}>
  <Button
    type="dashed"
    shape="circle"
    size="large"
    aria-label={t('library.addAgent')}
    icon={<PlusOutlined />}
    onClick={(event) => onFollowSource(selectedSource, event)}
  />
</TouchSafeTooltip>
```

`onFollowSource` already preselects this source and all linked agents, so no
new assignment state or API is required.

- [ ] **Step 7: Make the analysis action explicit**

Change the header action label from `t('library.runAnalysisNow')` to a new
locale key. Use:

```json
// en.json
"analyzeNewContent": "Analyze new content",
"analyzeNewContentHelp": "Analyzes the newest items for this source that have not been processed yet. To analyze one specific episode, use its play button in the Episodes tab."

// de.json
"analyzeNewContent": "Neue Inhalte analysieren",
"analyzeNewContentHelp": "Analysiert die neuesten noch nicht verarbeiteten Inhalte dieser Quelle. Für eine bestimmte Episode den Play-Button im Tab „Episoden“ verwenden."
```

Wrap the header button in `TouchSafeTooltip` with
`title={t('library.analyzeNewContentHelp')}`. Keep its callback exactly:

```tsx
onClick={() => void onRunSourceEpisode(undefined)}
```

This preserves the current `latest_only` behavior. Do not change the
per-episode button, which passes `{ title, link, pubDate }` and therefore
forces that episode.

- [ ] **Step 8: Add and run frontend tests**

In `AgentsPage.three-hub.test.tsx`, add assertions that a source with
`reportCount: 0` renders `library.noReportsYet`, while one with
`reportCount: 2` renders `2 reports available`; the fixture must give both
sources the same linked agent to prevent the former bug from passing by
accident.

Add a test that opens a source detail, clicks the `library.addAgent`
aria-label, and asserts the existing follow wizard shows the source title and
the linked agent selected.

Run:

```powershell
cd apps/web
npx vitest run src/pages/AgentsPage.three-hub.test.tsx
npm run build
```

If the web project has no available Vitest executable, do not add one; run
`npm run build` and record the unavailable test command.

- [ ] **Step 9: Commit**

```powershell
git add apps/api/src/modules/reports/repository.ts apps/api/src/modules/reports/repository.test.ts apps/api/src/modules/source/routes.ts apps/api/src/modules/source/routes.test.ts apps/web/src/api/sources.ts apps/web/src/pages/AgentsPage.tsx apps/web/src/pages/AgentsPage.three-hub.test.tsx apps/web/src/i18n/locales/en.json apps/web/src/i18n/locales/de.json
git commit -m "fix(library): scope report cards and manage agents in details`n`nCo-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

## Plan Review

- **Spec coverage:** Tasks 1–4 implement durable event storage and all producer
  topics; Task 2 implements cursor, heartbeat, resync, cleanup and SSE headers;
  Tasks 5–6 implement one client stream, persisted cursor, topic refreshes,
  legacy-hook migration, and contained picker results; Task 7 handles explicit
  nginx behavior, removal, tests and VPS verification.
- **Library coverage:** Task 8 adds the batched source-scoped card count,
  detail agent-plus flow, and explicit latest-content analysis wording from
  the approved Library extension.
- **No placeholder scan:** no deferred requirements or unspecified error paths
  remain; invalid cursors, stale cursors, disconnects, mutation failures, and
  cleanup failures have explicit behavior.
- **Type consistency:** backend `RealtimeTopic` literals are mirrored in the
  frontend DTO, and all producers/consumers use the same five topics.
