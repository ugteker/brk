# Shared Catalog Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build shared source memberships, immutable agent versions, manual playbooks, and validated offline catalog import/preview tooling.

**Architecture:** Keep `Source`, `Agent`, `AgentPromptVersion`, `Playbook`, and `MarketplacePublication` as the migration anchors. Add user-library memberships, treat `AgentPromptVersion` as the immutable execution snapshot, pin playbooks to versions, and extend marketplace publications with curated-catalog metadata rather than introducing a parallel marketplace.

**Tech Stack:** Node.js, TypeScript, Fastify 4, Prisma 6, SQLite, Vitest, React static preview output.

## Global Constraints

- Nothing is copied into a user account at signup.
- Public sources are canonical and crawled once.
- Every created agent version is immutable; edits create a new version.
- Existing playbooks and reports must retain valid historical references.
- Manual playbooks are excluded from scheduler pickup.
- Catalog import is validated, transactional, idempotent, and non-destructive.
- Missing catalog entries are retired, never deleted.
- Phosphor SVGs are vendored locally; runtime icon fetching is forbidden.
- New user-facing strings must be localized in English and German.
- Commit steps are checkpoints only; run them only after the user explicitly approves commits.

---

### Task 1: Add memberships, immutable version snapshots, and manual playbooks

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260724090000_add_shared_catalog_foundation/migration.sql`
- Modify: `apps/api/src/modules/agents/domain-split-schema.test.ts`
- Modify: `apps/api/src/modules/playbook/types.ts`
- Modify: `apps/api/src/modules/playbook/repository.ts`
- Modify: `apps/api/src/modules/playbook/repository.test.ts`
- Modify: `apps/api/src/modules/runs/prisma-run-store.ts`
- Modify: `apps/api/src/modules/runs/prisma-run-store.test.ts`
- Modify: `apps/api/src/modules/runs/run-queue.service.ts`
- Modify: `apps/api/src/modules/runs/run-queue.service.test.ts`
- Modify: `apps/api/src/modules/runs/manual-run-trigger.ts`
- Modify: `apps/api/src/modules/runs/worker.ts`
- Modify: `apps/api/src/modules/analysis/agent-runner.ts`
- Modify: `apps/api/src/modules/analysis/agent-runner.test.ts`

**Interfaces:**
- Produces: `UserLibrarySource`, `UserLibraryAgent`, immutable metadata on `AgentPromptVersion`, optional `Playbook.agentVersionId`, pinned `AgentRun.agentVersionId`, and `PlaybookScheduleInput = { mode: 'manual' } | ...`.
- Consumes: existing source, agent, prompt-version, playbook, publication, and report rows.

- [ ] **Step 1: Add failing schema assertions**

Add exact assertions to `domain-split-schema.test.ts`:

```ts
expect(schema).toContain('model UserLibrarySource');
expect(schema).toContain('@@unique([userId, sourceId])');
expect(schema).toContain('model UserLibraryAgent');
expect(schema).toContain('@@unique([userId, agentVersionId])');
expect(schema).toContain('agentVersionId String?');
expect(schema).toContain('agentVersion AgentPromptVersion?');
expect(schema).toContain('nextRunAt DateTime?');
expect(schema).toContain('basedOnAgentVersionId String?');
expect(schema).toContain('iconAssetKey String?');
```

- [ ] **Step 2: Run the schema test and verify failure**

Run: `npm --prefix apps/api test -- src/modules/agents/domain-split-schema.test.ts`

Expected: FAIL because the membership and immutable-version fields do not exist.

- [ ] **Step 3: Extend the Prisma schema and migration**

Add these models and relations:

```prisma
model UserLibrarySource {
  id                  String   @id @default(cuid())
  userId              String
  sourceId            String
  displayNameOverride String?
  savedAt             DateTime @default(now())
  source              Source   @relation(fields: [sourceId], references: [id], onDelete: Cascade)

  @@unique([userId, sourceId])
  @@index([userId, savedAt])
}

