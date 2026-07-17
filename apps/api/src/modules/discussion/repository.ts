import type { PrismaClient } from '@prisma/client';
import type {
  Discussion,
  DiscussionParticipant,
  DiscussionRun,
  DiscussionTurn,
  CreateDiscussionInput,
  UpdateDiscussionInput,
  DiscussionTrigger,
  DiscussionRunEvidenceSnapshot
} from './types';

type DiscussionDb = Pick<
  PrismaClient,
  'discussion' | 'discussionParticipant' | 'discussionRun' | 'discussionTurn' | '$transaction'
>;

function mapParticipant(row: any): DiscussionParticipant {
  return {
    id: row.id,
    discussionId: row.discussionId,
    agentId: row.agentId,
    role: row.role as any,
    voiceId: row.voiceId as any,
    speakerOrder: row.speakerOrder,
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
    createdAt: row.createdAt,
    turns: (row.turns ?? []).map(mapTurn),
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
  constructor(private readonly db: DiscussionDb) {}

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
    const data: any = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.format !== undefined) data.format = input.format;
    if (input.formatConfig !== undefined) data.formatConfigJson = JSON.stringify(input.formatConfig);
    if ('scheduleJson' in input) data.scheduleJson = input.scheduleJson;
    await (this.db as any).discussion.update({ where: { id: discussionId }, data });
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
    const row = await (this.db as any).discussionRun.create({
      data: { discussionId, triggeredBy, status: 'pending' },
      include: { turns: true }
    });
    return mapRun(row);
  }

  async getRunWithTurns(runId: string): Promise<DiscussionRun | null> {
    const row = await (this.db as any).discussionRun.findUnique({
      where: { id: runId },
      include: { turns: { orderBy: { turnIndex: 'asc' } } }
    });
    return row ? mapRun(row) : null;
  }

  async listRuns(discussionId: string): Promise<DiscussionRun[]> {
    const rows = await (this.db as any).discussionRun.findMany({
      where: { discussionId },
      include: { turns: { orderBy: { turnIndex: 'asc' } } },
      orderBy: { createdAt: 'desc' }
    });
    return rows.map(mapRun);
  }

  async updateRun(
    runId: string,
    patch: Partial<Pick<DiscussionRun, 'status' | 'errorMessage' | 'startedAt' | 'completedAt' | 'syntheticSourceItemId' | 'audioUrl'>>
  ): Promise<void> {
    await (this.db as any).discussionRun.update({ where: { id: runId }, data: patch });
  }

  async createTurn(
    runId: string,
    participantId: string,
    turnIndex: number,
    content: string,
    segmentLabel: string | null
  ): Promise<DiscussionTurn> {
    const row = await (this.db as any).discussionTurn.create({
      data: { discussionRunId: runId, participantId, turnIndex, content, segmentLabel }
    });
    return mapTurn(row);
  }

  async updateTurnAudioUrl(turnId: string, audioUrl: string): Promise<void> {
    await (this.db as any).discussionTurn.update({ where: { id: turnId }, data: { audioUrl } });
  }

  /**
   * Freezes the resolved report/source-material context used to generate a run's turns, so the
   * run remains readable later even if reports change or the fallback limit is reconfigured.
   */
  async setRunEvidenceSnapshot(runId: string, snapshot: DiscussionRunEvidenceSnapshot): Promise<void> {
    await (this.db as any).discussionRun.update({
      where: { id: runId },
      data: { evidenceSnapshotJson: JSON.stringify(snapshot) }
    });
  }
}

export type DiscussionRepositoryLike = DiscussionRepository;
