import { describe, expect, it } from 'vitest';
import { InMemoryRunStore, RunQueueService } from './run-queue.service';

describe('RunQueueService', () => {
  it('claims one run per worker call without duplicates', async () => {
    const store = new InMemoryRunStore();
    await store.addSchedule({
      agentId: 'agent-a',
      nextRunAt: new Date('2026-07-10T10:00:00.000Z'),
      enabled: true
    });
    await store.addSchedule({
      agentId: 'agent-b',
      nextRunAt: new Date('2026-07-10T10:00:00.000Z'),
      enabled: true
    });

    const service = new RunQueueService(store);
    await service.enqueueDueRuns(new Date('2026-07-10T10:00:00.000Z'));

    const runA = await service.claimNextRun('worker-a');
    const runB = await service.claimNextRun('worker-b');

    expect(runA).not.toBeNull();
    expect(runB).not.toBeNull();
    expect(runA?.id).not.toBe(runB?.id);
  });

  it('does not enqueue duplicate run for same agent and slot', async () => {
    const store = new InMemoryRunStore();
    await store.addSchedule({
      agentId: 'agent-a',
      nextRunAt: new Date('2026-07-10T10:00:00.000Z'),
      enabled: true
    });

    const service = new RunQueueService(store);
    await service.enqueueDueRuns(new Date('2026-07-10T10:01:00.000Z'));
    await service.enqueueDueRuns(new Date('2026-07-10T10:02:00.000Z'));

    expect(store.runs.length).toBe(1);
  });
});
