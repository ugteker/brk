# Seeded Library Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace forced onboarding and the empty Library with a guided Start here section, sample outcomes, saved-source membership, and optional post-source agent handoff.

**Architecture:** Consume the shared catalog and membership APIs from `2026-07-23-shared-catalog-foundation.md`. Extract the Library overview from `AgentsPage.tsx` into focused components, while preserving the existing source detail view and using the current follow-source flow as the temporary agent-selection handoff until the third plan replaces it.

**Tech Stack:** React 18, TypeScript, Ant Design 6, Tailwind CSS, i18next, Playwright.

## Global Constraints

- The Add source ghost card is the first card.
- Starter picks never appear as user-owned before being saved.
- The welcome assistant and forced first-run wizard are removed.
- Sample reports are frozen demos and explicitly labeled.
- Directional motion is one-time and respects `prefers-reduced-motion`.
- Saving a starter source creates a membership, not a source clone.
- Source creation offers Choose an agent and Skip after success.
- No recurring schedule is enabled automatically.
- New display text is localized in English and German.
- Keep one column on mobile and two columns from `sm` upward.
- Commit steps are checkpoints only; run them only after the user explicitly approves commits.

---

### Task 1: Add catalog loading and saved-source actions to app data

**Files:**
- Create: `apps/web/src/api/catalog.ts`
- Modify: `apps/web/src/api/sources.ts`
- Modify: `apps/web/src/context/AppDataContext.tsx`
- Modify: `apps/web/e2e/agent-setup.spec.ts`

**Interfaces:**
- Consumes: `GET /api/catalog`, `POST /api/sources/:sourceId/save`, and `DELETE /api/sources/:sourceId/save`.
- Produces: `catalog`, `catalogLoadState`, `refreshCatalog()`, `saveCatalogSource()`, and `removeCatalogSource()`.

- [ ] **Step 1: Add failing smoke assertions**

Add a source-level smoke test:

```ts
test('@smoke app data loads catalog separately from the user library', async () => {
  const context = await readFile(resolve(process.cwd(), 'src/context/AppDataContext.tsx'), 'utf8');
  expect(context).toContain('catalogLoadState');
  expect(context).toContain('listCatalog()');
  expect(context).toContain('refreshCatalog');
});
```

- [ ] **Step 2: Run the smoke test and verify failure**

Run: `npm --prefix apps/web run test:smoke -- --grep "app data loads catalog"`

Expected: FAIL because the context has no catalog state.

- [ ] **Step 3: Create the typed catalog client**

Define:

```ts
export interface CatalogSource {
  publicationId: string;
  sourceId: string;
  slug: string;
  title: string;
  summary: string;
  type: SourceType;
  value: string;
  coverImageUrl: string | null;
  editorialRank: number;
  saved: boolean;
}

export interface CatalogDemo {
  slug: string;
  sourcePublicationId: string;
  agentPublicationId: string;
  title: string;
  disclosure: string;
  report: RunReportDto;
}

export interface CatalogResponse {
  sources: CatalogSource[];
  agents: CatalogAgent[];
  demos: CatalogDemo[];
}
```

`listCatalog(locale)` requests `/api/catalog?locale=${encodeURIComponent(locale)}` and surfaces a typed error.

- [ ] **Step 4: Extend app context**

Load catalog data separately from agents/sources/playbooks. A catalog failure sets `catalogLoadState = 'error'` but does not sign the user out or clear `sources`.

Implement:

```ts
async function saveCatalogSource(sourceId: string) {
  await saveSource(sourceId);
  await Promise.all([refreshSources(), refreshCatalog()]);
}
```

- [ ] **Step 5: Run smoke and build**

Run:

```powershell
npm --prefix apps/web run test:smoke -- --grep "app data loads catalog"
npm --prefix apps/web run build
```

