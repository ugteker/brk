import { describe, expect, it, vi } from 'vitest';
import { RealtimeRepository } from './repository';

function makeRow(
  id: number,
  userId: string,
  topic: string,
  entityId: string | null,
  createdAt: Date,
  agentId: string | null = null
) {
  return { id, userId, topic, entityId, agentId, createdAt };
}

describe('RealtimeRepository', () => {
  it('returns only one users events after a cursor in id order', async () => {
    const rows = [
      makeRow(1, 'user-a', 'source.changed', 'source-1', new Date('2026-07-22T10:00:00.000Z')),
      makeRow(2, 'user-b', 'run.changed', null, new Date('2026-07-22T10:01:00.000Z')),
      makeRow(3, 'user-a', 'source.changed', 'source-1', new Date('2026-07-22T10:02:00.000Z'))
    ];

    const db = {
      realtimeEvent: {
        findMany: vi.fn(async ({ where }: { where: { userId: string; id: { gt: number } } }) =>
          rows
            .filter((r) => r.userId === where.userId && r.id > where.id.gt)
            .sort((a, b) => a.id - b.id)
        ),
        findFirst: vi.fn(),
        deleteMany: vi.fn(),
        create: vi.fn()
      }
    };

    const repository = new RealtimeRepository(db as never);

    await expect(repository.listAfter('user-a', 1)).resolves.toEqual([
      { id: 3, userId: 'user-a', topic: 'source.changed', entityId: 'source-1', agentId: null, createdAt: expect.any(Date) }
    ]);
  });

  it('deletes events older than the 24-hour cutoff', async () => {
    const db = {
      realtimeEvent: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn()
      }
    };

    const repository = new RealtimeRepository(db as never);
    await repository.deleteOlderThan(new Date('2026-07-21T12:00:00.000Z'));

    expect(db.realtimeEvent.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date('2026-07-21T12:00:00.000Z') } }
    });
  });

  it('append calls tx.realtimeEvent.create with entityId and agentId null when omitted', async () => {
    const tx = {
      realtimeEvent: {
        create: vi.fn().mockResolvedValue({})
      }
    };

    const db = {
      realtimeEvent: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        deleteMany: vi.fn(),
        create: vi.fn()
      }
    };

    const repository = new RealtimeRepository(db as never);
    await repository.append(tx, { userId: 'user-a', topic: 'run.changed' });

    expect(tx.realtimeEvent.create).toHaveBeenCalledWith({
      data: { userId: 'user-a', topic: 'run.changed', entityId: null, agentId: null }
    });
    // append must use the injected tx, not open its own transaction on db
    expect(db.realtimeEvent.create).not.toHaveBeenCalled();
  });

  it('append passes entityId when provided', async () => {
    const tx = {
      realtimeEvent: {
        create: vi.fn().mockResolvedValue({})
      }
    };

    const db = {
      realtimeEvent: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        deleteMany: vi.fn(),
        create: vi.fn()
      }
    };

    const repository = new RealtimeRepository(db as never);
    await repository.append(tx, { userId: 'user-a', topic: 'source.changed', entityId: 'source-42' });

    expect(tx.realtimeEvent.create).toHaveBeenCalledWith({
      data: { userId: 'user-a', topic: 'source.changed', entityId: 'source-42', agentId: null }
    });
  });

  it('append passes agentId when provided, alongside entityId', async () => {
    const tx = {
      realtimeEvent: {
        create: vi.fn().mockResolvedValue({})
      }
    };

    const db = {
      realtimeEvent: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        deleteMany: vi.fn(),
        create: vi.fn()
      }
    };

    const repository = new RealtimeRepository(db as never);
    await repository.append(tx, { userId: 'user-a', topic: 'run.changed', entityId: 'run-42', agentId: 'agent-7' });

    expect(tx.realtimeEvent.create).toHaveBeenCalledWith({
      data: { userId: 'user-a', topic: 'run.changed', entityId: 'run-42', agentId: 'agent-7' }
    });
  });

  it('returns null from oldestIdForUser when no rows exist', async () => {
    const db = {
      realtimeEvent: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn(),
        deleteMany: vi.fn(),
        create: vi.fn()
      }
    };

    const repository = new RealtimeRepository(db as never);
    await expect(repository.oldestIdForUser('user-x')).resolves.toBeNull();
  });

  it('returns the oldest row id from oldestIdForUser', async () => {
    const db = {
      realtimeEvent: {
        findFirst: vi.fn().mockResolvedValue(makeRow(5, 'user-a', 'run.changed', null, new Date())),
        findMany: vi.fn(),
        deleteMany: vi.fn(),
        create: vi.fn()
      }
    };

    const repository = new RealtimeRepository(db as never);
    await expect(repository.oldestIdForUser('user-a')).resolves.toBe(5);
  });
});
