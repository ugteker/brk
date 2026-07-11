# Brokerino Agent AI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Brokerino into an Anthropic Claude API-powered agent system that crawls configured sources, produces structured long/short stock signals, and presents them in a polished Ant Design dashboard.

**Architecture:** Keep the current Fastify + Prisma backend and the existing scheduler/worker shape, but add a dedicated analysis pipeline with source adapters, prompt-version storage, Claude API integration, and persisted artifacts/reports. On the frontend, replace the lightweight custom/shadcn-style experience with Ant Design for the redesigned agent dashboard, prompt editor, and signal/report views. Existing database names can remain as implementation detail during the transition.

**Tech Stack:** TypeScript, Fastify, Prisma, SQLite (local dev), Anthropic Claude API, React, Vite, Ant Design, Vitest, Playwright

## Global Constraints

- Use the Anthropic Claude API (Sonnet model).
- Output is informational only: long/short signals + confidence + rationale + source citations or timecodes.
- No automated trade execution, brokerage write-back, or live market-data platform.
- No separate orchestration stack; keep the current scheduler/worker shape.
- Use Ant Design as the primary UI library for the redesigned experience.
- Existing storage names can remain as an implementation detail during transition.
- The implementation must remain testable without a live Anthropic Claude API dependency.
- Local development continues to use the current SQLite-backed Prisma setup.
- The web app must keep proxying `/api` requests to the API during local development.
- The dashboard should load persisted agents/reports instead of staying local-only.

---

### Task 1: Persisting Prompt Versions and Run Artifacts

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/src/modules/bots/types.ts`
- Create: `apps/api/src/modules/prompts/types.ts`
- Create: `apps/api/src/modules/prompts/repository.ts`
- Create: `apps/api/src/modules/prompts/repository.test.ts`
- Create: `apps/api/src/modules/artifacts/types.ts`
- Create: `apps/api/src/modules/artifacts/repository.ts`
- Create: `apps/api/src/modules/artifacts/repository.test.ts`
- Create: `apps/api/src/modules/reports/types.ts`
- Create: `apps/api/src/modules/reports/repository.ts`
- Create: `apps/api/src/modules/reports/repository.test.ts`

**Interfaces:**
- Consumes: existing bot IDs from `apps/api/src/modules/bots/types.ts`
- Produces:
  - `PromptRepository.savePromptVersion(botId: string, input: CreatePromptVersionInput): Promise<PromptVersionRecord>`
  - `PromptRepository.getLatestPromptVersion(botId: string): Promise<PromptVersionRecord | null>`
  - `ArtifactRepository.saveArtifact(input: CreateArtifactInput): Promise<ArtifactRecord>`
  - `ArtifactRepository.listArtifactsForRun(botRunId: string): Promise<ArtifactRecord[]>`
  - `ReportRepository.saveRunReport(input: CreateRunReportInput): Promise<RunReportRecord>`
  - `ReportRepository.getLatestRunReport(botId: string): Promise<RunReportRecord | null>`

- [ ] **Step 1: Write the failing repository tests**

```ts
it('increments prompt versions and returns the latest one', async () => {
  const first = await repo.savePromptVersion('bot-1', {
    model: 'claude-sonnet',
    systemPrompt: 'v1',
    enabled: true
  });

  const second = await repo.savePromptVersion('bot-1', {
    model: 'claude-sonnet',
    systemPrompt: 'v2',
    enabled: true
  });

  expect(second.version).toBe(first.version + 1);
  expect((await repo.getLatestPromptVersion('bot-1'))?.systemPrompt).toBe('v2');
});

it('stores a run report with signals and citations', async () => {
  const saved = await repo.saveRunReport({
    botId: 'bot-1',
    botRunId: 'run-1',
    summary: 'Bullish on AAPL',
    needsHumanReview: false,
    sourceWarnings: ['one podcast transcript was missing'],
    signals: [
      {
        symbol: 'AAPL',
        side: 'long',
        confidence: 82,
        rationale: 'Strong product cycle',
        citations: ['podcast-ep-12@12:44']
      }
    ]
  });

  expect(saved.signals[0]?.symbol).toBe('AAPL');
});

