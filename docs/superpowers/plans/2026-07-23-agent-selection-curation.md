# Agent Selection and Curation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver source-aware Best matches, compact agent cards, manual source-agent connections, immutable public-agent variants, and proposal-first AI curation with at most two essential questions.

**Architecture:** Rank saved/private and curated immutable agent versions on the API using deterministic metadata. Replace the current follow-source agent chooser with focused components, pin every new manual playbook to the selected version, and use the existing curator for both new agents and independent variants.

**Tech Stack:** Node.js, TypeScript, Fastify 4, Prisma 6, SQLite, Vitest, React 18, Ant Design 6, Tailwind CSS, i18next, Playwright.

## Global Constraints

- Best matches ranks owned and curated agents together.
- Ranking uses topic, source type, language, ownership tie-break, then editorial rank.
- Show four matches first; Show more reveals the next ranked set and moves focus.
- Agents shown in Best matches are not duplicated under Your agents.
- Compact cards show only icon, name, one-line purpose, match reasons, ownership, and one primary action.
- Curate your own always opens the AI-driven curator.
- The manual Create Agent wizard is removed from primary navigation.
- Source-aware curation proposes first and asks at most one or two essential questions.
- Published versions cannot be edited in place.
- Create a variant produces an independent private agent with provenance.
- Using an agent creates a manual playbook and never enables recurrence automatically.
- New display text is localized in English and German.
- Commit steps are checkpoints only; run them only after the user explicitly approves commits.

---

### Task 1: Add deterministic source-aware matching

**Files:**
- Create: `apps/api/src/modules/catalog/agent-matcher.ts`
- Create: `apps/api/src/modules/catalog/agent-matcher.test.ts`
- Modify: `apps/api/src/modules/catalog/types.ts`
- Modify: `apps/api/src/modules/catalog/repository.ts`
- Modify: `apps/api/src/modules/catalog/routes.ts`
- Modify: `apps/api/src/modules/catalog/routes.test.ts`

**Interfaces:**
- Consumes: canonical source metadata, user-saved/private immutable versions, curated publications, and catalog tags.
- Produces: `rankAgentMatches(input): AgentMatch[]` and `GET /api/catalog/agent-matches?sourceId=...`.

- [ ] **Step 1: Write failing ranking tests**

Cover exact ordering:

```ts
it('ranks topic, source type, language, ownership, then editorial rank', () => {
  const matches = rankAgentMatches({
    source: { type: 'podcast_feeds', topics: ['business'], language: 'en' },
    agents: [
      fixture({ id: 'curated-topic', topics: ['business'], sourceTypes: ['podcast_feeds'], language: 'en', ownership: 'curated', editorialRank: 5 }),
      fixture({ id: 'owned-topic', topics: ['business'], sourceTypes: ['podcast_feeds'], language: 'en', ownership: 'owned', editorialRank: 1 }),
      fixture({ id: 'type-only', topics: ['science'], sourceTypes: ['podcast_feeds'], language: 'en', ownership: 'curated', editorialRank: 99 })
    ]
  });

  expect(matches.map((match) => match.agentVersionId)).toEqual(['owned-topic', 'curated-topic', 'type-only']);
  expect(matches[0].reasons).toEqual(['Matches business', 'Works well with podcasts']);
});
```

Add tests for each fallback level and deterministic ties.

- [ ] **Step 2: Run matcher tests and verify failure**

Run: `npm --prefix apps/api test -- src/modules/catalog/agent-matcher.test.ts`

Expected: FAIL because the matcher does not exist.

- [ ] **Step 3: Implement typed scoring**

Define:

```ts
export type AgentOwnership = 'owned' | 'curated';

export interface AgentMatch {
  agentVersionId: string;
  publicationId: string | null;
  ownership: AgentOwnership;
  name: string;
  purpose: string;
  iconAssetKey: string | null;
  reasons: string[];
  score: number;
}
```

Use explicit score bands so lower-priority metadata cannot outweigh higher-priority dimensions:

```ts
const score =
  topicMatches * 10_000 +
  sourceTypeMatches * 1_000 +
  languageMatches * 100 +
  (ownership === 'owned' ? 10 : 0) +
  editorialRank;
```

Return at most two localized reason codes; translate labels on the client from codes and values rather than emitting English API prose.

