import { describe, expect, it, vi, afterEach } from 'vitest';
import { startRealtimeCleanupLoop } from './cleanup-loop';
import { REALTIME_RETENTION_MS } from './types';

describe('startRealtimeCleanupLoop', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs cleanup immediately and once per hour', async () => {
    vi.useFakeTimers();

    const fixedNow = new Date('2026-07-22T12:00:00.000Z');
    const repository = {
      deleteOlderThan: vi.fn().mockResolvedValue(undefined),
    };

    const stop = startRealtimeCleanupLoop({ repository, now: () => fixedNow });

    expect(repository.deleteOlderThan).toHaveBeenCalledWith(
      new Date(fixedNow.getTime() - REALTIME_RETENTION_MS)
    );

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(repository.deleteOlderThan).toHaveBeenCalledTimes(2);

    stop();
  });

  it('continues running after a cleanup error', async () => {
    vi.useFakeTimers();

    const fixedNow = new Date('2026-07-22T12:00:00.000Z');
    const repository = {
      deleteOlderThan: vi.fn()
        .mockRejectedValueOnce(new Error('db error'))
        .mockResolvedValue(undefined),
    };

    const stop = startRealtimeCleanupLoop({ repository, now: () => fixedNow });

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(repository.deleteOlderThan).toHaveBeenCalledTimes(2);

    stop();
  });
});
