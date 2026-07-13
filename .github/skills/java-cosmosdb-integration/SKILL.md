---
name: java-cosmosdb-integration
description: >
    Azure CosmosDB integration for Spring Boot with managed identity. Deps, custom config class, credential chaining (WorkloadIdentity + ManagedIdentity), repository setup, properties, Spring Data auditing. Spring Boot can't auto-configure managed identity for CosmosDB. USE FOR: CosmosDB, cosmos, azure database, cosmos dependency, cosmos config, managed identity, cosmos repository, cosmos spring data, cosmos auditing, createddate, lastmodifieddate, auditoraware.
---

# CosmosDB Integration

Spring Boot + Azure CosmosDB with managed identity auth. Manual config required (Spring Boot can't auto-configure).

## 1. Dependencies

```xml
<spring-cloud-azure.version>7.0.0</spring-cloud-azure.version>

<dependency>
    <groupId>com.azure.spring</groupId>
    <artifactId>spring-cloud-azure-starter-data-cosmos</artifactId>
    <version>${spring-cloud-azure.version}</version>
</dependency>
<dependency>
    <groupId>com.azure.spring</groupId>
    <artifactId>spring-cloud-azure-starter-actuator</artifactId>
    <version>${spring-cloud-azure.version}</version>
</dependency>
```

Use Maven Management skill for version extraction + alphabetical sort.

## 2. Configuration Class

Location: `src/main/java/.../infrastructure/config/CosmosDbConfig.java`

```java
package com.qvc.order.management.infrastructure.config;

import com.azure.core.credential.TokenCredential;
import com.azure.identity.ChainedTokenCredentialBuilder;
import com.azure.identity.ManagedIdentityCredentialBuilder;
import com.azure.identity.WorkloadIdentityCredentialBuilder;
import com.azure.spring.data.cosmos.config.AbstractCosmosConfiguration;
import com.azure.spring.data.cosmos.config.CosmosConfig;
import com.azure.spring.data.cosmos.repository.config.EnableCosmosRepositories;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Slf4j
@Configuration
@EnableCosmosRepositories(basePackages = "com.qvc.order.management.infrastructure.repository")
public class CosmosDbConfig extends AbstractCosmosConfiguration {

    private final String database;
    private final boolean populateQueryMetrics;

    public CosmosDbConfig(
            @Value("${spring.cloud.azure.cosmos.database}") String database,
            @Value("${spring.cloud.azure.cosmos.populate-query-metrics:false}") boolean populateQueryMetrics) {
        this.database = database;
        this.populateQueryMetrics = populateQueryMetrics;
        log.info("Cosmos DB configuration initialized - database: {}, queryMetrics: {}", database, populateQueryMetrics);
    }

    @Bean
    TokenCredential tokenCredential() {
        ChainedTokenCredentialBuilder builder = new ChainedTokenCredentialBuilder();
        try {
            builder.addLast(new WorkloadIdentityCredentialBuilder().build());
            log.info("Added WorkloadIdentityCredential to chain");
        } catch (Exception ex) {
            log.warn("Failed to create WorkloadIdentityCredential", ex);
        }
        try {
            builder.addLast(new ManagedIdentityCredentialBuilder().build());
            log.info("Added ManagedIdentityCredential to chain");
        } catch (Exception ex) {
            log.warn("Failed to create ManagedIdentityCredential", ex);
        }
        return builder.build();
    }

    @Bean
    public CosmosConfig cosmosConfig() {
        return CosmosConfig.builder()
                .enableQueryMetrics(populateQueryMetrics)
                .build();
    }

    @Override
    protected String getDatabaseName() {
        return database;
    }
}
```

Key: extends `AbstractCosmosConfiguration`, credential chain WorkloadIdentity→ManagedIdentity, graceful failures.

## 3. Properties

```yaml
spring:
  cloud:
    azure:
      cosmos:
        populate-query-metrics: true
        enabled: true
        connection-mode: gateway
        database: ${COSMOS_DB}
        profile:
          tenantId: ${TENANT_ID}
        credential:
          clientId: ${CLIENT_ID}
        endpoint: https://cosmosact-nonprod-supplychain-qi-westeurope.documents.azure.com
```

Env vars: `COSMOS_DB`, `TENANT_ID`, `CLIENT_ID`

## 4. Repository

Package must match `@EnableCosmosRepositories` basePackages.

```java
package com.qvc.order.management.infrastructure.repository;

import com.azure.spring.data.cosmos.repository.CosmosRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface YourEntityRepository extends CosmosRepository<YourEntity, String> {
}
```

## 5. Entity

```java
package com.qvc.order.management.domain.model;

import com.azure.spring.data.cosmos.core.mapping.Container;
import com.azure.spring.data.cosmos.core.mapping.PartitionKey;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Container(containerName = "your-container-name")
public class YourEntity {
    
    @Id
    private String id;
    
    @PartitionKey
    private String partitionKey;
}
```

## 6. Auditing

Use Spring Data Cosmos auditing for `createdBy`, `createdDate`, `lastModifiedBy`, `lastModifiedDate` on `@Container` entities.

### Enable auditing

Add `@EnableCosmosAuditing` on config class that owns Cosmos repositories.

```java
package com.qvc.order.management.infrastructure.config;

import com.azure.spring.data.cosmos.core.mapping.EnableCosmosAuditing;
import java.util.Optional;
import org.springframework.context.annotation.Bean;
import org.springframework.data.domain.AuditorAware;

@EnableCosmosAuditing
public class CosmosDbConfig extends AbstractCosmosConfiguration {

    @Bean
    public AuditorAware<String> auditorAware() {
        return () -> Optional.of("system");
    }
}
```

Replace `"system"` with current principal resolution when app has authenticated user or service identity context.

### Audit fields on entity

```java
package com.qvc.order.management.domain.model;

import com.azure.spring.data.cosmos.core.mapping.Container;
import com.azure.spring.data.cosmos.core.mapping.PartitionKey;
import java.time.OffsetDateTime;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedBy;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.LastModifiedBy;
import org.springframework.data.annotation.LastModifiedDate;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Container(containerName = "your-container-name")
public class YourEntity {

    @Id
    private String id;

    @PartitionKey
    private String partitionKey;

    @CreatedBy
    private String createdBy;

    @CreatedDate
    private OffsetDateTime createdDate;

    @LastModifiedBy
    private String lastModifiedBy;

    @LastModifiedDate
    private OffsetDateTime lastModifiedDate;
}
```

### Auditing notes

- `@CreatedDate` and `@LastModifiedDate` should use time type like `OffsetDateTime`
- `AuditorAware<String>` supplies `createdBy` and `lastModifiedBy`
- Auditing runs on repository save/update flow; bypassing repositories can skip field population
- Do not manually set audit fields in normal business logic unless doing backfill/migration
- Keep audit fields on persisted document only when they are needed for support/compliance

## Common Issues

- **Repos not found**: verify `@EnableCosmosRepositories` basePackages matches exactly
- **Auth fails**: check credential chain logs; need WorkloadIdentity (K8s) or ManagedIdentity (VM)
- **Timeouts**: use `connection-mode: gateway`
- **No metrics**: set `populate-query-metrics: true`
- **Audit fields not populated**: verify `@EnableCosmosAuditing`, `AuditorAware<String>` bean, and repository-based persistence path

## Security

- Always managed identity (never connection strings)
- WorkloadIdentity first (K8s), ManagedIdentity second (VMs)
- No secrets in code — env vars only
- Gateway mode for corporate networks

## Checklist

- ✅ Both deps added, version in property
- ✅ Config class in `.infrastructure.config`
- ✅ Repo package matches `@EnableCosmosRepositories`
- ✅ Properties with all fields
- ✅ Env vars documented
- ✅ Credential chain: WorkloadIdentity + ManagedIdentity
- ✅ Connection mode: gateway
- ✅ Auditing enabled when entity needs created/modified metadata
- ✅ User reminded to reload Maven

## Post-Integration

1. Reload Maven in IDE
2. Set env vars: `COSMOS_DB`, `TENANT_ID`, `CLIENT_ID`
3. Check logs for credential setup
4. Create entities with `@Container` + `@PartitionKey`
5. Extend `CosmosRepository<Entity, String>`
6. Add auditing annotations if entity needs created/modified metadata
7. Verify `/actuator/health`

## Constraints

- Java + YAML only (no Terraform)
- Doesn't create Azure resources
- Doesn't configure network/firewall
- Assumes managed identity already configured
- Spring Boot 3.x+ only

