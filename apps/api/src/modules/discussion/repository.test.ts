import { describe, expect, it, vi } from 'vitest';
import { DiscussionRepository } from './repository';

const participantRow = { id: 'p1', discussionId: 'd1', agentId: 'a1', role: 'speaker', voiceId: 'alloy', speakerOrder: 0, reportIdsJson: '[]' };
const discRow = { id: 'd1', ownerUserId: 'u1', name: 'Test', description: '', format: 'free_form', formatConfigJson: '{}', scheduleJson: null, syntheticSourceId: null, createdAt: new Date(), updatedAt: new Date(), participants: [participantRow] };
const turnRow = { id: 't1', discussionRunId: 'r1', participantId: 'p1', turnIndex: 0, segmentLabel: null, content: 'Hello', audioUrl: null, createdAt: new Date() };
const runRow = { id: 'r1', discussionId: 'd1', status: 'pending', triggeredBy: 'manual', errorMessage: null, startedAt: null, completedAt: null, syntheticSourceItemId: null, audioUrl: null, createdAt: new Date(), evidenceSnapshotJson: null, turns: [] };

function makeDb(overrides: any = {}) {
  const db: any = {
    discussion: {
      create: vi.fn().mockResolvedValue(discRow),
      findUniqueOrThrow: vi.fn().mockResolvedValue(discRow),
      findUnique: vi.fn().mockResolvedValue(discRow),
      findMany: vi.fn().mockResolvedValue([discRow]),
      update: vi.fn().mockResolvedValue(discRow),
      delete: vi.fn().mockResolvedValue(undefined),
      ...overrides.discussion
    },
    discussionParticipant: { create: vi.fn().mockResolvedValue(participantRow), ...overrides.discussionParticipant },
    discussionRun: {
      create: vi.fn().mockResolvedValue(runRow),
      findUnique: vi.fn().mockResolvedValue({ ...runRow, turns: [turnRow] }),
      findMany: vi.fn().mockResolvedValue([runRow]),
      update: vi.fn().mockResolvedValue(runRow),
      ...overrides.discussionRun
    },
    discussionTurn: {
      create: vi.fn().mockResolvedValue(turnRow),
      update: vi.fn().mockResolvedValue(turnRow),
      ...overrides.discussionTurn
    }
  };
  db.$transaction = vi.fn().mockImplementation((fn: any) => fn(db));
  db.tx = db;
  return db;
}

