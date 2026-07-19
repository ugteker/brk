# Library Media Agent Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Library source card with the approved media-aware layout, agent rail, preview list, and owner action menu.

**Architecture:** Keep `AgentsPage.tsx` as the existing Library-card composition point. Reuse stored `SourceRecord.metadata.coverImageUrl`, `previewItems`, `EntityActions`, and existing agent/playbook associations; add presentation helpers only where they reduce repeated JSX. Use full artwork with a blurred background for podcast feeds and image crops for other source types.

**Tech Stack:** React 18, TypeScript, Ant Design, Tailwind CSS, react-i18next, Vitest.

**Progress update (2026-07-18):** Added the approved report-status row between the source preview and agent rail. It shows the linked agents' available report count and newest report date, provides a translated empty state, and opens the source's Reports tab on click.

## Global Constraints

- New user-facing strings must be added to both `apps/web/src/i18n/locales/en.json` and `apps/web/src/i18n/locales/de.json`.
- Use the existing Ant Design UI components; do not introduce native button controls.
- Keep the Library grid at one column on mobile and two columns from `sm` upward.
- Use `metadata.coverImageUrl`; do not download, persist, or AI-process publisher artwork.
- Podcast feeds render cover art with `object-contain` over a blurred cover-art background; YouTube and web sources render image heroes with `object-cover`.
- Owner actions are consolidated into one `⋯` control; the main card click still opens the source detail view.

---

### Task 1: Add owner-menu support and translations

**Files:**
- Modify: `apps/web/src/components/EntityActions.tsx`
- Modify: `apps/web/src/i18n/locales/en.json`
- Modify: `apps/web/src/i18n/locales/de.json`
- Test: `apps/web/src/pages/AgentsPage.three-hub.test.tsx`

**Interfaces:**
- Consumes: `EntityActionsProps` callbacks already supplied by source cards.
- Produces: `EntityActions` with optional `variant="menu"` that renders a single `MoreOutlined` trigger and menu entries for edit and share/publish.

- [x] **Step 1: Write failing expectations for owner action trigger and new card labels**

```ts
expect(screen.getByLabelText(/manage source/i)).toBeInTheDocument();
expect(screen.getByText(/agents follow/i)).toBeInTheDocument();
```

- [x] **Step 2: Run the focused test**

Run: `npm --prefix apps/web test -- AgentsPage.three-hub.test.tsx`
Expected: FAIL because no source-management trigger or agent-rail label exists.

- [x] **Step 3: Extend `EntityActions` with the menu variant**

```tsx
type EntityActionsVariant = 'inline' | 'menu';

export interface EntityActionsProps {
  // existing props
  variant?: EntityActionsVariant;
}

// When variant === 'menu', render a Dropdown with Edit and Share / Publish
// items, and an Ant Design Button using MoreOutlined as its only trigger.
```

- [x] **Step 4: Add exact translation keys in both locale files**

```json
"agentFollowLabel": "Agents follow",
"recentItems": "Latest items",
"manageSource": "Manage source",
"addAgent": "Add agent",
"coverUnavailable": "Cover unavailable"
```

```json
"agentFollowLabel": "Agenten folgen",
"recentItems": "Neueste Inhalte",
"manageSource": "Quelle verwalten",
"addAgent": "Agent hinzufügen",
"coverUnavailable": "Cover nicht verfügbar"
```

- [x] **Step 5: Run the focused test**

Run: `npm --prefix apps/web test -- AgentsPage.three-hub.test.tsx`
Expected: PASS for the new trigger and translated card-label assertions.

### Task 2: Replace the source-card presentation

**Files:**
- Modify: `apps/web/src/pages/AgentsPage.tsx:2431-2582`
- Test: `apps/web/src/pages/AgentsPage.three-hub.test.tsx`

**Interfaces:**
- Consumes: `SourceRecord.metadata.coverImageUrl`, `SourceRecord.metadata.previewItems`, `playbooks`, `agents`, `getCharacterTypeEmoji`, `getAgentCharacterLabel`, `EntityActions variant="menu"`.
- Produces: a source card with media hero, source badge, owner menu, two-item preview, agent rail and ghost add-agent action.

- [x] **Step 1: Add failing card-rendering tests**

```ts
expect(screen.getByRole('img', { name: /macro daily cover/i })).toHaveClass('object-contain');
expect(screen.getByText(/latest items/i)).toBeInTheDocument();
expect(screen.getByText('Ep 1')).toBeInTheDocument();
expect(screen.queryByRole('button', { name: /summarize this source/i })).not.toBeInTheDocument();
```

