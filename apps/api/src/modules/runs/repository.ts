import type { PrismaClient } from '@prisma/client';
import type { RunDetailRecord } from './types';

type RunsDb = Pick<PrismaClient, 'agentRun'>;

const CONTENT_PREVIEW_LENGTH = 300;

type ArtifactRow = {
  id: string;
  sourceRef: string;
  fidelity: string;
  payloadJson: string;
};

type ReportRow = {
  id: string;
  summary: string;
  needsHumanReview: boolean;
  signals: unknown[];
};

type RunRow = {
  id: string;
  agentId: string;
  status: string;
  phase: string | null;
  scheduledFor: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  retryCount: number;
  artifacts: ArtifactRow[];
  report: ReportRow | null;
};

/**
 * Pulls the normalized evidence text out of an artifact's payloadJson (a JSON-encoded
 * `EvidenceBlock`, see `apps/api/src/modules/analysis/types.ts`). Falls back to an empty string
 * if the payload isn't parseable or has no `content` field, so a malformed/legacy artifact row
 * never breaks the whole run-history listing.
 */
function extractArtifactContent(payloadJson: string): string {
  try {
    const parsed = JSON.parse(payloadJson) as { content?: unknown };
    return typeof parsed.content === 'string' ? parsed.content : '';
  } catch {
    return '';
  }
}

export class RunsRepository {
  constructor(private readonly db: RunsDb) {}

  async listRunDetailsForAgent(agentId: string, limit = 50): Promise<RunDetailRecord[]> {
    const rows = await this.db.agentRun.findMany({
      where: { agentId },
      orderBy: { scheduledFor: 'desc' },
      take: limit,
      include: {
        artifacts: true,
        report: { include: { signals: true } }
      }
    });

    return (rows as unknown as RunRow[]).map((row) => this.toRecord(row));
  }

  /**
   * Fetches the full (untruncated) evidence text for a single artifact, scoped to a specific
   * agent/run so a caller can't download an artifact belonging to a different agent by guessing
   * an id. Returns null if the run/artifact doesn't exist or doesn't belong to that agent/run.
   */
  async getArtifactContent(
    agentId: string,
    runId: string,
    artifactId: string
  ): Promise<{ sourceRef: string; content: string } | null> {
    const run = await this.db.agentRun.findFirst({
      where: { id: runId, agentId },
      include: { artifacts: { where: { id: artifactId } } }
    });

    const artifact = (run as unknown as RunRow | null)?.artifacts[0];
    if (!artifact) return null;

    return { sourceRef: artifact.sourceRef, content: extractArtifactContent(artifact.payloadJson) };
  }

  private toRecord(row: RunRow): RunDetailRecord {
    const durationMs =
      row.startedAt && row.finishedAt ? row.finishedAt.getTime() - row.startedAt.getTime() : null;

    return {
      id: row.id,
      agentId: row.agentId,
      status: row.status,
      phase: row.phase,
      scheduledFor: row.scheduledFor,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      durationMs,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      retryCount: row.retryCount,
      report: row.report
        ? {
            id: row.report.id,
            summary: row.report.summary,
            needsHumanReview: row.report.needsHumanReview,
            signalCount: row.report.signals.length
          }
        : null,
      artifacts: row.artifacts.map((artifact) => {
        const content = extractArtifactContent(artifact.payloadJson);
        return {
          id: artifact.id,
          sourceRef: artifact.sourceRef,
          fidelity: artifact.fidelity,
          contentPreview: content.slice(0, CONTENT_PREVIEW_LENGTH),
          contentLength: content.length
        };
      })
    };
  }
}
