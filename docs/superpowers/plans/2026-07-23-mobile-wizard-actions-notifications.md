# Mobile Wizard Actions and Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the framed wizard footer on mobile, keep desktop actions non-sticky, right-align Save on agent selection, and make the mobile notification bell open on the first touch.

**Architecture:** Keep responsive behavior in the existing mobile media query rather than JSX utility classes. The wizard action containers stay structurally shared across viewports, while mobile CSS supplies sticky positioning, safe-area spacing, transparent presentation, and circular controls. Restructure the header badge so the Ant Design popover receives the button as its direct trigger instead of receiving events through `TouchSafeTooltip`.

**Tech Stack:** React 18, TypeScript, Ant Design 6, Tailwind CSS, Playwright smoke tests.

## Global Constraints

- Mobile action controls are independent `48x48px` circles with no full-width background, gradient, or border.
- Sticky positioning applies only below the `768px` breakpoint.
- Desktop keeps labeled buttons in normal document flow.
- Back stays left; Continue, Create, and Save stay right.
- Accessible names, loading states, badges, and notification dismissal behavior remain unchanged.
- Do not commit automatically; the current branch and working tree are user-owned.

---

### Task 1: Floating Mobile Wizard Actions

**Files:**
- Modify: `apps/web/e2e/agent-setup.spec.ts:61-78`
- Modify: `apps/web/src/index.css:241-266`
- Modify: `apps/web/src/pages/AgentsPage.tsx:4818-4929`
- Modify: `apps/web/src/components/AgentForm.tsx:410-438`
- Modify: `apps/web/src/components/AgentCurator.tsx:386-420,490-536`

**Interfaces:**
- Consumes: Existing `mobile-workflow-actions`, `curator-actions`, and `mobile-wizard-button` class names.
- Produces: New `mobile-agent-form-actions` hook for mobile-only sticky positioning.

- [ ] **Step 1: Write the failing structural regression**

Replace the wizard-action smoke assertions with checks that reject scrims and unconditional sticky utilities:

```ts
test('@smoke mobile wizard actions float without affecting desktop flow', async () => {
  const styles = await readFile(resolve(process.cwd(), 'src/index.css'), 'utf8');
  const agentsPage = await readFile(resolve(process.cwd(), 'src/pages/AgentsPage.tsx'), 'utf8');
  const curator = await readFile(resolve(process.cwd(), 'src/components/AgentCurator.tsx'), 'utf8');
  const agentForm = await readFile(resolve(process.cwd(), 'src/components/AgentForm.tsx'), 'utf8');

  expect(styles).not.toContain('.mobile-action-scrim');
  expect(styles).toContain('.mobile-agent-form-actions');
  expect(styles).toContain('width: 48px !important');
  expect(agentsPage).not.toContain('mobile-action-scrim');
  expect(agentsPage).not.toContain('sticky bottom-0');
  expect(agentsPage).toContain('ml-auto');
  expect(curator).not.toContain('mobile-action-scrim');
  expect(agentForm).not.toContain('sticky bottom-0');
  expect(agentForm).toContain('mobile-agent-form-actions');
});
```

- [ ] **Step 2: Run the regression and verify RED**

Run:

```powershell
Set-Location G:\brk\apps\web
npx playwright test e2e\agent-setup.spec.ts --grep "mobile wizard actions float"
```

Expected: FAIL because `.mobile-action-scrim`, unconditional `sticky bottom-0`, `44px` controls, and missing `mobile-agent-form-actions` still describe the current implementation.

- [ ] **Step 3: Implement the minimal responsive styling**

In `index.css`, include all three action containers in the existing mobile-only sticky rule, delete `.mobile-action-scrim`, and change button dimensions to `48px`:

```css
.mobile-fullscreen-modal .curator-actions,
.mobile-fullscreen-modal .mobile-workflow-actions,
.mobile-agent-form-actions {
  position: sticky;
  bottom: 0;
  z-index: 10;
  margin-right: -4px;
  margin-left: -4px;
  padding: 12px 4px max(12px, env(safe-area-inset-bottom));
  background: transparent;
}

.mobile-wizard-button {
  width: 48px !important;
  min-width: 48px !important;
  height: 48px !important;
  padding: 0 !important;
  border-radius: 9999px !important;
  box-shadow: 0 8px 24px rgba(31, 23, 46, 0.16);
}
```

Remove `mobile-action-scrim` and `sticky bottom-0` from JSX. Add `mobile-agent-form-actions` to the form action row. Add `ml-auto` to the primary action group in `AgentsPage.tsx` so a lone Save action is right-aligned.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
Set-Location G:\brk\apps\web
npx playwright test e2e\agent-setup.spec.ts --grep "mobile wizard actions float"
```

Expected: 1 passed.

---

### Task 2: First-Touch Mobile Notification Bell

**Files:**
- Modify: `apps/web/e2e/agent-setup.spec.ts`
- Modify: `apps/web/src/components/AppShell.tsx:313-373`

**Interfaces:**
- Consumes: Existing `bellOpen`, `setBellOpen`, `combinedNotices`, and `unread`.
- Produces: A `Popover` whose direct trigger is the bell `Button`, wrapped externally by the unread `Badge`.

- [ ] **Step 1: Write the failing bell-trigger regression**

Add:

```ts
test('@smoke notification bell uses a direct popover trigger on touch devices', async () => {
  const appShell = await readFile(resolve(process.cwd(), 'src/components/AppShell.tsx'), 'utf8');
  const bellBlock = appShell.slice(
    appShell.indexOf('{/* Bell */}'),
    appShell.indexOf('{/* User menu')
  );

  expect(bellBlock).toContain('<Badge count={unread.length}');
  expect(bellBlock).toMatch(/<Popover[\s\S]*>\s*<Button[\s\S]*BellOutlined/);
  expect(bellBlock).not.toContain('<TouchSafeTooltip');
});
```

- [ ] **Step 2: Run the regression and verify RED**

Run:

```powershell
Set-Location G:\brk\apps\web
npx playwright test e2e\agent-setup.spec.ts --grep "notification bell uses"
```

Expected: FAIL because `TouchSafeTooltip` currently sits between `Popover` and `Badge/Button`.

- [ ] **Step 3: Move the badge outside the popover**

Restructure only the trigger hierarchy:

```tsx
<Badge count={unread.length} size="small" className={unread.length > 0 ? 'ct-bell-badge-alert' : undefined}>
  <Popover
    open={bellOpen}
    onOpenChange={setBellOpen}
    trigger="click"
    title={/* preserve existing title */}
    content={/* preserve existing content */}
  >
    <Button
      shape="circle"
      icon={<BellOutlined />}
      aria-label={t('nav.bellLabel')}
      style={circleActionStyle}
    />
  </Popover>
</Badge>
```

Do not change notification data, copy, clear-all behavior, or unread counting.

- [ ] **Step 4: Verify GREEN and run affected checks**

Run:

```powershell
Set-Location G:\brk\apps\web
npx playwright test e2e\agent-setup.spec.ts --grep "notification bell uses"
npm run test:smoke
Set-Location G:\brk
npm run build:web
git --no-pager diff --check
```

Expected: Bell regression passes, all smoke tests pass, the web production build succeeds, and diff check reports no errors.
