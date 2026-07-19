# Structured Report Card Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist domain-neutral report metadata and a validated, declarative recommendation for which report facts a future result card should emphasize.

**Architecture:** Claude returns metadata under the existing `common` report object. The backend normalizes all untrusted values against fixed unions and limits before persisting them in the existing JSON `reportJson` column. The web client receives the same typed structure, but no Feed UI consumes it in this change.

**Tech Stack:** TypeScript, Node.js API, Prisma JSON-string persistence, React frontend DTOs, Anthropic Claude JSON responses.

**Status:** Complete. The contract, Claude JSON instruction, normalization, JSON round-trip, and frontend DTO are implemented. Feed-card rendering remains intentionally out of scope.

## Global Constraints

- The platform is domain-neutral; no general metadata or presentation field may assume finance, stocks, or trading.
- Agent output is data only: never accept or execute agent-provided JSX, HTML, CSS, JavaScript, or rendering templates.
- `card_presentation` is advisory; frontend product code remains the only renderer.
- Store data in `AgentRunReport.reportJson`; do not add a Prisma migration.
- Legacy reports without metadata must normalize to valid, safe defaults.
- Do not alter Feed cards in this change.
- Existing user preference is to ignore tests; validate the touched applications with their existing build/type-check commands.

---

### Task 1: Define report and presentation contracts

**Files:**
- Modify: `apps/api/src/modules/reports/types.ts:11-16`
- Modify: `apps/web/src/api/agents.ts:219-237`

**Interfaces:**
- Produces `ReportResultType`, `ReportTimeHorizon`, `ReportTone`, `ReportCardEmphasis`, `ReportCardPrimaryField`, `ReportCardSupportingField`, and `CardPresentation`.
- Produces `UnifiedReportCommonFields.card_presentation: CardPresentation`.
- The frontend DTO mirrors all server JSON properties exactly.

- [ ] **Step 1: Add bounded backend contracts**

```ts
export type ReportCardEmphasis = 'standard' | 'attention' | 'critical' | 'positive';
export type ReportCardPrimaryField =
  | 'headline'
  | 'short_summary'
  | 'recommendation'
  | 'open_question'
  | 'key_takeaway';
export type ReportCardSupportingField =
  | 'result_type'
  | 'keywords'
  | 'relevance'
  | 'confidence'
  | 'time_horizon'
  | 'entities'
  | 'evidence'
  | 'novelty';

export interface CardPresentation {
  emphasis: ReportCardEmphasis;
  primary_field: ReportCardPrimaryField;
  supporting_fields: ReportCardSupportingField[];
  hide_when_empty: boolean;
  rationale: string;
}
```

- [ ] **Step 2: Extend `UnifiedReportCommonFields`**

```ts
export interface UnifiedReportCommonFields {
  summary: string;
  key_takeaways: string[];
  sources_used: string[];
  citations: string[];
  headline: string;
  short_summary: string;
  result_type: ReportResultType;
  keywords: string[];
  relevance: number;
  confidence: number;
  evidence: ReportEvidence[];
  entities: ReportEntity[];
  recommendation: string;
  open_questions: string[];
  time_horizon: ReportTimeHorizon;
  tone: ReportTone;
  source_references: ReportSourceReference[];
  novelty: number;
  card_presentation: CardPresentation;
}
```

- [ ] **Step 3: Mirror the public report DTO**

Add the same JSON field names and literal unions to `UnifiedReportCommonFieldsDto` in `apps/web/src/api/agents.ts`; do not convert agent-generated labels into UI copy.

- [ ] **Step 4: Commit**

```powershell
git add apps/api/src/modules/reports/types.ts apps/web/src/api/agents.ts
git commit -m "feat: define report presentation metadata"
```

### Task 2: Request declarative presentation recommendations

**Files:**
- Modify: `apps/api/src/modules/analysis/claude-client.ts:40-50`

**Interfaces:**
- Consumes the `UnifiedReportCommonFields` JSON shape from Task 1.
- Produces a Claude response containing only whitelisted `card_presentation` values.

- [ ] **Step 1: Extend the common JSON contract**

Include all structured metadata in the `common` object and describe `card_presentation` explicitly:

```text
"card_presentation": {
  "emphasis": "standard" | "attention" | "critical" | "positive",
  "primary_field": "headline" | "short_summary" | "recommendation" | "open_question" | "key_takeaway",
  "supporting_fields": ["result_type" | "keywords" | "relevance" | "confidence" | "time_horizon" | "entities" | "evidence" | "novelty"],
  "hide_when_empty": boolean,
  "rationale": string
}
```

- [ ] **Step 2: Add guardrail instructions**

```text
`card_presentation` is a data recommendation for a product-owned renderer.
Never return HTML, CSS, JSX, JavaScript, component names, markdown layouts, or arbitrary field names.
Choose one primary field and at most three unique supporting fields. Prefer facts that are present and useful for scanning this result.
```

