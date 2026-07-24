import { describe, expect, it, vi } from 'vitest';
import { PrismaRunStore } from './prisma-run-store';

describe('PrismaRunStore', () => {
  it('loads only recurring schedules and carries their pinned agent version', async () => {
    const db: any = {
      playbook: {
        findMany: vi.fn(async () => [{
          id: 'playbook-1',
          agentId: 'agent-1',
          agentVersionId: 'version-2',
          nextRunAt: new Date('2026-07-10T10:00:00.000Z')
        }])
      }
    };

    const store = new PrismaRunStore(db as never);
    const schedules = await store.getDueSchedules(new Date('2026-07-10T10:00:00.000Z'));

    expect(schedules).toEqual([expect.objectContaining({ agentVersionId: 'version-2' })]);
    expect(db.playbook.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          mode: { not: 'manual' },
          nextRunAt: { lte: new Date('2026-07-10T10:00:00.000Z') }
        })
      })
    );
  });

  it('upserts and claims queued runs through db adapter, including playbook ingestion metadata', async () => {
    const db: any = {
      agentSchedule: {
        findMany: vi.fn(async () => [{ agentId: 'agent-1', nextRunAt: new Date('2026-07-10T10:00:00.000Z'), enabled: true }])
      },
      agent: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id, ownerUserId: 'owner-1' }))
      },
      agentRun: {
        upsert: vi.fn(async () => ({})),
        findFirst: vi.fn(async () => ({
          id: 'run-1',
          agentId: 'agent-1',
          agentVersionId: 'version-2',
          playbookId: 'playbook-1',
          scheduledFor: new Date('2026-07-10T10:00:00.000Z'),
          status: 'queued',
          workerId: null,
          retryCount: 0,
          errorCode: null,
          startedAt: null,
          finishedAt: null,
          playbook: {
            recipientsJson: '["alerts@example.com"]',
            language: 'de',
            notificationsEnabled: false,
            digestFrequency: 'daily',
            maxItemsPerSource: 7
          }
        })),
        update: vi
          .fn()
          .mockResolvedValueOnce({
            id: 'run-1',
            agentId: 'agent-1',
            agentVersionId: 'version-2',
            playbookId: 'playbook-1',
            scheduledFor: new Date('2026-07-10T10:00:00.000Z'),
            status: 'running',
            workerId: 'worker-a',
            retryCount: 0,
            errorCode: null,
            startedAt: new Date('2026-07-10T10:01:00.000Z'),
            finishedAt: null
          })
          .mockResolvedValueOnce({ id: 'run-1', agentId: 'agent-1' })
      }
    };
    db.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db));

    const store = new PrismaRunStore(db as never);
    await store.upsertQueuedRun('agent-1', new Date('2026-07-10T10:00:00.000Z'), 'playbook-1', 'version-2');
    const claimed = await store.claimNextQueuedRun('worker-a');
    await store.completeRun('run-1', 'succeeded');

    expect(db.agentRun.upsert).toHaveBeenCalledTimes(1);
    expect(db.agentRun.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ agentVersionId: 'version-2' })
      })
    );
    expect(claimed?.status).toBe('running');
    expect(claimed).toEqual(
      expect.objectContaining({
        playbookId: 'playbook-1',
        agentVersionId: 'version-2',
        playbookRecipients: ['alerts@example.com'],
        playbookLanguage: 'de',
        playbookNotificationsEnabled: false,
        playbookDigestFrequency: 'daily',
        playbookMaxItemsPerSource: 7
      })
    );
    expect(db.agentRun.update).toHaveBeenCalledTimes(2);
  });
});

describe('PrismaRunStore realtime event production', () => {
  function createMockRealtime() {
    const events: Array<{ userId: string; topic: string; entityId?: string; agentId?: string }> = [];
    return {
      events,
      append: vi.fn(async (_tx: unknown, event: { userId: string; topic: string; entityId?: string; agentId?: string }) => {
        events.push(event);
      })
    };
  }

  function createFakeDb() {
    const db: any = {
      agent: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id, ownerUserId: 'owner-1' }))
      },
      agentRun: {
        findFirst: vi.fn(async () => ({
          id: 'run-1',
          agentId: 'agent-1',
          scheduledFor: new Date('2026-07-10T10:00:00.000Z'),
          status: 'queued'
        })),
        update: vi.fn(async ({ where, data }: any) => ({ id: where.id, agentId: 'agent-1', ...data }))
      }
    };
    db.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db));
    return db;
  }

  it('emits run.changed for the run agent owner on claim, phase change, and completion', async () => {
    const db = createFakeDb();
    const realtime = createMockRealtime();
    const store = new PrismaRunStore(db as never, realtime);

    await store.claimNextQueuedRun('worker-a');
    await store.setPhase('run-1', 'crawling');
    await store.completeRun('run-1', 'succeeded');

    expect(realtime.events).toHaveLength(3);
    expect(
      realtime.events.every(
        (e) => e.userId === 'owner-1' && e.topic === 'run.changed' && e.entityId === 'run-1' && e.agentId === 'agent-1'
      )
    ).toBe(true);
  });

  it('does not emit run.changed when the domain write throws', async () => {
    const db = createFakeDb();
    db.agentRun.update = vi.fn(async () => {
      throw new Error('db_error');
    });
    const realtime = createMockRealtime();
    const store = new PrismaRunStore(db as never, realtime);

    await expect(store.setPhase('run-1', 'crawling')).rejects.toThrow('db_error');

    expect(realtime.events).toHaveLength(0);
  });

  it('throws invariant_violation instead of silently skipping the event when the owning agent is missing on claim', async () => {
    const db = createFakeDb();
    db.agent.findUnique = vi.fn(async () => null);
    const realtime = createMockRealtime();
    const store = new PrismaRunStore(db as never, realtime);

    await expect(store.claimNextQueuedRun('worker-a')).rejects.toThrow(/invariant_violation/);

    expect(realtime.events).toHaveLength(0);
  });

  it('throws invariant_violation instead of silently skipping the event when the owning agent is missing on phase change', async () => {
    const db = createFakeDb();
    db.agent.findUnique = vi.fn(async () => null);
    const realtime = createMockRealtime();
    const store = new PrismaRunStore(db as never, realtime);

    await expect(store.setPhase('run-1', 'crawling')).rejects.toThrow(/invariant_violation: run run-1 references missing agent agent-1/);

    expect(realtime.events).toHaveLength(0);
  });

  it('throws invariant_violation instead of silently skipping the event when the owning agent is missing on completion', async () => {
    const db = createFakeDb();
    db.agent.findUnique = vi.fn(async () => null);
    const realtime = createMockRealtime();
    const store = new PrismaRunStore(db as never, realtime);

    await expect(store.completeRun('run-1', 'succeeded')).rejects.toThrow(/invariant_violation: run run-1 references missing agent agent-1/);

    expect(realtime.events).toHaveLength(0);
  });
});