- [x] **Step 2: Run the focused test**

Run: `npm --prefix apps/web test -- AgentsPage.three-hub.test.tsx`
Expected: FAIL because the current compact card renders a 56px cover and a summarize button.

- [x] **Step 3: Implement the approved media hero**

```tsx
const coverImageUrl = getSourceCoverImageUrl(source);
const usesContainedCover = source.type === 'podcast_feeds';

<div className="relative h-48 overflow-hidden rounded-t-lg bg-slate-900">
  {coverImageUrl && usesContainedCover ? (
    <>
      <img aria-hidden src={coverImageUrl} className="absolute -inset-4 h-[calc(100%+2rem)] w-[calc(100%+2rem)] object-cover blur-xl opacity-60" />
      <img src={coverImageUrl} alt={`${getSourceDisplayTitle(source)} cover`} className="relative h-full w-full object-contain" />
    </>
  ) : coverImageUrl ? (
    <img src={coverImageUrl} alt={`${getSourceDisplayTitle(source)} cover`} className="h-full w-full object-cover" />
  ) : (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t('library.coverUnavailable')}</div>
  )}
</div>
```

- [x] **Step 4: Implement content, preview, and agent rail**

```tsx
const cardPlaybooks = playbooks.filter((playbook) => playbook.sourceIds.includes(source.id));
const cardAgents = cardPlaybooks
  .map((playbook) => agents.find((agent) => agent.id === playbook.agentId))
  .filter((agent): agent is AgentSummary => Boolean(agent));

{source.metadata.previewItems.slice(0, 2).map((item) => (
  <div key={`${source.id}:${item.link ?? item.title}`} className="truncate">▶ {item.title}</div>
))}

{cardAgents.map((agent) => (
  <Tooltip key={agent.id} title={`${getAgentCharacterLabel(agent)} — ${getAgentPersonalityLabel(agent)}`}>
    <div className="flex w-12 flex-col items-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full">{getCharacterIcon(agent.characterType)}</span>
      <span className="truncate text-[10px]">{getAgentCharacterLabel(agent)}</span>
    </div>
  </Tooltip>
))}
```

- [x] **Step 5: Remove the bottom `ListenActiveButton`/`ListenIdleButton` card CTA**

```tsx
// Keep onFollowSource for the ghost-agent action, but remove both
// full-width Listen* buttons from the card footer.
```

- [x] **Step 6: Add the ghost agent as the final rail item**

```tsx
<Button
  type="dashed"
  shape="circle"
  aria-label={t('library.addAgent')}
  icon={<PlusOutlined />}
  onClick={(event) => onFollowSource(source, event)}
/>
```

- [x] **Step 7: Run focused tests**

Run: `npm --prefix apps/web test -- AgentsPage.three-hub.test.tsx`
Expected: PASS.

### Task 3: Build and regression verification

**Files:**
- Modify: `docs/superpowers/plans/2026-07-18-library-media-agent-card-implementation.md`

**Interfaces:**
- Consumes: completed Tasks 1 and 2.
- Produces: a verified web build and completed plan checklist.

- [~] **Step 1: Run the full web test suite** — intentionally not addressed at user request.

Run: `npm --prefix apps/web test`
Expected: PASS.

- [x] **Step 2: Build the web app**

Run: `npm --prefix apps/web run build`
Expected: Vite build succeeds with no TypeScript errors.

- [x] **Step 3: Mark completed plan steps**

```markdown
- [x] Completed each implementation and verification step above.
```

### Task 4: Apply Option 1 to every source image

**Files:**
- Modify: `apps/web/src/pages/AgentsPage.tsx:2432-2453`

**Interfaces:**
- Consumes: `getSourceCoverImageUrl(source): string | null` and `SourceRecord.metadata.coverImageUrl`.
- Produces: a universal media-hero rule: every available source image is rendered with `object-contain` above an enlarged, blurred copy of the same image.

- [x] **Step 1: Replace the podcast-only media condition**

Remove `usesContainedCover` and use one image branch for every source type:

```tsx
const coverImageUrl = getSourceCoverImageUrl(source);

{coverImageUrl ? (
  <>
    <img
      aria-hidden="true"
      src={coverImageUrl}
      className="absolute -inset-4 h-[calc(100%+2rem)] w-[calc(100%+2rem)] object-cover blur-xl opacity-60"
    />
    <img
      src={coverImageUrl}
      alt={`${getSourceDisplayTitle(source)} cover`}
      className="relative h-full w-full object-contain"
    />
  </>
) : (
  <div className="flex h-full items-center justify-center text-sm text-slate-300">
    {t('library.coverUnavailable')}
  </div>
)}
```

