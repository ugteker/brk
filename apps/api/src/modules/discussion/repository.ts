import type { PrismaClient } from '@prisma/client';
import type {
  Discussion,
  DiscussionParticipant,
  DiscussionRun,
  DiscussionTurn,
  CreateDiscussionInput,
  UpdateDiscussionInput,
  DiscussionTrigger,
  DiscussionRunEvidenceSnapshot,
  DiscussionLiveQuestion
} from './types';
import type { RealtimeEventWriter } from '../realtime/types';

type DiscussionDb = Pick<
  PrismaClient,
  'discussion' | 'discussionParticipant' | 'discussionRun' | 'discussionTurn' | 'discussionLiveQuestion' | 'realtimeEvent' | '$transaction'
>;

/** Used when a caller doesn't wire a real RealtimeEventWriter (e.g. legacy tests); keeps
 * mutation behavior identical while emitting no realtime events. */
const noopRealtimeEventWriter: RealtimeEventWriter = { append: async () => {} };

function mapParticipant(row: any): DiscussionParticipant {
  return {
    id: row.id,
    discussionId: row.discussionId,
    agentId: row.agentId,
    role: row.role as any,
    voiceId: row.voiceId as any,
    speakerOrder: row.speakerOrder,
    active: row.active ?? true,
    reportIds: row.reportIdsJson ? JSON.parse(row.reportIdsJson) : []
  };
}

function mapTurn(row: any): DiscussionTurn {
  return {
    id: row.id,
    discussionRunId: row.discussionRunId,
    participantId: row.participantId,
    turnIndex: row.turnIndex,
    segmentLabel: row.segmentLabel ?? null,
    content: row.content,
    audioUrl: row.audioUrl ?? null,
    createdAt: row.createdAt
  };
}

function mapLiveQuestion(row: any): DiscussionLiveQuestion {
  return {
    id: row.id,
    discussionRunId: row.discussionRunId,
    content: row.content,
    createdAt: row.createdAt,
    answeredByTurnId: row.answeredByTurnId ?? null,
    answeredAt: row.answeredAt ?? null
  };
}

function mapRun(row: any): DiscussionRun {
  return {
    id: row.id,
    discussionId: row.discussionId,
    status: row.status as any,
    triggeredBy: row.triggeredBy as any,
    errorMessage: row.errorMessage ?? null,
    startedAt: row.startedAt ?? null,
    completedAt: row.completedAt ?? null,
    syntheticSourceItemId: row.syntheticSourceItemId ?? null,
    audioUrl: row.audioUrl ?? null,
    questionsClosedAt: row.questionsClosedAt ?? null,
    createdAt: row.createdAt,
    turns: (row.turns ?? []).map(mapTurn),
    questions: (row.questions ?? []).map(mapLiveQuestion),
    evidenceSnapshot: row.evidenceSnapshotJson ? JSON.parse(row.evidenceSnapshotJson) : null
  };
}

function mapDiscussion(row: any): Discussion {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    name: row.name,
    description: row.description,
    format: row.format as any,
    formatConfig: row.formatConfigJson ? JSON.parse(row.formatConfigJson) : {},
    scheduleJson: row.scheduleJson ?? null,
    syntheticSourceId: row.syntheticSourceId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    participants: (row.participants ?? []).map(mapParticipant)
  };
}

export class DiscussionRepository {
  constructor(
    private readonly db: DiscussionDb,
    private readonly realtime: RealtimeEventWriter = noopRealtimeEventWriter
  ) {}

  async createDiscussion(ownerUserId: string, input: CreateDiscussionInput): Promise<Discussion> {
    const row = await (this.db as any).$transaction(async (tx: any) => {
      const disc = await tx.discussion.create({
        data: {
          ownerUserId,
          name: input.name,
          description: input.description ?? '',
          format: input.format,
          formatConfigJson: JSON.stringify(input.formatConfig ?? {}),
          scheduleJson: input.scheduleJson ?? null
        }
      });
      for (const p of input.participants) {
        await tx.discussionParticipant.create({
          data: {
            discussionId: disc.id,
            agentId: p.agentId,
            role: p.role,
            voiceId: p.voiceId,
            speakerOrder: p.speakerOrder,
            reportIdsJson: JSON.stringify(p.reportIds ?? [])
          }
        });
      }
      return tx.discussion.findUniqueOrThrow({ where: { id: disc.id }, include: { participants: true } });
    });
    return mapDiscussion(row);
  }

