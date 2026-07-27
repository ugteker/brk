# Source-first domain model: Playbook/Run/Report ownership redesign

## Context

Today `Playbook` has a many-to-many relation to `Source` via a `PlaybookSource` join
table, and `AgentRun`/`AgentRunReport` only carry `agentId` + optional `playbookId` — they
have no direct link to a `Source` at all. Source attribution for a report is done by
string-matching `"sourceId":"<value>"` inside `AgentRunArtifact.payloadJson`
(`apps/api/src/modules/reports/repository.ts:135-155`, `listReportsForSource`/
`countReportsForSourceValues`) — a workaround, not a real relationship. The consequence
(reported by the user): attaching an agent to a new source can surface playbooks/runs/
reports that were actually created for a *different* source the same playbook happens to
be linked to.

Investigation found the actual behavior already leans this direction — the frontend
wizard only ever reads `playbookSourceIdsDraft[0]` (`apps/web/src/pages/AgentsPage.tsx`,
7+ call sites), and `Playbook.executionMode`/`maxSourcesPerRun` are stored but **never
read** by `agent-runner.ts` — so multi-source-per-playbook is legacy/vestigial, not an
active feature. This makes the redesign lower-risk than it first appears: we're mostly
codifying what the code already assumes, not tearing out live multi-source behavior.

Target model (confirmed with user):
- `Source` 1─▶M `Playbook` (direct `sourceId` FK on `Playbook`, `PlaybookSource` dropped).
- Unique `(agentId, sourceId)` on `Playbook` — one playbook per agent+source pair. Editing
  re-attaches by updating the existing playbook's schedule; detaching **deletes** the
  playbook row.
- `Source` 1─▶M `AgentRun` and `Source` 1─▶M `AgentRunReport` (direct `sourceId` FK on
  both), replacing the artifact-payload string-match.