- [ ] **Step 4: Add the route**

`GET /api/catalog/agent-matches?sourceId=<id>` must:

1. require a source the user saved or owns;
2. gather eligible saved/private and active curated versions;
3. deduplicate by `agentVersionId`;
4. return all ranked matches; and
5. return `404 source_not_in_library` for inaccessible sources.

- [ ] **Step 5: Run matcher and route tests**

Run: `npm --prefix apps/api test -- src/modules/catalog/agent-matcher.test.ts src/modules/catalog/routes.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/modules/catalog
git commit -m "[NO-JIRA] rank source-aware agent matches"
```

### Task 2: Create a pinned manual playbook when an agent is used

**Files:**
- Modify: `apps/api/src/modules/catalog/repository.ts`
- Modify: `apps/api/src/modules/catalog/repository.test.ts`
- Modify: `apps/api/src/modules/catalog/routes.ts`
- Modify: `apps/api/src/modules/catalog/routes.test.ts`
- Modify: `apps/api/src/modules/playbook/repository.ts`
- Modify: `apps/api/src/modules/playbook/routes.test.ts`
- Create: `apps/web/src/api/agent-selection.ts`

**Interfaces:**
- Consumes: saved source, immutable agent version, saved-agent membership, and manual playbook support.
- Produces: `POST /api/catalog/agent-versions/:agentVersionId/use` and `useAgentForSource()`.

- [ ] **Step 1: Write failing use-agent tests**

Add:

```ts
it('saves the version and creates a manual playbook for the selected source', async () => {
  const result = await repository.useAgentForSource({
    userId: 'user-1',
    sourceId: 'source-1',
    agentVersionId: 'version-3'
  });

  expect(result.playbook.schedule).toEqual({ mode: 'manual' });
  expect(result.playbook.agentVersionId).toBe('version-3');
  expect(result.playbook.nextRunAt).toBeNull();
});
```

Assert idempotency returns the existing equivalent manual connection rather than creating duplicates.

- [ ] **Step 2: Run focused tests**

Run: `npm --prefix apps/api test -- src/modules/catalog/repository.test.ts src/modules/catalog/routes.test.ts`

Expected: FAIL because `useAgentForSource` is missing.

- [ ] **Step 3: Implement transactional use**

Inside one transaction:

1. verify source membership;
2. verify the version is private to the user or actively published;
3. upsert `UserLibraryAgent`;
4. find or create the manual playbook pinned to `agentVersionId` and source;
5. emit one playbook realtime event; and
6. return `{ agentVersion, playbook, created }`.

Do not create a schedule, run, report, or notification.

- [ ] **Step 4: Add route and client**

Request:

```ts
export interface UseAgentForSourceInput {
  sourceId: string;
}

export async function useAgentForSource(
  agentVersionId: string,
  sourceId: string
): Promise<{ playbook: PlaybookRecord; created: boolean }> {
  const response = await fetch(`/api/catalog/agent-versions/${agentVersionId}/use`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sourceId })
  });
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'Failed to use agent'));
  return response.json();
}
```

- [ ] **Step 5: Run focused tests and API build**

Run:

```powershell
npm --prefix apps/api test -- src/modules/catalog/repository.test.ts src/modules/catalog/routes.test.ts src/modules/playbook/routes.test.ts
npm --prefix apps/api run build
```