it('stores normalized source artifacts for a run', async () => {
  const saved = await repo.saveArtifact({
    botId: 'bot-1',
    botRunId: 'run-1',
    kind: 'normalized_evidence',
    sourceRef: 'https://example.com/article',
    payloadJson: '{"content":"company guidance"}',
    fidelity: 'high'
  });

  expect(saved.kind).toBe('normalized_evidence');
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run:
`Set-Location G:\brk\apps\api; npm run test -- src\modules\prompts\repository.test.ts src\modules\artifacts\repository.test.ts src\modules\reports\repository.test.ts`

Expected: FAIL because the Prisma models and repositories do not exist yet.

- [ ] **Step 3: Add the Prisma models and repository implementations**

```prisma
model BotPromptVersion {
  id           String   @id @default(cuid())
  botId        String
  version      Int
  model        String
  systemPrompt String
  enabled      Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  bot          Bot      @relation(fields: [botId], references: [id], onDelete: Restrict)

  @@unique([botId, version])
}

model BotRunArtifact {
  id         String   @id @default(cuid())
  botRunId   String
  kind       String
  sourceRef  String
  payloadJson String
  fidelity   String
  createdAt  DateTime @default(now())
  botRun     BotRun   @relation(fields: [botRunId], references: [id], onDelete: Restrict)
}

model BotRunReport {
  id              String   @id @default(cuid())
  botId           String
  botRunId        String   @unique
  promptVersionId String
  summary         String
  sourceWarningsJson String
  needsHumanReview Boolean
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  bot             Bot      @relation(fields: [botId], references: [id], onDelete: Restrict)
  botRun          BotRun    @relation(fields: [botRunId], references: [id], onDelete: Restrict)
  promptVersion   BotPromptVersion @relation(fields: [promptVersionId], references: [id], onDelete: Restrict)
}

model BotSignal {
  id          String   @id @default(cuid())
  botRunId    String
  symbol      String
  side        String
  confidence  Int
  rationale   String
  citationsJson String
  createdAt   DateTime @default(now())
  botRun      BotRun   @relation(fields: [botRunId], references: [id], onDelete: Restrict)
}
```

```ts
export interface CreatePromptVersionInput {
  model: string;
  systemPrompt: string;
  enabled: boolean;
}

export interface PromptVersionRecord {
  id: string;
  botId: string;
  version: number;
  model: string;
  systemPrompt: string;
  enabled: boolean;
  createdAt: Date;
}

export interface SignalRecord {
  symbol: string;
  side: 'long' | 'short';
  confidence: number;
  rationale: string;
  citations: string[];
}

export interface CreateArtifactInput {
  botId: string;
  botRunId: string;
  kind: string;
  sourceRef: string;
  payloadJson: string;
  fidelity: 'high' | 'medium' | 'low';
}

export interface CreateRunReportInput {
  botId: string;
  botRunId: string;
  promptVersionId: string;
  summary: string;
  sourceWarnings: string[];
  needsHumanReview: boolean;
  signals: SignalRecord[];
}

export interface ArtifactRecord {
  id: string;
  botId: string;
  botRunId: string;
  kind: string;
  sourceRef: string;
  payloadJson: string;
  fidelity: 'high' | 'medium' | 'low';
  createdAt: Date;
}

export interface RunReportRecord {
  id: string;
  botId: string;
  botRunId: string;
  promptVersionId: string;
  summary: string;
  sourceWarnings: string[];
  needsHumanReview: boolean;
  signals: SignalRecord[];
  createdAt: Date;
}
```

- [ ] **Step 4: Re-run the repository tests and Prisma generation**

Run:
`Set-Location G:\brk\apps\api; npx prisma generate; npm run test -- src\modules\prompts\repository.test.ts src\modules\artifacts\repository.test.ts src\modules\reports\repository.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/src/modules/bots/types.ts apps/api/src/modules/prompts apps/api/src/modules/reports
git commit -m "feat(api): persist agent prompts and reports"
```

### Task 2: Building the Claude Analysis Pipeline and Source Adapters

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/modules/analysis/types.ts`
- Create: `apps/api/src/modules/analysis/source-adapters/web-url-adapter.ts`
- Create: `apps/api/src/modules/analysis/source-adapters/podcast-feed-adapter.ts`
- Create: `apps/api/src/modules/analysis/prompt-builder.ts`
- Create: `apps/api/src/modules/analysis/response-parser.ts`
- Create: `apps/api/src/modules/analysis/claude-client.ts`
- Create: `apps/api/src/modules/analysis/claude-client.test.ts`
- Create: `apps/api/src/modules/analysis/source-adapters/web-url-adapter.test.ts`
- Create: `apps/api/src/modules/analysis/source-adapters/podcast-feed-adapter.test.ts`
- Create: `apps/api/src/modules/analysis/prompt-builder.test.ts`
- Create: `apps/api/src/modules/analysis/response-parser.test.ts`

**Interfaces:**
- Consumes:
  - `PromptVersionRecord` from Task 1
  - source configs from existing bot records
- Produces:
  - `EvidenceBlock`
  - `ClaudeAnalysisRequest`
  - `ClaudeAnalysisResult`
  - `SignalRecord`

- [ ] **Step 1: Write the failing adapter and parser tests**

```ts
it('extracts readable text from an article fixture', async () => {
  const evidence = await adapter.fetch({
    type: 'web_urls',
    value: 'https://example.com/article'
  });

  expect(evidence[0]?.content).toContain('company guidance');
});

it('falls back to show notes when a podcast transcript is missing', async () => {
  const evidence = await adapter.fetch({
    type: 'podcast_feeds',
    value: 'https://example.com/feed.xml'
  });

  expect(evidence[0]?.fidelity).toBe('low');
});

it('parses Claude JSON into structured signals', () => {
  const parsed = parseClaudeResponse({
    summary: 'Mixed outlook',
    signals: [
      { symbol: 'AAPL', side: 'long', confidence: 81, rationale: '...', citations: ['ep1@10:12'] }
    ]
  });

  expect(parsed.signals[0]?.side).toBe('long');
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run:
`Set-Location G:\brk\apps\api; npm run test -- src\modules\analysis\claude-client.test.ts src\modules\analysis\source-adapters\web-url-adapter.test.ts src\modules\analysis\source-adapters\podcast-feed-adapter.test.ts src\modules\analysis\prompt-builder.test.ts src\modules\analysis\response-parser.test.ts`

Expected: FAIL because the analysis module does not exist yet.

- [ ] **Step 3: Add the minimal analysis module and Claude SDK dependency**

```ts
export interface EvidenceBlock {
  sourceId: string;
  sourceType: 'web_urls' | 'podcast_feeds';
  sourceRef: string;
  content: string;
  fidelity: 'high' | 'medium' | 'low';
  citations: string[];
}

export interface ClaudeAnalysisRequest {
  model: string;
  systemPrompt: string;
  evidence: EvidenceBlock[];
}

export interface ClaudeAnalysisResult {
  summary: string;
  signals: SignalRecord[];
  sourceWarnings: string[];
  needsHumanReview: boolean;
}
```

- [ ] **Step 4: Re-run the analysis tests and verify the parser boundary**

Run:
`Set-Location G:\brk\apps\api; npm run test -- src\modules\analysis\claude-client.test.ts src\modules\analysis\source-adapters\web-url-adapter.test.ts src\modules\analysis\source-adapters\podcast-feed-adapter.test.ts src\modules\analysis\prompt-builder.test.ts src\modules\analysis\response-parser.test.ts`

Expected: PASS with stubbed Claude responses and fixture-based source extraction.

- [ ] **Step 5: Commit**

```bash
git add apps/api/package.json apps/api/src/modules/analysis
git commit -m "feat(api): add claude analysis pipeline"
```

### Task 3: Wiring Scheduled Runs to Agent Execution and API Routes

**Files:**
- Create: `apps/api/src/modules/analysis/agent-runner.ts`
- Create: `apps/api/src/modules/analysis/agent-runner.test.ts`
- Modify: `apps/api/src/modules/runs/worker.ts`
- Modify: `apps/api/src/modules/schedules/scheduler-loop.ts`
- Modify: `apps/api/src/main.ts`
- Create: `apps/api/src/modules/agents/routes.ts`
- Create: `apps/api/src/modules/agents/routes.test.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/modules/bots/routes.ts` (delegate or keep compatibility)

**Interfaces:**
- Consumes:
  - `PromptRepository` from Task 1
  - `ArtifactRepository` from Task 1
  - `ReportRepository` from Task 1
  - `ClaudeClient` and adapters from Task 2
  - existing `RunQueueService`
- Produces:
  - `AgentRunner.run(botId: string, botRunId: string): Promise<{ status: 'succeeded' | 'failed'; errorCode?: string; reportId?: string }>`
  - `/api/agents` dashboard and prompt/report endpoints
  - worker execution that stores artifacts and reports instead of just marking runs complete

- [ ] **Step 1: Write the failing agent-runner and route tests**

```ts
it('stores artifacts and a report when a run succeeds', async () => {
  const result = await runner.run('bot-1', 'run-1');

  expect(result.status).toBe('succeeded');
  expect(reportRepository.saveRunReport).toHaveBeenCalledTimes(1);
});

it('returns latest agent report and prompt version through the API', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/agents/bot-1/report/latest' });

  expect(res.statusCode).toBe(200);
  expect(res.json().signals[0].symbol).toBe('AAPL');
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run:
`Set-Location G:\brk\apps\api; npm run test -- src\modules\analysis\agent-runner.test.ts src\modules\agents\routes.test.ts`

Expected: FAIL because the runner and agent routes do not exist yet.

- [ ] **Step 3: Implement the run coordinator and agent routes**

```ts
export async function processNextRun(
  workerId: string,
  queue: Pick<RunQueueService, 'claimNextRun' | 'completeRun'>,
  runner: Pick<AgentRunner, 'run'>
) {
  const run = await queue.claimNextRun(workerId);
  if (!run) return;

  const result = await runner.run(run.botId, run.id);
  await queue.completeRun(run.id, result.status, result.errorCode);
}
```

- [ ] **Step 4: Re-run the API tests and build**

Run:
`Set-Location G:\brk\apps\api; npm run test -- src\modules\analysis\agent-runner.test.ts src\modules\agents\routes.test.ts; npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/analysis/agent-runner.ts apps/api/src/modules/runs/worker.ts apps/api/src/modules/schedules/scheduler-loop.ts apps/api/src/main.ts apps/api/src/modules/agents apps/api/src/server.ts apps/api/src/modules/bots/routes.ts
git commit -m "feat(api): wire agent runs into claude pipeline"
```

### Task 4: Rebuilding the Web Experience with Ant Design

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/pages/BotsPage.tsx`
- Modify: `apps/web/src/components/BotForm.tsx`
- Modify: `apps/web/src/components/BotStatusCard.tsx`
- Modify: `apps/web/src/components/ThemePicker.tsx`
- Modify: `apps/web/src/api/bots.ts`
- Create: `apps/web/src/api/agents.ts`
- Create: `apps/web/src/components/AgentPromptEditor.tsx`
- Create: `apps/web/src/components/AgentSignalReport.tsx`
- Create: `apps/web/src/components/AgentPromptEditor.test.tsx`
- Create: `apps/web/src/components/AgentSignalReport.test.tsx`

**Interfaces:**
- Consumes:
  - `/api/agents` endpoints from Task 3
  - report/prompt payloads from Task 1 and Task 3
- Produces:
  - Ant Design `Layout`-based dashboard
  - 6-step agent setup flow:
    1. Agent identity
    2. Sources and ingestion rules
    3. System prompt
    4. Signal policy and publish rules
    5. Schedule and recipients
    6. Review and run
  - prompt editor and signal/report panels

- [ ] **Step 1: Write the failing Ant Design UI tests**

```tsx
it('renders the agent dashboard shell and the 6-step setup flow', () => {
  render(<BotsPage />);

  expect(screen.getByRole('heading', { name: /agent dashboard/i })).toBeInTheDocument();
  expect(screen.getByText(/step 1 of 6/i)).toBeInTheDocument();
});

it('renders a signal report with long/short tags', () => {
  render(<AgentSignalReport signals={[{ symbol: 'AAPL', side: 'long', confidence: 81, rationale: '...', citations: ['ep1@10:12'] }]} />);

  expect(screen.getByText('AAPL')).toBeInTheDocument();
  expect(screen.getByText(/long/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run:
`Set-Location G:\brk\apps\web; npm run test -- src\components\BotForm.test.tsx src\components\AgentPromptEditor.test.tsx src\components\AgentSignalReport.test.tsx`

Expected: FAIL because Ant Design screens and the agent-specific components do not exist yet.

- [ ] **Step 3: Replace the wizard/dashboard shell with Ant Design components**

```tsx
import { Layout, Card, Button, Steps, Form, Input, Select, Switch, Tag, Statistic } from 'antd';

<Layout>
  <Layout.Header>Brokerino Agent Dashboard</Layout.Header>
  <Card>
    <Steps current={currentStep} items={steps} />
  </Card>
</Layout>
```

- [ ] **Step 4: Re-run the UI tests and build**

Run:
`Set-Location G:\brk\apps\web; npm run test -- src\components\BotForm.test.tsx src\components\AgentPromptEditor.test.tsx src\components\AgentSignalReport.test.tsx; npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/src/main.tsx apps/web/src/pages/BotsPage.tsx apps/web/src/components/BotForm.tsx apps/web/src/components/BotStatusCard.tsx apps/web/src/components/ThemePicker.tsx apps/web/src/api/bots.ts apps/web/src/api/agents.ts apps/web/src/components/AgentPromptEditor.tsx apps/web/src/components/AgentSignalReport.tsx
git commit -m "feat(web): rebuild agent ui with antd"
```

### Task 5: End-to-End Verification and Setup Docs

**Files:**
- Create: `apps/api/src/modules/analysis/agent-runner.integration.test.ts`
- Create: `apps/web/e2e/agent-flow.spec.ts`
- Modify: `docs/implementation/setup-and-run.md`
- Modify: `apps/api/package.json` (if a test script split is needed)
- Modify: `apps/web/package.json` (if a test script split is needed)

**Interfaces:**
- Consumes: the runner, repositories, and Ant Design screens from Tasks 1–4
- Produces:
  - backend integration coverage for a crawl → Claude → signal report run
  - a Playwright flow that opens the dashboard, configures an agent, and verifies the latest report card
  - setup docs for Anthropic API keys and local dev startup

- [ ] **Step 1: Write the failing integration/E2E tests**

```ts
it('runs an agent end-to-end with a stubbed Claude client', async () => {
  const result = await runner.run('bot-1', 'run-1');

  expect(result.status).toBe('succeeded');
  expect(await reportRepository.getLatestRunReport('bot-1')).not.toBeNull();
});
```

```ts
await expect(page.getByRole('heading', { name: /agent dashboard/i })).toBeVisible();
await page.getByRole('button', { name: /create agent/i }).click();
await expect(page.getByText(/system prompt/i)).toBeVisible();
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run:
`Set-Location G:\brk\apps\api; npm run test -- src\modules\analysis\agent-runner.integration.test.ts`

Run:
`Set-Location G:\brk\apps\web; npm run test:e2e -- e2e\agent-flow.spec.ts`

Expected: FAIL because the end-to-end path is not fully wired until Tasks 1–4 land.

- [ ] **Step 3: Update the setup docs for Claude API usage**

```powershell
Set-Location G:\brk\apps\api
$env:ANTHROPIC_API_KEY = '<your key>'
$env:ANTHROPIC_MODEL = 'claude-sonnet-4-5'
npm run start
```

```powershell
Set-Location G:\brk\apps\web
npm run start
```

- [ ] **Step 4: Re-run the integration tests, E2E test, and builds**

Run:
`Set-Location G:\brk\apps\api; npm run test -- src\modules\analysis\agent-runner.integration.test.ts; npm run build`

Run:
`Set-Location G:\brk\apps\web; npm run test:e2e -- e2e\agent-flow.spec.ts; npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/analysis/agent-runner.integration.test.ts apps/web/e2e/agent-flow.spec.ts docs/implementation/setup-and-run.md apps/api/package.json apps/web/package.json
git commit -m "test: cover brokerino agent flow end to end"
```

## Self-Review

### 1. Spec coverage
- Anthropic Claude API integration is covered by Tasks 2 and 3.
- Long/short signal output with citations/timecodes is covered by Tasks 1, 2, and 5.
- Prompt version storage is covered by Task 1.
- Source crawling and normalization are covered by Task 2.
- Scheduler/worker pipeline wiring is covered by Task 3.
- Ant Design UI polish is covered by Task 4.
- Testability without a live Claude API is covered by Tasks 2 and 5.

### 2. Placeholder scan
- No TBD/TODO placeholders.
- No vague steps like "add validation later" or "handle edge cases" without concrete test targets.
- Every task has exact files, exact commands, and explicit expected outcomes.

### 3. Type consistency
- `PromptRepository.savePromptVersion`, `ReportRepository.saveRunReport`, `ClaudeAnalysisRequest`, `ClaudeAnalysisResult`, and `AgentRunner.run` are used consistently across tasks.
- The 6-step agent wizard is named the same way in Task 4 and the Playwright flow in Task 5.
- `/api/agents` is the public UI-facing route family referenced consistently in Tasks 3–5.
