---
name: qrg-migration
description: >
  Migrate QRG Framework (qrg-integration-framework-lib) → Spring Integration. Flow-by-flow. Maps AsyncFlow, FlowConfig, FlowBuilder, AdapterFactory, UseCaseBuilder, StepsBuilder to SI Java DSL. Receiver/sender conversions, trace→headers, profiles, circuit breakers. USE FOR: QRG migration, convert AsyncFlow, replace FlowBuilder, migrate adapter, receiver to SI, sender to SI, remove qrg-integration-framework-lib, GDC modernization, SI Java DSL.
---

# QRG → Spring Integration Migration

Migrate `qrg-integration-framework-lib` ~3.5.0 → Spring Integration, one flow at a time.

## Non-Negotiable

1. One flow at a time — no batch converts
2. Preserve behavior — same messages/endpoints/tx
3. No business-logic changes
4. Explicit `IntegrationFlow` beans, no reflection
5. Preserve profiles + trace headers
6. Only change integration plumbing

---

## Discovery — grep these

```
com.qvc.logistics.gdc.integration.spring.AsyncFlow
com.qvc.logistics.gdc.integration.spring.FlowConfig
com.qvc.logistics.gdc.integration.spring.bean.FlowBuilder
com.qvc.logistics.gdc.integration.framework.domain.adapter.AdapterFactory
com.qvc.logistics.gdc.integration.framework.domain.usecase.UseCaseBuilder
com.qvc.logistics.gdc.integration.framework.domain.usecase.StepsBuilder
com.qvc.logistics.gdc.integration.framework.domain.usecase.BiStepsBuilder
com.qvc.logistics.gdc.integration.framework.domain.adapter.inbound.AsyncInAdapter
com.qvc.logistics.gdc.integration.framework.domain.adapter.outbound.AsyncOutAdapter
com.qvc.logistics.gdc.integration.framework.infrastructure.receiver.Receiver
com.qvc.logistics.gdc.integration.framework.infrastructure.sender.Sender
com.qvc.logistics.gdc.integration.domain.common.Traceable
com.qvc.logistics.gdc.integration.domain.common.DtoContext
com.qvc.logistics.gdc.integration.framework.domain.adapter.outbound.SyncOutAdapter
com.qvc.logistics.gdc.common.us.receiver.MQReceiverWithCircuitBreakerCapability
```

Annotations: `@AsyncInAdapterItem`, `@AsyncInAdapterBatch`, `@AsyncOutAdapterItem`, `@AsyncOutAdapterBatch`

Receivers: `RestReceiver`, `MQReceiver`, `MQReceiverWithCircuitBreakerCapability`, `TimeTriggeredReceiver`, `CallableReceiver`
Senders: `JmsSender`, `GetRestSender`, `PostRestSender`, `CrudSender`, `FlatFileSender`, `AzureBlobSender`, `AmazonObjectSender`
Sync: `SyncInAdapter`, `SyncOutAdapter`, `SyncOutAdapterItem`, `SyncOutAdapterBatch`

---

## Mapping Table

| QRG Component | SI Equivalent | Notes |
|---|---|---|
| `AsyncFlow` class | `@Configuration` + `@Bean IntegrationFlow` | One flow bean per flow |
| `FlowConfig` + `FlowBuilder` | Removed — SI wires via beans | |
| `AdapterFactory` | Removed — bean construction | No reflection |
| `@AsyncInAdapterItem` | `IntegrationFlow.from(inbound).handle(...)` | Chain: unmarshal→validate→audit→map |
| `@AsyncInAdapterBatch` | `.from(inbound).split().handle(...)` | Add splitter |
| `@AsyncOutAdapterItem` | `.handle(outbound)` at end | Chain: map→validate→audit→marshal→send |
| `@AsyncOutAdapterBatch` | `.aggregate().handle(outbound)` | Aggregator before send |
| `MQReceiver` | `Jms.messageDrivenChannelAdapter(cf).destination(q)` | |
| `MQReceiverWithCircuitBreakerCapability` | JMS adapter + Resilience4j `@CircuitBreaker` | Preserve thresholds |
| `RestReceiver` | `Http.inboundGateway("/path")` | Returns response |
| `RestReceiver` (nested class) | Extract to `@RestController` + `@MessagingGateway` | Must become top-level |
| `TimeTriggeredReceiver` | `@InboundChannelAdapter(poller=@Poller(...))` | |
| `CallableReceiver` | `@MessagingGateway` interface | req-reply |
| `SyncOutAdapter` | `.gateway(subFlow)` or `@MessagingGateway` | req-reply, NOT fire-and-forget |
| `JmsSender` | `Jms.outboundAdapter(cf).destination(q)` | fire-and-forget |
| `PostRestSender` | `Http.outboundGateway(url).httpMethod(POST)` | |
| `GetRestSender` | `Http.outboundGateway(url).httpMethod(GET)` | |
| `CrudSender` | `.handle(serviceActivator)` calling repository | |
| `FlatFileSender` | `Files.outboundAdapter(dir)` | |
| `AzureBlobSender` | `.handle(azureBlobServiceActivator)` | |
| `UseCaseBuilder` + steps | `IntegrationFlow` DSL | |
| `Receive` step | Flow entry (inbound adapter) | |
| `Send` step | `.handle(outbound)` | |
| `Delegate` step | `.gateway(subFlow)` or `.channel(target)` | |
| `Filter` step | `.filter(expression)` | |
| `Route` step | `.route(expr, r -> r.subFlowMapping(...))` | |
| `If` step | `.route(cond, r -> r.subFlowMapping(true/false,...))` | |
| `Try` step | Error channel + error handler | |
| `Parallelize` step | `ExecutorChannel` + `.scatterGather()` | |
| `Convert` step | `.transform(converter)` | |
| `Call` step | `.handle(serviceActivator)` | |
| `Broadcast` step | `PublishSubscribeChannel` | |
| `Log` step | `.log()` or `.wireTap(loggingFlow)` | |
| `Traceable.copyTraceId` | `MessageBuilder.withHeader("traceId",...)` | |
| `DtoContext` | SI `MessageHeaders` | |
| `transactional` flag | `.transactional()` on poller or `TransactionInterceptor` | |
| Itemizer (Graal/JS) | `.split(customSplitter)` | Extract to Java |
| Merger (Graal/JS) | `.aggregate(customAggregator)` | Extract to Java |