model UserLibraryAgent {
  id             String             @id @default(cuid())
  userId         String
  agentVersionId String
  savedAt        DateTime           @default(now())
  agentVersion   AgentPromptVersion @relation(fields: [agentVersionId], references: [id], onDelete: Restrict)

  @@unique([userId, agentVersionId])
  @@index([userId, savedAt])
}
```

Extend `AgentPromptVersion` with immutable snapshot fields:

```prisma
name                  String   @default("")
description           String   @default("")
characterType         String   @default("summarizer")
promptConfigJson      String   @default("{}")
iconAssetKey          String?
basedOnAgentVersionId String?
basedOnAgentVersion   AgentPromptVersion?  @relation("AgentVersionDerivation", fields: [basedOnAgentVersionId], references: [id], onDelete: Restrict)
derivedVersions       AgentPromptVersion[] @relation("AgentVersionDerivation")
publishedAt           DateTime?
libraryMemberships    UserLibraryAgent[]
playbooks             Playbook[]
runs                  AgentRun[]
catalogPublications   MarketplacePublication[]
```

Extend `Source` with `libraryMemberships UserLibrarySource[]`. Extend `Playbook` with:

```prisma
agentVersionId String?
nextRunAt      DateTime?
agentVersion   AgentPromptVersion? @relation(fields: [agentVersionId], references: [id], onDelete: Restrict)
```

Extend `AgentRun` with:

```prisma
agentVersionId String?
agentVersion   AgentPromptVersion? @relation(fields: [agentVersionId], references: [id], onDelete: Restrict)
```

The SQL migration must:

1. create both membership tables;
2. rebuild SQLite tables where nullable/foreign-key changes require it;
3. backfill one source membership for each existing `Source.ownerUserId`;
4. backfill prompt-version snapshot fields from the owning `Agent`;
5. set each existing playbook's `agentVersionId` to its agent's highest prompt version; and
6. backfill each existing run's `agentVersionId` from its report `promptVersionId`, or from its playbook when no report exists; and
7. preserve every existing primary key and report `promptVersionId`.

- [ ] **Step 4: Add manual schedule tests**

Add:

```ts
it('creates a manual playbook without nextRunAt', async () => {
  const created = await repository.createPlaybook('user-1', {
    agentId: 'agent-1',
    agentVersionId: 'version-2',
    name: 'Manual analysis',
    sourceIds: ['source-1'],
    schedule: { mode: 'manual' }
  });

  expect(created.schedule).toEqual({ mode: 'manual' });
  expect(created.agentVersionId).toBe('version-2');
  expect(created.nextRunAt).toBeNull();
});
```

Add a run-store test proving a manual playbook is absent from due scheduled runs.

Add queue/runner tests proving both scheduled and manual runs carry the playbook's pinned `agentVersionId` through claim and execution.

- [ ] **Step 5: Implement manual playbook mapping**

Change the types:

```ts
export type PlaybookScheduleInput =
  | { mode: 'manual' }
  | { mode: 'interval'; intervalMinutes: number }
  | { mode: 'daily'; dailyTime: string; timezone: string }
  | { mode: 'weekly'; daysOfWeek: number[]; dailyTime: string; timezone: string };

export interface CreatePlaybookInput {
  agentId: string;
  agentVersionId: string;
  // existing fields unchanged
}
```

Make `schedulePatchData()` return `nextRunAt: null` for manual mode and make `mapPlaybook()` preserve `{ mode: 'manual' }`. Filter due-run queries with:

```ts
where: {
  enabled: true,
  mode: { not: 'manual' },
  nextRunAt: { lte: now }
}
```

Extend `AgentScheduleRecord`, `AgentRunRecord`, `enqueueImmediateRun`, and `upsertQueuedRun` with `agentVersionId`. Persist it on `AgentRun`. `worker.ts` passes it through `AgentRunOptions`.

Change `AgentRunnerDeps` to consume both prompt lookups:

```ts
promptRepository: Pick<PromptRepository, 'getPromptVersionById' | 'getLatestPromptVersion'>;
```

Resolve:

```ts
const promptVersion = options?.agentVersionId
  ? await this.deps.promptRepository.getPromptVersionById(options.agentVersionId)
  : await this.deps.promptRepository.getLatestPromptVersion(agentId);
