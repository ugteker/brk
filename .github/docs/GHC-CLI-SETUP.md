# GitHub Copilot CLI Setup Guide

> For VS Code setup, see [VS Code Setup Guide](VSCODE-SETUP.md).

Complete setup instructions for GitHub Copilot resources in the **GitHub Copilot CLI** (`ghc`).

## Global Setup (One-Time)

The CLI reads agents, instructions, and skills from `~\.copilot\`. Copy the repo contents directly.

### Install

```powershell
# Run from the repo root
mkdir "$env:USERPROFILE\.copilot\agents"
mkdir "$env:USERPROFILE\.copilot\instructions"
mkdir "$env:USERPROFILE\.copilot\skills"

Copy-Item -Path "agents\*" -Destination "$env:USERPROFILE\.copilot\agents\" -Recurse -Force
Copy-Item -Path "instructions\copilot-instructions.md" -Destination "$env:USERPROFILE\.copilot\instructions\" -Force
Copy-Item -Path "skills\*" -Destination "$env:USERPROFILE\.copilot\skills\" -Recurse -Force
Copy-Item -Path "instructions\copilot-instructions.md" -Destination "$env:USERPROFILE\.copilot\" -Force
```

The CLI uses the same resources as VS Code. The only extra step is the root-level `copilot-instructions.md` copy.

Your `.copilot` folder after install:

```text
C:\Users\[YOUR USER]\.copilot\
├── copilot-instructions.md
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

Restart the CLI session to pick up the new configuration.

## What Each Component Does

### `copilot-instructions.md`

Loaded at the root of `~\.copilot\` for every CLI session. Contains collaboration style, core principles, OWASP Top 10 security, git commit format, logging, and the skills-first workflow.

### Developer Agent

Orchestrates multi-step work and delegates standards to skills.

### Skills

Same 20 skill folders as VS Code.
