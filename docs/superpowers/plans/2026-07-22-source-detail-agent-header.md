# Source Detail Agent Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the duplicated source-detail agent strip with a single
header-level add-agent control that opens the existing follow wizard.

**Architecture:** Keep source-to-agent assignment entirely in the existing
follow wizard. `AgentsPage` moves the existing circular add-agent button from
the detail-body strip into the `Card.extra` header action group, then removes
the strip and its duplicate agent/removal UI.

**Tech Stack:** React, TypeScript, Ant Design, Tailwind CSS, Vitest, Testing
Library.

## Global Constraints

- Keep “Watched by” as the only source-detail linked-agent presentation.
- The header action must use `library.addAgent` for both tooltip and ARIA label.
- Its click handler must call `onFollowSource(selectedSource, event)`.
- Do not change APIs, source/playbook state, or follow-wizard behavior.
- Do not change the existing “Analyze new content” callback.

---

### Task 1: Move the add-agent control to the source-detail header

**Files:**
- Modify: `apps/web/src/pages/AgentsPage.tsx:2315-2357,2526-2588`
- Modify: `apps/web/src/pages/AgentsPage.three-hub.test.tsx`

**Interfaces:**
- Consumes: `onFollowSource(source: SourceRecord, event?: React.MouseEvent)`.
- Produces: one source-detail header button with
  `aria-label={t('library.addAgent')}`.

- [ ] **Step 1: Write the failing UI test**

Add a source-detail test with a source, linked playbook, and matching agent.
Open the source detail, then assert that clicking the only
`library.addAgent`-labelled button opens the preselected follow wizard:

```tsx
fireEvent.click(await screen.findByText('Example source'));
fireEvent.click(screen.getByRole('button', { name: /add agent/i }));

expect(await screen.findByRole('dialog', { name: /summarize/i })).toBeInTheDocument();
expect(screen.getByText('Example source')).toBeInTheDocument();
```

Also assert the former detail-strip heading is absent:

```tsx
expect(screen.queryByText(/agents follow/i)).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```powershell
cd apps/web
npx vitest run src/pages/AgentsPage.three-hub.test.tsx
```

Expected: the test fails because the header does not yet contain the
add-agent control and the old strip is still rendered.

- [ ] **Step 3: Move the existing header-safe button**

In the `Card.extra` action `<div>` for `selectedSource`, insert:

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

Keep it beside the existing “Analyze new content” action and before the
discussion/manage-source actions. Remove the complete body strip beginning
with `library.agentFollowLabel`, including `linkedAgentLinks`, avatar
buttons, owner-only `Popconfirm` controls, and its inline add-agent button.
Remove the now-unused `linkedAgentLinks` declaration.

- [ ] **Step 4: Run the focused test to verify it passes**

Run:

```powershell
cd apps/web
npx vitest run src/pages/AgentsPage.three-hub.test.tsx
```

Expected: the new header-action test passes; no add-agent control exists in
the removed detail strip.

- [ ] **Step 5: Run the production build**

Run:

```powershell
cd apps/web
npm run build
```

Expected: Vite completes successfully.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/pages/AgentsPage.tsx apps/web/src/pages/AgentsPage.three-hub.test.tsx
git commit -m "fix(library): move source agent action to detail header" -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

## Self-Review

- **Spec coverage:** Task 1 removes the duplicate detail strip, adds the
  header action, preserves the existing follow callback, and validates the
  wizard flow and production build.
- **Placeholder scan:** No TBD, deferred behavior, or unspecified code paths.
- **Type consistency:** The plan uses the existing `SourceRecord` and
  `onFollowSource` signature without adding new state or interfaces.