Expected: PASS and successful Vite build.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/api/catalog.ts apps/web/src/api/sources.ts apps/web/src/context/AppDataContext.tsx apps/web/e2e/agent-setup.spec.ts
git commit -m "[NO-JIRA] load curated catalog in app data"
```

### Task 2: Extract the Library overview and put creation first

**Files:**
- Create: `apps/web/src/components/library/GhostCreateCard.tsx`
- Create: `apps/web/src/components/library/StarterSourceCard.tsx`
- Create: `apps/web/src/components/library/SavedSourceGrid.tsx`
- Create: `apps/web/src/components/library/LibraryOverview.tsx`
- Modify: `apps/web/src/pages/AgentsPage.tsx`
- Modify: `apps/web/src/i18n/locales/en.json`
- Modify: `apps/web/src/i18n/locales/de.json`
- Modify: `apps/web/e2e/agent-setup.spec.ts`

**Interfaces:**
- Consumes: catalog sources, saved sources, current source-card rendering callbacks, and source creation callback.
- Produces: `LibraryOverviewProps` with distinct starter and saved sections.

- [ ] **Step 1: Add failing hierarchy assertions**

Add:

```ts
test('@smoke library renders creation before starter picks and saved sources', async () => {
  const overview = await readFile(resolve(process.cwd(), 'src/components/library/LibraryOverview.tsx'), 'utf8');
  expect(overview.indexOf('GhostCreateCard')).toBeLessThan(overview.indexOf('StarterSourceCard'));
  expect(overview.indexOf("t('library.startHere')")).toBeLessThan(overview.indexOf("t('library.yourLibrary')"));
});
```

- [ ] **Step 2: Run the hierarchy test**

Run: `npm --prefix apps/web run test:smoke -- --grep "creation before starter"`

Expected: FAIL because `LibraryOverview.tsx` does not exist.

- [ ] **Step 3: Extract the reusable ghost card**

Move the existing `GhostCreateCard` out of `AgentsPage.tsx` without changing keyboard/button semantics. Add `attention?: boolean`:

```tsx
className={clsx(
  baseClasses,
  attention && 'library-next-action'
)}
```

- [ ] **Step 4: Build the Library hierarchy**

Define:

```ts
export interface LibraryOverviewProps {
  starterSources: CatalogSource[];
  savedSources: SourceRecord[];
  isCatalogLoading: boolean;
  catalogError: boolean;
  showAddSourceAttention: boolean;
  onAddSource: () => void;
  onSaveStarter: (source: CatalogSource) => Promise<void>;
  onOpenSource: (source: SourceRecord) => void;
  onRetryCatalog: () => void;
}
```

Render:

```tsx
<section aria-labelledby="library-start-here">
  <Title id="library-start-here" level={3}>{t('library.startHere')}</Title>
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
    <GhostCreateCard attention={showAddSourceAttention} />
    {starterSources.slice(0, 5).map((source) => <StarterSourceCard key={source.sourceId} source={source} />)}
  </div>
</section>

<section aria-labelledby="library-yours">
  <Title id="library-yours" level={3}>{t('library.yourLibrary')}</Title>
  <SavedSourceGrid sources={savedSources} />