- [ ] **Step 3: Commit**

```powershell
git add apps/api/src/modules/analysis/claude-client.ts
git commit -m "feat: request report card presentation guidance"
```

### Task 3: Normalize untrusted report metadata

**Files:**
- Modify: `apps/api/src/modules/reports/unified-report.ts:19-40`
- Modify: `apps/api/src/modules/analysis/response-parser.ts:14-76`

**Interfaces:**
- Consumes arbitrary Claude JSON under `common`.
- Produces complete `UnifiedReportCommonFields` with defaults, bounded number fields, maximum list lengths, and whitelisted presentation fields.

- [ ] **Step 1: Add complete legacy defaults**

```ts
const EMPTY_COMMON: UnifiedReportCommonFields = {
  summary: '',
  key_takeaways: [],
  sources_used: [],
  citations: [],
  headline: '',
  short_summary: '',
  result_type: 'insight',
  keywords: [],
  relevance: 0,
  confidence: 0,
  evidence: [],
  entities: [],
  recommendation: '',
  open_questions: [],
  time_horizon: 'unspecified',
  tone: 'neutral',
  source_references: [],
  novelty: 0,
  card_presentation: {
    emphasis: 'standard',
    primary_field: 'headline',
    supporting_fields: [],
    hide_when_empty: true,
    rationale: ''
  }
};
```

- [ ] **Step 2: Normalize scalar and collection metadata**

Create focused normalizers for strings, `0..100` numeric scores, typed evidence/entity/source-reference objects, and capped unique string arrays. Treat malformed optional metadata as absent; do not reject a report that has a valid legacy summary and section.

- [ ] **Step 3: Normalize presentation guidance**

```ts
function normalizeCardPresentation(value: unknown): CardPresentation {
  // Accept only enum members, one primary field, up to three distinct supporting fields,
  // and a boolean `hide_when_empty`; all other values use EMPTY_COMMON defaults.
}
```

Remove the selected primary field from `supporting_fields` when it maps to the same semantic content, and never retain unrecognized field names.

- [ ] **Step 4: Preserve parser flow**

Keep `parseClaudeResponse()` passing raw `common` to `normalizeUnifiedCharacterReport()`. It must still accept older responses containing only `summary` and character-specific sections.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/modules/reports/unified-report.ts apps/api/src/modules/analysis/response-parser.ts
git commit -m "feat: normalize report card presentation metadata"
```

### Task 4: Preserve persistence and expose the contract

**Files:**
- Verify: `apps/api/src/modules/reports/repository.ts:31-48`
- Verify: `apps/api/src/modules/reports/repository.ts:124-163`
- Modify only if needed: `apps/web/src/api/agents.ts`

**Interfaces:**
- Consumes normalized `UnifiedCharacterReport`.
- Produces a JSON report record with `common.card_presentation` both immediately after saving and when reading historical records.

- [ ] **Step 1: Confirm JSON round-trip**

Keep the existing `JSON.stringify(normalizedReport)` write and `normalizeUnifiedCharacterReport()` read. Do not introduce relational fields or Prisma schema changes.

- [ ] **Step 2: Confirm public DTO parity**

Ensure `RunReportDto.report.common` includes all Task 1 fields; no Feed component imports or renders `card_presentation` yet.

- [ ] **Step 3: Commit only if a persistence/DTO correction was required**

```powershell
git add apps/api/src/modules/reports/repository.ts apps/web/src/api/agents.ts
git commit -m "fix: expose persisted report presentation metadata"
```

### Task 5: Build the changed applications

**Files:**
- Verify: `apps/api`
- Verify: `apps/web`

**Interfaces:**
- Verifies the API and frontend agree on the JSON contract.

- [ ] **Step 1: Build the API**

```powershell
npm --prefix apps/api run build
```

Expected: successful TypeScript build with no contract errors.

- [ ] **Step 2: Build the web application**

```powershell
npm --prefix apps/web run build
```

Expected: successful production build with the expanded report DTO.

- [ ] **Step 3: Update task status and plan checkboxes**

Mark all completed tasks in the session tracker and this plan. Do not claim a card redesign; the stored presentation data is for the later Feed-card design phase.

## Self-Review

- **Spec coverage:** Tasks 1–4 implement declarative per-report presentation, strict validation, JSON persistence, frontend transport, legacy compatibility, and the explicit ban on generated render code. Task 5 validates the contract. Feed rendering is intentionally excluded.
- **Placeholder scan:** No `TODO`, `TBD`, or deferred implementation references are used as work instructions.
- **Type consistency:** `CardPresentation` is defined in Task 1, requested in Task 2, normalized in Task 3, persisted through `UnifiedCharacterReport` in Task 4, and build-checked in Task 5.
