---
name: java-concurrency-implementation
description: >
  Thread-safe concurrent code: proper sync, data partitioning, minimal shared state. ExecutorService, CompletableFuture, concurrent collections, atomics. Separates threading from business logic. USE FOR: multithreading, concurrency, ExecutorService, thread-safe, parallel processing, async, concurrent collections, thread pool, CompletableFuture, race conditions.
---

# Concurrency Implementation

Thread-safe concurrent code with proven patterns. Keep threading separate from business logic.

## 1. ExecutorService + Thread Pool

```java
@Configuration
public class ThreadPoolConfig {
    
    @Bean(name = "orderProcessingExecutor")
    public ExecutorService orderProcessingExecutor() {
        return Executors.newFixedThreadPool(10);
    }
    
    @PreDestroy
    public void shutdownExecutor() {
        orderProcessingExecutor().shutdown();
        try {
            if (!orderProcessingExecutor().awaitTermination(60, TimeUnit.SECONDS)) {
                orderProcessingExecutor().shutdownNow();
            }
        } catch (InterruptedException e) {
            orderProcessingExecutor().shutdownNow();
            Thread.currentThread().interrupt();
        }
    }
}
```

## 2. Async with CompletableFuture

```java
public class AsyncOrderProcessor {
    private final OrderProcessor processor;
    private final ExecutorService executor;
    
    public AsyncOrderProcessor(OrderProcessor processor, ExecutorService executor) {
        this.processor = processor;
        this.executor = executor;
    }
    
    public CompletableFuture<OrderResult> processOrderAsync(Order order) {
        return CompletableFuture.supplyAsync(() -> processor.processOrder(order), executor)
            .exceptionally(throwable -> {
                log.error("Failed to process order: {}", order.getId(), throwable);
                return OrderResult.failed(order.getId(), throwable.getMessage());
            });
    }
    
    public List<OrderResult> processOrdersBatch(List<Order> orders) {
        List<CompletableFuture<OrderResult>> futures = orders.stream()
            .map(this::processOrderAsync)
            .toList();
        
        return futures.stream()
            .map(CompletableFuture::join)
            .toList();
    }
}
```

## 3. Thread-Safe Shared State

**Concurrent collections (preferred):**
```java
public class OrderStatistics {
    private final ConcurrentHashMap<String, AtomicInteger> orderCounts = new ConcurrentHashMap<>();
    
    public void incrementCount(String category) {
        orderCounts.computeIfAbsent(category, k -> new AtomicInteger(0))
            .incrementAndGet();
    }
    
    public int getCount(String category) {
        return orderCounts.getOrDefault(category, new AtomicInteger(0)).get();
    }
    
    public Map<String, Integer> getSnapshot() {
        return orderCounts.entrySet().stream()
            .collect(Collectors.toMap(
                Map.Entry::getKey,
                entry -> entry.getValue().get()
            ));
    }
}
```

**ReadWriteLock (when needed):**
```java
public class InventoryManager {
    private final Map<String, Integer> inventory = new HashMap<>();
    private final ReadWriteLock lock = new ReentrantReadWriteLock();
    
    public void updateStock(String sku, int quantity) {
        lock.writeLock().lock();
        try {
            inventory.merge(sku, quantity, Integer::sum);
        } finally {
            lock.writeLock().unlock();
        }
    }
    
    public Integer getStock(String sku) {
        lock.readLock().lock();
        try {
            return inventory.get(sku);
        } finally {
            lock.readLock().unlock();
        }
    }
}
```

## 4. Data Partitioning

```java
public class PartitionedOrderProcessor {
    private final List<OrderProcessor> processors;
    private final ExecutorService executor;
    
    public void processOrders(List<Order> orders) {
        int partitionCount = processors.size();
        
        // Partition orders by hash
        Map<Integer, List<Order>> partitions = orders.stream()
            .collect(Collectors.groupingBy(
                order -> Math.abs(order.getCustomerId().hashCode() % partitionCount)
            ));
        
        // Process each partition independently
        List<CompletableFuture<Void>> futures = partitions.entrySet().stream()
            .map(entry -> CompletableFuture.runAsync(() -> {
                int partition = entry.getKey();
                processors.get(partition).processBatch(entry.getValue());
            }, executor))
            .toList();
        
        // Wait for all partitions to complete
        CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
    }
}
```

## 5. Minimal Synchronization

```java
// ❌ Over-synchronized
public synchronized void processOrder(Order order) {
    validateOrder(order);      // Doesn't need lock
    updateInventory(order);    // Needs lock
    sendConfirmation(order);   // Doesn't need lock
}

// ✅ Minimal
private final Object inventoryLock = new Object();

public void processOrder(Order order) {
    validateOrder(order);
    
    synchronized (inventoryLock) {
        updateInventory(order);
    }
    
    sendConfirmation(order);
}
```

## 6. Atomic Operations

```java
public class RequestCounter {
    private final AtomicLong requestCount = new AtomicLong(0);
    private final AtomicReference<LocalDateTime> lastRequest = new AtomicReference<>(LocalDateTime.now());
    
    public long incrementAndGet() {
        lastRequest.set(LocalDateTime.now());
        return requestCount.incrementAndGet();
    }
    
    public long getCount() {
        return requestCount.get();
    }
    
    public LocalDateTime getLastRequestTime() {
        return lastRequest.get();
    }
}
```

