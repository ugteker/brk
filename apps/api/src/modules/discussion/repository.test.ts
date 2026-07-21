import { describe, expect, it, vi } from 'vitest';
import { DiscussionRepository } from './repository';

const participantRow = { id: 'p1', discussionId: 'd1', agentId: 'a1', role: 'speaker', voiceId: 'alloy', speakerOrder: 0, reportIdsJson: '[]' };
const discRow = { id: 'd1', ownerUserId: 'u1', name: 'Test', description: '', format: 'free_form', formatConfigJson: '{}', scheduleJson: null, syntheticSourceId: null, createdAt: new Date(), updatedAt: new Date(), participants: [participantRow] };
const turnRow = { id: 't1', discussionRunId: 'r1', participantId: 'p1', turnIndex: 0, segmentLabel: null, content: 'Hello', audioUrl: null, createdAt: new Date() };
const runRow = { id: 'r1', discussionId: 'd1', status: 'pending', triggeredBy: 'manual', errorMessage: null, startedAt: null, completedAt: null, syntheticSourceItemId: null, audioUrl: null, createdAt: new Date(), evidenceSnapshotJson: null, turns: [] };

function makeDb(overrides: any = {}) {
  const tx = {
    discussion: { create: vi.fn().mockResolvedValue(discRow), findUniqueOrThrow: vi.fn().mockResolvedValue(discRow) },
    discussionParticipant: { create: vi.fn().mockResolvedValue(participantRow) }
  };
  return {
    tx,
    $transaction: vi.fn().mockImplementation((fn: any) => fn(tx)),
    discussion: {
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
      update: vi.fn().mockResolvedValue(undefined),
      ...overrides.discussionRun
    },
    discussionTurn: {
      create: vi.fn().mockResolvedValue(turnRow),
      update: vi.fn().mockResolvedValue(undefined),
      ...overrides.discussionTurn
    }
  };
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