describe('DiscussionRepository', () => {
  it('createDiscussion calls $transaction and returns mapped discussion', async () => {
    const db = makeDb();
    const repo = new DiscussionRepository(db as any);
    const result = await repo.createDiscussion('u1', {
      name: 'Test',
      format: 'free_form',
      participants: [{ agentId: 'a1', role: 'speaker', voiceId: 'alloy', speakerOrder: 0 }]
    });
    expect(result.id).toBe('d1');
    expect(result.participants).toHaveLength(1);
    expect(db.$transaction).toHaveBeenCalled();
  });

  it('getDiscussion returns null when not found', async () => {
    const db = makeDb({ discussion: { findUnique: vi.fn().mockResolvedValue(null) } });
    const repo = new DiscussionRepository(db as any);
    const result = await repo.getDiscussion('missing');
    expect(result).toBeNull();
  });

  it('createRun returns a run with empty turns', async () => {
    const db = makeDb();
    const repo = new DiscussionRepository(db as any);
    const run = await repo.createRun('d1', 'manual');
    expect(run.id).toBe('r1');
    expect(run.status).toBe('pending');
    expect(run.turns).toHaveLength(0);
  });

  it('getRunWithTurns returns run with turns', async () => {
    const db = makeDb();
    const repo = new DiscussionRepository(db as any);
    const run = await repo.getRunWithTurns('r1');
    expect(run).not.toBeNull();
    expect(run!.turns).toHaveLength(1);
    expect(run!.turns[0].content).toBe('Hello');
  });

  it('createTurn returns turn record', async () => {
    const db = makeDb();
    const repo = new DiscussionRepository(db as any);
    const turn = await repo.createTurn('r1', 'p1', 0, 'Hello', null);
    expect(turn.content).toBe('Hello');
    expect(turn.segmentLabel).toBeNull();
  });

  it('deleteDiscussion calls db.discussion.delete', async () => {
    const db = makeDb();
    const repo = new DiscussionRepository(db as any);
    await repo.deleteDiscussion('d1');
    expect(db.discussion.delete).toHaveBeenCalledWith({ where: { id: 'd1' } });
  });

  it('createDiscussion persists per-participant reportIds and getDiscussion parses them back', async () => {
    const db = makeDb();
    const repo = new DiscussionRepository(db as any);
    await repo.createDiscussion('u1', {
      name: 'Test',
      format: 'free_form',
      participants: [
        { agentId: 'a1', role: 'speaker', voiceId: 'alloy', speakerOrder: 0, reportIds: ['r1', 'r2'] }
      ]
    });
    expect(db.tx.discussionParticipant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ reportIdsJson: JSON.stringify(['r1', 'r2']) })
    });
  });

  it('getDiscussion parses participant reportIdsJson back into reportIds', async () => {
    const db = makeDb({
      discussion: {
        findUnique: vi.fn().mockResolvedValue({
          ...discRow,
          participants: [{ ...participantRow, reportIdsJson: JSON.stringify(['r5']) }]
        })
      }
    });
    const repo = new DiscussionRepository(db as any);
    const result = await repo.getDiscussion('d1');
    expect(result!.participants[0].reportIds).toEqual(['r5']);
  });

  it('getRunWithTurns returns null evidenceSnapshot for legacy runs without a snapshot', async () => {
    const db = makeDb();
    const repo = new DiscussionRepository(db as any);
    const run = await repo.getRunWithTurns('r1');
    expect(run!.evidenceSnapshot).toBeNull();
  });

  it('setRunEvidenceSnapshot persists the snapshot as JSON', async () => {
    const db = makeDb();
    const repo = new DiscussionRepository(db as any);
    const snapshot = {
      agenda: 'Discuss NVDA',
      participants: [
        { participantId: 'p1', agentId: 'a1', reportIds: ['r1'], origin: 'explicit' as const, sourceItemIds: ['item-1'], transcriptWarnings: [] }
      ]
    };
    await repo.setRunEvidenceSnapshot('r1', snapshot);
    expect(db.discussionRun.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { evidenceSnapshotJson: JSON.stringify(snapshot) }
    });
  });

  it('getRunWithTurns parses a persisted evidenceSnapshotJson back into an object', async () => {
    const snapshot = { agenda: 'Topic', participants: [] };
    const db = makeDb({
      discussionRun: {
        findUnique: vi.fn().mockResolvedValue({ ...runRow, evidenceSnapshotJson: JSON.stringify(snapshot), turns: [] })
      }
    });
    const repo = new DiscussionRepository(db as any);
    const run = await repo.getRunWithTurns('r1');
    expect(run!.evidenceSnapshot).toEqual(snapshot);
  });
});

