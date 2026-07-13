---
name: agent-or-skill-gate
description: >
  Gate check before creating custom agents or skills. Advises whether something should be a skill (preferred) or custom agent. Provides token-efficient creation guidance and compression rules. USE FOR: create agent, create skill, new agent, new skill, should this be agent or skill, agent vs skill decision, planning new automation.
---

# Agent-or-Skill Gate

Invoke BEFORE creating custom agent or skill. Decide which fits, guide token-efficient creation.

## Decision: Skill vs Agent

### Skill (default — ~95% of cases)

On-demand knowledge loaded only when needed.

Choose skill when:
- Domain knowledge/standards (coding style, security, logging, UI/UX)
- Templates/patterns to follow
- Checklists/validation rules
- Format specs (field mappings, diagrams)
- Technology guidance (Spring, Maven, CosmosDB)
- Any "how to do X correctly" content

Advantages: zero tokens when not invoked, no subprocess overhead, composable, easy to maintain.

### Agent (rare — justify it)

Autonomous multi-step workflows needing independent context.

Choose agent ONLY when ALL apply:
- Multi-step orchestration (not "apply these rules")
- Needs tool access (file read/write, shell, LSP) independently
- Decision-making between steps based on intermediate results
- Would be "developer doing job" not "rules to follow"

Valid examples: code review with diff analysis, migration (analyze→plan→rewrite→verify), complex refactoring with iterative tool use.

**If in doubt → skill.** Convert later if insufficient.

### Red Flags: Should NOT Be Agent

- Mostly rules/standards/guidelines → **skill**
- "Apply patterns when doing X" → **skill**
- Checklist or template → **skill**
- No tool access needed → **skill**
- Reference material → **skill**

## Creating Token-Efficient Skills

### Structure

```markdown
---
name: Skill Name; needs to match skill folder name as best practice
description: >
  1-2 sentence description. USE FOR: keyword triggers, comma separated.
---

# Title (short)

One-line purpose statement.

## [Main sections — keep minimal]

[Content — compressed, no fluff]

## Constraints

**Does:** X, Y, Z
**Does NOT:** A, B, C
```

### Compression Rules (apply from start)

- No articles (a/an/the) in prose
- No filler (just, really, basically, actually, simply)
- No hedging ("you might want to", "consider")
- Fragments OK ("Run tests" not "You should run tests")
- Short synonyms ("use" not "utilize", "fix" not "implement a solution")
- Merge bullets saying same thing differently
- One example per pattern (not three showing same concept)

### PRESERVE exactly (never compress)

- Code blocks (``` fenced), inline code (`backticks`)
- URLs, file paths, commands
- Technical terms, proper nouns
- Tables structure, YAML frontmatter

### Size Targets

- Simple (standards/rules): 30-80 lines
- Medium (patterns + examples): 80-150 lines
- Complex (code-heavy, templates): 150-300 lines
- Exceeding 300 → split into multiple skills or question scope

### Description Field (Critical for Routing)

YAML frontmatter description = platform routing. Must include:
- Clear purpose statement
- `USE FOR:` keyword list matching how users/AI would ask
- Under 3 lines total

## Creating Token-Efficient Agents (When Justified)

### Core Rule: Agents Orchestrate, Skills Educate

Agent prompt = workflow steps + tool usage + decisions. NOT knowledge dump.
Domain knowledge → skills. Agent references them.

### Agent Prompt Structure

```
1. Purpose (1 line)
2. Workflow steps (numbered, concrete)
3. Tool usage (what tools, when)
4. Decision points (if X then Y)
5. Skills to invoke (for domain knowledge)
6. Output format
7. Constraints (what NOT to do)
```

### Compression Rules (same as skills)

- No articles, filler, hedging, pleasantries
- Fragments OK, short synonyms
- One example per pattern
- Merge redundant bullets

### PRESERVE exactly

- Code blocks, inline code, URLs, file paths, commands
- Technical terms, proper nouns, tool/parameter names

### Token Budget

- Target: 50-150 lines
- Hard ceiling: 200 lines — if exceeding, extract to skills
- Reference skills instead of embedding standards

### Size Reduction Patterns

| Problem | Fix |
|---------|-----|
| Standards embedded in agent | Extract to skill, add "invoke X skill" |
| Multiple examples same pattern | Keep one |
| Verbose step descriptions | Fragment: "Read → extract → validate" |
| Long constraint lists | Merge related items |
| Repeated context across agents | Shared skill both reference |

### Agent Anti-Patterns

- Embedding coding/security standards (→ skill)
- Long "background" domain sections (→ skill)
- Copy-pasting same rules into multiple agents (→ shared skill)
- Using agent when no tool access needed (→ skill)

## Recommendation Template

When advising:

**Verdict:** Skill / Agent / Split (skill + agent)
**Reasoning:** 1-2 sentences
**If skill:** Suggested name, key sections, size estimate
**If agent:** What justifies complexity, which skills to reference
**Token estimate:** Approximate lines for final artifact
