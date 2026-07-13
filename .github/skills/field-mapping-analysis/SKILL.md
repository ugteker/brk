---
name: field-mapping-analysis
description: >
  Maps data in/out, field relationships, transformations. Produces mapping tables with source→intermediate→target. USE FOR: field mapping, data flow mapping, input output mapping, transformations, mapping tables, field tracing, data lineage, ETL docs, integration mapping.
---

# Field Mapping Analysis

Analyze code to map fields: what enters, leaves, changes, how fields relate. Report in chat; file only if asked.

## Process

1. Identify entry/exit points (controllers, listeners, DB, files, messages)
2. Extract field lists with types
3. Classify transformations
4. Build mapping table
5. Generate overview

## Mapping Table

| Entity | Field | Type | Req | Source | Intermediate | Target(s) | Transform | Example | Notes |
|---|---|---|---|---|---|---|---|---|---|

## Transformation Types

- **Direct Copy**: unchanged
- **Calculated**: via calculation (qty × price)
- **Enhanced**: modified/enriched (status lookup)
- **Conditional**: value set by condition
- **Lookup**: from reference data
- **Constant**: fixed/default
- **Concatenated**: fields combined
- **Split**: one → many
- **Converted**: type/format change

## Complex Scenarios

- **Multiple targets**: semicolon-separated in Target(s)
- **Legacy mappings**: in Notes column
- **Conditional**: note condition in Transform
- **Type conversions**: show source/target types

## Framework Detection

- Spring: REST controllers, JPA entities, services
- JAXB: `@XmlElement`, `@XmlRootElement`
- JPA: `@Entity`, `@Column`
- Jackson: `@JsonProperty`
- MapStruct: Mapper interfaces
- Messaging: JMS, Kafka, RabbitMQ

## Output

1. Application summary
2. Field mapping table
3. Mermaid `graph LR` data flow
4. Key business rules (bullets)
5. Notes + follow-up questions

## Constraints

- Do NOT modify code
- Do NOT include implementation details unless asked
- Chat output default; file only when asked
