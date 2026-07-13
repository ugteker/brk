---
name: java-junit-testing
description: >
  JUnit 5 tests in src/test/java. Full branch coverage, manual Mockito in @BeforeEach (no @Mock), given-when-then names, JUnit assertions only. Spring/SI test-aware. USE FOR: tests, JUnit, mock setup, test service, test controller, parameterized tests, edge cases, coverage.
---

# JUnit Testing

Create/improve JUnit 5 tests in `src/test/java` for full branch + path coverage.

## What to Test
- Services with business logic
- Validators, parsers, transformers, mappers
- Controllers via `@WebMvcTest` or unit
- Components with conditionals/errors/orchestration
- Custom exception handling

## What NOT to Test
- DTOs/entities with no logic
- Lombok-generated code
- Simple enums, constants
- `@Configuration` bean-only classes
- Interfaces without default methods

**Rule**: No `if`, no `switch`, no calculation = no test.

---

## Standards

- No `var` — explicit types
- No comments/Javadoc
- Static imports: `import static org.junit.jupiter.api.Assertions.*;` and `import static org.mockito.Mockito.*;`

## Naming

camelCase given-when-then — no "test", no underscores:
- ✅ `givenValidInputWhenProcessingThenSuccess`

## Structure

```java
@Test
void givenValidOrderWhenProcessingThenReturnsConfirmation() {
    // given
    Order order = createValidOrder();
    when(repository.save(order)).thenReturn(order);

    // when
    OrderConfirmation result = orderService.process(order);

    // then
    assertNotNull(result);
    assertEquals(OrderStatus.CONFIRMED, result.getStatus());
    verify(repository).save(order);
}
```

## Mocking

Manual mocks in `@BeforeEach`. NO `@Mock` annotations. NO `MockitoAnnotations`.

```java
class OrderServiceTest {
    private OrderRepository repository;
    private OrderService orderService;

    @BeforeEach
    void setUp() {
        repository = mock(OrderRepository.class);
        orderService = new OrderService(repository);
    }
}
```

`ArgumentCaptor<T>` for complex argument verification.

## Assertions

JUnit only: `assertEquals`, `assertTrue`, `assertFalse`, `assertNull`, `assertNotNull`, `assertThrows`
NO AssertJ, NO Hamcrest.

## Coverage

100% branch coverage:
- Happy path
- Edge cases (empty/boundary)
- Null/invalid inputs
- Exceptions
- All branches (if/else, switch, ternary)
- Loop boundaries (empty, single, many)

## Test Data

- Helper methods at bottom: `createValidOrder()`, `createExpiredOrder()`
- `@ParameterizedTest` with `@MethodSource` or `@CsvSource` for data-driven

## Spring Testing

- Prefer pure unit + Mockito (no context)
- `@WebMvcTest` for controllers
- `@DataJpaTest` for repos
- `@SpringBootTest` sparingly

## SI Testing

- `MockIntegration` for outbound adapters
- Test via gateway interfaces
- Test error flows + dead letter
- Test transformations/routing separately

## Checklist

- ✅ All scenarios (happy, edge, null, exception)
- ✅ 100% branch coverage
- ✅ Mocks in `@BeforeEach` (no `@Mock`)
- ✅ JUnit assertions only
- ✅ given-when-then names
- ✅ Static imports
- ✅ No `var`
- ✅ Helpers at bottom

## Constraints

- Do NOT modify production code
- Do NOT create outside `src/test/java`
- Do NOT modify `pom.xml`
- One scenario per test method