- `AgentRun`/`AgentRunReport` keep their `agentId` FK.
- `AgentRun` ↔ `AgentRunReport` stay 1:1 (already true via `AgentRunReport.agentRunId
  @unique` + Prisma's implicit back-relation) — no change needed there.
- Multiple runs against the same source already works today (`AgentRun` unique key is
  `(agentId, scheduledFor)`, not per-playbook) — unaffected.
- Dev data is disposable: this ships as a clean schema rewrite, not a data migration.

## Schema changes (`apps/api/prisma/schema.prisma`)

- **Drop** `model PlaybookSource` entirely.
- **`Playbook`**: replace the `sources PlaybookSource[]` relation with `sourceId String`
  + `source Source @relation(fields: [sourceId], references: [id], onDelete: Restrict)`.
  Add `@@unique([agentId, sourceId])`. Remove `executionMode` and `maxSourcesPerRun`
  columns — confirmed dead (stored, never read in `agent-runner.ts`).
- **`Source`**: replace `playbooks PlaybookSource[]` with `playbooks Playbook[]`.
- **`AgentRun`**: add `sourceId String` + `source Source @relation(..., onDelete:
  Restrict)`. Change `playbook Playbook? @relation(..., onDelete: Restrict)` →
  `onDelete: SetNull` (deleting a playbook must not be blocked by its run history).
- **`AgentRunReport`**: add `sourceId String` + `source Source @relation(...,
  onDelete: Restrict)`.
- **`AccessGrant.playbookId`** and **`MarketplacePublication.playbookId`**: change
  `onDelete: Restrict` → the delete-playbook flow below explicitly clears these first, so
  either `SetNull` (grant/publication becomes orphaned-but-visible — wrong, a grant to a
  deleted playbook is meaningless) or keep `Restrict` and have `deletePlaybook` actively
  delete grants + retire/delete publications in the same transaction before deleting the
  playbook. **Recommend the latter** (explicit cleanup in the transaction, keep `Restrict`
  as a safety net against future code paths forgetting the cleanup).

## Backend changes

- **`apps/api/src/modules/playbook/types.ts`**: `CreatePlaybookInput.sourceIds: string[]`
  → `sourceId: string`; same for `UpdatePlaybookInput`, `Playbook`. Drop
  `executionMode`/`maxSourcesPerRun` from all three.
- **`apps/api/src/modules/playbook/repository.ts`**:
  - `mapPlaybook`: `sourceIds: row.sources.map(...)` → `sourceId: row.sourceId`.
  - `createPlaybook`: replace the `sources: { create: [...] }` nested-write with a plain
    `sourceId: input.sourceId` column, guarded by a friendly `already_exists` error if the
    `(agentId, sourceId)` unique constraint trips (translate the Prisma P2002 error —
    surfaces as "this agent is already attached to this source, edit its schedule
    instead").
  - `updatePlaybook`: drop the `playbookSource.deleteMany`/`createMany` block entirely
    (source is immutable after creation — changing source should mean delete + recreate,
    matching the detach/reattach semantics the user described).
  - `deletePlaybook`: within the transaction, delete `AccessGrant` rows and retire/delete
    `MarketplacePublication` rows where `playbookId = playbookId`, *then* delete the
    playbook. `AgentRun.playbookId` no longer blocks this (`SetNull` from the schema
    change).
  - `listPlaybooks`/`getPlaybook`: drop the `sources: { orderBy... }` include, `select`/
    `include` the direct `source` relation instead (or just the scalar `sourceId`).
- **`apps/api/src/modules/playbook/routes.ts`**: `sourceIds` array validation (lines
  ~104-105, ~189-191) → single `sourceId: string` validation. Drop `executionMode`
  validation (~line 111).
- **`apps/api/src/modules/playbook/run-trigger-factory.ts`**: pass `sourceId:
  playbook.sourceId` into `AgentRunOptions`.
- **`apps/api/src/modules/runs/prisma-run-store.ts`**:
  - `getDueSchedules`: `select` `sourceId` alongside `agentId`/`agentVersionId`, return it
    in the mapped shape.
  - `upsertQueuedRun(agentId, scheduledFor, playbookId?, agentVersionId?)` → add a
    `sourceId` param, write it into `agentRun.create`'s `data`.
  - `claimNextQueuedRun`: `select` `sourceId` on the claimed row (it's a plain column now,
    no join needed), include it in the returned `AgentRunRecord`.
  - This is the single choke point for `AgentRun` creation (confirmed both scheduled runs
    and `ManualRunTrigger` funnel through `upsertQueuedRun`) — one change point.
- **`apps/api/src/modules/analysis/agent-runner.ts`**:
  - `AgentRunOptions`: add `sourceId?: string` (present whenever `playbookId` is present).
  - `collectPlaybookEvidence`: collapses from "loop over `listPlaybookSources(playbookId)`"
    to a single lookup — call `ingestionRepository.listUnconsumed(playbookId, sourceId,
    maxItemsPerSource)` directly (no more per-source loop, no `forcedEpisode` filtering
    across multiple candidate sources since there's only one). Simplifies this method
    substantially.
  - `run()`: thread `sourceId` into the `artifactRepository.saveArtifact` call (evidence
    blocks already carry `sourceId` on the `EvidenceBlock` itself — keep that, it's
    correct and now redundant-but-harmless with the new run-level FK) and into
    `reportRepository.saveRunReport`.
  - `ingestionRepository.listPlaybookSources` becomes unused by this file — check no other
    caller depends on it before removing it from the interface (grep first).
- **`apps/api/src/modules/reports/repository.ts`**:
  - `CreateRunReportInput`: add `sourceId: string`; `saveRunReport`'s `agentRunReport.create`
    writes it directly.
  - `listReportsForSource(sourceValue)` → replace the artifact-payload string-match with
    `this.db.agentRunReport.findMany({ where: { sourceId } , ... })`. **Note the param
    changes from `sourceValue: string` (the source's URL/value) to `sourceId: string` (the
    source's primary key)** — check `apps/api/src/modules/source/routes.ts:110` and any
    other caller to see whether they currently pass `.value` and need to switch to `.id`.
  - `countReportsForSourceValues` → same treatment, becomes a plain `groupBy`/`count` on
    `sourceId IN (...)`, dropping the JSON-parsing fallback entirely.
  - Add `listRunsForSource(sourceId)` (new, mirrors `listReportsForSource`) if the Source
    detail page's Runs tab needs it — check `apps/web/src/pages/AgentsPage.tsx`'s
    `sourceDetailRuns` state / whatever currently populates it before deciding this is
    needed.
- **`apps/api/src/modules/source/ingestion-repository.ts`**: after confirming no other
  caller needs it, remove `listPlaybookSources`/`PlaybookSourceRecord` (dead once
  `agent-runner.ts` stops calling it).

## Frontend changes (`apps/web/src`)

Blast radius is smaller than it looks — the wizard already behaves as one-source-per-
playbook in practice (only ever reads index `[0]` of the array), so this is mostly type
cleanup, not a UX redesign:

- **`apps/web/src/api/playbooks.ts`**: `PlaybookRecord.sourceIds: string[]` →
  `sourceId: string` (and same for `CreatePlaybookPayload`/`UpdatePlaybookPayload`). Drop
  `maxSourcesPerRun`/`executionMode`.
- **`apps/web/src/pages/AgentsPage.tsx`**: `playbookSourceIdsDraft: string[]` →
  `playbookSourceIdDraft: string | null`; update the ~10 call sites currently doing
  `playbookSourceIdsDraft[0]` / `playbookSourceIdsDraft.length` / passing the array to
  `createPlaybook`/`updatePlaybook` to use the scalar directly. `unlinkPlaybookFromSources`
  simplifies (no more "unlink specific sources from a playbook" — it's just `deletePlaybook`
  now, since source is immutable per playbook).
- No change needed to the multi-select (`mode="multiple"`) UI pieces found — those are for
  days-of-week and recipient emails, unrelated to source selection.
- **`apps/web/src/api/agents.ts`**: if `RunReportDto`/`RunDetailDto` should surface
  `sourceId` (e.g. for the Feed tab's existing playbook→source lookup dance in
  `FeedTab.tsx`, which today derives source via `playbook.sourceIds[0]` — check this
  becomes `playbook.sourceId` directly, likely simplifying `FeedTab.tsx`'s lookup logic
  slightly), add the field; otherwise leave as-is since the source detail page already
  gets reports via the (now-fixed) `listReportsForSource` endpoint.

## Migration strategy

Dev data is disposable (per user decision) — no data-preserving migration script. Approach:
1. Edit `schema.prisma` as above.
2. Delete the dev SQLite DB (`apps/api/dev.db*`) and any leftover Prisma migration lock
   conflicts, then `npx prisma migrate dev --name source_first_relations` to generate a
   fresh migration and re-create the dev DB from scratch.
3. Re-seed via the existing `POST /api/admin/seed-demo` admin action if needed for manual
   testing.

## Test updates

`apps/api/src/modules/playbook/repository.test.ts`, `routes.test.ts`,
`run-trigger-factory.test.ts` all construct fixtures with `sourceIds: ['source-1', ...]`
(some with 2 sources, e.g. `routes.test.ts:284`) — these need updating to `sourceId:
'source-1'` and any "multiple sources on one playbook" test case either deleted or
rewritten as "two playbooks, one per source, same agent". `apps/api/src/modules/reports/
repository.test.ts` needs new/updated cases for `listReportsForSource` against the real FK
instead of artifact-payload matching.

## Verification

1. `npx tsc --noEmit` in both `apps/api` and `apps/web` — catches every call site the type
   changes above touch (this is a very effective safety net for this kind of rename, given
   how far `sourceIds`/`sourceId` propagates).
2. `npm run test:api` — playbook/reports/runs suites must pass after fixture updates.
3. Manual smoke test via `npm run dev` (api + web): create a source, attach an agent
   (creates a playbook), trigger a manual run, confirm the report shows up under that
   source's detail view and *not* under an unrelated source. Then attach a second agent to
   the same source, confirm two playbooks exist and both sets of runs/reports stay scoped
   to that one source. Then detach one agent, confirm its playbook is gone but its past
   runs/reports still exist (now with `playbookId: null`) and still show up under the
   source.
4. `npm run build:api && npm run build:web` — full build must stay green.