```

The latest-version branch is a migration fallback only. Extend `ManualRunTrigger.triggerRun()` so playbook-triggered manual runs enqueue `playbookId` and `agentVersionId`.

- [ ] **Step 6: Run focused domain tests**

Run: `npm --prefix apps/api test -- src/modules/agents/domain-split-schema.test.ts src/modules/playbook/repository.test.ts src/modules/runs/prisma-run-store.test.ts src/modules/runs/run-queue.service.test.ts src/modules/analysis/agent-runner.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/api/prisma apps/api/src/modules/agents/domain-split-schema.test.ts apps/api/src/modules/playbook apps/api/src/modules/runs/prisma-run-store.ts apps/api/src/modules/runs/prisma-run-store.test.ts
git commit -m "[NO-JIRA] add shared catalog domain foundation"
```

### Task 2: Replace source cloning with saved-library memberships

**Files:**
- Modify: `apps/api/src/modules/source/types.ts`
- Modify: `apps/api/src/modules/source/repository.ts`
- Modify: `apps/api/src/modules/source/repository.test.ts`
- Modify: `apps/api/src/modules/source/routes.ts`
- Modify: `apps/api/src/modules/source/routes.test.ts`
- Modify: `apps/web/src/api/sources.ts`

**Interfaces:**
- Consumes: `UserLibrarySource` from Task 1.
- Produces: `saveSource(userId, sourceId)`, `removeSavedSource(userId, sourceId)`, and source records with `saved: boolean`.

- [ ] **Step 1: Write failing repository tests**

Add:

```ts
it('saves one canonical source without cloning it', async () => {
  await repository.saveSource('user-2', 'source-1');
  await repository.saveSource('user-2', 'source-1');

  expect(db.source.create).not.toHaveBeenCalled();
  expect(db.userLibrarySource.upsert).toHaveBeenCalledTimes(2);
});

it('lists owned and saved canonical sources for a user', async () => {
  const result = await repository.listSources('user-2');
  expect(result.map((source) => source.id)).toEqual(['saved-source', 'owned-source']);
});
```

- [ ] **Step 2: Run source repository tests**

Run: `npm --prefix apps/api test -- src/modules/source/repository.test.ts`

Expected: FAIL because membership methods are missing.

- [ ] **Step 3: Implement membership repository methods**

Extend `SourceRepositoryLike`:

```ts
saveSource(userId: string, sourceId: string): Promise<SourceRecord>;
removeSavedSource(userId: string, sourceId: string): Promise<void>;
```

Use `userLibrarySource.upsert()` for saves. Change user-scoped listing to query memberships and map their canonical sources. `createSource()` must create the private source and its owner membership in the same transaction.

Do not delete a canonical source when a non-owner removes it. `removeSavedSource()` deletes only the membership.

- [ ] **Step 4: Add save/remove route tests**

Cover:

```ts
POST /api/sources/:sourceId/save
DELETE /api/sources/:sourceId/save
```

Assert idempotent `200`, authenticated user scoping, `404` for unknown sources, and no call to `cloneFromMarketplace`.

- [ ] **Step 5: Implement routes and web client**

Add:

```ts
export async function saveSource(sourceId: string): Promise<SourceRecord> {
  const response = await fetch(`/api/sources/${sourceId}/save`, { method: 'POST' });
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'Failed to add source'));
  return response.json();
}