</section>
```

The starter card primary action says **Add to library** and calls the membership endpoint. It must not reuse owner edit/delete controls.

- [ ] **Step 5: Replace only the Library overview branch**

Use `LibraryOverview` for the unselected-source state. Keep existing selected-source detail tabs and callbacks unchanged. Do not refactor unrelated Feed, Agents, Playbooks, or Studio code.

- [ ] **Step 6: Add translations**

Add matching English/German keys for:

```json
"startHere": "Start here",
"starterPicks": "Starter picks",
"curatedForYou": "Curated for you",
"yourLibrary": "Your library",
"addToLibrary": "Add to library",
"starterLoadError": "Starter picks could not be loaded.",
"starterLoadRetry": "Try again",
"savedEmptyTitle": "Your library is ready for your first source",
"savedEmptyDescription": "Sources you add will appear here."
```

- [ ] **Step 7: Run smoke and build**

Run:

```powershell
npm --prefix apps/web run test:smoke -- --grep "library renders creation"
npm --prefix apps/web run build
```

Expected: PASS and successful build.

- [ ] **Step 8: Commit**

```powershell
git add apps/web/src/components/library apps/web/src/pages/AgentsPage.tsx apps/web/src/i18n apps/web/e2e/agent-setup.spec.ts
git commit -m "[NO-JIRA] reorganize library around starter picks"
```

### Task 3: Add frozen sample-report previews

**Files:**
- Create: `apps/web/src/components/library/SampleReportPreview.tsx`
- Modify: `apps/web/src/components/library/LibraryOverview.tsx`
- Modify: `apps/web/src/i18n/locales/en.json`
- Modify: `apps/web/src/i18n/locales/de.json`
- Modify: `apps/web/e2e/agent-setup.spec.ts`

**Interfaces:**
- Consumes: `CatalogDemo[]` and the existing `CharacterReportRenderer`.
- Produces: a read-only sample preview that cannot invoke user-report actions.

- [ ] **Step 1: Add failing sample-label assertions**

```ts
test('@smoke catalog demos are labeled and read only', async () => {
  const preview = await readFile(resolve(process.cwd(), 'src/components/library/SampleReportPreview.tsx'), 'utf8');
  expect(preview).toContain("t('library.sampleReport')");
  expect(preview).toContain('demo.disclosure');
  expect(preview).not.toContain('markReportRead');
  expect(preview).not.toContain('dismissReport');
});
```

- [ ] **Step 2: Run the sample test**

Run: `npm --prefix apps/web run test:smoke -- --grep "catalog demos"`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement read-only preview**

Render a compact teaser with a **Sample report** tag and disclosure. Opening it uses an Ant Design Drawer containing `CharacterReportRenderer` with no report ownership, chat, dismiss, read-state, or run controls.

Match demos to currently visible starter sources. If no eligible demo exists, omit the section rather than rendering an empty placeholder.

- [ ] **Step 4: Add translations and run checks**

Add:

```json
"sampleReport": "Sample report",
"sampleReportOpen": "See a sample analysis",
"sampleReportDisclosure": "Example output from a curated source and agent."
```

Run:

```powershell
npm --prefix apps/web run test:smoke -- --grep "catalog demos"
npm --prefix apps/web run build
```

Expected: PASS and successful build.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/components/library apps/web/src/i18n apps/web/e2e/agent-setup.spec.ts
git commit -m "[NO-JIRA] show labeled sample reports in library"
```

### Task 4: Replace forced onboarding with one-time directional guidance

**Files:**
- Modify: `apps/web/src/context/AppDataContext.tsx`
- Modify: `apps/web/src/components/AppShell.tsx`
- Modify: `apps/web/src/components/library/LibraryOverview.tsx`
- Modify: `apps/web/src/pages/AgentsPage.tsx`
- Modify: `apps/web/src/index.css`
- Modify: `apps/web/src/i18n/locales/en.json`
- Modify: `apps/web/src/i18n/locales/de.json`
- Modify: `apps/web/e2e/agent-setup.spec.ts`

**Interfaces:**
- Consumes: saved-source count and a persisted first-action acknowledgement.
- Produces: static/animated next-action treatment with reduced-motion behavior.

- [ ] **Step 1: Add failing removal and motion assertions**

Add:

```ts
test('@smoke first run uses library guidance instead of forced onboarding', async () => {
  const page = await readFile(resolve(process.cwd(), 'src/pages/AgentsPage.tsx'), 'utf8');
  const css = await readFile(resolve(process.cwd(), 'src/index.css'), 'utf8');
  expect(page).not.toContain('forceShowGuidedWizard');
  expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  expect(css).toContain('.library-next-action');
});
```

- [ ] **Step 2: Run the guidance test**

Run: `npm --prefix apps/web run test:smoke -- --grep "library guidance"`

Expected: FAIL while forced onboarding remains.

- [ ] **Step 3: Remove forced welcome flows**

Remove first-account auto-open logic, guided-wizard modal rendering, `forceShowOnboarding`, `forceShowGuidedWizard`, and their admin preview actions. Preserve source creation and AI curation flows that are invoked explicitly elsewhere.

- [ ] **Step 4: Implement acknowledgement state**

Use one key:

```ts
const LIBRARY_GUIDANCE_KEY = 'brk:library:add-source-guidance-seen';
```

