# API Multi-Process Scaling (Cluster + SQLite WAL)

**Date:** 2026-07-22
**Status:** Approved

## Problem

The API runs as a single Node.js process. One CPU-heavy or slow request blocks all
other users. Goal: serve multiple concurrent users with higher throughput —
proactively, before load becomes a problem. Constraint: keep SQLite (no Postgres
migration).

## Decision

Use `node:cluster` to run multiple HTTP worker processes sharing port 3000, split
background work (scheduler loops) into a dedicated role so it runs exactly once,
and harden SQLite for multi-process access with WAL + busy_timeout.

## Design

### 1. Process model

New environment variables:

| Variable | Values | Default | Meaning |
| --- | --- | --- | --- |
| `WEB_CONCURRENCY` | integer ≥ 1 | `1` | Number of HTTP worker processes |
| `ROLE` | `web` \| `worker` \| `all` | `all` | What this process runs |

Behavior:

- `WEB_CONCURRENCY=1` (default): everything runs in one process (`ROLE=all`),
  identical to today. Dev setups are unaffected.
- `WEB_CONCURRENCY>1`: a small cluster bootstrap (primary process) forks
  N processes with `ROLE=web` **plus exactly one** process with `ROLE=worker`.
  The primary monitors children and respawns any that exit unexpectedly.

Role gating inside `main.ts`:

- `ROLE=web` or `all`: `app.listen(...)` (HTTP server).
- `ROLE=worker` or `all`: `startSchedulerLoop`, the discussion-scheduler
  `setInterval`, and the admin bootstrap. These must run in exactly one process —
  duplicating them would enqueue duplicate runs and race the admin-user creation.

The cluster logic lives in a thin bootstrap; the fork decision is computed by a
pure, unit-testable function `planClusterProcesses(env)` returning the list of
child roles to spawn (e.g. `['web', 'web', 'worker']`).

### 2. SQLite hardening

On startup, every process executes once via Prisma:

```sql
PRAGMA journal_mode=WAL;
PRAGMA busy_timeout=5000;
```

- WAL allows concurrent readers alongside a single writer — essential once
  multiple processes access the same database file.
- `journal_mode` is persistent in the database file; `busy_timeout` is
  per-connection, so each process sets it.
- Implemented as `applySqlitePragmas(prisma)` with an injectable Prisma-like
  dependency for testing.

### 3. WAL and Docker volumes

The production database lives on the named Docker volume `api-data` on a single
Hetzner VPS. Named volumes use the `local` driver — the file sits on the host's
local ext4 filesystem under `/var/lib/docker/volumes/`, not on a network drive.
All cluster processes run in the same container on the same kernel. This is
exactly the scenario WAL is designed for.

**Constraint (documented in deployment docs):** WAL is unreliable on network
filesystems (NFS/CIFS/SMB) because it depends on `mmap` of the `-shm` file and
correct POSIX file locking. If the volume is ever moved to network storage, or
multiple containers/hosts point at the same database file, switch to Postgres
instead.

### 4. Deployment

- `docker-compose.yml`: add `WEB_CONCURRENCY: ${WEB_CONCURRENCY:-2}`.
- `apps/api/.env.example`: document `WEB_CONCURRENCY` and `ROLE`.
- Deployment docs: note the NFS/WAL constraint above.

### 5. Why this is safe with the existing queue

- `RunQueueService` is backed by `PrismaRunStore` with `claimNextQueuedRun(workerId)`
  — DB-based claim semantics, already safe across processes.
- `ManualRunTrigger` enqueues + claims + runs synchronously inside the HTTP
  request; since the queue is DB-based this works from any web process.

## Error handling

- Child process crash: primary logs and respawns with the same role.
- WAL pragma failure (e.g. exotic filesystem): log a warning and continue with
  the default journal mode; do not crash the process.

## Testing

- `planClusterProcesses(env)`: pure function unit tests (N web + 1 worker;
  concurrency 1 → single `all`).
- Role gating: extract the "what does this role start" decision into a pure
  function and test it (web → listen only; worker → schedulers only; all → both).
- `applySqlitePragmas`: mock Prisma dependency, assert the executed PRAGMAs and
  that failures are swallowed with a warning.
- Actual `cluster.fork` / `app.listen` calls remain thin, untested glue.

## Out of scope

- Postgres migration.
- `worker_threads` for the analysis pipeline.
- Horizontal scaling across hosts.