Expected: PASS and successful build.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/modules/catalog apps/api/src/modules/playbook apps/web/src/api/agent-selection.ts
git commit -m "[NO-JIRA] connect sources to immutable agent versions"
```

### Task 3: Build the compact source-aware Agent Selection view

**Files:**
- Create: `apps/web/src/components/agent-selection/CompactAgentCard.tsx`
- Create: `apps/web/src/components/agent-selection/AgentDetailsDrawer.tsx`
- Create: `apps/web/src/components/agent-selection/AgentSelectionView.tsx`
- Modify: `apps/web/src/pages/AgentsPage.tsx`
- Modify: `apps/web/src/i18n/locales/en.json`
- Modify: `apps/web/src/i18n/locales/de.json`
- Modify: `apps/web/e2e/agent-setup.spec.ts`

**Interfaces:**
- Consumes: `listAgentMatches(sourceId)`, `useAgentForSource()`, current source, and the AI curator opener.
- Produces: `AgentSelectionViewProps` and `onAgentConnected(playbook)`.

- [ ] **Step 1: Add failing compact-card assertions**

```ts
test('@smoke agent selection uses compact source-aware cards', async () => {
  const card = await readFile(resolve(process.cwd(), 'src/components/agent-selection/CompactAgentCard.tsx'), 'utf8');
  expect(card).toContain('iconAssetKey');
  expect(card).toContain('match.reasons.slice(0, 2)');
  expect(card).toContain("t('agentSelection.useAgent')");
  expect(card).not.toContain('systemPrompt');
  expect(card).not.toContain('model');
  expect(card).not.toContain('runCount');
});
```

- [ ] **Step 2: Run the compact-card test**

Run: `npm --prefix apps/web run test:smoke -- --grep "compact source-aware"`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement the compact card**

Define:

```ts
export interface CompactAgentCardProps {
  match: AgentMatchDto;
  loading: boolean;
  onUse: (match: AgentMatchDto) => void;
  onDetails: (match: AgentMatchDto) => void;
}
```

Render the vendored SVG through `/agent-icons/${iconAssetKey}.svg`, one-line purpose, two reason tags, **Yours** or **Curated**, a details affordance, and one primary **Use agent** action.

- [ ] **Step 4: Implement section behavior**

`AgentSelectionView` must:

- show four Best matches initially;
- increase the visible limit by four on Show more;
- move focus to the first newly revealed card;
- derive Your agents by excluding visible/all matched owned version IDs;
- render one `GhostCreateCard` labeled Curate your own;
- show loading skeletons, retryable errors, and deterministic empty fallback; and
- avoid rendering a second manual-create ghost card.

- [ ] **Step 5: Rewire all source entry points**

Replace the current follow-source agent-choice stage behind:

- post-source Choose an agent;
- source-card Add agent;
- selected-source Add agent; and
- source detail Listen/setup actions.

Do not alter report browsing or existing source detail tabs.

- [ ] **Step 6: Add translations**

Add keys for Best matches, Show more, Your agents, Yours, Curated, match-reason templates, Use agent, View details, Curate your own, retry, empty fallback, and connection success.

- [ ] **Step 7: Run smoke and build**

Run:

```powershell
npm --prefix apps/web run test:smoke -- --grep "compact source-aware"
npm --prefix apps/web run build
```

Expected: PASS and successful build.

- [ ] **Step 8: Commit**

```powershell
git add apps/web/src/components/agent-selection apps/web/src/pages/AgentsPage.tsx apps/web/src/i18n apps/web/e2e/agent-setup.spec.ts
git commit -m "[NO-JIRA] add source-aware agent selection"
```

### Task 4: Offer Run first report without enabling recurrence

**Files:**
- Create: `apps/web/src/components/agent-selection/AgentConnectedModal.tsx`
- Modify: `apps/web/src/components/agent-selection/AgentSelectionView.tsx`
- Modify: `apps/web/src/api/playbooks.ts`
- Modify: `apps/web/src/i18n/locales/en.json`
- Modify: `apps/web/src/i18n/locales/de.json`
- Modify: `apps/web/e2e/agent-setup.spec.ts`

**Interfaces:**
- Consumes: newly returned manual `PlaybookRecord`.
- Produces: Run first report, Schedule recurring, and Done actions.

- [ ] **Step 1: Add failing action assertions**

```ts
test('@smoke connected agent offers run before schedule', async () => {
  const modal = await readFile(resolve(process.cwd(), 'src/components/agent-selection/AgentConnectedModal.tsx'), 'utf8');
  expect(modal).toContain("t('agentSelection.runFirstReport')");
  expect(modal).toContain("t('agentSelection.scheduleRecurring')");
  expect(modal).not.toContain("schedule: { mode: 'daily'");
});
```

- [ ] **Step 2: Run the connected modal test**

Run: `npm --prefix apps/web run test:smoke -- --grep "run before schedule"`

Expected: FAIL because the modal does not exist.

- [ ] **Step 3: Implement post-connection actions**

Run first report calls the existing `runPlaybookNow(playbook.id)` and reports the real run status. Schedule recurring opens the existing advanced schedule editor with no preselected recurrence. Done closes the flow.

Do not update the manual playbook unless the user confirms a valid schedule.

- [ ] **Step 4: Run smoke and build**

Run:

```powershell
npm --prefix apps/web run test:smoke -- --grep "run before schedule"
npm --prefix apps/web run build
```

Expected: PASS and successful build.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/components/agent-selection apps/web/src/api/playbooks.ts apps/web/src/i18n apps/web/e2e/agent-setup.spec.ts
git commit -m "[NO-JIRA] add first-report action after agent selection"
```

