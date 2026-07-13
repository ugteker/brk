---
name: security-owasp
description: >
  OWASP Top 10 security standards. Access control, cryptography, injection, input validation, SSRF prevention. USE FOR: security review, secure coding, input validation, SQL injection, auth, access control, OWASP, secure API, secrets management, secure random.
---

# Security — OWASP Top 10

Apply to ALL code handling auth, user input, external data, sensitive ops.

## Rules

- **Access Control**: server-side authz; least privilege; deny by default
- **Cryptography**: never plain text passwords (bcrypt/scrypt/Argon2); TLS transit; AES-256+ rest
- **Injection**: parameterized queries ONLY; never concat user input; allowlist validation
- **Insecure Design**: threat modeling; defense in depth; rate limit auth endpoints
- **Misconfiguration**: disable defaults; update deps; never expose stack traces
- **Vulnerable Components**: monitor CVEs; remove unused deps; pin versions
- **Auth Failures**: secure sessions; account lockout; never log credentials
- **Integrity**: verify signatures; no deserializing untrusted data
- **Logging Failures**: log auth attempts; never log sensitive data
- **SSRF**: validate URLs; allowlist domains; HTTPS only external

## Input Validation

- Always server-side (client = UX only)
- Type-safe (Bean Validation)
- Allowlists > denylists
- Validate early, fail fast

## Secure Random

- `SecureRandom` (Java) / `crypto.randomBytes` (Node)
- Never `Math.random()` or `Random`

## Never Log / Never Expose

- Passwords, API keys, tokens, secrets
- CC numbers, PII (unless masked)
- Session IDs, security questions
- Stack traces to end users

## Checklist

- [ ] Input validated server-side?
- [ ] Queries parameterized?
- [ ] Passwords hashed (bcrypt/scrypt/Argon2)?
- [ ] Secrets in env/vault, not code?
- [ ] Auth endpoints rate-limited?
- [ ] Error responses generic?
- [ ] Deps up to date?
