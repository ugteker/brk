# Brokerino UI Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Brokerino’s default dashboard plus a full-featured 7-step bot configuration wizard with modern shadcn/ui UX.

**Architecture:** Keep a dashboard-first entry (`BotsPage`) and route users into a guided wizard inside `BotForm`. Split UI into small reusable shadcn-based primitives and wizard sections, with one shared state model and step-by-step validation. Preserve existing API contract while enriching frontend preferences payload.

**Tech Stack:** React, TypeScript, Vite, shadcn/ui (Radix + Tailwind patterns), Vitest, Playwright

## Global Constraints

- Application name must be **Brokerino**.
- Default start view must be **Bot Dashboard**.
- Wizard layout must be **wizard-stepper**.
- Mandatory steps are exactly: basic_identity, sources, schedule, asset_universe_strategy, risk_settings, notifications, review_test.
- Guidance level is **balanced** (short helper text + inline validation).
- All newly added UI components must use shadcn/ui patterns.
- Source types remain `web_urls` and `podcast_feeds`.
- Schedule modes remain interval and daily-timezone.
- Existing backend limits still apply: max 20 bots/user, max 50 sources/bot, min interval 60 minutes.

---

### Task 1: Dashboard Shell + Branding

**Files:**
- Modify: `apps/web/src/pages/BotsPage.tsx`
- Test: `apps/web/src/components/BotForm.test.tsx`

**Interfaces:**
- Consumes: `BotForm`, `BotStatusCard`
- Produces: Brokerino-branded dashboard shell with create/config area

- [ ] **Step 1: Write failing test expectation for Brokerino heading**

```tsx
// append in BotForm/Bots page related test file
expect(screen.getByText(/brokerino/i)).toBeInTheDocument();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/web run test -- src/components/BotForm.test.tsx`  
Expected: FAIL because Brokerino heading is missing.

- [ ] **Step 3: Implement Brokerino dashboard shell**

```tsx
// apps/web/src/pages/BotsPage.tsx
<header className="space-y-1">
  <h1 className="text-2xl font-bold">Brokerino</h1>
  <p className="text-sm text-gray-700">Bot Dashboard</p>
</header>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/web run test -- src/components/BotForm.test.tsx`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/BotsPage.tsx apps/web/src/components/BotForm.test.tsx
git commit -m "feat(web): add brokerino dashboard shell"
```

### Task 2: Seven-Step Wizard Structure

**Files:**
- Modify: `apps/web/src/components/BotForm.tsx`
- Modify: `apps/web/src/components/BotForm.test.tsx`
- Create: `apps/web/src/components/ui/textarea.tsx`
- Create: `apps/web/src/components/ui/switch.tsx`

**Interfaces:**
- Consumes: `createBot(payload: CreateBotPayload): Promise<unknown>`
- Produces:
  - Wizard state model with current step index
  - Step navigation methods: `goNext()`, `goBack()`, `goToStep(index)`
  - Section renderers for all 7 mandatory steps

- [ ] **Step 1: Write failing wizard-step test**

```tsx
expect(screen.getByText(/step 1 of 7/i)).toBeInTheDocument();
expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/web run test -- src/components/BotForm.test.tsx`  
Expected: FAIL because stepper UI does not exist.

- [ ] **Step 3: Implement minimal stepper shell**

```tsx
const steps = ['Basic identity', 'Sources', 'Schedule', 'Asset + strategy', 'Risk', 'Notifications', 'Review & test'];
const [currentStep, setCurrentStep] = useState(0);

<p aria-label="Wizard progress">Step {currentStep + 1} of {steps.length}</p>
<Button onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}>Back</Button>
<Button onClick={() => setCurrentStep((s) => Math.min(steps.length - 1, s + 1))}>Next</Button>
```

- [ ] **Step 4: Implement all 7 section bodies with shadcn components**

```tsx
// example section block
{currentStep === 0 && (
  <Card>
    <Input aria-label="Bot name" ... />
    <Textarea aria-label="Description" ... />
    <Switch aria-label="Active toggle" ... />
  </Card>
)}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npm --prefix apps/web run test -- src/components/BotForm.test.tsx`  
Expected: PASS with stepper and required controls.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/BotForm.tsx apps/web/src/components/BotForm.test.tsx apps/web/src/components/ui/textarea.tsx apps/web/src/components/ui/switch.tsx
git commit -m "feat(web): implement 7-step shadcn wizard for bot config"
```

### Task 3: Review/Test Actions + E2E Flow

**Files:**
- Modify: `apps/web/src/components/BotForm.tsx`
- Modify: `apps/web/e2e/bot-setup.spec.ts`

**Interfaces:**
- Consumes: wizard state from Task 2, `createBot` API client
- Produces:
  - Review step save action
  - Send test report action
  - E2E path: Dashboard → wizard → review → save

- [ ] **Step 1: Write failing e2e expectation for dashboard-first flow**

```ts
await expect(page.getByText('Bot Dashboard')).toBeVisible();
await page.getByRole('button', { name: /create bot/i }).click();
await expect(page.getByText(/step 1 of 7/i)).toBeVisible();
```

- [ ] **Step 2: Run e2e to verify it fails**

Run: `npm --prefix apps/web run test:e2e -- e2e/bot-setup.spec.ts`  
Expected: FAIL because flow does not expose dashboard-first wizard transition.

- [ ] **Step 3: Implement review step actions**

```tsx
{currentStep === 6 && (
  <Card>
    <Button onClick={onSendTestReport}>Send test report</Button>
    <Button onClick={onSave}>Save bot configuration</Button>
  </Card>
)}
```

- [ ] **Step 4: Update e2e flow and rerun**

Run: `npm --prefix apps/web run test:e2e -- e2e/bot-setup.spec.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/BotForm.tsx apps/web/e2e/bot-setup.spec.ts
git commit -m "feat(web): add review step actions and dashboard-first e2e flow"
```

## Self-Review

### 1. Spec coverage
- Brokerino naming covered in Task 1.
- Dashboard default view covered in Tasks 1 and 3.
- 7 mandatory steps covered in Task 2.
- shadcn-only policy covered in Task 2.
- Review/test/save behavior covered in Task 3.

### 2. Placeholder scan
- No TBD/TODO placeholders.
- Each task includes concrete file paths, code snippets, and commands.

### 3. Type consistency
- `createBot` interface is reused consistently from existing API client.
- Wizard step count and mandatory step list are aligned across tasks.