### Task 5: Remove manual creation entry points and shorten AI curation

**Files:**
- Modify: `apps/api/src/modules/agent-curation/service.ts`
- Modify: `apps/api/src/modules/agent-curation/service.test.ts`
- Modify: `apps/api/src/modules/agent-curation/types.ts`
- Modify: `apps/web/src/components/AgentCurator.tsx`
- Modify: `apps/web/src/pages/AgentsPage.tsx`
- Modify: `apps/web/src/i18n/locales/en.json`
- Modify: `apps/web/src/i18n/locales/de.json`
- Modify: `apps/web/e2e/agent-setup.spec.ts`

**Interfaces:**
- Consumes: source context and existing curation session flow.
- Produces: proposal-first opening, `MAX_CURATION_FOLLOW_UP_QUESTIONS = 2`, and AI-only creation entry points.

- [ ] **Step 1: Replace interview-first service tests**

Add:

```ts
it('allows a complete source-aware opening to proceed directly to review', async () => {
  claude.curateAgent.mockResolvedValue(completeProposal());
  const result = await service.start(sourceAwareInput);
  expect(result.draft.completeness).toBe('ready_for_review');
});

it('instructs the model to stop asking after two essential questions', async () => {
  await service.reply(sessionWithTwoUserAnswers, 'Continue');
  expect(claude.curateAgent).toHaveBeenCalledWith(expect.objectContaining({
    systemInstruction: expect.stringContaining('Do not ask another question')
  }));
});
```

Remove expectations that a vague request always requires at least two follow-ups.

- [ ] **Step 2: Run curation service tests**

Run: `npm --prefix apps/api test -- src/modules/agent-curation/service.test.ts`

Expected: FAIL under the current interview-first instruction.

- [ ] **Step 3: Implement proposal-first policy**

Export:

```ts
export const MAX_CURATION_FOLLOW_UP_QUESTIONS = 2;
```

Replace the instruction with:

```ts
[
  'Propose the most complete useful agent profile immediately from explicit user input and available source context.',
  'Ask one short follow-up only when information essential to a useful result cannot be inferred safely.',
  'Ask no more than two follow-up questions in the entire session.',
  'When the follow-up limit is reached, make conservative editable choices and return a complete profile for review.',
  'Never treat source-derived details as locked requirements.',
  'Explicit user corrections always win.'
].join('\n')
```

Count prior assistant messages that end with a question and append `Do not ask another question; complete the editable proposal now.` once the limit is reached.

- [ ] **Step 4: Remove manual-create UI**

Remove `manual-create`, `openManualAgentCreate`, `openInlineAgentCreate`, and the manual creation ghost card. Keep `AgentForm` only for private-agent advanced editing if still used; do not remove edit support in this task.

Every Curate your own action calls the same AI curator opener with source context when available.

- [ ] **Step 5: Run API tests, smoke, and builds**

Run:

```powershell
npm --prefix apps/api test -- src/modules/agent-curation/service.test.ts src/modules/agent-curation/routes.test.ts
npm --prefix apps/web run test:smoke -- --grep "curator|manual"
npm --prefix apps/api run build
npm --prefix apps/web run build
```

Expected: all tests PASS; both builds succeed.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/modules/agent-curation apps/web/src/components/AgentCurator.tsx apps/web/src/pages/AgentsPage.tsx apps/web/src/i18n apps/web/e2e/agent-setup.spec.ts
git commit -m "[NO-JIRA] shorten AI agent curation"
```

### Task 6: Add immutable public-agent variants

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260724130000_add_curation_base_agent_version/migration.sql`
- Modify: `apps/api/src/modules/agent-curation/types.ts`
- Modify: `apps/api/src/modules/agent-curation/repository.ts`
- Modify: `apps/api/src/modules/agent-curation/repository.test.ts`
- Modify: `apps/api/src/modules/agent-curation/routes.ts`
- Modify: `apps/api/src/modules/agent-curation/routes.test.ts`
- Modify: `apps/api/src/modules/agent-curation/service.ts`
- Modify: `apps/api/src/modules/agent-curation/service.test.ts`
- Modify: `apps/web/src/api/agent-curation.ts`
- Modify: `apps/web/src/components/AgentCurator.tsx`
- Modify: `apps/web/src/components/agent-selection/AgentDetailsDrawer.tsx`
- Modify: `apps/web/src/i18n/locales/en.json`
- Modify: `apps/web/src/i18n/locales/de.json`

