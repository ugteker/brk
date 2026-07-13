# VS Code Setup Guide

> For GitHub Copilot CLI setup, see [GitHub Copilot CLI Setup Guide](GHC-CLI-SETUP.md).

Complete setup instructions for GitHub Copilot resources in **Visual Studio Code**.

## Global Setup (One-Time)

VS Code reads agents, instructions, and skills from `~\.copilot\`. Copy the repo contents directly — no per-project configuration needed.

### Install

```powershell
# Run from the repo root
mkdir "$env:USERPROFILE\.copilot\agents"
mkdir "$env:USERPROFILE\.copilot\instructions"
mkdir "$env:USERPROFILE\.copilot\skills"

Copy-Item -Path "agents\*" -Destination "$env:USERPROFILE\.copilot\agents\" -Recurse -Force
Copy-Item -Path "instructions\copilot-instructions.md" -Destination "$env:USERPROFILE\.copilot\instructions\" -Force
Copy-Item -Path "skills\*" -Destination "$env:USERPROFILE\.copilot\skills\" -Recurse -Force
```

Your `.copilot` folder after install:

```text
C:\Users\[YOUR USER]\.copilot\
├── agents\
│   └── developer.md (+ any additional agents)
├── instructions\
│   └── copilot-instructions.md
└── skills\
    ├── java-production-code\
    ├── java-junit-testing\
    ├── logging\
    └── ... (20 folders total)
```

Restart VS Code to pick up the new resources.

## What Each Component Does

### Instructions — Global Rules

All `.md` files in `~\.copilot\instructions\` are automatically applied by VS Code's Copilot to every interaction.

| File | Purpose |
|------|---------|
| `copilot-instructions.md` | Team standards: collaboration style, core principles, OWASP security, git commits, logging, and the skills-first workflow |

### Agent — Workflow Orchestration

Installed globally and available in all projects automatically.

| Agent | Role |
|-------|------|
| **developer** | Workflow orchestration only; coordinates multi-step work and delegates domain standards to skills |

### Skills — Global Skills (Auto-invoked)

| Group | Skills |
|-------|--------|
| Engineering standards | `java-production-code`, `java-junit-testing`, `logging`, `security-owasp`, `maven-management`, `java-code-hygiene`, `java-concurrency-implementation` |
| Workflow utilities | `git-branch`, `git-commit`, `agent-or-skill-gate` |
| Documentation and analysis | `documentation-generation`, `technical-report-generation`, `business-flow-analysis`, `field-mapping-analysis`, `teams-blog-post` |
| Platform and migration | `java-cosmosdb-integration`, `qrg-migration`, `ui-ux-design`, `caveman`, `caveman-compress` |

## Recommended Setup by Project Type

### Java/Spring

Use: `developer` + `java-production-code` + `java-junit-testing` + `logging` + `java-code-hygiene`

### Spring Boot + Azure

Everything above + `maven-management` and `java-cosmosdb-integration`

### Analysis and Documentation

`business-flow-analysis` + `field-mapping-analysis` + `technical-report-generation` + `documentation-generation`

### Concurrent/Performance

Java/Spring setup above — `java-concurrency-implementation` is auto-available