---

## Rewrite Rules

### Rule 1: Flow structure

**Before (QRG):**
```java
@Configuration
@Profile("US")
public class UsManifestFlow implements AsyncFlow {
    @AsyncInAdapterItem(receiver = RestReceiver.class, mapper = ManifestMapper.class, ...)
    private AsyncInAdapter<ManifestDto> inAdapter;

    @AsyncOutAdapterItem(sender = JmsSender.class, marshaller = ManifestMarshaller.class)
    private AsyncOutAdapter<ManifestDto> outAdapter;
}
```

**After (SI):**
```java
@Configuration
@Profile("US")
public class UsManifestFlowConfig {
    @Bean
    public IntegrationFlow usManifestFlow(ManifestMapper mapper, ManifestValidator validator,
            ManifestAudit audit, ManifestMarshaller marshaller, ConnectionFactory cf) {
        return IntegrationFlow
            .from(Http.inboundGateway("/api/manifest"))
            .enrichHeaders(h -> h.errorChannel("usManifestErrorChannel"))
            .wireTap(sf -> sf.handle(audit, "auditInbound"))
            .filter(validator, "validate")
            .transform(mapper, "mapInbound")
            .transform(marshaller, "marshal")
            .handle(Jms.outboundAdapter(cf).destination("manifest.outbound.queue"))
            .get();
    }
}
```

### Rule 2: Batch → splitter
`@AsyncInAdapterBatch` with `itemizer` → `.split(itemizerBean, "extractItems")`

### Rule 3: Transactional
`transactional = true` → `.from(Jms.messageDrivenChannelAdapter(...).configureListenerContainer(c -> c.transactionManager(txManager)))`

### Rule 4: UseCaseBuilder → IntegrationFlow
```java
// Before
new UseCaseBuilder<>(() -> new StepsBuilder<>()
    .and(new Receive<>(inAdapter))
    .and(new Filter<>(predicate))
    .and(new Route<>(router, Map.of(...)))
    .and(new Send<>(outAdapter))
).build();

// After
IntegrationFlow.from("inChannel")
    .filter(predicate, "test")
    .route(router, "resolve", r -> r.subFlowMapping(...))
    .handle(outbound)
    .get();
```

### Rule 5: Trace propagation
`Traceable.copyTraceId` / `DtoContext.get("traceId")` → `MessageBuilder.setHeader("traceId", value)` + `@Header("traceId")`

### Rule 6: Profiles
Each `@Profile` variant → own `@Configuration`. Never merge into single flow with conditionals.

### Rule 7: SyncOutAdapter (req-reply)
→ `.gateway(subFlow)` or `@MessagingGateway`. Never `.handle(outbound)` without reply.

### Rule 8: Nested RestController
Extract to top-level bean. Wire via `@MessagingGateway` or `Http.inboundGateway()`.

### Rule 9: Multi-inbound
Separate `IntegrationFlow` per inbound, all route to named channel.

### Rule 10: Circuit breaker
`MQReceiverWithCircuitBreakerCapability` → JMS + Resilience4j. Thresholds to `application.yml`.

---

## High-Risk Patterns

| Pattern | Risk | Action |
|---|---|---|
| Graal/JS itemizer/merger | Not portable | WARN: extract to Java |
| `CallableReceiver` sync reply | Must preserve req-reply | `@MessagingGateway` + reply channel |
| Multiple `@AsyncOutAdapter` | Fan-out | `PublishSubscribeChannel` or `RecipientListRouter` |
| `transactional = true` + MQ | XA boundary | WARN: verify tx manager |
| `DtoContext` mutable state | SI messages immutable | Convert to headers/payload |
| `SyncOutAdapter` mid-flow | Loses response if async | `.gateway()` required |
| Nested `@RestController` | Can't be bean | Extract + verify paths |
| Multi-inbound flow | Must keep all entries | Separate flow beans |

---

## Migration Workflow

1. **Discovery**: scan QRG imports, catalog flows (profile, adapters, steps), note SI deps
2. **Prepare** (per flow): map QRG→SI, plan `@Configuration` shape
3. **Rewrite** (per flow): create flow bean, wire chain, extract business logic unchanged, replace DtoContext→headers, remove AsyncFlow
4. **Validate** (per flow): compile (zero QRG imports), check profile, verify chain order
5. **Finalize** (project): confirm zero QRG imports, remove `qrg-integration-framework-lib`

## Checklist

- ✅ No QRG imports in migrated file
- ✅ `@Profile` matches original
- ✅ Inbound matches receiver semantics
- ✅ Chain order preserved
- ✅ Outbound matches sender semantics
- ✅ Tx boundaries preserved
- ✅ Trace → headers
- ✅ Error handling → error channel
- ✅ No business logic changes
- ✅ CB preserved
- ✅ SyncOutAdapter → req-reply gateway
- ✅ Inner receivers extracted
- ✅ Multi-inbound → separate flows + shared channel
