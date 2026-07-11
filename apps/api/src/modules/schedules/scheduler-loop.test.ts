import { afterEach, describe, expect, it, vi } from 'vitest';
import { startSchedulerLoop } from './scheduler-loop';
import type { RunQueueService } from '../runs/run-queue.service';

describe('startSchedulerLoop', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ticks and calls enqueueDueRuns', async () => {
    vi.useFakeTimers();
    const queue = {
      enqueueDueRuns: vi.fn(async () => 1)
    } as unknown as Pick<RunQueueService, 'enqueueDueRuns'>;
    const processNextRun = vi.fn(async () => {});
    const runner = { run: vi.fn(async () => ({ status: 'succeeded' as const })) };

    const stop = startSchedulerLoop({ intervalMs: 1000, queue, processNextRun, runner });
    await vi.advanceTimersByTimeAsync(1000);
    stop();

    expect(queue.enqueueDueRuns).toHaveBeenCalledTimes(1);
    expect(processNextRun).toHaveBeenCalledTimes(1);
  });
});
