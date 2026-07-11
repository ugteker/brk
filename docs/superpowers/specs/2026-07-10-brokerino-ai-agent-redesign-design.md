# Brokerino AI Agent Redesign Spec

## Scope

Redesign the current "bot" concept into an AI agent that:

- crawls configured web URLs and podcast feeds
- turns source content into normalized evidence
- sends that evidence plus a per-agent system prompt to the Anthropic Claude API (Sonnet model)
- returns publishable long/short stock signals for reporting
- stores prompt versions, run artifacts, and final reports for traceability

Public product language should shift from "bot" to "agent" where feasible. Existing storage names can remain as an implementation detail during transition.

Out of scope:
- automated trade execution
- brokerage write-back
- live market-data platform
- replacing the scheduler/runtime with a separate orchestration stack

## Goal

Each scheduled run should answer: "Given these sources, what stock signals should be reported?"

For v1, the output is informational only:
- long / short signals
- confidence
- short rationale
- source citations or timecodes

## Recommended Approach

### Option 1: Single-step worker
Fetch sources, build one prompt, call Claude, store the response.

Pros: smallest change.
Cons: weak audit trail, hard to debug, poor recovery when one source fails.

### Option 2: Staged pipeline with persisted artifacts
Crawler -> evidence normalization -> Claude analysis -> report publishing.

Pros: traceable, testable, partial failures are manageable, easy to review later.
Cons: more tables and services than the current bot config.

### Option 3: Event-driven multi-service pipeline
Separate services for crawling, summarizing, analysis, and report publishing.

Pros: scalable.
Cons: too much infrastructure for this stage.

### Recommendation

Use **Option 2**. It keeps the current scheduler/worker shape but makes the bot an actual AI analysis pipeline instead of a single config form.

## Proposed Design

### Core model

An agent run has four phases:

1. **Collect** - fetch source content
2. **Normalize** - convert raw source material into evidence blocks
3. **Analyze** - send evidence + system prompt to the Anthropic Claude API
4. **Publish** - store structured signals and a human-readable report

### Provider boundary

Add one AI provider adapter:

- `AnthropicClaudeClient`

It owns:
- auth/transport to the Anthropic Claude API using the user's API key
- model selection
- request/response shaping for Claude
- retry behavior for transient failures

The rest of the app should depend on a provider interface, not on Anthropic-specific APIs.

### Source adapters

Support two source adapters in v1:

- **Web URL adapter** - fetch article HTML, extract readable text, keep quoted spans
- **Podcast feed adapter** - fetch feed metadata, episode notes, and transcript text if available; fall back to show notes when transcripts are missing

If a podcast source has no transcript or notes, it should be marked as partially unusable instead of silently skipped.

### Prompt management

Add a dedicated **System Prompts** page/section per agent.

It should store:
- prompt text
- model target
- prompt version
- enabled/disabled state

Each run must reference the exact prompt version used so the report can be reproduced later.

### Output schema

Claude should return structured JSON, not free text.

Required fields:
- run summary
- signals array
- for each signal: `symbol`, `side` (`long` or `short`), `confidence`, `rationale`, `citations`

Optional fields:
- `sourceWarnings`
- `ignoredMentions`
- `needsHumanReview`

Signals should only be published when they meet the agent's configured confidence threshold.

## UX / UI Direction

Use **Ant Design** as the primary UI library for the redesign to give the product a more polished, enterprise-style dashboard and form experience.

The current wizard should evolve into an agent setup flow:

1. Agent identity
2. Sources and ingestion rules
3. System prompt
4. Signal policy and publish rules
5. Schedule and recipients
6. Review and run

Dashboard should show:
- latest run status
- latest signals
- confidence summary
- prompt version used

The dashboard should make it obvious that the product produces analysis outputs, not trades. All new screens and controls should follow Ant Design patterns and theming rather than the current lightweight custom/shadcn-style approach.

## Data Flow

1. User configures an agent and its system prompt.
2. Scheduler creates a run.
3. Crawl adapters fetch source material.
4. Evidence is normalized and persisted.
5. The prompt builder assembles the Claude request.
6. The Claude provider sends the request to the Anthropic Claude API.
7. Response is validated against the JSON schema.
8. Signals and report content are stored.
9. UI and email/report consumers read the stored report.

## Error Handling

- **Per-source failures**: keep the run alive if at least one source succeeds; surface failed sources in the report.
- **Missing transcripts**: fall back to show notes/metadata; flag the source as low fidelity.
- **Large inputs**: chunk evidence before prompting; preserve source IDs/timecodes.
- **Invalid model output**: retry once with stricter schema instructions, then fail the run with a parse error.
- **Provider outage**: mark the run failed and keep source artifacts for later replay.

## Testing

- unit tests for source adapters and evidence normalization
- unit tests for prompt assembly and output parsing
- integration tests for the Anthropic Claude provider boundary using a stub client
- run tests that prove a podcast/article can produce structured long/short signals
- UI tests for prompt editing, run status, and report display

## Acceptance Criteria

- An agent run can crawl web sources and podcast feeds.
- The run sends source evidence and system prompt text to Claude Sonnet.
- The output is a structured report with long/short signals and citations/timecodes.
- Prompt versions are stored and tied to runs.
- The dashboard shows analysis results, not just configuration.
- The implementation remains testable without a live Anthropic Claude API dependency.
- The redesigned UI uses Ant Design consistently for the main experience.
