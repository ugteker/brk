# API Multi-Process Scaling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve multiple concurrent users faster by running N HTTP worker processes via `node:cluster`, one dedicated scheduler process, and hardening SQLite with WAL + busy_timeout.

**Architecture:** A pure `runtime/roles.ts` module decides which processes to fork (`planClusterProcesses`) and what each role starts (`rolePlan`). `main.ts` becomes a thin bootstrap: primary forks children with `ROLE=web|worker`; each child runs `start(role)` which gates schedulers vs. `app.listen`. Every process applies SQLite PRAGMAs (`applySqlitePragmas`) on startup. Default `WEB_CONCURRENCY=1` keeps today's single-process behavior.

**Tech Stack:** Node.js `node:cluster` (built-in), Fastify 4, Prisma 6 + SQLite, vitest 2, tsx runtime (ESM, `"type": "module"`).

**Spec:** `docs/superpowers/specs/2026-07-22-api-multiprocess-scaling-design.md`

## Global Constraints

- Keep SQLite — no Postgres, no new dependencies.
- `WEB_CONCURRENCY` default `1` = exactly today's behavior (one process, `ROLE=all`).
- Scheduler loops, digest loop, discussion interval, and admin bootstrap must run in **exactly one** process.
- PRAGMA failure must never crash the process — log a warning and continue.
- Tests: vitest, run from `apps/api` with `npx vitest run <path>`. No real forking/listening in tests.
- Commits: conventional commits with trailer `Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>`.
- All commands below run from `apps/api` unless stated otherwise (repo root: the worktree root).

---

### Task 1: Runtime role logic (`runtime/roles.ts`)

**Files:**
- Create: `apps/api/src/runtime/roles.ts`
- Test: `apps/api/src/runtime/roles.test.ts`

**Interfaces:**
- Consumes: nothing (pure functions over env strings).
- Produces:
  - `type Role = 'web' | 'worker' | 'all'`
  - `parseWebConcurrency(raw: string | undefined): number` — integer ≥ 1, default 1, garbage → 1
  - `resolveRole(raw: string | undefined): Role` — default `'all'`, unknown values → `'all'`
  - `planClusterProcesses(concurrency: number): Role[]` — `1` → `[]` (no forking); `n > 1` → n×`'web'` + 1×`'worker'`
  - `rolePlan(role: Role): { startHttp: boolean; startSchedulers: boolean }`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/runtime/roles.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseWebConcurrency, planClusterProcesses, resolveRole, rolePlan } from './roles';

describe('parseWebConcurrency', () => {
  it('defaults to 1 when unset', () => {
    expect(parseWebConcurrency(undefined)).toBe(1);
  });

  it('parses a positive integer', () => {
    expect(parseWebConcurrency('4')).toBe(4);
  });

  it('falls back to 1 for garbage, zero and negatives', () => {
    expect(parseWebConcurrency('banana')).toBe(1);
    expect(parseWebConcurrency('0')).toBe(1);
    expect(parseWebConcurrency('-2')).toBe(1);
    expect(parseWebConcurrency('2.7')).toBe(1);
  });
});

describe('resolveRole', () => {
  it('defaults to all', () => {
    expect(resolveRole(undefined)).toBe('all');
  });

  it('accepts web and worker', () => {
    expect(resolveRole('web')).toBe('web');
    expect(resolveRole('worker')).toBe('worker');
  });

  it('treats unknown values as all', () => {
    expect(resolveRole('bogus')).toBe('all');
  });
});

describe('planClusterProcesses', () => {
  it('returns no children for concurrency 1 (single-process mode)', () => {
    expect(planClusterProcesses(1)).toEqual([]);
  });

  it('returns n web children plus exactly one worker', () => {
    expect(planClusterProcesses(3)).toEqual(['web', 'web', 'web', 'worker']);
  });
});