describe('DiscussionRepository realtime event production', () => {
  function createMockRealtime() {
    const events: Array<{ userId: string; topic: string; entityId?: string }> = [];
    return {
      events,
      append: vi.fn(async (_tx: unknown, event: { userId: string; topic: string; entityId?: string }) => {
        events.push(event);
      })
    };
  }

  it('emits discussion.changed for the discussion owner on createRun, updateRun, and createTurn', async () => {
    const db = makeDb();
    const realtime = createMockRealtime();
    const repo = new DiscussionRepository(db as any, realtime);

    await repo.createRun('d1', 'manual');
    await repo.updateRun('r1', { status: 'running' });
    await repo.createTurn('r1', 'p1', 0, 'Hello', null);

    expect(realtime.events).toHaveLength(3);
    expect(realtime.events.every((e) => e.userId === 'u1' && e.topic === 'discussion.changed' && e.entityId === 'd1')).toBe(true);
  });

  it('emits discussion.changed for the discussion owner on updateTurnAudioUrl and setRunEvidenceSnapshot', async () => {
    const db = makeDb();
    const realtime = createMockRealtime();
    const repo = new DiscussionRepository(db as any, realtime);

    await repo.updateTurnAudioUrl('t1', 'https://audio/1.mp3');
    await repo.setRunEvidenceSnapshot('r1', { agenda: 'Discuss', participants: [] });

    expect(realtime.events).toHaveLength(2);
    expect(realtime.events.every((e) => e.userId === 'u1' && e.topic === 'discussion.changed' && e.entityId === 'd1')).toBe(true);
  });

  it('does not emit discussion.changed when the domain write throws', async () => {
    const db = makeDb({ discussionRun: { update: vi.fn().mockRejectedValue(new Error('db_error')) } });
    const realtime = createMockRealtime();
    const repo = new DiscussionRepository(db as any, realtime);

    await expect(repo.updateRun('r1', { status: 'error' })).rejects.toThrow('db_error');

    expect(realtime.events).toHaveLength(0);
  });

  it('throws invariant_violation instead of silently skipping the event when createRun cannot find the owning discussion', async () => {
    const db = makeDb({ discussion: { findUnique: vi.fn().mockResolvedValue(null) } });
    const realtime = createMockRealtime();
    const repo = new DiscussionRepository(db as any, realtime);

    await expect(repo.createRun('d1', 'manual')).rejects.toThrow(/invariant_violation: discussion run r1 references missing discussion d1/);

    expect(realtime.events).toHaveLength(0);
  });

  it('throws invariant_violation instead of silently skipping the event when updateRun cannot find the owning discussion', async () => {
    const db = makeDb({ discussion: { findUnique: vi.fn().mockResolvedValue(null) } });
    const realtime = createMockRealtime();
    const repo = new DiscussionRepository(db as any, realtime);

    await expect(repo.updateRun('r1', { status: 'running' })).rejects.toThrow(
      /invariant_violation: discussion run r1 references missing discussion d1/
    );

    expect(realtime.events).toHaveLength(0);
  });

  it('throws invariant_violation instead of silently skipping the event when setRunEvidenceSnapshot cannot find the owning discussion', async () => {
    const db = makeDb({ discussion: { findUnique: vi.fn().mockResolvedValue(null) } });
    const realtime = createMockRealtime();
    const repo = new DiscussionRepository(db as any, realtime);

    await expect(repo.setRunEvidenceSnapshot('r1', { agenda: 'Discuss', participants: [] })).rejects.toThrow(
      /invariant_violation: discussion run r1 references missing discussion d1/
    );

    expect(realtime.events).toHaveLength(0);
  });

  it('throws invariant_violation instead of silently skipping the event when createTurn cannot find the owning run', async () => {
    const db = makeDb({ discussionRun: { findUnique: vi.fn().mockResolvedValue(null) } });
    const realtime = createMockRealtime();
    const repo = new DiscussionRepository(db as any, realtime);

    await expect(repo.createTurn('r1', 'p1', 0, 'Hello', null)).rejects.toThrow(
      /invariant_violation: discussion turn t1 references missing run r1/
    );

    expect(realtime.events).toHaveLength(0);
  });

  it('throws invariant_violation instead of silently skipping the event when createTurn cannot find the owning discussion', async () => {
    const db = makeDb({ discussion: { findUnique: vi.fn().mockResolvedValue(null) } });
    const realtime = createMockRealtime();
    const repo = new DiscussionRepository(db as any, realtime);

    await expect(repo.createTurn('r1', 'p1', 0, 'Hello', null)).rejects.toThrow(
      /invariant_violation: discussion run r1 references missing discussion d1/
    );

    expect(realtime.events).toHaveLength(0);
  });

  it('throws invariant_violation instead of silently skipping the event when updateTurnAudioUrl cannot find the owning run', async () => {
    const db = makeDb({ discussionRun: { findUnique: vi.fn().mockResolvedValue(null) } });
    const realtime = createMockRealtime();
    const repo = new DiscussionRepository(db as any, realtime);

    await expect(repo.updateTurnAudioUrl('t1', 'https://audio/1.mp3')).rejects.toThrow(
      /invariant_violation: discussion turn t1 references missing run r1/
    );

    expect(realtime.events).toHaveLength(0);
  });

  it('throws invariant_violation instead of silently skipping the event when updateTurnAudioUrl cannot find the owning discussion', async () => {
    const db = makeDb({ discussion: { findUnique: vi.fn().mockResolvedValue(null) } });
    const realtime = createMockRealtime();
    const repo = new DiscussionRepository(db as any, realtime);

    await expect(repo.updateTurnAudioUrl('t1', 'https://audio/1.mp3')).rejects.toThrow(
      /invariant_violation: discussion run r1 references missing discussion d1/
    );

    expect(realtime.events).toHaveLength(0);
  });
});
