import { describe, expect, it, vi } from 'vitest';
import { PrismaRunStore } from './prisma-run-store';

describe('PrismaRunStore', () => {
  it('upserts and claims queued runs through db adapter', async () => {
    const db = {
      agentSchedule: {
        findMany: vi.fn(async () => [{ agentId: 'agent-1', nextRunAt: new Date('2026-07-10T10:00:00.000Z'), enabled: true }])
      },
      agentRun: {
        upsert: vi.fn(async () => ({})),
        findFirst: vi.fn(async () => ({
          id: 'run-1',
          agentId: 'agent-1',
          scheduledFor: new Date('2026-07-10T10:00:00.000Z'),
          status: 'queued',
          workerId: null,
          retryCount: 0,
          errorCode: null,
          startedAt: null,
          finishedAt: null
        })),
        update: vi
          .fn()
          .mockResolvedValueOnce({
            id: 'run-1',
            agentId: 'agent-1',
            scheduledFor: new Date('2026-07-10T10:00:00.000Z'),
            status: 'running',
            workerId: 'worker-a',
            retryCount: 0,
            errorCode: null,
            startedAt: new Date('2026-07-10T10:01:00.000Z'),
            finishedAt: null
          })
          .mockResolvedValueOnce({})
      }
    };

    const store = new PrismaRunStore(db as never);
    await store.upsertQueuedRun('agent-1', new Date('2026-07-10T10:00:00.000Z'));
    const claimed = await store.claimNextQueuedRun('worker-a');
    await store.completeRun('run-1', 'succeeded');

    expect(db.agentRun.upsert).toHaveBeenCalledTimes(1);
    expect(claimed?.status).toBe('running');
    expect(db.agentRun.update).toHaveBeenCalledTimes(2);
  });
});