- [x] **Step 2: Add restrained card elevation**

Keep the existing Ant Design `Card`, its current click behavior, and its recent-update outline. Extend only its class list:

```tsx
className="overflow-hidden border border-slate-200/80 shadow-sm transition-shadow hover:shadow-md dark:border-slate-700/80 flex flex-col"
```

The border separates cards from the dashboard background; `shadow-sm` is intentionally subtle and `hover:shadow-md` provides interactive feedback without increasing the grid density.

- [x] **Step 3: Build the web application**

Run: `npm --prefix apps/web run build`

Expected: Vite completes without TypeScript or bundling errors. Per the user's explicit instruction, do not run or address tests.

- [x] **Step 4: Update this plan**

Mark Steps 1–3 complete after the production build succeeds.

### Task 5: Refine source-card visual hierarchy

**Files:**
- Modify: `apps/web/src/pages/AgentsPage.tsx:2484-2536`

**Interfaces:**
- Consumes: the existing preview section and `cardAgents` rail.
- Produces: greater separation between newest content and agents, plus a subdued framed agent rail.

- [x] **Step 1: Increase the content-to-agent separation**

Use `mt-6` on the agent section instead of relying only on `mt-auto`, and increase its top padding to `pt-4`. This makes the preview and agent areas distinct even when cards have little content.

- [x] **Step 2: Frame the agent rail**

Wrap the existing agent buttons and dashed add-agent button in a single subdued panel:

```tsx
<div className="rounded-lg border border-slate-200/80 bg-slate-50/60 p-3 dark:border-slate-700/80 dark:bg-slate-800/40">
  <div className="flex flex-wrap items-start gap-3">
    {/* existing agent buttons and add-agent button */}
  </div>
</div>
```

This preserves the individual circular agent icons and character labels while visually grouping them as the agents following this source.

- [x] **Step 3: Use the Studio microphone as the synthetic-discussion cover**

Render synthetic discussions before checking for a source image:

```tsx
{source.type === 'synthetic_discussion' ? (
  <div className="flex h-full items-center justify-center bg-gradient-to-br from-geekblue-100 to-sky-200 text-geekblue-700 dark:from-geekblue-950 dark:to-sky-950 dark:text-geekblue-200">
    <AudioOutlined className="text-6xl" />
  </div>
) : coverImageUrl ? (
  // universal Option 1 cover treatment
) : (
  // existing unavailable-cover state
)}
```

This reuses the Studio navigation's `AudioOutlined` icon and makes synthetic content immediately distinguishable from imported sources.

- [x] **Step 4: Build the web application**

Run: `npm --prefix apps/web run build`

Expected: Vite completes without TypeScript or bundling errors. Per the user's explicit instruction, do not run or address tests.

- [x] **Step 5: Update this plan**

Mark Steps 1–4 complete after the production build succeeds.

### Task 6: Strengthen the add-agent ghost affordance

**Files:**
- Modify: `apps/web/src/pages/AgentsPage.tsx:2530-2536`

**Interfaces:**
- Consumes: `onFollowSource(source, event)` and `t('library.addAgent')`.
- Produces: an accessible Ant Design dashed circular button that is visually distinct from existing agent icons.

- [x] **Step 1: Increase ghost-button visibility**

Keep the existing Ant Design `Button` and its click handler, but add an explicit large size and high-contrast dashed styling:

```tsx
<TouchSafeTooltip title={t('library.addAgent')}>
  <Button
    type="dashed"
    shape="circle"
    size="large"
    aria-label={t('library.addAgent')}
    icon={<PlusOutlined />}
    className="border-2 border-dashed border-sky-400 bg-sky-50 text-sky-700 shadow-sm transition-colors hover:border-sky-500 hover:bg-sky-100 hover:text-sky-800 dark:border-sky-500 dark:bg-sky-950/50 dark:text-sky-300"
    onClick={(event) => onFollowSource(source, event)}
  />
</TouchSafeTooltip>
```

- [x] **Step 2: Build the web application**

Run: `npm --prefix apps/web run build`

Expected: Vite completes without TypeScript or bundling errors. Per the user's explicit instruction, do not run or address tests.

- [x] **Step 3: Update this plan**

Mark Steps 1–2 complete after the production build succeeds.

