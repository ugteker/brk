import { describe, expect, it, vi } from 'vitest';
import { DiscussionRepository } from './repository';

const participantRow = { id: 'p1', discussionId: 'd1', agentId: 'a1', role: 'speaker', voiceId: 'alloy', speakerOrder: 0, reportIdsJson: '[]', active: true };
const discRow = { id: 'd1', ownerUserId: 'u1', name: 'Test', description: '', format: 'free_form', formatConfigJson: '{}', scheduleJson: null, syntheticSourceId: null, createdAt: new Date(), updatedAt: new Date(), participants: [participantRow] };
const turnRow = { id: 't1', discussionRunId: 'r1', participantId: 'p1', turnIndex: 0, segmentLabel: null, content: 'Hello', audioUrl: null, createdAt: new Date() };
const questionRow = { id: 'q1', discussionRunId: 'r1', content: 'What about risk?', createdAt: new Date(), answeredByTurnId: null, answeredAt: null };
const runRow = { id: 'r1', discussionId: 'd1', status: 'pending', triggeredBy: 'manual', errorMessage: null, startedAt: null, completedAt: null, syntheticSourceItemId: null, audioUrl: null, createdAt: new Date(), evidenceSnapshotJson: null, turns: [], questions: [] };

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
    discussionParticipant: {
      create: vi.fn().mockResolvedValue(participantRow),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      update: vi.fn().mockResolvedValue(participantRow),
      ...overrides.discussionParticipant
    },
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
    },
    discussionLiveQuestion: {
      create: vi.fn().mockResolvedValue(questionRow),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(questionRow),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn().mockResolvedValue(questionRow),
      ...overrides.discussionLiveQuestion
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
    expect(run!.questions).toEqual([]);
  });

  it('maps legacy runs without an included questions relation to an empty array', async () => {
    const db = makeDb({
      discussionRun: {
        findUnique: vi.fn().mockResolvedValue({ ...runRow, questions: undefined, turns: [] })
      }
    });
    const repo = new DiscussionRepository(db as any);

    expect((await repo.getRunWithTurns('r1'))!.questions).toEqual([]);
  });

  it('includes questions in FIFO order when getting a run', async () => {
    const db = makeDb();
    const repo = new DiscussionRepository(db as any);

    await repo.getRunWithTurns('r1');

    expect(db.discussionRun.findUnique).toHaveBeenCalledWith({
      where: { id: 'r1' },
      include: {
        turns: { orderBy: { turnIndex: 'asc' } },
        questions: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }
      }
    });
  });

  it('submits a question transactionally while the run is live and below the limit', async () => {
    const db = makeDb({
      discussionRun: {
        findUnique: vi.fn().mockResolvedValue({ ...runRow, status: 'running' })
      },
      discussionLiveQuestion: {
        count: vi.fn().mockResolvedValue(9)
      }
    });
    const realtime = { append: vi.fn().mockResolvedValue(undefined) };
    const repo = new DiscussionRepository(db as any, realtime);

    const result = await repo.submitLiveQuestion('r1', 'What about risk?');

    expect(result).toEqual({ ok: true, question: expect.objectContaining({ id: 'q1' }) });
    expect(db.$transaction).toHaveBeenCalled();
    expect(db.discussionLiveQuestion.create).toHaveBeenCalledWith({
      data: { discussionRunId: 'r1', content: 'What about risk?' }
    });
    expect(realtime.append).toHaveBeenCalledWith(db, {
      userId: 'u1',
      topic: 'discussion.changed',
      entityId: 'd1'
    });
  });

  it('rejects question submission when the run failed or already has ten questions', async () => {
    const errorDb = makeDb({
      discussionRun: { findUnique: vi.fn().mockResolvedValue({ ...runRow, status: 'error' }) }
    });
    const fullDb = makeDb({
      discussionRun: { findUnique: vi.fn().mockResolvedValue({ ...runRow, status: 'running' }) },
      discussionLiveQuestion: { count: vi.fn().mockResolvedValue(10) }
    });

    await expect(new DiscussionRepository(errorDb as any).submitLiveQuestion('r1', 'Question')).resolves.toEqual({
      ok: false,
      reason: 'run_not_live'
    });
    await expect(new DiscussionRepository(fullDb as any).submitLiveQuestion('r1', 'Question')).resolves.toEqual({
      ok: false,
      reason: 'question_limit_reached'
    });
  });

  it('accepts questions on a done run (encore: playback outlives generation)', async () => {
    const db = makeDb({
      discussionRun: {
        findUnique: vi.fn().mockResolvedValue({ ...runRow, status: 'done', questionsClosedAt: new Date() })
      },
      discussionLiveQuestion: { count: vi.fn().mockResolvedValue(0) }
    });
    const repo = new DiscussionRepository(db as any);

    await expect(repo.submitLiveQuestion('r1', 'One more thing?')).resolves.toEqual({
      ok: true,
      question: expect.objectContaining({ id: 'q1' })
    });
  });

  it('gets the oldest unanswered FIFO question', async () => {
    const db = makeDb();
    const repo = new DiscussionRepository(db as any);

    await repo.getOldestUnansweredLiveQuestion('r1');

    expect(db.discussionLiveQuestion.findFirst).toHaveBeenCalledWith({
      where: { discussionRunId: 'r1', answeredAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
    });
  });

  it('marks a question answered only by a turn from the same run and emits realtime', async () => {
    const db = makeDb({
      discussionTurn: { findUnique: vi.fn().mockResolvedValue(turnRow) }
    });
    const realtime = { append: vi.fn().mockResolvedValue(undefined) };
    const repo = new DiscussionRepository(db as any, realtime);

    await repo.markLiveQuestionAnswered('q1', 't1');

    expect(db.discussionLiveQuestion.update).toHaveBeenCalledWith({
      where: { id: 'q1' },
      data: { answeredByTurnId: 't1', answeredAt: expect.any(Date) }
    });
    expect(realtime.append).toHaveBeenCalled();
  });

  it('rejects marking a question with a turn from another run', async () => {
    const db = makeDb({
      discussionTurn: {
        findUnique: vi.fn().mockResolvedValue({ ...turnRow, discussionRunId: 'r2' })
      }
    });
    const repo = new DiscussionRepository(db as any);

    await expect(repo.markLiveQuestionAnswered('q1', 't1')).rejects.toThrow('invariant_violation');
    expect(db.discussionLiveQuestion.update).not.toHaveBeenCalled();
  });

  it('does not complete a run while unanswered questions remain', async () => {
    const db = makeDb({
      discussionRun: { findUnique: vi.fn().mockResolvedValue({ ...runRow, status: 'running' }) },
      discussionLiveQuestion: { count: vi.fn().mockResolvedValue(1) }
    });
    const repo = new DiscussionRepository(db as any);

    await expect(repo.completeRunIfNoUnansweredQuestions('r1')).resolves.toBe(false);
    expect(db.discussionRun.update).not.toHaveBeenCalled();
  });

  it('atomically closes a running run to submissions when no unanswered questions remain', async () => {
    const db = makeDb({
      discussionRun: { findUnique: vi.fn().mockResolvedValue({ ...runRow, status: 'running' }) }
    });
    const realtime = { append: vi.fn().mockResolvedValue(undefined) };
    const repo = new DiscussionRepository(db as any, realtime);

    await expect(repo.completeRunIfNoUnansweredQuestions('r1')).resolves.toBe(true);
    expect(db.discussionRun.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { questionsClosedAt: expect.any(Date) }
    });
    expect(realtime.append).toHaveBeenCalledWith(db.tx, {
      userId: 'u1',
      topic: 'discussion.changed',
      entityId: 'd1'
    });
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

  it('replaces active participants without breaking historic turn links or grounding', async () => {
    const db = makeDb({
      discussion: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          ...discRow,
          formatConfigJson: JSON.stringify({ grounding: { mode: 'material', reportIds: ['r1'] }, language: 'en' }),
          participants: [
            { ...participantRow, reportIdsJson: JSON.stringify(['r2']) },
            { ...participantRow, id: 'p2', agentId: 'a2', active: true },
            { ...participantRow, id: 'p3', agentId: 'a3', active: false }
          ]
        })
      }
    });
    const repo = new DiscussionRepository(db as any);

    await repo.updateDiscussion('d1', {
      name: 'Updated',
      formatConfig: { language: 'de' },
      participants: [
        { agentId: 'a1', role: 'host', voiceId: 'nova', speakerOrder: 0 },
        { agentId: 'a3', role: 'speaker', voiceId: 'echo', speakerOrder: 1 },
        { agentId: 'a4', role: 'speaker', voiceId: 'fable', speakerOrder: 2 }
      ]
    });

    expect(db.discussionParticipant.deleteMany).not.toHaveBeenCalled();
    expect(db.discussionParticipant.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { active: true, role: 'host', voiceId: 'nova', speakerOrder: 0 }
    });
    expect(db.discussionParticipant.update).toHaveBeenCalledWith({
      where: { id: 'p2' },
      data: { active: false }
    });
    expect(db.discussionParticipant.update).toHaveBeenCalledWith({
      where: { id: 'p3' },
      data: { active: true, role: 'speaker', voiceId: 'echo', speakerOrder: 1 }
    });
    expect(db.discussionParticipant.create).toHaveBeenCalledWith({
      data: {
        discussionId: 'd1',
        agentId: 'a4',
        role: 'speaker',
        voiceId: 'fable',
        speakerOrder: 2,
        reportIdsJson: '[]',
        active: true
      }
    });
    expect(JSON.parse(db.discussion.update.mock.calls[0][0].data.formatConfigJson)).toEqual({
      grounding: { mode: 'material', reportIds: ['r1'] },
      language: 'de'
    });
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
