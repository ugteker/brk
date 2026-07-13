---
name: fortify-common-findings-remediation
description: Fortify fix patterns for common Java/Spring findings; use when PR quality gate fails and team needs approved remediation or suppression guidance.
---

# OpenText Fortify Common Findings Remediation

Skill gives fast checklist for common Fortify findings.

## How To Use This Guide

1. Find exact Fortify category.
2. Apply matching remediation pattern.
3. Add unit/integration tests that prove fix.
4. If suppress, add explicit audit comment + evidence.

## Global Rules

- Prefer secure-by-design over suppression.
- Validate untrusted input at boundaries.
- Use explicit allowlists when possible.
- Keep security headers explicit; do not rely only on defaults.
- Never expose secrets or PII in logs.

## 1) JSON Injection

Risk:

- Untrusted input concatenated into JSON payload.

Remediation:

- Return typed DTO; let Jackson serialize.
- Validate input with bean validation annotations.
- Avoid raw JSON string construction.

Preferred pattern:

- Controller returns `OrderResponse` (or equivalent typed object), not `String` JSON.

Examples:

Non-compliant:

```java
@GetMapping("/orders/{id}")
public String getOrder(@PathVariable String id) {
  return "{\"id\":\"" + id + "\",\"status\":\"SHIPPED\"}";
}
```

Compliant:

```java
@GetMapping("/orders/{id}")
public OrderResponse getOrder(
    @PathVariable @Pattern(regexp = "[A-Za-z0-9-]{1,30}") String id) {
  return new OrderResponse(id, OrderStatus.SHIPPED);
}
```

## 2) Access Control: Database

Risk:

- Query returns records without ownership or caller auth boundaries.

Remediation:

- Add ownership constraints in queries (ex: member/account ownership).
- Enforce access rules in service layer and query predicates.

Suppression guidance:

- Only if service-account model intentionally allows full data access and upstream service enforces auth.
- Add explicit audit comment describing architecture.

## 3) Spring Boot Misconfiguration: Actuator Endpoint Security Disabled

Risk:

- Sensitive actuator endpoints exposed.

Remediation:

- Expose only required endpoints (`health`, `info`).
- Apply authentication/authorization to any additional actuator endpoints.

Suppression guidance:

- Allowed only when limited to `health` and `info`, with evidence.

## 4) SQL Injection: MyBatis Mapper

Risk:

- `${}` does string concatenation.

Remediation:

- Use `#{}` for params when possible.
- If dynamic object names are required, use `<bind>` and strict validation.
- Validate schema/table prefix with regex in typed config.

Example validation rule:

- `@Pattern(regexp = "\\w+")` for schema/prefix style properties.

Examples:

Non-compliant:

```xml
<select id="findByEmail" resultType="Customer">
  SELECT * FROM customer WHERE email = '${email}'
</select>
```

Compliant:

```xml
<select id="findByEmail" resultType="Customer">
  SELECT * FROM customer WHERE email = #{email}
</select>
```

## 5) Access Specifier Manipulation

Risk:

- Reflection with `setAccessible(true)` flagged.

Remediation:

- Prefer `org.springframework.util.ReflectionUtils.makeAccessible(field)`
  when reflection is required.
- Reduce reflective access surface.

## 6) Log Injection / Log Forging

Risk:

- Untrusted log data can inject CR/LF or script-like payloads.

Remediation:

- Normalize/sanitize user input before logging.
- Consider logging pattern replacements for CR/LF.
- Validate incoming values with strict patterns before logging.

Suppression guidance:

- If global logger pattern sanitizes, add explicit audit comment + config evidence.

Examples:

Non-compliant:

```java
log.info("Request failed for userId={} reason={}", userId, reason);
```

Compliant:

```java
String safeUserId = userId == null ? "" : userId.replaceAll("[\\r\\n\\t]", " ");
String safeReason = reason == null ? "" : reason.replaceAll("[\\r\\n\\t]", " ");
log.info("Request failed for userId={} reason={}", safeUserId, safeReason);
```

## 7) System Information Leak

Risk:

- Logs/errors expose internal details useful to attackers.

Remediation:

- Log minimal, non-sensitive ops details.
- Replace verbose stack/context in user paths with generic message.

Suppression guidance:

- Provide actual logged line and justify necessity.

## 8) Insecure Transport: Mail Transmission

Risk:

- Unencrypted/legacy SMTP channels.

Remediation:

- Use approved SMTP relay (`smtpcustomerouta.qvcdev.qvc.net`) with TLS-capable path.
- Complete required firewall/network allowlisting before rollout.

## 9) Mass Assignment: Insecure Binder Configuration

Risk:

- Request binding populates unintended fields.

Remediation:

- Use dedicated request DTO exposing only intended fields.
- Prefer allowlist binding (`setAllowedFields`) when applicable.
- For JSON request bodies, use field-level exclusion controls where needed.

