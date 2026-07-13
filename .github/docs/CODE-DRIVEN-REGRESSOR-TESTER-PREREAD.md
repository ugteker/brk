# Code-Driven Regressor Tester Pre-Read

## Purpose

This pre-read explains when to use the Code-Driven Regressor Tester agent, what it will produce, and how to run it effectively.

The agent is designed to generate a full Java regression test framework directly from source code behavior, not from assumptions or undocumented expectations.

## Agent Profile

- Agent name: Code-Driven Regressor Tester
- Location: agents/code-driven-regressor-tester.md
- Invocation mode: manual by user selection
- Primary output: runnable regression artifacts for discovered application flows

## When To Use This Agent

Use this agent when you need end-to-end regression scaffolding generated from an existing Java codebase, especially for:

- REST controller driven flows
- Message listener flows (Kafka or JMS)
- Scheduled-job driven flows
- Legacy systems where behavior must be inferred from source code

Use other resources when your task is not full regression framework generation:

- General coding workflow orchestration: agents/developer.md
- Domain standards and reusable recipes: skills/*/SKILL.md

## What The Agent Is Expected To Generate

The agent attempts complete flow coverage and creates artifacts in this order:

1. Feature files
2. Payloads
3. Mapper query layer
4. DB validator
5. Step definitions
6. Runner integration

Expected output areas:

- src/test/resources/features
- src/test/resources/payloads
- src/test/java/bdd/mapper
- src/test/java/bdd/validators
- src/test/java/bdd/steps
- src/test/java/bdd/runner

## Core Guardrails

- Code is the only source of truth.
- No assumptions for behavior that cannot be proven from source.
- No partial completion by design intent.
- SQL query logic belongs in mapper classes under src/test/java/bdd/mapper.
- Async handling should use Awaitility, not Thread.sleep.

## How To Invoke Manually

In Copilot Chat, explicitly select the Code-Driven Regressor Tester agent, then provide:

- Target repository or module path
- Target package boundaries (if needed)
- Any flow scope constraints (optional)
- Any environment limitations for execution/validation (DB, broker, credentials)

Example prompt:

Generate a full code-driven regression framework for this service. Discover all REST, listener, and scheduled flows, produce features and payloads first, then mapper, validator, step definitions, and runner. Do not assume behavior beyond source code.

## Input Checklist Before Running

- Source code compiles in current workspace
- Test dependencies are available or can be added
- Test runtime profile or config is identifiable (application.yml, application-test.yml)
- DB and messaging integration constraints are known

## Validation Checklist After Generation

- A feature exists for every discovered flow
- Scenario count matches payload count
- Payload naming aligns to scenario naming
- Mapper layer contains DB query logic
- Validator performs explicit field assertions
- API status and response checks are present for HTTP flows
- Messaging assertions are present for messaging flows

## Limitations And Assumptions

- The agent can only encode behavior visible in source code.
- Environment setup that depends on unavailable infrastructure may require user action.
- Generated tests may require project-specific tuning for credentials, ports, and test data lifecycle.

## Troubleshooting

If output is incomplete or misaligned:

1. Re-run with narrower scope (single module or package).
2. Ask for explicit flow inventory output first, then full generation.
3. Confirm source paths and build profile in the prompt.
4. Confirm DB and messaging test constraints up front.

## Related Docs

- README.md
- AGENTS.md
- CONTRIBUTING.md
- docs/WALKTHROUGH.md