**Interfaces:**
- Consumes: immutable public version and shortened curator.
- Produces: `baseAgentVersionId` curation sessions and independent `basedOnAgentVersionId` private versions.

- [ ] **Step 1: Add failing variant tests**

Add:

```ts
it('starts a variant from a published immutable version', async () => {
  const session = await service.start({
    ownerUserId: 'user-2',
    mode: 'create',
    baseAgentVersionId: 'public-version-4'
  });
  expect(session.baseAgentVersionId).toBe('public-version-4');
  expect(session.draft.name).toBe('Public agent name');
});

it('finalizes an independent private version with provenance', async () => {
  const result = await finalizeVariant();
  expect(result.agentVersion.basedOnAgentVersionId).toBe('public-version-4');
  expect(updatePublicVersion).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run variant tests**

Run: `npm --prefix apps/api test -- src/modules/agent-curation/service.test.ts src/modules/agent-curation/repository.test.ts src/modules/agent-curation/routes.test.ts`

Expected: FAIL because sessions have no base version.

- [ ] **Step 3: Persist the base version**

Add nullable `baseAgentVersionId` to `AgentCurationSession`, related to `AgentPromptVersion` with `onDelete: Restrict`. Extend API types with:

```ts
baseAgentVersionId?: string | null;
```

Use named reverse relations:

```prisma
// AgentCurationSession
baseAgentVersionId String?
baseAgentVersion   AgentPromptVersion? @relation("CurationBaseVersion", fields: [baseAgentVersionId], references: [id], onDelete: Restrict)

// AgentPromptVersion
basedCurationSessions AgentCurationSession[] @relation("CurationBaseVersion")
```

Validate that the base version is published and active or privately accessible to the user.

- [ ] **Step 4: Seed and finalize variants**

When a base exists:

- initialize the draft from its immutable snapshot;
- tell the curator this is inspiration, not live inheritance;
- ask what the user wants changed;
- create a new private `Agent`;
- create immutable version 1 with `basedOnAgentVersionId`; and
- never update the base agent/version/publication.

- [ ] **Step 5: Add Create a variant UI**

Public details show **Create a variant**, not Edit or Improve with AI. The action starts curation with `baseAgentVersionId`, opens the existing curator, and displays **Based on {agent name}**.

Private agents retain **Improve with AI**, which creates a new private immutable version rather than mutating the prior version.

- [ ] **Step 6: Run focused tests and builds**

Run:

```powershell
npm --prefix apps/api test -- src/modules/agent-curation/service.test.ts src/modules/agent-curation/repository.test.ts src/modules/agent-curation/routes.test.ts
npm --prefix apps/api run build
npm --prefix apps/web run build
```

Expected: PASS and successful builds.

- [ ] **Step 7: Commit**

```powershell
git add apps/api/prisma apps/api/src/modules/agent-curation apps/web/src/api/agent-curation.ts apps/web/src/components/AgentCurator.tsx apps/web/src/components/agent-selection apps/web/src/i18n
git commit -m "[NO-JIRA] create independent AI agent variants"
```

### Task 7: Add explicit update-to-new-version behavior

**Files:**
- Modify: `apps/api/src/modules/catalog/types.ts`
- Modify: `apps/api/src/modules/catalog/repository.ts`
- Modify: `apps/api/src/modules/catalog/repository.test.ts`
- Modify: `apps/api/src/modules/catalog/routes.ts`
- Modify: `apps/api/src/modules/catalog/routes.test.ts`
- Modify: `apps/web/src/api/agent-selection.ts`
- Modify: `apps/web/src/components/agent-selection/AgentDetailsDrawer.tsx`
- Modify: `apps/web/src/i18n/locales/en.json`
- Modify: `apps/web/src/i18n/locales/de.json`

**Interfaces:**
- Consumes: saved immutable version, latest active publication for the same agent identity/slug, and pinned manual playbooks.
- Produces: `updateAvailable`, `latestAgentVersionId`, and explicit membership/connection updates.

- [ ] **Step 1: Add failing update tests**

Add:

```ts
it('reports an update without changing a saved version', async () => {
  const saved = await repository.listSavedAgents('user-1');
  expect(saved[0]).toMatchObject({
    agentVersionId: 'version-2',
    latestAgentVersionId: 'version-3',
    updateAvailable: true
  });
  expect(updateMembership).not.toHaveBeenCalled();
});