export async function removeSavedSource(sourceId: string): Promise<void> {
  const response = await fetch(`/api/sources/${sourceId}/save`, { method: 'DELETE' });
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'Failed to remove source'));
}
```

Keep legacy marketplace clone routes temporarily for backward compatibility, but do not use them in new catalog flows.

- [ ] **Step 6: Run focused source tests**

Run: `npm --prefix apps/api test -- src/modules/source/repository.test.ts src/modules/source/routes.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/api/src/modules/source apps/web/src/api/sources.ts
git commit -m "[NO-JIRA] save shared sources by membership"
```

### Task 3: Enforce immutable agent versions and saved-agent memberships

**Files:**
- Modify: `apps/api/src/modules/agents/types.ts`
- Modify: `apps/api/src/modules/agents/repository.ts`
- Modify: `apps/api/src/modules/agents/repository.test.ts`
- Modify: `apps/api/src/modules/agents/routes.ts`
- Modify: `apps/api/src/modules/agents/routes.test.ts`
- Modify: `apps/api/src/modules/prompts/repository.ts`
- Modify: `apps/api/src/modules/prompts/repository.test.ts`

**Interfaces:**
- Consumes: snapshot fields and `UserLibraryAgent` from Task 1.
- Produces: `createAgentVersion()`, `saveAgentVersion()`, explicit playbook version pinning, and immutable published behavior.

- [ ] **Step 1: Add failing immutability tests**

Add tests proving:

```ts
it('creates a new immutable version when a private agent changes', async () => {
  const changed = await repository.createAgentVersion('agent-1', {
    name: 'Revised teacher',
    description: 'Explains difficult ideas',
    characterType: 'teacher',
    promptConfig: {},
    model: 'claude-sonnet-4-5',
    systemPrompt: 'Explain the evidence step by step.',
    iconAssetKey: 'chalkboard-teacher'
  });

  expect(changed.version).toBe(3);
  expect(db.agentPromptVersion.update).not.toHaveBeenCalled();
});