describe('rolePlan', () => {
  it('web starts http only', () => {
    expect(rolePlan('web')).toEqual({ startHttp: true, startSchedulers: false });
  });

  it('worker starts schedulers only', () => {
    expect(rolePlan('worker')).toEqual({ startHttp: false, startSchedulers: true });
  });

  it('all starts both', () => {
    expect(rolePlan('all')).toEqual({ startHttp: true, startSchedulers: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api; npx vitest run src/runtime/roles.test.ts`
Expected: FAIL — cannot resolve `./roles`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/runtime/roles.ts`:

```ts
// Pure decision logic for the multi-process runtime: how many processes to
// fork and what each role is responsible for. Kept free of node:cluster /
// Fastify imports so it is trivially unit-testable.

export type Role = 'web' | 'worker' | 'all';

export function parseWebConcurrency(raw: string | undefined): number {
  if (!raw) return 1;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return 1;
  return n;
}

export function resolveRole(raw: string | undefined): Role {
  if (raw === 'web' || raw === 'worker') return raw;
  return 'all';
}

export function planClusterProcesses(concurrency: number): Role[] {
  if (concurrency <= 1) return [];
  return [...Array<Role>(concurrency).fill('web'), 'worker'];
}

export function rolePlan(role: Role): { startHttp: boolean; startSchedulers: boolean } {
  return {
    startHttp: role === 'web' || role === 'all',
    startSchedulers: role === 'worker' || role === 'all'
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api; npx vitest run src/runtime/roles.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/runtime/roles.ts apps/api/src/runtime/roles.test.ts
git commit -m "feat(api): add pure role/cluster planning logic for multi-process runtime

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: SQLite pragmas (`lib/sqlite-pragmas.ts`)

**Files:**
- Create: `apps/api/src/lib/sqlite-pragmas.ts`
- Test: `apps/api/src/lib/sqlite-pragmas.test.ts`

**Interfaces:**
- Consumes: a Prisma-like object with `$queryRawUnsafe(sql: string): Promise<unknown>` (the real `prisma` from `lib/db.ts` satisfies this).
- Produces: `applySqlitePragmas(db: SqlitePragmaClient, log?: { warn(msg: string): void }): Promise<void>` — executes `PRAGMA journal_mode=WAL;` and `PRAGMA busy_timeout=5000;`; on any error logs one warning and resolves normally (never throws).

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/lib/sqlite-pragmas.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { applySqlitePragmas } from './sqlite-pragmas';

describe('applySqlitePragmas', () => {
  it('enables WAL and sets busy_timeout', async () => {
    const executed: string[] = [];
    const db = {
      $queryRawUnsafe: async (sql: string) => {
        executed.push(sql);
        return [];
      }
    };

    await applySqlitePragmas(db);

    expect(executed).toEqual(['PRAGMA journal_mode=WAL;', 'PRAGMA busy_timeout=5000;']);
  });

  it('logs a warning and does not throw when a pragma fails', async () => {
    const warn = vi.fn();
    const db = {
      $queryRawUnsafe: async () => {
        throw new Error('disk I/O error');
      }
    };

    await expect(applySqlitePragmas(db, { warn })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('disk I/O error');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api; npx vitest run src/lib/sqlite-pragmas.test.ts`
Expected: FAIL — cannot resolve `./sqlite-pragmas`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/lib/sqlite-pragmas.ts`:

```ts
import { logger } from './logger';

export interface SqlitePragmaClient {
  $queryRawUnsafe(sql: string): Promise<unknown>;
}

// WAL lets concurrent readers coexist with one writer — required once several
// cluster processes share the same SQLite file. journal_mode is persisted in
// the db file; busy_timeout is per-connection, so every process must set it.
// PRAGMA failures (e.g. exotic filesystems) are non-fatal: we log and keep the
// default journal mode rather than crash the process.
export async function applySqlitePragmas(
  db: SqlitePragmaClient,
  log: { warn(msg: string): void } = logger
): Promise<void> {
  try {
    await db.$queryRawUnsafe('PRAGMA journal_mode=WAL;');
    await db.$queryRawUnsafe('PRAGMA busy_timeout=5000;');
  } catch (err) {
    log.warn(`[db] failed to apply SQLite pragmas (continuing with defaults): ${err instanceof Error ? err.message : String(err)}`);
  }
}
```

Note: `logger` is exported from `apps/api/src/lib/logger.ts` and has a `warn(msg: string)` method (already used across the codebase, e.g. `main.ts`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api; npx vitest run src/lib/sqlite-pragmas.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/sqlite-pragmas.ts apps/api/src/lib/sqlite-pragmas.test.ts
git commit -m "feat(api): add WAL + busy_timeout SQLite pragma bootstrap

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Wire cluster + role gating into `main.ts`

**Files:**
- Modify: `apps/api/src/main.ts` (imports ~line 1-48; `start()` ~line 84; scheduler block lines 236-267; listen line 269; `start();` line 272)

**Interfaces:**
- Consumes: `Role`, `parseWebConcurrency`, `resolveRole`, `planClusterProcesses`, `rolePlan` from `./runtime/roles`; `applySqlitePragmas` from `./lib/sqlite-pragmas`.
- Produces: process entrypoint behavior only (no exports consumed by later tasks).

No unit tests for this task (thin glue per spec); validation = full existing API suite + manual smoke.

- [ ] **Step 1: Add imports**

In `apps/api/src/main.ts`, after line 9 (`import { ensureSqliteSchemaCompatibility, prisma } from './lib/db';`) add:

```ts
import cluster from 'node:cluster';
import { applySqlitePragmas } from './lib/sqlite-pragmas';
import { parseWebConcurrency, planClusterProcesses, resolveRole, rolePlan, type Role } from './runtime/roles';
```

- [ ] **Step 2: Give `start()` a role parameter and apply pragmas**

Change the `start` signature and its first lines (currently `async function start() { await ensureSqliteSchemaCompatibility();`) to:

```ts
async function start(role: Role) {
  const plan = rolePlan(role);
  await ensureSqliteSchemaCompatibility();
  await applySqlitePragmas(prisma);
```

- [ ] **Step 3: Gate the admin bootstrap**

The admin bootstrap must run once (scheduler process). Change line 124:

```ts
  if (plan.startSchedulers) {
    await bootstrapAdminAccount(userRepository);
  }
```

- [ ] **Step 4: Gate schedulers and listen**

Replace the block from `startSchedulerLoop({ intervalMs: 60_000, queue, runner: agentRunner });` (line 236) through `await app.listen({ port: 3000, host: '0.0.0.0' });` (line 269) with the same code wrapped in role guards. The discussion `setInterval` body (lines 240-267) stays byte-identical — only indentation and the surrounding `if` change:

```ts
  if (plan.startSchedulers) {
    startSchedulerLoop({ intervalMs: 60_000, queue, runner: agentRunner });
    startDigestLoop({ store: new PrismaDigestStore(prisma), mailer });

    // Discussion scheduler: check every 60s for scheduled discussions due to run
    setInterval(async () => {
      // ... existing body from lines 241-266, unchanged ...
    }, 60_000);
  }

  if (plan.startHttp) {
    await app.listen({ port: 3000, host: '0.0.0.0' });
  } else {
    logger.info(`[runtime] role=${role}: scheduler-only process (no HTTP listener)`);
  }
```

- [ ] **Step 5: Replace the entrypoint call with cluster bootstrap**

Replace the final line `start();` with:

```ts
function bootstrap() {
  const concurrency = parseWebConcurrency(process.env.WEB_CONCURRENCY);
  const children = planClusterProcesses(concurrency);

  if (children.length > 0 && cluster.isPrimary) {
    logger.info(`[runtime] cluster primary: forking ${concurrency} web process(es) + 1 worker process`);
    const rolesByWorkerId = new Map<number, Role>();
    for (const role of children) {
      const child = cluster.fork({ ...process.env, ROLE: role });
      rolesByWorkerId.set(child.id, role);
    }
    cluster.on('exit', (worker, code, signal) => {
      const role = rolesByWorkerId.get(worker.id) ?? 'web';
      rolesByWorkerId.delete(worker.id);
      logger.warn(`[runtime] ${role} process ${worker.process.pid} exited (code=${code}, signal=${signal}) — respawning`);
      const replacement = cluster.fork({ ...process.env, ROLE: role });
      rolesByWorkerId.set(replacement.id, role);
    });
    return;
  }

  start(resolveRole(process.env.ROLE));
}

bootstrap();
```

Notes for the implementer:
- Forked children re-execute `main.ts`; they hit `cluster.isPrimary === false`, skip the fork branch, and run `start()` with their injected `ROLE`.
- `ROLE=worker` children never call `app.listen`, so only web children share port 3000 (cluster's built-in handle sharing).
- With `WEB_CONCURRENCY` unset/1, `children` is empty → identical single-process behavior as before (`ROLE` default `all`).

- [ ] **Step 6: Typecheck and run the full API test suite**

Run: `cd apps/api; npx tsc --noEmit; npx vitest run`
Expected: no NEW tsc errors (pre-existing errors exist in runs/watchlist test fakes and repository.ts — ignore those); all vitest suites PASS.

- [ ] **Step 7: Smoke test single-process mode**

Run: `cd apps/api; npx tsx --eval "process.env.WEB_CONCURRENCY='1'; import('./src/main.ts');"` — wait ~5s, confirm it boots without error (listens on 3000 or fails only on port-in-use, which is fine), then kill it.
Alternative if a dev server already occupies port 3000: skip and rely on Step 6.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/main.ts
git commit -m "feat(api): cluster bootstrap with web/worker role split and SQLite WAL

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Deployment config + docs

**Files:**
- Modify: `docker-compose.yml` (environment block, lines 20-22)
- Modify: `apps/api/.env.example` (append)
- Modify: `docs/APP-SUMMARY.md` (architecture/deployment section)
- Modify: `deploy/README.md` (add WAL/NFS note)

**Interfaces:**
- Consumes: env var names `WEB_CONCURRENCY`, `ROLE` as implemented in Task 3.
- Produces: documentation only.

- [ ] **Step 1: docker-compose.yml**

In the `environment:` block add:

```yaml
      WEB_CONCURRENCY: ${WEB_CONCURRENCY:-2}
```

- [ ] **Step 2: .env.example**

Append to `apps/api/.env.example`:

```
# Multi-process scaling (optional). Number of HTTP worker processes; 1 (default)
# runs everything in a single process like before. Values > 1 fork N web
# processes sharing port 3000 plus one dedicated scheduler process.
# WEB_CONCURRENCY=2
# Advanced: force a single process to a specific role (web|worker|all).
# Normally set automatically by the cluster bootstrap — leave unset.
# ROLE=all
```

- [ ] **Step 3: Docs**

- `docs/APP-SUMMARY.md`: in the architecture/deployment section, add 2-4 sentences: the API can run as a cluster (`WEB_CONCURRENCY` web processes + 1 scheduler process), SQLite runs in WAL mode with a 5s busy timeout, default is single-process.
- `deploy/README.md`: add a short "SQLite & WAL" note: WAL requires a local filesystem; the named volume `api-data` on the VPS is local, so this is fine — but never move the database onto NFS/CIFS or share it between hosts; that would require migrating to Postgres.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml apps/api/.env.example docs/APP-SUMMARY.md deploy/README.md
git commit -m "docs: document WEB_CONCURRENCY/ROLE and SQLite WAL constraints

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```