### Task 7: Align source-card borders with the brand accent

**Files:**
- Modify: `apps/web/src/pages/AgentsPage.tsx:2441`

**Interfaces:**
- Consumes: the existing Ant Design source-card class list.
- Produces: a neutral card surface with a subtle brand-lilac border and stronger hover border.

- [x] **Step 1: Apply the brand-lilac border**

Use `border-[rgba(114,46,209,0.18)]` at rest, `hover:border-[rgba(114,46,209,0.38)]` on hover, and accessible lighter purple equivalents for dark mode. Keep the existing shadow behavior and do not tint the card background.

- [x] **Step 2: Build the web application**

`npm --prefix apps/web run build` completed successfully. Per the user's explicit instruction, tests were not run or addressed.

### Task 11: Show the source-agent remove control to source owners

**Files:**
- Modify: `apps/web/src/pages/AgentsPage.tsx`

**Interfaces:**
- Consumes: `source.ownerUserId` and `user?.id`.
- Produces: a visible agent-removal control under the same ownership rule as the source card's management menu.

- [x] **Step 1: Align visibility with source ownership**

Replace the control's playbook-owner check with `source.ownerUserId === user?.id`. The card’s edit and `⋯` controls already use this source-level ownership boundary, so the remove control must follow it as well.

- [x] **Step 2: Build the web application**

`npm --prefix apps/web run build` completed successfully. Per the user's explicit instruction, tests were not run or addressed.

### Task 10: Remove an agent from a source directly

**Files:**
- Modify: `apps/web/src/pages/AgentsPage.tsx`
- Modify: `apps/web/src/i18n/locales/en.json`
- Modify: `apps/web/src/i18n/locales/de.json`

**Interfaces:**
- Consumes: `PlaybookRecord.sourceIds`, `updatePlaybook()`, `deletePlaybook()`, and `refreshPlaybooks()`.
- Produces: an owner-only hover/focus remove control for every agent-to-source association.

- [x] **Step 1: Add localized removal copy**

Add labels for the remove action, confirmation title/description, success and failure messages in English and German. Add the shared `common.remove` label for the confirmation button.

- [x] **Step 2: Model each visible agent as an agent/playbook link**

Build `cardAgentLinks` from the source's linked playbooks and their matching agents. This preserves the exact playbook that owns a given agent-to-source association.

- [x] **Step 3: Remove only the source association**

`onRemoveAgentFromSource(playbook, sourceId)` removes `sourceId` from `playbook.sourceIds` through `updatePlaybook`. If this was its sole source, it deletes only the now-empty playbook. It refreshes playbooks and shows localized feedback.

- [x] **Step 4: Add the hover/focus removal control**

Place an owner-only, compact Ant Design danger `CloseOutlined` button in the upper-right corner of each agent item. Reveal it through the parent group's hover/focus state and wrap it in a localized `Popconfirm` plus `TouchSafeTooltip`.

- [x] **Step 5: Build the web application**

`npm --prefix apps/web run build` completed successfully. Per the user's explicit instruction, tests were not run or addressed.

### Task 9: Add restrained source-card hover elevation

**Files:**
- Modify: `apps/web/src/pages/AgentsPage.tsx:2441`

**Interfaces:**
- Consumes: the source-card's existing border and shadow hover behavior.
- Produces: a 2px upward hover translation without any scale transform.

- [x] **Step 1: Add a transform transition and hover lift**

Replace `transition-shadow` with `transition-[transform,box-shadow,border-color] duration-200` and add `hover:-translate-y-0.5`. Keep the existing border-color and shadow hover states intact.

- [x] **Step 2: Build the web application**

`npm --prefix apps/web run build` completed successfully. Per the user's explicit instruction, tests were not run or addressed.

### Task 8: Polish the synthetic-discussion cover

**Files:**
- Modify: `apps/web/src/pages/AgentsPage.tsx:2444-2447`

**Interfaces:**
- Consumes: Ant Design's `AudioOutlined` Studio icon.
- Produces: a premium, distinct media treatment for synthetic discussions without depending on external artwork.

- [x] **Step 1: Add the Studio cover treatment**

Replace the flat microphone placeholder with a dark violet-to-blue gradient, two blurred light fields, and a centered translucent rounded microphone badge. The badge uses `AudioOutlined`, white foreground, a translucent white background, and a fine white border.

- [x] **Step 2: Build the web application**

`npm --prefix apps/web run build` completed successfully. Per the user's explicit instruction, tests were not run or addressed.
