import type { PrismaClient } from '@prisma/client';
import type { CreateRunReportInput, RunReportRecord, SignalRecord } from './types';

type ReportDb = Pick<PrismaClient, 'agentRunReport'>;

type SignalRow = { symbol: string; side: string; confidence: number; rationale: string; citationsJson: string };

type ReportRow = {
  id: string;
  agentId: string;
  agentRunId: string;
  promptVersionId: string;
  summary: string;
  sourceWarningsJson: string;
  needsHumanReview: boolean;
  createdAt: Date;
  signals: SignalRow[];
};

export class ReportRepository {
  constructor(private readonly db: ReportDb) {}

  async saveRunReport(input: CreateRunReportInput): Promise<RunReportRecord> {
    const created = await this.db.agentRunReport.create({
      data: {
        agentId: input.agentId,
        agentRunId: input.agentRunId,
        promptVersionId: input.promptVersionId,
        summary: input.summary,
        needsHumanReview: input.needsHumanReview,
        sourceWarningsJson: JSON.stringify(input.sourceWarnings),
        signals: {
          create: input.signals.map((signal) => ({
            symbol: signal.symbol,
            side: signal.side,
            confidence: signal.confidence,
            rationale: signal.rationale,
            citationsJson: JSON.stringify(signal.citations)
          }))
        }
      },
      include: { signals: true }
    });

    return this.toRecord(created as unknown as ReportRow);
  }

  async getLatestRunReport(agentId: string): Promise<RunReportRecord | null> {
    const latest = await this.db.agentRunReport.findFirst({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
      include: { signals: true }
    });

    return latest ? this.toRecord(latest as unknown as ReportRow) : null;
  }

  /**
   * Looks up a single report by its own id (not scoped to an agent) - callers that need to
   * confirm it belongs to a particular agent (e.g. the resend-notification endpoint) should
   * compare `report.agentId` against the expected agent id themselves.
   */
  async getReportById(reportId: string): Promise<RunReportRecord | null> {
    const found = await this.db.agentRunReport.findFirst({
      where: { id: reportId },
      include: { signals: true }
    });

    return found ? this.toRecord(found as unknown as ReportRow) : null;
  }

  async listReportsForAgent(agentId: string): Promise<RunReportRecord[]> {
    const rows = await this.db.agentRunReport.findMany({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
      include: { signals: true }
    });

    return rows.map((row: unknown) => this.toRecord(row as ReportRow));
  }

  /**
   * Lists all reports for the given agent that contain at least one signal for `symbol`,
   * ordered oldest-first (chronological), for building a per-symbol signal history timeline.
   * Symbol matching is exact/case-sensitive, matching how symbols are stored elsewhere.
   */
  async listSignalHistoryForSymbol(agentId: string, symbol: string): Promise<RunReportRecord[]> {
    const rows = await this.db.agentRunReport.findMany({
      where: { agentId, signals: { some: { symbol } } },
      orderBy: { createdAt: 'asc' },
      include: { signals: true }
    });

    return rows.map((row: unknown) => this.toRecord(row as ReportRow));
  }

  private toRecord(row: ReportRow): RunReportRecord {
    return {
      id: row.id,
      agentId: row.agentId,
      agentRunId: row.agentRunId,
      promptVersionId: row.promptVersionId,
      summary: row.summary,
      sourceWarnings: JSON.parse(row.sourceWarningsJson) as string[],
      needsHumanReview: row.needsHumanReview,
      signals: row.signals.map((signal): SignalRecord => ({
        symbol: signal.symbol,
        side: signal.side as SignalRecord['side'],
        confidence: signal.confidence,
        rationale: signal.rationale,
        citations: JSON.parse(signal.citationsJson) as string[]
      })),
      createdAt: row.createdAt
    };
  }
}
