---
name: maven-management
description: >
  Atomic Maven pom.xml ops. Add/update deps, manage plugins, extract version properties, sort alphabetically, enforce formatting. USE FOR: add dependency, update version, pom.xml, plugin, build config, version property, sort properties, Maven config, dependency scope.
---

# Maven Management

Atomic `pom.xml` operations with strict conventions.

## Operations

### 1. Add Dependency
1. Check if exists
2. Extract version to `<properties>` as `{artifact}.version`
3. Add dependency with `${property}` reference
4. Sort properties alphabetically

### 2. Update Version
1. Locate property in `<properties>`
2. Update value
3. Maintain sort

### 3. Extract Version to Property
1. Find hardcoded versions
2. Create `{artifact}.version` property
3. Replace with `${property}`
4. Sort alphabetically

### 4. Sort Properties
- All `<properties>` alphabetically (case-insensitive)
- 4-space indentation

### 5. Add Plugin
1. Extract version to properties
2. Add plugin config
3. Sort properties

### 6. Remove Dependency
1. Remove `<dependency>` block
2. Remove version property if unused

## Standards

### Versions
- Never hardcode versions
- Format: `{artifact}.version` (e.g., `junit.version`, `spring.boot.version`)

### Structure
```xml
<dependency>
    <groupId>...</groupId>
    <artifactId>...</artifactId>
    <version>${property.name}</version>
    <scope>test</scope> <!-- If not compile -->
</dependency>
```

## Checklist

- ✅ Versions in properties
- ✅ Properties sorted alphabetically
- ✅ 4-space indentation
- ✅ No duplicates

## Constraints

- Only `pom.xml` files
- No Java code
- No Maven commands
- Flags conflicts for user (doesn't resolve)

