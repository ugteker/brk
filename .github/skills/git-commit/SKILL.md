---
name: git-commit
description: >
  Git commits with team standards: JIRA prefix, imperative verb, lowercase, max 80 chars, Co-authored-by trailer. Extracts ticket from branch automatically. USE FOR: commit, git commit, commit message, format commit, push changes.
---

# Git Commit Skill

## Format

```
[JIRA-TICKET] short description

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

## Rules

- Start with JIRA ticket from branch name
- Imperative verb: add, fix, update, remove, refactor
- Lowercase after ticket
- No punctuation at end
- Max 80 chars (excluding ticket)
- Always include Co-authored-by trailer
- Multiple areas → split into separate commits

## Good

```
PROJ-123 add multithreading support to integration flow
PROJ-456 fix unused imports in service layer
PROJ-789 update dependency versions in pom.xml
```

## Bad

```
❌ PROJ-123 Added multithreading support.       # not imperative, period
❌ proj-123 Add Multithreading Support          # caps
❌ add multithreading support                   # missing ticket
```

## Steps

1. `git branch --show-current` → extract JIRA ticket
2. `git --no-pager diff --staged` → review changes
3. Compose message per rules
4. `git commit -m "[TICKET] desc" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"`
