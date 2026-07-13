---
name: java-production-code
description: >
  Write/modify Java prod source (src/main/java). SOLID, Clean Architecture, OWASP, team standards. Spring and Spring Integration patterns. USE FOR: Java code, service, controller, repository, Spring bean, use case, SI flow, REST endpoint, business logic, configuration.
---

# Java Production Code

Standards for `src/main/java/**`.

## Java Standards

### Naming & Types
- `camelCase` vars/methods; `PascalCase` classes
- Explicit types, not `var`
- `Optional<T>` for maybe-absent

### Code Quality
- SOLID + DRY
- One abstraction level per method
- No comments/Javadoc (exception: regex)

### Logging
- SLF4J + `@Slf4j`; ECS format
- Include IDs: orderId, customerId, SKU, transactionId
- Parameterized only — never concat

### Log Levels
- **INFO**: business events, received/published, config init, state transitions
- **DEBUG**: flow tracing, parsing, transformations, validations
- **ERROR**: failures — always include exception: `log.error("msg", ex)`
- **WARN**: degraded, fallback, deprecated

### Performance Guards
```java
log.debug("User {} performed action {}", userId, action);

if (log.isDebugEnabled()) {
    log.debug("Complex result: {}", computeExpensiveResult());
}
```

### Never Log
- Passwords, API keys, tokens, secrets, PII

### Annotations & Imports
- Lombok: `@Slf4j`, `@RequiredArgsConstructor`, `@Builder`, `@Data`, `@Value`
- Static imports when clearer
- Direct imports only — never FQN inline

### Null Safety
- Guard NPEs; validate constructor args
- `@NonNull` where useful

### Constants
- Repeated strings → `private static final`

### Structure
- High-level methods first, helpers below in usage order

### Methods
- Max 3 args; more → parameter object/builder/split
- One abstraction level
- Move try/catch to separate methods

### Visibility
- Private unless needed

### YAGNI
- No single-impl interfaces (unless testing/DI)
- No future-use params, hypothetical utilities

### Anti-patterns
- No reflection unless framework requires
- No feature envy, no God classes

---

## Architecture (Clean)

### Layers
- **Presentation**: controllers, REST (framework-aware)
- **Application**: use cases, app services
- **Domain**: entities, logic, repo interfaces (framework-agnostic)
- **Infrastructure**: DB adapters, external clients

### Dependency Direction
- Controllers → Use Cases → Domain + Repo Interfaces
- Repos implement Domain Interfaces
- **Never**: Domain → Infrastructure/Framework

### Domain Purity
- No Spring annotations in domain entities
- Repo interfaces in domain, implementations in infra

### YAGNI Architecture
- No empty layers
- Single service → single repo doesn't need use case layer

---

## Spring (when detected)

### DI
- Constructor injection only — `@RequiredArgsConstructor`
- No field/setter injection (unless optional deps)

### Beans
- `@Component`, `@Service`, `@Repository`, `@RestController`
- `@Configuration` for complex wiring; `@Primary`/`@Qualifier` for multiples

### Boot
- Leverage auto-config; `@ConfigurationProperties` for 3+ props
- Minimal `@SpringBootApplication`

### Transactions
- `@Transactional` on services, not repos
- `readOnly = true` for reads

### Exception Handling
- Custom exceptions; `@ControllerAdvice` for REST
- Proper HTTP status; never expose stack traces

### REST
- `@GetMapping`, `@PostMapping`; `ResponseEntity<T>`
- `@Valid` for Bean Validation; thin controllers

### Data
- Derived queries preferred; `Optional<T>` single results

---

## Spring Integration (when detected)

### Channels
- DirectChannel (sync), QueueChannel (async), PublishSubscribeChannel (broadcast), ExecutorChannel (thread pool)
- Name explicitly; bounded queues

### Error Handling
- `errorChannel` centralized
- `RequestHandlerRetryAdvice` transient failures
- Exponential backoff external calls
- Dead-letter channels

### Config
- Java DSL (`IntegrationFlows`)
- Focused service activators
- Return domain objects (not `Message<?>` unless headers)
- Direct method call `.handle()` — never reflection style

### Clean Architecture + SI
- SI in infrastructure only
- Flows call use cases
- Use cases SI-agnostic
- Transform DTOs ↔ domain commands in infra

### Performance
- `TaskExecutor` pool sizes per workload
- Filter early; header-based filtering

---

## Checklist

- ✅ No God classes (10+ deps → split)
- ✅ Constructor injection
- ✅ No `var`
- ✅ Max 3 params
- ✅ SLF4J structured logging
- ✅ Domain layer framework-agnostic
- ✅ Graceful shutdown (SI)

## Constraints

- Do NOT write tests
- Do NOT modify `pom.xml`