## 7. Separate Concurrency from Business Logic

**Business (no threading):**
```java
public class OrderProcessor {
    private final OrderRepository repository;
    private final InventoryService inventoryService;
    
    public OrderProcessor(OrderRepository repository, InventoryService inventoryService) {
        this.repository = repository;
        this.inventoryService = inventoryService;
    }
    
    public OrderResult processOrder(Order order) {
        validateOrder(order);
        inventoryService.reserveItems(order.getItems());
        Order savedOrder = repository.save(order);
        return OrderResult.success(savedOrder);
    }
}
```

**Concurrent wrapper:**
```java
public class ConcurrentOrderProcessor {
    private final OrderProcessor processor;
    private final ExecutorService executor;
    
    public ConcurrentOrderProcessor(OrderProcessor processor, ExecutorService executor) {
        this.processor = processor;
        this.executor = executor;
    }
    
    public CompletableFuture<OrderResult> processOrderAsync(Order order) {
        return CompletableFuture.supplyAsync(() -> processor.processOrder(order), executor);
    }
    
    public List<OrderResult> processOrdersConcurrently(List<Order> orders, int parallelism) {
        // Threading logic here
    }
}
```

## 8. Threading Tests

```java
@Test
void givenConcurrentAccessWhenIncrementingCounterThenResultIsCorrect() throws Exception {
    Counter counter = new Counter();
    int numberOfThreads = 100;
    int incrementsPerThread = 1000;
    ExecutorService executor = Executors.newFixedThreadPool(numberOfThreads);
    CountDownLatch latch = new CountDownLatch(numberOfThreads);
    
    // Launch threads
    for (int i = 0; i < numberOfThreads; i++) {
        executor.submit(() -> {
            for (int j = 0; j < incrementsPerThread; j++) {
                counter.increment();
            }
            latch.countDown();
        });
    }
    
    // Wait for completion
    boolean completed = latch.await(10, TimeUnit.SECONDS);
    assertTrue(completed);
    
    // Verify
    assertEquals(numberOfThreads * incrementsPerThread, counter.getValue());
    
    executor.shutdown();
}
```

## Patterns

### Producer-Consumer
```java
public class OrderQueue {
    private final BlockingQueue<Order> queue = new LinkedBlockingQueue<>(1000);
    
    public void produce(Order order) throws InterruptedException {
        queue.put(order);
    }
    
    public Order consume() throws InterruptedException {
        return queue.take();
    }
}
```

### Fork/Join
```java
public class RecursiveOrderProcessor extends RecursiveTask<Integer> {
    private static final int THRESHOLD = 10;
    private final List<Order> orders;
    
    @Override
    protected Integer compute() {
        if (orders.size() <= THRESHOLD) {
            return processDirectly();
        } else {
            int mid = orders.size() / 2;
            RecursiveOrderProcessor left = new RecursiveOrderProcessor(orders.subList(0, mid));
            RecursiveOrderProcessor right = new RecursiveOrderProcessor(orders.subList(mid, orders.size()));
            
            left.fork();
            int rightResult = right.compute();
            int leftResult = left.join();
            
            return leftResult + rightResult;
        }
    }
}
```

### Phaser (Multi-Phase)
```java
public class PhasedOrderProcessor {
    private final Phaser phaser = new Phaser(1);
    
    public void processInPhases(List<Order> orders) {
        orders.forEach(order -> {
            phaser.register();
            executor.submit(() -> {
                processPhase1(order);
                phaser.arriveAndAwaitAdvance();
                
                processPhase2(order);
                phaser.arriveAndAwaitAdvance();
                
                processPhase3(order);
                phaser.arriveAndDeregister();
            });
        });
        
        phaser.arriveAndDeregister(); // Deregister main thread
    }
}
```

## Sync Primitives Reference

- **synchronized**: simple mutual exclusion
- **ReentrantLock**: tryLock, timed waits, interruptibility
- **ReadWriteLock**: many readers, few writers
- **Semaphore**: resource pooling, rate limiting
- **CountDownLatch**: wait for N ops
- **CyclicBarrier**: N threads at sync points
- **Phaser**: multi-phase coordination
- **Atomics**: lock-free (AtomicInteger, AtomicLong, AtomicReference)
- **Concurrent collections**: ConcurrentHashMap, CopyOnWriteArrayList, BlockingQueue

## Pitfalls

- **Deadlock**: consistent lock order; use timeouts
- **Race conditions**: check-then-act not atomic; use sync/atomics
- **Thread leaks**: always shutdown ExecutorService; @PreDestroy
- **Over-sync**: use concurrent collections over synchronized wrappers
- **Visibility**: volatile for flags; sync/atomics for shared state

## Checklist

- ✅ Concurrency separated from business logic
- ✅ Shared state minimized + synchronized
- ✅ Data partitioned (if applicable)
- ✅ Sync sections minimal
- ✅ ExecutorService properly shut down
- ✅ Exceptions handled in concurrent tasks
- ✅ No deadlock possibilities
- ✅ Threading tests included
- ✅ Pool sizes configurable

## Constraints

- Implement thread-safe code, not analyze existing
- No performance profiling
- No custom thread schedulers

