---
name: agents-md-skill
description: >
  Create and maintain high-signal AGENTS.md with low always-on token cost.
  USE FOR: AGENTS.md, context file, write/review AGENTS.md, prune, keep vs delete rules.
---

# AGENTS.md Authoring and Review

Write/review AGENTS.md with landmine-first, low-token rules.

## Core principle

AGENTS.md always-on context. Extra line costs tokens + attention.

Keep only guidance agent cannot reliably infer from repo.

## Scope

Use this skill for:
- New AGENTS.md creation
- Existing AGENTS.md review
- Rewrite verbose to compact
- Keep/delete decisions for candidate lines

Out of scope:
- Full project documentation
- Team process wiki
- Generic language/framework primers

## Decision filter: keep vs delete

Rule: If agent can discover from code or standard tooling, delete.

Keep only non-discoverable landmines:
- Mandatory command variants preventing false results
- Unsafe zones agent must not refactor
- Environment constraints invisible from repo (VPN, network, infra gate)
- Order-sensitive operational traps (migration sequencing, release gating)

Delete discoverable noise:
- Language/framework/package manager already visible in files
- Directory maps agent can find via search
- Obvious branch or repo metadata
- Repeated instructions already enforced by tooling

## Authoring workflow

1. Collect candidate rules from failures, postmortems, reviewer feedback.
2. Apply discoverability filter to each candidate.
3. Keep only high-impact, non-discoverable constraints.
4. Compress phrasing to shortest clear form.
5. Order by risk: breakage/security first, efficiency second.
6. Cap file size; remove weakest lines first when over budget.

## Review workflow (existing AGENTS.md)

1. Parse each line into one category: landmine, discoverable, duplicate, stale, vague.
2. Remove discoverable, duplicate, stale items.
3. Rewrite vague items into concrete command or constraint.
4. Return edited AGENTS.md plus short rationale table.

## Output formats

When asked to **write** AGENTS.md, output:
1. Final AGENTS.md content
2. Keep/Delete table for candidate rules

When asked to **review** AGENTS.md, output:
1. Revised AGENTS.md
2. Findings table with action per line

## Compact AGENTS.md template

Use baseline; replace placeholders only when true.

```text
# AGENTS.md

Critical constraints only. Discoverable facts excluded.

- Use `<required command pattern>` for `<task>`; default variant invalid here.
- Do not refactor `<sensitive module/path>` until `<condition>`.
- Run `<ordered step 1>` before `<ordered step 2>`; reverse order breaks `<reason>`.
- `<environment gate>` required before `<operation>`.
```

## Quality bar

Good AGENTS.md characteristics:
- 6-25 lines typical
- One rule per line
- Concrete verbs and objects
- Testable by reviewer in one pass
- Removes more lines over time than adds

Reject output when:
- Reads like wiki/onboarding doc
- Contains generic stack facts
- Uses soft advice without action
- Duplicates CI or lint policy already encoded in tooling

## Maintenance loop

Treat AGENTS.md like bug tracker:
1. Agent fails due to hidden constraint -> add one minimal line.
2. Root cause fixed in code/tooling -> delete line.
3. Re-run pruning periodically; target net shrink.

## Constraints

**Does:** author compact AGENTS.md, review existing file, classify rules, prune noise, preserve high-impact constraints.

**Does NOT:** generate long prose docs, duplicate repository-discoverable facts, retain stale guidance, pad context for completeness.