  async getDiscussion(discussionId: string): Promise<Discussion | null> {
    const row = await (this.db as any).discussion.findUnique({
      where: { id: discussionId },
      include: { participants: true }
    });
    return row ? mapDiscussion(row) : null;
  }

  async listDiscussions(ownerUserId: string): Promise<Discussion[]> {
    const rows = await (this.db as any).discussion.findMany({
      where: { ownerUserId },
      include: { participants: true },
      orderBy: { createdAt: 'desc' }
    });
    return rows.map(mapDiscussion);
  }

  async listScheduledDiscussions(): Promise<Discussion[]> {
    const rows = await (this.db as any).discussion.findMany({
      where: { NOT: { scheduleJson: null } },
      include: { participants: true }
    });
    return rows.map(mapDiscussion);
  }

  async updateDiscussion(discussionId: string, input: UpdateDiscussionInput): Promise<Discussion> {
    await (this.db as any).$transaction(async (tx: any) => {
      const existing = await tx.discussion.findUniqueOrThrow({
        where: { id: discussionId },
        include: { participants: true }
      });
      const data: any = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.format !== undefined) data.format = input.format;
      if (input.formatConfig !== undefined) {
        const { grounding: _grounding, ...editableFormatConfig } = input.formatConfig as Discussion['formatConfig'];
        const currentFormatConfig = existing.formatConfigJson ? JSON.parse(existing.formatConfigJson) : {};
        data.formatConfigJson = JSON.stringify({ ...currentFormatConfig, ...editableFormatConfig });
      }
      if ('scheduleJson' in input) data.scheduleJson = input.scheduleJson;
      if (Object.keys(data).length > 0) {
        await tx.discussion.update({ where: { id: discussionId }, data });
      }

      if (input.participants) {
        const existingByAgentId = new Map<string, any>(
          existing.participants.map((participant: any) => [participant.agentId, participant])
        );
        const selectedAgentIds = new Set(input.participants.map((participant) => participant.agentId));
        for (const participant of existing.participants) {
          if (participant.active && !selectedAgentIds.has(participant.agentId)) {
            await tx.discussionParticipant.update({
              where: { id: participant.id },
              data: { active: false }
            });
          }
        }
        for (const participant of input.participants) {
          const existingParticipant = existingByAgentId.get(participant.agentId);
          if (existingParticipant) {
            await tx.discussionParticipant.update({
              where: { id: existingParticipant.id },
              data: {
                active: true,
                role: participant.role,
                voiceId: participant.voiceId,
                speakerOrder: participant.speakerOrder
              }
            });
          } else {
            await tx.discussionParticipant.create({
              data: {
                discussionId,
                agentId: participant.agentId,
                role: participant.role,
                voiceId: participant.voiceId,
                speakerOrder: participant.speakerOrder,
                reportIdsJson: '[]',
                active: true
              }
            });
          }
        }
      }
      await this.realtime.append(tx, { userId: existing.ownerUserId, topic: 'discussion.changed', entityId: discussionId });
    });
    return this.getDiscussion(discussionId) as Promise<Discussion>;
  }

  async deleteDiscussion(discussionId: string): Promise<void> {
    await (this.db as any).discussion.delete({ where: { id: discussionId } });
  }

  async setSyntheticSourceId(discussionId: string, sourceId: string): Promise<void> {
    await (this.db as any).discussion.update({
      where: { id: discussionId },
      data: { syntheticSourceId: sourceId }
    });
  }

  async createRun(discussionId: string, triggeredBy: DiscussionTrigger): Promise<DiscussionRun> {
    const row = await (this.db as any).$transaction(async (tx: any) => {
      const created = await tx.discussionRun.create({
        data: { discussionId, triggeredBy, status: 'pending' },
        include: { turns: true, questions: true }
      });
      const discussion = await tx.discussion.findUnique({ where: { id: discussionId }, select: { ownerUserId: true } });
      if (!discussion) {
        // DiscussionRun.discussionId is a required, FK-enforced column (onDelete: Cascade), so
        // a missing discussion here means the data invariant has been violated. Surface it
        // loudly instead of silently skipping the realtime event.
        throw new Error(`invariant_violation: discussion run ${created.id} references missing discussion ${discussionId}`);
      }
      await this.realtime.append(tx, { userId: discussion.ownerUserId, topic: 'discussion.changed', entityId: discussionId });
      return created;
    });
    return mapRun(row);
  }

  async getRunWithTurns(runId: string): Promise<DiscussionRun | null> {
    const row = await (this.db as any).discussionRun.findUnique({
      where: { id: runId },
      include: {
        turns: { orderBy: { turnIndex: 'asc' } },
        questions: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }
      }
    });
    return row ? mapRun(row) : null;
  }

  async listRuns(discussionId: string): Promise<DiscussionRun[]> {
    const rows = await (this.db as any).discussionRun.findMany({
      where: { discussionId },
      include: {
        turns: { orderBy: { turnIndex: 'asc' } },
        questions: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }
      },
      orderBy: { createdAt: 'desc' }
    });
    return rows.map(mapRun);
  }

  async updateRun(
    runId: string,
    patch: Partial<Pick<DiscussionRun, 'status' | 'errorMessage' | 'startedAt' | 'completedAt' | 'syntheticSourceItemId' | 'audioUrl'>>
  ): Promise<void> {
    await (this.db as any).$transaction(async (tx: any) => {
      const updated = await tx.discussionRun.update({ where: { id: runId }, data: patch });
      const discussion = await tx.discussion.findUnique({ where: { id: updated.discussionId }, select: { ownerUserId: true } });
      if (!discussion) {
        throw new Error(`invariant_violation: discussion run ${runId} references missing discussion ${updated.discussionId}`);
      }
      await this.realtime.append(tx, { userId: discussion.ownerUserId, topic: 'discussion.changed', entityId: updated.discussionId });
    });
  }

  async createTurn(
    runId: string,
    participantId: string,
    turnIndex: number,
    content: string,
    segmentLabel: string | null
  ): Promise<DiscussionTurn> {
    const row = await (this.db as any).$transaction(async (tx: any) => {
      const created = await tx.discussionTurn.create({
        data: { discussionRunId: runId, participantId, turnIndex, content, segmentLabel }
      });
      const run = await tx.discussionRun.findUnique({ where: { id: runId }, select: { discussionId: true } });
      if (!run) {
        // DiscussionTurn.discussionRunId is a required, FK-enforced column (onDelete: Cascade),
        // so a missing run here means the data invariant has been violated.
        throw new Error(`invariant_violation: discussion turn ${created.id} references missing run ${runId}`);
      }
      const discussion = await tx.discussion.findUnique({ where: { id: run.discussionId }, select: { ownerUserId: true } });
      if (!discussion) {
        throw new Error(`invariant_violation: discussion run ${runId} references missing discussion ${run.discussionId}`);
      }
      await this.realtime.append(tx, { userId: discussion.ownerUserId, topic: 'discussion.changed', entityId: run.discussionId });
      return created;
    });
    return mapTurn(row);
  }

  async updateTurnAudioUrl(turnId: string, audioUrl: string): Promise<void> {
    await (this.db as any).$transaction(async (tx: any) => {
      const updated = await tx.discussionTurn.update({ where: { id: turnId }, data: { audioUrl } });
      const run = await tx.discussionRun.findUnique({ where: { id: updated.discussionRunId }, select: { discussionId: true } });
      if (!run) {
        throw new Error(`invariant_violation: discussion turn ${turnId} references missing run ${updated.discussionRunId}`);
      }
      const discussion = await tx.discussion.findUnique({ where: { id: run.discussionId }, select: { ownerUserId: true } });
      if (!discussion) {
        throw new Error(`invariant_violation: discussion run ${updated.discussionRunId} references missing discussion ${run.discussionId}`);
      }
      await this.realtime.append(tx, { userId: discussion.ownerUserId, topic: 'discussion.changed', entityId: run.discussionId });
    });
  }

  async submitLiveQuestion(
    runId: string,
    content: string
  ): Promise<
    | { ok: true; question: DiscussionLiveQuestion }
    | { ok: false; reason: 'run_not_found' | 'run_not_live' | 'question_limit_reached' }
  > {
    return (this.db as any).$transaction(async (tx: any) => {
      const run = await tx.discussionRun.findUnique({ where: { id: runId } });
      if (!run) return { ok: false, reason: 'run_not_found' } as const;
      if ((run.status !== 'pending' && run.status !== 'running') || run.questionsClosedAt) {
        return { ok: false, reason: 'run_not_live' } as const;
      }
      const submittedCount = await tx.discussionLiveQuestion.count({
        where: { discussionRunId: runId }
      });
      if (submittedCount >= 10) {
        return { ok: false, reason: 'question_limit_reached' } as const;
      }
      const created = await tx.discussionLiveQuestion.create({
        data: { discussionRunId: runId, content }
      });
      const discussion = await tx.discussion.findUnique({
        where: { id: run.discussionId },
        select: { ownerUserId: true }
      });
      if (!discussion) {
        throw new Error(`invariant_violation: discussion run ${runId} references missing discussion ${run.discussionId}`);
      }
      await this.realtime.append(tx, {
        userId: discussion.ownerUserId,
        topic: 'discussion.changed',
        entityId: run.discussionId
      });
      return { ok: true, question: mapLiveQuestion(created) } as const;
    });
  }

  async getOldestUnansweredLiveQuestion(runId: string): Promise<DiscussionLiveQuestion | null> {
    const row = await (this.db as any).discussionLiveQuestion.findFirst({
      where: { discussionRunId: runId, answeredAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
    });
    return row ? mapLiveQuestion(row) : null;
  }

  async markLiveQuestionAnswered(questionId: string, turnId: string): Promise<void> {
    await (this.db as any).$transaction(async (tx: any) => {
      const question = await tx.discussionLiveQuestion.findUnique({ where: { id: questionId } });
      const turn = await tx.discussionTurn.findUnique({ where: { id: turnId } });
      if (!question || !turn || question.discussionRunId !== turn.discussionRunId || question.answeredAt) {
        throw new Error(`invariant_violation: question ${questionId} cannot be answered by turn ${turnId}`);
      }
      await tx.discussionLiveQuestion.update({
        where: { id: questionId },
        data: { answeredByTurnId: turnId, answeredAt: new Date() }
      });
      const run = await tx.discussionRun.findUnique({
        where: { id: question.discussionRunId },
        select: { discussionId: true }
      });
      if (!run) {
        throw new Error(`invariant_violation: question ${questionId} references missing run ${question.discussionRunId}`);
      }
      const discussion = await tx.discussion.findUnique({
        where: { id: run.discussionId },
        select: { ownerUserId: true }
      });
      if (!discussion) {
        throw new Error(`invariant_violation: discussion run ${question.discussionRunId} references missing discussion ${run.discussionId}`);
      }
      await this.realtime.append(tx, {
        userId: discussion.ownerUserId,
        topic: 'discussion.changed',
        entityId: run.discussionId
      });
    });
  }

  async completeRunIfNoUnansweredQuestions(runId: string): Promise<boolean> {
    return (this.db as any).$transaction(async (tx: any) => {
      const run = await tx.discussionRun.findUnique({ where: { id: runId } });
      if (!run) throw new Error(`Discussion run ${runId} not found`);
      if (run.status === 'done') return true;
      if (run.status !== 'running') {
        throw new Error(`Discussion run ${runId} is not running`);
      }
      const unansweredCount = await tx.discussionLiveQuestion.count({
        where: { discussionRunId: runId, answeredAt: null }
      });
      if (unansweredCount > 0) return false;
      await tx.discussionRun.update({
        where: { id: runId },
        data: { questionsClosedAt: new Date() }
      });
      const discussion = await tx.discussion.findUnique({
        where: { id: run.discussionId },
        select: { ownerUserId: true }
      });
      if (!discussion) {
        throw new Error(`invariant_violation: discussion run ${runId} references missing discussion ${run.discussionId}`);
      }
      await this.realtime.append(tx, {
        userId: discussion.ownerUserId,
        topic: 'discussion.changed',
        entityId: run.discussionId
      });
      return true;
    });
  }

  /**
   * Freezes the resolved report/source-material context used to generate a run's turns, so the
   * run remains readable later even if reports change or the fallback limit is reconfigured.
   */
  async setRunEvidenceSnapshot(runId: string, snapshot: DiscussionRunEvidenceSnapshot): Promise<void> {
    await (this.db as any).$transaction(async (tx: any) => {
      const updated = await tx.discussionRun.update({
        where: { id: runId },
        data: { evidenceSnapshotJson: JSON.stringify(snapshot) }
      });
      const discussion = await tx.discussion.findUnique({ where: { id: updated.discussionId }, select: { ownerUserId: true } });
      if (!discussion) {
        throw new Error(`invariant_violation: discussion run ${runId} references missing discussion ${updated.discussionId}`);
      }
      await this.realtime.append(tx, { userId: discussion.ownerUserId, topic: 'discussion.changed', entityId: updated.discussionId });
    });
  }
}

export type DiscussionRepositoryLike = DiscussionRepository;
