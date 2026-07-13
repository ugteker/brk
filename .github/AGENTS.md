# AGENTS.md — Copilot Resource Governance

Constraints only. Discoverable facts excluded.

- **1 instruction file hard limit** — only `copilot-instructions.md`; never add second.
- VS Code / CLI only. No IntelliJ.
- New content: cross-cutting rule → `instructions/`; multi-step orchestration → `agents/`; standard/recipe → `skills/`. Unsure → skill; use `skills/agent-or-skill-gate/SKILL.md`.
- `agents/developer.md` = orchestration only; no Java/JUnit/logging/security/Maven/cleanup → skills.
- `instructions/copilot-instructions.md` = declarative rules only; no workflows or procedures.
- One topic = one home; no duplicate rules across instruction + skill + agent.
- Rename/delete → update refs in `README.md`, `CONTRIBUTING.md`, `docs/*.md`, skill files before done.

## Source of Truth

| Topic | Skill |
|-------|-------|
| Java + Spring + Spring Integration | `java-production-code` |
| Logging (ECS/SLF4J) | `logging` |
| JUnit/testing | `java-junit-testing` |
| Maven pom.xml | `maven-management` |
| Code cleanup | `java-code-hygiene` |
| Concurrency | `java-concurrency-implementation` |
| Security/OWASP | `security-owasp` |
| Git commit | `git-commit` |
| Git branch | `git-branch` |
| AGENTS.md | `agents-md-skill` |
| ELI5 plain-language explanation | `eli5-explainer` |
| Docs | `documentation-generation` |
| Reports | `technical-report-generation` |
| Business flow | `business-flow-analysis` |
| Field mapping | `field-mapping-analysis` |
| CosmosDB | `java-cosmosdb-integration` |
| QRG migration | `qrg-migration` |
| UI/UX | `ui-ux-design` |
| Teams posts | `teams-blog-post` |
| Agent vs skill | `agent-or-skill-gate` |
| Fortify | `fortify-common-findings-remediation` |
| Compression | `caveman`, `caveman-compress` |
| Cross-cutting rules | `instructions/copilot-instructions.md` |

## Maintenance

On add/modify: check decision tree → right type? → update `README.md` → update `CONTRIBUTING.md` → search old filenames after rename/delete.
