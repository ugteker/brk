---
name: logging
description: >
  Structured logging standards. Log levels, ECS format, structured context, sensitive data rules. Language-agnostic. USE FOR: logging, log levels, structured logging, ECS, MDC, sensitive data, observability, audit logging.
---

# Logging Standards

Language-agnostic structured logging.

## Log Levels

| Level | Use For |
|-------|---------|
| **INFO** | Business events, successful ops, state changes, startup |
| **DEBUG** | Flow tracing, parsing, transformations, intermediates |
| **WARN** | Degraded functionality, non-fatal issues, deprecated usage |
| **ERROR** | Failures — ALWAYS include exception + context (what failed, which IDs) |

## Format

- **ECS (Elastic Common Schema)** where supported
- Structured JSON > free-text
- Include: timestamp, level, logger, message, context fields

## Structured Context

- Key business IDs: orderId, customerId, transactionId, userId
- Log **outcome**, not attempt
- Active voice ("Order created" not "Order was created")
- Consistent ID names across app
- No tight-loop logging — summary logs ("Processed 42 items in 3.2s")

## Never Log

- Passwords, API keys, tokens, secrets
- CC numbers, PII unless masked
- Session IDs, security questions
- When in doubt: mask or omit

## Language Notes

- **Java**: SLF4J + Logback; MDC for context; `log.info("Order {} created", orderId)`
- **Node**: pino/winston JSON; child loggers
- **Python**: structlog or stdlib JSON formatter
- **Go**: slog/zerolog; structured fields
