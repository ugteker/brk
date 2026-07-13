# GitHub Copilot Resources

Shared GitHub Copilot resources for a skills-first workflow across VS Code and GitHub Copilot CLI.

## Quick Start

### VS Code (recommended)

1. Create the global folders if they do not exist:

```powershell
mkdir "$env:USERPROFILE\.copilot\agents"
mkdir "$env:USERPROFILE\.copilot\instructions"
mkdir "$env:USERPROFILE\.copilot\skills"
```

2. Copy the repo resources:

```powershell
Copy-Item -Path "agents\*" -Destination "$env:USERPROFILE\.copilot\agents\" -Recurse -Force
Copy-Item -Path "instructions\copilot-instructions.md" -Destination "$env:USERPROFILE\.copilot\instructions\" -Force
Copy-Item -Path "skills\*" -Destination "$env:USERPROFILE\.copilot\skills\" -Recurse -Force
```

3. Restart VS Code.

### GitHub Copilot CLI

1. Create the same global folders if needed.
2. Copy the repo resources:

```powershell
Copy-Item -Path "agents\*" -Destination "$env:USERPROFILE\.copilot\agents\" -Recurse -Force
Copy-Item -Path "instructions\copilot-instructions.md" -Destination "$env:USERPROFILE\.copilot\instructions\" -Force
Copy-Item -Path "skills\*" -Destination "$env:USERPROFILE\.copilot\skills\" -Recurse -Force
Copy-Item -Path "instructions\copilot-instructions.md" -Destination "$env:USERPROFILE\.copilot\" -Force
```

3. Restart the CLI session.

### GitHub Copilot CLI (\*nix Terminal Emulator) 

1. Create the same global folders if needed.
```bash
# Creates .copilot / .github scaffolding in current user's home dir
mkdir -p ~/{.copilot,.github}/{agents,instructions,skills}
```
2. Copy the repo resources:

```bash
cp -rp agents/* ~/.copilot/agents/. && cp -rp agents/* ~/.github/agents/.
cp -p instructions/copilot-instructions.md ~/.copilot/instructions/. && cp -p instructions/copilot-instructions.md ~/.github/instructions/.
cp -rp skills/* ~/.copilot/skills/. && cp -rp skills/* ~/.github/skills/.
cp -p instructions/copilot-instructions.md ~/.copilot/. && cp -p instructions/copilot-instructions.md ~/.github/.
```

3. Restart the CLI session.


## How It Works

```text
YOU
  -> instructions/copilot-instructions.md (always on, cross-cutting rules)
  -> agents/developer.md (workflow orchestration only)
  -> skills/*/SKILL.md (domain standards + repeatable recipes)
```

| Layer | Role |
|-------|------|
| Instructions | Always-on team rules; only `copilot-instructions.md` |
| Developer agent | Single workflow orchestrator; coordinates work and delegates to skills |
| Skills | Token-efficient standards and recipes; auto-invoked or user-triggered |

## Installed Resources

### Instructions (1 file)

| File | Purpose |
|------|---------|
| `copilot-instructions.md` | Team standards: collaboration style, core principles, OWASP security, git commit format, logging, and the skills-first workflow |

### Agents (1+ files)

| File | Purpose |
|------|---------|
| `developer.md` | Full development workflow orchestrator; keeps standards out of the agent and uses skills instead |
| `code-driven-regressor-tester.md` | Manual specialist agent for full code-driven Java regression test framework generation |
| `token-saver.md` | Token-conscious assistant; terse output, scoped context, minimal tool calls |

### Skills (23 folders)

| Skill | Purpose |
|-------|---------|
| `agent-or-skill-gate` | Decide whether new automation should be a skill or agent; default to skill |
| `agents-md-skill` | Create and maintain high-signal AGENTS.md with low always-on token cost |
| `business-flow-analysis` | Map business logic flow from input to output and generate reports |
| `caveman` | Ultra-compressed communication mode |
| `caveman-compress` | Compress markdown memory/preferences files into caveman format |
| `java-code-hygiene` | Remove unused imports, unused code, dead code, and lint noise |
| `java-concurrency-implementation` | Thread-safe concurrent code patterns |
| `java-cosmosdb-integration` | Azure Cosmos DB setup with managed identity |
| `documentation-generation` | Create and maintain README and project docs |
| `eli5-explainer` | Explain any topic in plain language using analogies and real-world examples |
| `field-mapping-analysis` | Trace field mappings and data lineage |
| `fortify-common-findings-remediation` | Remediate common Fortify findings with practical secure-code fixes |
| `git-branch` | Create feature, bugfix, and hotfix branches with Jira naming |
| `git-commit` | Create commits with team format and trailer |
| `java-production-code` | Java production code standards for `src/main/java` |
| `java-junit-testing` | JUnit 5 test standards for `src/test/java` |
| `logging` | Structured logging and sensitive-data rules |
| `maven-management` | Atomic `pom.xml` operations and version/property management |
| `qrg-migration` | Migrate QRG flows to Spring Integration |
| `security-owasp` | OWASP Top 10 secure coding standards |
| `teams-blog-post` | Concise, casual Teams blog posts |
| `technical-report-generation` | Markdown reports from structured analysis data |
| `ui-ux-design` | UI/UX design principles and accessibility |

## Learn More

| Topic | Link |
|-------|------|
| VS Code setup | [docs/VSCODE-SETUP.md](docs/VSCODE-SETUP.md) |
| GitHub Copilot CLI setup | [docs/GHC-CLI-SETUP.md](docs/GHC-CLI-SETUP.md) |
| Workflow walkthrough | [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md) |
| Contributing guidelines | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Governance rules | [AGENTS.md](AGENTS.md) |
