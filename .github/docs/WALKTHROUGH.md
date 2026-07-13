# Java/Spring Workflow Walkthrough

This walkthrough shows how instructions, the developer agent, and skills work together in the skills-first setup.

## Prerequisites

Make sure you have completed the VS Code or GitHub Copilot CLI setup:

- `agents/developer.md`
- `instructions/copilot-instructions.md`
- `skills/*`

## Example Workflow: Build an Order Service

### Step 1 — Generate Production Code

You type in Copilot Chat:

```text
Create an OrderService that validates orders, calculates totals with tax, and saves to the database
```

**What happens behind the scenes:**

| Layer | What Fires | What It Does |
|-------|-----------|--------------|
| **Instructions** | `copilot-instructions.md` | Enforces SOLID, OWASP security, git commit standards, logging, and the skills-first workflow |
| **Agent** | `developer` | Orchestrates the task and delegates domain work to skills |
| **Skills** | `java-production-code`, `maven-management`, `logging`, `security-owasp` | Apply production standards, add dependencies, and keep the code secure and observable |

**Result** — a service class that automatically follows the team standards:

```java
@Service
@Slf4j
@RequiredArgsConstructor
public class OrderService {

    private static final String ORDER_PROCESSING_LOG = "Processing order: orderId={}, customerId={}";

    private final OrderRepository orderRepository;
    private final TaxCalculator taxCalculator;

    @Transactional
    public Order processOrder(OrderRequest request) {
        log.info("Order received: customerId={}", request.getCustomerId());
        validateOrder(request);
        BigDecimal total = taxCalculator.calculateWithTax(request.getSubtotal());
        Order order = createOrder(request, total);
        Order savedOrder = orderRepository.save(order);
        log.info("Order processed: orderId={}, total={}", savedOrder.getId(), total);
        return savedOrder;
    }

    private void validateOrder(OrderRequest request) {
        // validation logic
    }

    private Order createOrder(OrderRequest request, BigDecimal total) {
        // mapping logic
    }
}
```

Notice: constructor injection, `@Slf4j`, structured logging, `@Transactional`, explicit types, max 3 params, stepdown rule — all enforced through skills.

### Step 2 — Generate Tests

You type:

```text
Create tests for OrderService
```

| Layer | What Fires | What It Does |
|-------|-----------|--------------|
| **Agent** | `developer` | Routes the request to the correct test skill |
| **Skill** | `java-junit-testing` | Generates JUnit 5 tests with manual mocks, given-when-then names, and 100% branch coverage |
| **Skill** | `java-code-hygiene` | Cleans up static imports, unused variables, and formatting |

**Result** — tests with proper naming, structure, and coverage:

```java
class OrderServiceTest {

    private OrderRepository orderRepository;
    private TaxCalculator taxCalculator;
    private OrderService orderService;

    @BeforeEach
    void setUp() {
        orderRepository = mock(OrderRepository.class);
        taxCalculator = mock(TaxCalculator.class);
        orderService = new OrderService(orderRepository, taxCalculator);
    }

    @Test
    void givenValidRequestWhenProcessingOrderThenSavesAndReturns() {
        // given
        OrderRequest request = createValidRequest();
        when(taxCalculator.calculateWithTax(any())).thenReturn(new BigDecimal("107.00"));
        when(orderRepository.save(any())).thenReturn(createSavedOrder());

        // when
        Order result = orderService.processOrder(request);

        // then
        assertNotNull(result);
        verify(orderRepository).save(any(Order.class));
    }

    @Test
    void givenNullRequestWhenProcessingOrderThenThrowsException() {
        // given
        // when / then
        assertThrows(IllegalArgumentException.class, () -> orderService.processOrder(null));
    }

    private OrderRequest createValidRequest() {
        // helper method
    }

    private Order createSavedOrder() {
        // helper method
    }
}
```

Notice: mocks in `@BeforeEach` (no `@Mock`), `givenWhenThen` naming, three sections, JUnit assertions, helper methods at bottom.

### Step 3 — Clean Up

You type:

```text
Clean up the files I just created
```

| Layer | What Fires | What It Does |
|-------|-----------|--------------|
| **Agent** | `developer` | Coordinates the cleanup pass |
| **Skill** | `java-code-hygiene` | Removes unused imports, variables, dead code, and lint noise |

### Step 4 — Analyze What You Built

You type:

```text
Analyze the business logic flow
```

| Layer | What Fires | What It Does |
|-------|-----------|--------------|
| **Agent** | `developer` | Delegates analysis to the reporting skills |
| **Skill** | `business-flow-analysis` | Traces data flow from controller to service to repository and generates a Mermaid diagram |
| **Skill** | `technical-report-generation` | Formats the analysis into a structured Markdown report |

## How the Layers Connect

```text
YOU (Developer)
  -> copilot-instructions.md
  -> developer
  -> skills
```

## Takeaway

The developer agent stays small, and the skills carry the standards. That keeps the workflow token-efficient and easy to reuse across VS Code and the CLI.