Show attention only when the user has no saved sources and the key is absent. Set it when Add source opens or a starter source is saved.

Add a class with a restrained box-shadow pulse. Under reduced motion, disable animation while keeping the emphasized border and background.

- [ ] **Step 5: Run smoke and build**

Run:

```powershell
npm --prefix apps/web run test:smoke -- --grep "library guidance"
npm --prefix apps/web run build
```

Expected: PASS and successful build.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/context/AppDataContext.tsx apps/web/src/components/AppShell.tsx apps/web/src/components/library apps/web/src/pages/AgentsPage.tsx apps/web/src/index.css apps/web/src/i18n apps/web/e2e/agent-setup.spec.ts
git commit -m "[NO-JIRA] replace forced onboarding with library guidance"
```

### Task 5: Add the optional post-source agent handoff

**Files:**
- Create: `apps/web/src/components/library/PostSourceChoiceModal.tsx`
- Modify: `apps/web/src/pages/AgentsPage.tsx`
- Modify: `apps/web/src/i18n/locales/en.json`
- Modify: `apps/web/src/i18n/locales/de.json`
- Modify: `apps/web/e2e/agent-setup.spec.ts`

**Interfaces:**
- Consumes: a newly created/saved `SourceRecord`.
- Produces: `onChooseAgent(source)` and `onSkip(source)` handoff; the next plan replaces the existing follow wizard behind `onChooseAgent`.

- [ ] **Step 1: Add failing handoff assertions**

```ts
test('@smoke saving a source offers optional agent selection', async () => {
  const modal = await readFile(resolve(process.cwd(), 'src/components/library/PostSourceChoiceModal.tsx'), 'utf8');
  expect(modal).toContain("t('library.chooseAgent')");
  expect(modal).toContain("t('library.skipAgent')");
  expect(modal).not.toContain('createPlaybook(');
});
```

- [ ] **Step 2: Run the handoff test**

Run: `npm --prefix apps/web run test:smoke -- --grep "offers optional agent"`

Expected: FAIL because the modal does not exist.

- [ ] **Step 3: Implement the modal**

Define:

```ts
export interface PostSourceChoiceModalProps {
  source: SourceRecord | null;
  open: boolean;
  onChooseAgent: (source: SourceRecord) => void;
  onSkip: (source: SourceRecord) => void;
}
```

The modal has exactly two actions. Skip closes it and sets `brk:library:add-agent-guidance:${source.id}` to `pending`. Choose agent closes it and invokes the current `onFollowSource(source)` handoff.

- [ ] **Step 4: Show one-time Add agent guidance after Skip**

On the newly saved source card, read the source-specific pending key and apply `library-next-action` to Add agent. Clear the key when Add agent is opened.

- [ ] **Step 5: Add translations and run checks**

Add:

```json
"sourceAdded": "Source added",
"chooseAgent": "Choose an agent",
"chooseAgentDescription": "Pick an agent now, or continue exploring and add one later.",
"skipAgent": "Skip for now"
```

Run:

```powershell
npm --prefix apps/web run test:smoke -- --grep "offers optional agent"
npm --prefix apps/web run build
```

Expected: PASS and successful build.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/components/library apps/web/src/pages/AgentsPage.tsx apps/web/src/i18n apps/web/e2e/agent-setup.spec.ts
git commit -m "[NO-JIRA] add optional agent handoff after source save"
```

### Task 6: Update product documentation

**Files:**
- Modify: `docs/APP-SUMMARY.md`
- Modify: `docs/implementation/PROJECT.md`

**Interfaces:**
- Consumes: completed seeded Library behavior.
- Produces: accurate first-run and Library documentation.

- [ ] **Step 1: Replace onboarding documentation**

State that signup creates no resources, the Library presents catalog starter picks and sample reports, source membership is explicit, and AI selection is optional after save.

- [ ] **Step 2: Record completion**

Add the exact UI components, removed onboarding state, and smoke/build commands to the project ledger.

- [ ] **Step 3: Commit**

```powershell
git add docs/APP-SUMMARY.md docs/implementation/PROJECT.md
git commit -m "[NO-JIRA] document seeded library experience"
```