Notes:

- `initBinder` differs for `@RequestBody`; design DTO explicitly.

Examples:

Non-compliant:

```java
public class UserUpdateRequest {
  private String displayName;
  private boolean admin;
}
```

Compliant:

```java
public class UserUpdateRequest {
  private String displayName;
}

@PostMapping("/users/{id}")
public void updateUser(
    @PathVariable String id,
    @Valid @RequestBody UserUpdateRequest request) {
  // admin flag is not bindable from input
}
```

## 10) Cross Site Scripting (XSS)

Risk:

- Browser-interpretable response includes unsanitized untrusted data.

Remediation:

- If returning HTML, encode/sanitize output (ex: `HtmlUtils.htmlEscape`).
- If returning non-HTML, set explicit content type and
  `X-Content-Type-Options: nosniff`.
- Keep API response media types explicit.

Suppression guidance:

- For non-HTML responses, provide evidence of explicit content type and
  `nosniff` header.

Examples:

Non-compliant:

```java
return ResponseEntity.ok("Updated key: " + key);
```

Compliant:

```java
String safeKey = HtmlUtils.htmlEscape(key);
return ResponseEntity.ok()
  .contentType(MediaType.TEXT_PLAIN)
  .header("X-Content-Type-Options", "nosniff")
  .body("Updated key: " + safeKey);
```

## 11) Privacy Violation

Risk:

- Sensitive values (ex: Basic Auth credentials) exposed over insecure transport.

Remediation:

- Use HTTPS only for credential-bearing requests.
- Avoid manual auth header patterns where secure framework alternatives exist.
- Ensure client configuration enforces secure transport and avoids leaking secrets.

## 12) HTML5: Missing Content Security Policy (CSP)

Risk:

- Browser execution context lacks policy restrictions.

Remediation:

- Configure explicit CSP header rules in security config.
- Do not rely on implicit defaults when scanner requires explicit policy.
- Add explicit security headers in `SecurityFilterChain`.

## 13) Code Correctness: Byte Array to String Conversion

Risk:

- Platform-default charset conversion causes inconsistent/unsafe decoding.

Remediation:

- Always specify charset explicitly (ex: `StandardCharsets.UTF_8`).

## 14) HTTP Parameter Pollution

Risk:

- Repeated/conflicting params alter request semantics.

Remediation:

- Validate param cardinality; reject ambiguous duplicates.
- Use typed binding and explicit checks for multi-value inputs.

## 15) Dynamic Code Evaluation: Unsafe Deserialization

Risk:

- Deserialization of untrusted payload can lead to code execution.

Remediation:

- Prefer safe serialization libraries/formats.
- Validate input and reject untrusted object graphs.
- Avoid native Java serialization for untrusted data.
- Use class allowlists where deserialization is unavoidable.

Examples:

Non-compliant:

```java
ObjectInputStream in = new ObjectInputStream(inputStream);
Object obj = in.readObject();
```

Compliant:

```java
ObjectMapper mapper = new ObjectMapper();
OrderRequest request = mapper.readValue(jsonBody, OrderRequest.class);
validator.validate(request);
```

## 16) Path Manipulation

Risk:

- Untrusted input controls file path resolution.

Remediation:

- Normalize and canonicalize paths.
- Enforce base-dir constraints and allowlisted path patterns.
- Reject traversal attempts (`..`, encoded traversal, mixed separators).

Examples:

Non-compliant:

```java
Path path = Paths.get(baseDir, fileName);
byte[] content = Files.readAllBytes(path);
```

Compliant:

```java
Path base = Paths.get(baseDir).toAbsolutePath().normalize();
Path resolved = base.resolve(fileName).normalize();
if (!resolved.startsWith(base)) {
  throw new IllegalArgumentException("Invalid path");
}
byte[] content = Files.readAllBytes(resolved);
```

## 17) Dockerfile Misconfiguration: Default User Privilege

Risk:

- Container runs as root by default.

Remediation:

- Create/use non-root user in image.
- Set `USER` explicitly before runtime entrypoint.
- Ensure file ownership/permissions match runtime user.

## Suppression Comment Templates

Use only when remediation not applicable and risk accepted.

- Access Control (service-account model):
  - "Access control for this service is enforced by upstream authorized
    service accounts. This service intentionally has full dataset access for
    its integration role."

- Actuator (limited exposure):
  - "Only `/health` and `/info` actuator endpoints are exposed; no sensitive
    actuator endpoints are externally available."

- Logging pattern mitigation:
  - "Logging pattern configuration sanitizes CR/LF to prevent log forging;
    application logging path uses this global sanitizer."

## PR Checklist

- Finding category matches guide.
- Remediation implemented in code/config.
- Tests added/updated.
- Security headers explicit where relevant.
- No sensitive logging introduced.
- Suppression used only with evidence-backed comment.
