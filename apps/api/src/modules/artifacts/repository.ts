import type { PrismaClient } from '@prisma/client';
import type { ArtifactFidelity, ArtifactRecord, CreateArtifactInput } from './types';

type ArtifactDb = Pick<PrismaClient, 'agentRunArtifact'>;

export class ArtifactRepository {
  constructor(private readonly db: ArtifactDb) {}

  async saveArtifact(input: CreateArtifactInput): Promise<ArtifactRecord> {
    const created = await this.db.agentRunArtifact.create({
      data: {
        agentId: input.agentId,
        agentRunId: input.agentRunId,
        kind: input.kind,
        sourceRef: input.sourceRef,
        payloadJson: input.payloadJson,
        fidelity: input.fidelity
      }
    });

    return this.toRecord(created);
  }

  async listArtifactsForRun(agentRunId: string): Promise<ArtifactRecord[]> {
    const rows = await this.db.agentRunArtifact.findMany({ where: { agentRunId } });
    return rows.map((row: unknown) => this.toRecord(row as Parameters<typeof this.toRecord>[0]));
  }

  async getArtifactsByIds(ids: string[]): Promise<ArtifactRecord[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.agentRunArtifact.findMany({ where: { id: { in: ids } } });
    return rows.map((row: unknown) => this.toRecord(row as Parameters<typeof this.toRecord>[0]));
  }

  /** Lists the user's most recent raw source-material artifacts (episode/page transcripts
   * downloaded during agent runs) - the pickable options for transcript-grounded Studio
   * discussions. Ownership is resolved through the run's agent. */
  async listRecentEvidenceArtifacts(userId: string, limit = 50): Promise<ArtifactRecord[]> {
    const rows = await this.db.agentRunArtifact.findMany({
      where: { kind: 'normalized_evidence', agentRun: { agent: { ownerUserId: userId } } },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
    return rows.map((row: unknown) => this.toRecord(row as Parameters<typeof this.toRecord>[0]));
  }

  private toRecord(row: {
    id: string;
    agentId: string;
    agentRunId: string;
    kind: string;
    sourceRef: string;
    payloadJson: string;
    fidelity: string;
    createdAt: Date;
  }): ArtifactRecord {
    return {
      id: row.id,
      agentId: row.agentId,
      agentRunId: row.agentRunId,
      kind: row.kind,
      sourceRef: row.sourceRef,
      payloadJson: row.payloadJson,
      fidelity: row.fidelity as ArtifactFidelity,
      createdAt: row.createdAt
    };
  }
}
