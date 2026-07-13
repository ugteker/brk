# Contributing

Guidelines for adding or modifying resources in this repository.

Before contributing, review [AGENTS.md](./AGENTS.md) first — especially the skills-first model and the one source of truth per topic rule.

## Resource Model

There is exactly **one** instruction file (hard limit):

- `instructions/copilot-instructions.md`

It contains cross-cutting rules for every Copilot interaction: collaboration style, core principles, OWASP security, git commit format, logging, and the skills-first workflow. Do **not** create additional instruction files.

Agents handle workflow orchestration. The default agent is `agents/developer.md`. New agents can be added when a task genuinely needs autonomous multi-step workflow coordination. Do **not** use agents to hold domain standards — those belong in skills.

Everything else belongs in **skills**:

- Java coding standards
- JUnit/testing standards
- Maven pom.xml operations
- Logging standards
- Security/OWASP rules
- Cleanup, docs, reports, branch naming, commits, migration, and other reusable recipes

If you are unsure whether something should be a skill or an agent, use `skills/agent-or-skill-gate/SKILL.md` first. Default to a skill unless the work truly needs orchestration.

## Where New Content Belongs

- Applies to every interaction, regardless of task → `instructions/copilot-instructions.md`
- Coordinates multi-step work, approvals, or routing → `agents/`
- Encodes domain standards or reusable procedures → the relevant `skills/*/SKILL.md`

## Adding or Updating Agents

Add a new agent when a task genuinely needs autonomous multi-step workflow coordination. Use `skills/agent-or-skill-gate/SKILL.md` if unsure.

- Keep agents focused on orchestration
- Do not embed domain standards in agents — use skills for those
- No single-agent limit; add as many as workflows require

## Creating or Updating Skills

1. Use a lowercase, hyphenated folder name under `skills/`
2. Add a `SKILL.md` file with YAML front matter
3. Include clear triggers, boundaries, and core steps
4. Keep the skill self-contained and token-efficient
5. Test the skill in VS Code or GitHub Copilot CLI

## After Any Change

- Update `README.md` and `AGENTS.md` if the resource inventory changes
- Update the relevant setup guide if install steps change
- Search the repo for stale filenames after any rename or deletion
