---
name: java-code-hygiene
description: >
  Post-work cleanup: unused imports/vars, static imports, lint warnings, Java standards (no var, explicit types, max 3 args, camelCase/PascalCase), dead code, formatting. Sequential file-by-file. USE FOR: cleanup, imports, static imports, unused vars, lint, dead code, code style, formatting, naming, post-implementation cleanup.
---

# Code Hygiene

Post-work cosmetic cleanup; semantics stay same.

## Operations

### 1. Remove Unused Imports
Analyze → check usage → remove unused → keep order

### 2. Static Imports
Convert common imports for readability:
- JUnit: `Assertions.*`, `@Test`, `@BeforeEach`
- Mockito: `Mockito.*`, `ArgumentMatchers.*`, `ArgumentCaptor.*`
- Collections: `Collections.*`, `Arrays.*`

```java
// Before
import org.junit.jupiter.api.Assertions;
Assertions.assertEquals(expected, actual);

// After
import static org.junit.jupiter.api.Assertions.assertEquals;
assertEquals(expected, actual);
```

### 3. Remove Unused Variables
- Locals assigned never read
- Params never referenced
- Private fields never accessed
- Loop vars unused

### 4. Remove Dead Code
- Code after `return`/`break`/`throw`
- Private methods never called
- Always-true/false conditions

### 5. Naming Conventions
- Variables/methods: camelCase
- Classes: PascalCase
- Constants: UPPER_SNAKE_CASE

### 6. Explicit Types
```java
// ❌
var user = userRepository.findById(id);

// ✅
Optional<User> user = userRepository.findById(id);
```

### 7. Remove Redundant Code
- `new ArrayList<String>()` → `new ArrayList<>()`
- Unnecessary casts
- Redundant `this.` qualifiers
- Redundant null checks before instanceof

### 8. Formatting
- 4-space indentation
- Consistent braces
- Line length limits
- Blank line conventions

### 9. Fix Lint Warnings

**Safe to fix:**
- Unused declarations
- Redundant ops
- String concat in loops
- Missing `@Override`
- Raw types
- Unnecessary boxing

**Do NOT fix:**
- Null pointer warnings (may change behavior)
- Concurrency warnings
- Security warnings

## Processing

Sequential: one file at a time.
1. Read → 2. Analyze → 3. Fix → 4. Verify (`mvn compile -q` or LSP) → 5. Next

## Team Standards

### Java
- No `var` — explicit types
- Max 3 params (flag 4+, don't auto-fix)
- Repeated strings → `private static final`
- Static imports when clearer
- Direct imports only — never FQN inline
  - ❌ `new com.example.CustomObject()`
  - ✅ `import com.example.CustomObject;` → `new CustomObject()`
- Private unless needed

### Quality
- SOLID/SRP per class
- DRY — no duplicate blocks
- Intention-revealing names
- Remove comments (exception: regex)

### Lombok
- Remove manual getters/setters if `@Data`/`@Getter`/`@Setter`
- `@Slf4j` over manual logger

## Checklist
- ✅ No unused imports
- ✅ Static imports applied
- ✅ No FQN inline — direct imports
- ✅ No unused vars/params/fields
- ✅ No dead code
- ✅ Naming correct
- ✅ No `var`
- ✅ No redundant code
- ✅ Consistent formatting
- ✅ No new compile errors

## Constraints

- Do NOT refactor logic
- Do NOT change behavior
- Do NOT fix complex warnings (concurrency, null safety, security)
- Sequential only — one file at a time
- Only targeted files