it('saves a public version without cloning its agent', async () => {
  await repository.saveAgentVersion('user-2', 'version-3');
  expect(db.agent.create).not.toHaveBeenCalled();
  expect(db.userLibraryAgent.upsert).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run focused agent tests**

Run: `npm --prefix apps/api test -- src/modules/agents/repository.test.ts src/modules/prompts/repository.test.ts`

Expected: FAIL because version snapshot and membership methods are missing.

- [ ] **Step 3: Implement version creation**

Define:

```ts
export interface CreateAgentVersionInput {
  name: string;
  description: string;
  characterType: CharacterType;
  promptConfig: PromptConfig;
  model: string;
  systemPrompt: string;
  iconAssetKey: string | null;
  basedOnAgentVersionId?: string | null;
}
```

`createAgentVersion(agentId, input)` must calculate `max(version) + 1` and insert one new `AgentPromptVersion`; it must never update an existing version. Keep `Agent` identity/status fields only as compatibility projections of the latest private version.

Add `PromptRepository.getPromptVersionById(agentVersionId)` and automatically upsert `UserLibraryAgent` when a user creates a private agent's first version.

- [ ] **Step 4: Enforce version ownership and publication access**

Before saving or using a version, resolve access with:

```ts
const usable = version.agent.ownerUserId === userId
  || version.publications.some((publication) =>
    publication.status === 'published'
    && publication.visibility === 'public'
    && publication.retiredAt === null
  );
```

Return `404` rather than disclosing an inaccessible version. Task 1 already pins queue and runner execution to `AgentRun.agentVersionId`.

- [ ] **Step 5: Add save and version routes**

Add authenticated routes:

```text
POST /api/agent-versions/:agentVersionId/save
DELETE /api/agent-versions/:agentVersionId/save
POST /api/agents/:agentId/versions
```

Reject attempts to patch a published version with `409 immutable_agent_version`. Existing `PATCH /api/agents/:agentId` must create a version rather than mutate execution fields.

- [ ] **Step 6: Run focused tests**

Run: `npm --prefix apps/api test -- src/modules/agents/repository.test.ts src/modules/agents/routes.test.ts src/modules/prompts/repository.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/api/src/modules/agents apps/api/src/modules/prompts
git commit -m "[NO-JIRA] make agent versions immutable"
```

### Task 4: Add curated catalog metadata, demos, and read APIs

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260724110000_add_curated_catalog_metadata/migration.sql`
- Create: `apps/api/src/modules/catalog/types.ts`
- Create: `apps/api/src/modules/catalog/repository.ts`
- Create: `apps/api/src/modules/catalog/repository.test.ts`
- Create: `apps/api/src/modules/catalog/routes.ts`
- Create: `apps/api/src/modules/catalog/routes.test.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/main.ts`

**Interfaces:**
- Produces: `CatalogSource`, `CatalogAgent`, `CatalogDemo`, `CatalogRepositoryLike`, and `GET /api/catalog`.
- Consumes: publications, canonical sources, immutable agent versions, and reports.

- [ ] **Step 1: Write failing catalog repository tests**

Cover active ordering, retirement filtering, locale fallback, and frozen demos:

```ts
const catalog = await repository.getCatalog({ userId: 'user-1', locale: 'de' });
expect(catalog.sources.map((entry) => entry.slug)).toEqual(['acquired', 'knowledge-project']);
expect(catalog.agents[0].agentVersionId).toBe('version-2');
expect(catalog.demos[0].disclosure).toBe('Beispielbericht');
expect(catalog.sources[0].saved).toBe(false);
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm --prefix apps/api test -- src/modules/catalog/repository.test.ts`

Expected: FAIL because the catalog module does not exist.

- [ ] **Step 3: Add catalog schema**

Extend `MarketplacePublication`:

```prisma
slug             String?
catalogVersion   Int      @default(1)
origin           String   @default("community")
locale           String   @default("en")
sourceTypesJson  String   @default("[]")
topicsJson       String   @default("[]")
iconAssetKey     String?
editorialRank    Int      @default(0)
agentVersionId   String?
agentVersion     AgentPromptVersion? @relation(fields: [agentVersionId], references: [id], onDelete: Restrict)

@@unique([origin, resourceType, slug, catalogVersion])
```

Add:

```prisma
model CatalogDemo {
  id                  String                 @id @default(cuid())
  slug                String                 @unique
  sourcePublicationId String
  agentPublicationId  String
  locale              String                 @default("en")
  title               String
  disclosure          String
  reportJson          String
  status              String                 @default("active")
  createdAt           DateTime               @default(now())
  updatedAt           DateTime               @updatedAt
  sourcePublication   MarketplacePublication @relation("CatalogDemoSource", fields: [sourcePublicationId], references: [id], onDelete: Restrict)
  agentPublication    MarketplacePublication @relation("CatalogDemoAgent", fields: [agentPublicationId], references: [id], onDelete: Restrict)
}
```

Add the matching reverse relations to `MarketplacePublication`:

```prisma
sourceCatalogDemos CatalogDemo[] @relation("CatalogDemoSource")
agentCatalogDemos  CatalogDemo[] @relation("CatalogDemoAgent")
```

- [ ] **Step 4: Implement repository and route**

Expose one payload:

```ts
export interface CatalogResponse {
  sources: CatalogSource[];
  agents: CatalogAgent[];
  demos: CatalogDemo[];
}
```

`GET /api/catalog?locale=de` returns active `platform_curated` entries, falls back to English copy, joins the requesting user's memberships, and never returns retired resources.

- [ ] **Step 5: Wire dependencies**

Add optional `catalog` deps to `ServerDeps`, register `registerCatalogRoutes`, instantiate `CatalogRepository(prisma)` in `main.ts`, and pass it to `buildServer`.

- [ ] **Step 6: Run catalog and server tests**

Run: `npm --prefix apps/api test -- src/modules/catalog/repository.test.ts src/modules/catalog/routes.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/api/prisma apps/api/src/modules/catalog apps/api/src/server.ts apps/api/src/main.ts
git commit -m "[NO-JIRA] expose curated catalog data"
```

### Task 5: Add validated catalog files, icon assets, preview, and import

**Files:**
- Create: `apps/api/catalog/catalog.json`
- Create: `apps/api/catalog/catalog.schema.json`
- Create: `apps/api/src/tools/catalog/validate.ts`
- Create: `apps/api/src/tools/catalog/preview.ts`
- Create: `apps/api/src/tools/catalog/import.ts`
- Create: `apps/api/src/tools/catalog/catalog-tools.test.ts`
- Create: `apps/web/public/agent-icons/README.txt`
- Create: `apps/web/public/agent-icons/*.svg`
- Modify: `apps/api/package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: catalog repository models from Task 4.
- Produces: `catalog:validate`, `catalog:preview`, `catalog:import:dry-run`, and `catalog:import`.

- [ ] **Step 1: Write failing validator/import tests**

Test:

```ts
expect(validateCatalog(validFixture)).toEqual([]);
expect(validateCatalog(duplicateSlugFixture)).toContainEqual(expect.objectContaining({ code: 'duplicate_slug' }));
expect(validateCatalog(missingIconFixture)).toContainEqual(expect.objectContaining({ code: 'missing_icon' }));
expect(validateCatalog(badDemoReferenceFixture)).toContainEqual(expect.objectContaining({ code: 'unknown_demo_reference' }));
```

Import the same bundle twice and assert the second dry run has zero creates/updates. Remove one entry and assert the plan contains one retirement and zero deletions.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm --prefix apps/api test -- src/tools/catalog/catalog-tools.test.ts`

Expected: FAIL because catalog tools do not exist.

- [ ] **Step 3: Define catalog file shape**

Use one versioned root object:

```json
{
  "schemaVersion": 1,
  "sources": [],
  "agents": [],
  "demos": []
}
```

Agent entries include stable slug/version, localized copy, source types, topics, language, prompt snapshot, `iconAssetKey`, `iconLicense: "MIT"`, and editorial rank. Source entries include canonical type/value and card metadata. Demo entries reference source and agent slugs plus a frozen report payload.

- [ ] **Step 4: Implement validation and preview**

`catalog:preview` must first call validation, then write `.superpowers/catalog-preview/index.html`. The HTML must render:

- every starter source card;
- every compact agent card and vendored icon;
- tags and editorial rank;
- duplicate-icon warnings; and
- every source-agent sample pairing.

Add `.superpowers/catalog-preview/` to `.gitignore`.

- [ ] **Step 5: Implement transactional import**

Expose:

```ts
export interface CatalogImportPlan {
  creates: CatalogImportChange[];
  updates: CatalogImportChange[];
  versions: CatalogImportChange[];
  retirements: CatalogImportChange[];
}

export async function planCatalogImport(db: PrismaClient, bundle: CatalogBundle): Promise<CatalogImportPlan>;
export async function applyCatalogImport(db: PrismaClient, bundle: CatalogBundle): Promise<CatalogImportPlan>;
```

`applyCatalogImport` reruns validation and applies the exact plan inside one `$transaction`. It may upsert canonical resources and publications, insert new immutable agent versions, upsert demos, and retire absent curated publications. It must not delete user memberships, connections, versions, runs, or reports.

- [ ] **Step 6: Add package scripts**

```json
"catalog:validate": "tsx src/tools/catalog/validate.ts",
"catalog:preview": "tsx src/tools/catalog/preview.ts",
"catalog:import:dry-run": "tsx src/tools/catalog/import.ts --dry-run",
"catalog:import": "tsx src/tools/catalog/import.ts --apply"
```

- [ ] **Step 7: Run tool tests and commands**

Run:

```powershell
npm --prefix apps/api test -- src/tools/catalog/catalog-tools.test.ts
npm --prefix apps/api run catalog:validate
npm --prefix apps/api run catalog:preview
npm --prefix apps/api run catalog:import:dry-run
```

Expected: tests PASS; validation reports zero errors; preview path is printed; dry run prints deterministic creates/updates/versions/retirements without changing the database.

- [ ] **Step 8: Run the API build**

Run: `npm --prefix apps/api run build`

Expected: TypeScript build succeeds.

- [ ] **Step 9: Commit**

```powershell
git add .gitignore apps/api/catalog apps/api/src/tools/catalog apps/api/package.json apps/web/public/agent-icons
git commit -m "[NO-JIRA] add offline catalog curation tools"
```

### Task 6: Move public-source crawling to canonical ingestion

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260724120000_add_canonical_source_ingestion/migration.sql`
- Create: `apps/api/src/modules/source/ingestion-repository.ts`
- Create: `apps/api/src/modules/source/ingestion-repository.test.ts`
- Create: `apps/api/src/modules/source/ingestion-service.ts`
- Create: `apps/api/src/modules/source/ingestion-service.test.ts`
- Modify: `apps/api/src/modules/analysis/source-adapters/feed-items.ts`
- Modify: `apps/api/src/modules/analysis/source-adapters/podcast-feed-adapter.ts`
- Modify: `apps/api/src/modules/analysis/source-adapters/youtube-adapter.ts`
- Modify: `apps/api/src/modules/analysis/source-adapters/web-url-adapter.ts`
- Modify: `apps/api/src/modules/analysis/agent-runner.ts`
- Modify: `apps/api/src/modules/analysis/agent-runner.test.ts`
- Modify: `apps/api/src/modules/runs/prisma-run-store.ts`
- Modify: `apps/api/src/modules/runs/prisma-run-store.test.ts`
- Modify: `apps/api/src/main.ts`

**Interfaces:**
- Consumes: canonical `Source`, `SourceItem`, playbook source links, and pinned run/playbook IDs.
- Produces: one ingestion cursor per source and per-playbook item consumption.

- [ ] **Step 1: Write failing ingestion tests**

Add:

```ts
it('refreshes one canonical source once inside the freshness window', async () => {
  await service.ensureFresh('source-1', now);
  await service.ensureFresh('source-1', new Date(now.getTime() + 30_000));
  expect(adapter.fetch).toHaveBeenCalledTimes(1);
});

it('lets two playbooks consume the same stored source item independently', async () => {
  const first = await repository.listUnconsumed('playbook-1', 'source-1', 3);
  const second = await repository.listUnconsumed('playbook-2', 'source-1', 3);
  expect(first[0].id).toBe('item-1');
  expect(second[0].id).toBe('item-1');
});
```

Add a runner test proving two agents using the same source trigger one adapter refresh but can each analyze the stored item once.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm --prefix apps/api test -- src/modules/source/ingestion-repository.test.ts src/modules/source/ingestion-service.test.ts src/modules/analysis/agent-runner.test.ts`

Expected: FAIL because canonical ingestion does not exist.

- [ ] **Step 3: Add ingestion and consumption schema**

Add:

```prisma
model SourceIngestionState {
  id            String   @id @default(cuid())
  sourceId      String   @unique
  cursorJson    String   @default("{}")
  lastAttemptAt DateTime?
  refreshedAt   DateTime?
  leaseUntil    DateTime?
  source        Source   @relation(fields: [sourceId], references: [id], onDelete: Cascade)
}

model PlaybookSourceItem {
  id           String     @id @default(cuid())
  playbookId   String
  sourceItemId String
  consumedAt   DateTime   @default(now())
  playbook     Playbook   @relation(fields: [playbookId], references: [id], onDelete: Cascade)
  sourceItem   SourceItem @relation(fields: [sourceItemId], references: [id], onDelete: Cascade)

  @@unique([playbookId, sourceItemId])
}
```

Add `SourceItem.contentHash String`, `SourceItem.metadataJson String @default("{}")`, and `@@unique([sourceId, link])`. Add reverse relations on `Source`, `SourceItem`, and `Playbook`.

- [ ] **Step 4: Implement ingestion repository and lease**

Define:

```ts
export interface CanonicalSourceItemInput {
  title: string;
  content: string;
  link: string;
  publishedAt: Date;
  contentHash: string;
  metadata: Record<string, unknown>;
}

export interface SourceIngestionRepositoryLike {
  claimRefresh(sourceId: string, now: Date, leaseMs: number, freshnessMs: number): Promise<boolean>;
  completeRefresh(sourceId: string, items: CanonicalSourceItemInput[], cursor: Record<string, unknown>, now: Date): Promise<void>;
  releaseRefresh(sourceId: string): Promise<void>;
  listUnconsumed(playbookId: string, sourceId: string, limit: number): Promise<SourceItemRecord[]>;
  markConsumed(playbookId: string, sourceItemIds: string[], consumedAt: Date): Promise<void>;
}
```

`claimRefresh` must be atomic. A fresh source or active lease returns `false`. `completeRefresh` upserts by `sourceId + link` and stores the new cursor in one transaction.

- [ ] **Step 5: Decouple adapters from agent cursors**

Introduce:

```ts
export interface CanonicalSourceAdapter {
  fetch(
    source: { id: string; type: SourceType; value: string },
    cursor: Record<string, unknown>,
    options?: { forcedItemLink?: string }
  ): Promise<{ items: CanonicalSourceItemInput[]; cursor: Record<string, unknown>; warning?: string }>;
}
```

Move feed item normalization into `feed-items.ts`. Podcast, YouTube, and web adapters return canonical items and cursor data without reading or writing `AgentSourceCursor`.

Keep legacy adapter methods only until all call sites compile, then remove the runner dependency on `SourceCursorRepositoryLike`.

- [ ] **Step 6: Implement ingestion service**

`ensureFresh(sourceId, now, forcedItemLink?)`:

1. load the canonical source;
2. claim refresh unless a forced item bypasses freshness;
3. call the adapter selected by source type;
4. complete refresh transactionally; and
5. release the lease on explicit failure before rethrowing.

Do not hide adapter errors or return success-shaped empty data.

- [ ] **Step 7: Make the runner consume playbook sources**

Carry `playbookId` in `AgentRunOptions`. For new runs:

1. load `PlaybookSource` rows and canonical sources;
2. call `ensureFresh` per canonical source;
3. read up to `maxItemsPerSource` unconsumed items;
4. convert stored items to `EvidenceBlock`;
5. analyze and save the report; and
6. mark the exact source item IDs consumed only after the report is durable.

Forced episode runs resolve by source item link and remain retryable. Keep `agent.sources` only as a legacy fallback for runs without `playbookId`; add a warning in code and documentation.

- [ ] **Step 8: Wire production dependencies**

Instantiate `SourceIngestionRepository` and `SourceIngestionService` in `main.ts`, inject them into `AgentRunner`, and include playbook ID/version metadata in claimed run options.

- [ ] **Step 9: Run canonical-ingestion tests and API build**

Run:

```powershell
npm --prefix apps/api test -- src/modules/source/ingestion-repository.test.ts src/modules/source/ingestion-service.test.ts src/modules/analysis/agent-runner.test.ts src/modules/runs/prisma-run-store.test.ts
npm --prefix apps/api run build
```

Expected: PASS and successful build.

- [ ] **Step 10: Commit**

```powershell
git add apps/api/prisma apps/api/src/modules/source apps/api/src/modules/analysis apps/api/src/modules/runs apps/api/src/main.ts
git commit -m "[NO-JIRA] ingest shared sources canonically"
```

### Task 7: Update architecture documentation

**Files:**
- Modify: `docs/APP-SUMMARY.md`
- Modify: `docs/implementation/PROJECT.md`

**Interfaces:**
- Consumes: completed foundation behavior.
- Produces: current documentation for later Library and agent-selection work.

- [ ] **Step 1: Update domain documentation**

Document:

- canonical shared sources plus user memberships;
- immutable `AgentPromptVersion` snapshots;
- manual playbooks pinned to versions;
- curated catalog metadata and frozen demos;
- Phosphor-first vendored icons; and
- validate/preview/import commands.

- [ ] **Step 2: Record completion in the project ledger**

Add a dated entry naming the migration, catalog endpoints, and import commands. Do not mark Library or agent-selection UI as complete.

- [ ] **Step 3: Commit**

```powershell
git add docs/APP-SUMMARY.md docs/implementation/PROJECT.md
git commit -m "[NO-JIRA] document shared catalog foundation"
```
