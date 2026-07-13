---
name: documentation-generation
description: >
  Creates/maintains README.md and project docs. Standard layouts, Quick Start guides, usage examples, contributing guidelines. Copy-paste ready. USE FOR: README, documentation, Quick Start, usage examples, installation steps, contributing guide, API docs, project overview.
---

# Documentation Generation

Create/improve `README.md` and project docs — actionable, copy-paste ready.

## Operations

### 1. Generate README
Sections: title, description, features, prerequisites, Quick Start, usage, config, dev setup, testing, contributing, license.

### 2. Quick Start
- All commands copy-paste ready
- Get user running in ≤ 10 minutes
- Include prerequisites + expected output

### 3. Usage Examples
- Actual class/method names from codebase
- Include imports + complete context
- Show expected outputs
- Team standards (no `var`, constructor injection)

### 4. API Documentation

**REST:**
```markdown
### Create Order
**Endpoint:** `POST /api/v1/orders`
**Request Body:**
```json
{"customerId": "CUST123", "items": [{"sku": "SKU001", "quantity": 2}]}
```
**Response:** 201 Created
```

**CLI:**
```markdown
### Process File
```bash
app process --file data.csv --output results.json
```
**Options:** --file (required), --output (default: stdout), --verbose
```

### 5. Contributing Guidelines
- Code standards (SOLID, no `var`, max 3 params, constructor injection)
- Branch strategy
- Commit format
- PR process
- 100% test coverage

### 6. Update Existing Section
Read → locate → update → preserve anchors → fix links

### 7. Configuration Docs
Table format: Variable | Description | Default | Required

## Standards

- Imperative headings ("Run", "Install", "Configure")
- Code blocks with language hints
- All commands must work as-is
- Relative links to repo files
- No badges, no secrets (use `${ENV_VAR}` placeholders)
- Team Java standards in examples (no `var`, constructor injection, `@Slf4j`)

## Checklist

- ✅ Commands copy-paste ready
- ✅ Examples use actual project classes
- ✅ Links relative + correct
- ✅ No TODOs remaining
- ✅ Team standards in examples
- ✅ No secrets exposed
- ✅ Code blocks have language hints
- ✅ Quick Start ≤ 10 minutes

## Constraints

- Generate/update docs only
- No production code
- No build commands
- Needs pre-analyzed data for API docs

