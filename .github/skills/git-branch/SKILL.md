---
name: git-branch
description: >
  Git branch rules: feature/, bugfix/, hotfix/ prefixes, Jira ticket required, ask when missing. USE FOR: branch, new branch, create branch, git switch, git checkout -b.
---

# Git Branch Skill

Make branch name: type + Jira + short desc.

## Format

```
feature/JIRA-123-short-description
bugfix/JIRA-123-short-description
hotfix/JIRA-123-short-description
```

## Rules

- New feature → `feature/`
- Bug fix → `bugfix/`
- Hotfix → `hotfix/`
- Every branch need Jira ticket
- No ticket id → ask user for Jira id first
- Short desc lowercase, hyphen-separated
- No spaces, no punctuation
- Keep branch short, clear, exact

## Good

```
feature/JIRA-123-add-login-flow
bugfix/JIRA-456-fix-null-pointer
hotfix/JIRA-789-disable-bad-cache
```

## Bad

```
feature/add-login-flow
bugfix/PROJ123-fix-bug
hotfix/JIRA-123
```

## Steps

1. Get work type
2. Get Jira ticket
3. If ticket missing, ask user
4. Build branch name
5. `git switch -c "feature/JIRA-123-short-description"`