it('updates only after explicit confirmation', async () => {
  await repository.updateSavedAgentVersion({
    userId: 'user-1',
    fromAgentVersionId: 'version-2',
    toAgentVersionId: 'version-3',
    updateManualPlaybooks: true
  });
  expect(updateMembership).toHaveBeenCalled();
  expect(updatePinnedManualPlaybooks).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run catalog tests**

Run: `npm --prefix apps/api test -- src/modules/catalog/repository.test.ts src/modules/catalog/routes.test.ts`

Expected: FAIL because update metadata and command do not exist.

- [ ] **Step 3: Implement update discovery**

Catalog and saved-agent DTOs expose:

```ts
updateAvailable: boolean;
latestAgentVersionId: string | null;
```

Compare versions only within the same published agent identity or stable curated slug. Never treat an unrelated variant as an update.

- [ ] **Step 4: Implement explicit update route**

Add:

```text
POST /api/catalog/agent-versions/:agentVersionId/update
```

Body:

```ts
{
  fromAgentVersionId: string;
  updateManualPlaybooks: boolean;
}
```

Verify the target is the latest active published version for the same identity. In one transaction, replace the saved membership and optionally repin the user's manual playbooks. Historical runs/reports remain pinned to their original versions.

- [ ] **Step 5: Add confirmation UI**

The details drawer shows **Update available** and an **Update agent** action. Confirmation states whether existing manual source connections will move. Default `updateManualPlaybooks` to `false`; users opt in explicitly.

- [ ] **Step 6: Run focused tests and web build**

Run:

```powershell
npm --prefix apps/api test -- src/modules/catalog/repository.test.ts src/modules/catalog/routes.test.ts
npm --prefix apps/web run build
```

Expected: PASS and successful build.

- [ ] **Step 7: Commit**

```powershell
git add apps/api/src/modules/catalog apps/web/src/api/agent-selection.ts apps/web/src/components/agent-selection/AgentDetailsDrawer.tsx apps/web/src/i18n
git commit -m "[NO-JIRA] add explicit immutable agent updates"
```

### Task 8: Verify accessibility, update behavior, and documentation

**Files:**
- Modify: `apps/web/e2e/agent-setup.spec.ts`
- Modify: `docs/APP-SUMMARY.md`
- Modify: `docs/implementation/PROJECT.md`

**Interfaces:**
- Consumes: completed agent-selection and curation behavior.
- Produces: regression coverage and current product documentation.

- [ ] **Step 1: Add final smoke assertions**

Cover:

- Show more changes `aria-expanded` and focuses the first new card;
- Yours/Curated labels are text, not color-only;
- missing icon uses an accessible static fallback;
- no public-agent Edit action exists;
- Create a variant opens AI curation;
- Curate your own opens AI curation;
- reduced-motion Library guidance remains static;
- a manual connection offers Run first report; and
- recurring scheduling requires confirmation.

- [ ] **Step 2: Run complete targeted verification**

Run:

```powershell
npm --prefix apps/api test -- src/modules/catalog src/modules/playbook src/modules/agent-curation src/modules/analysis/agent-runner.test.ts
npm --prefix apps/web run test:smoke
npm --prefix apps/api run build
npm --prefix apps/web run build
```

Expected: all tests PASS and both builds succeed.

- [ ] **Step 3: Update documentation**

Document deterministic Best matches, compact cards, manual source-agent connections, proposal-first curation, immutable public versions, explicit updates, and independent variants.

- [ ] **Step 4: Commit**

```powershell
git add apps/web/e2e/agent-setup.spec.ts docs/APP-SUMMARY.md docs/implementation/PROJECT.md
git commit -m "[NO-JIRA] document agent selection and variants"
```
