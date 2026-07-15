import type { PrismaClient } from '@prisma/client';
import type { CreateRunReportInput, RunReportRecord, SignalRecord } from './types';
import { normalizeUnifiedCharacterReport } from './unified-report';

type ReportDb = Pick<PrismaClient, 'agentRunReport'>;

type SignalRow = { symbol: string; side: string; confidence: number; rationale: string; citationsJson: string };

type ReportRow = {
  id: string;
  agentId: string;
  agentRunId: string;
  promptVersionId: string;
  summary: string;
  reportJson: string | null;
  sourceWarningsJson: string;
  needsHumanReview: boolean;
  createdAt: Date;
  signals: SignalRow[];
  agent?: { characterType: string };
  model: string | null;
  promptVersionNumber: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
};

export class ReportRepository {
  constructor(private readonly db: ReportDb) {}

  async saveRunReport(input: CreateRunReportInput): Promise<RunReportRecord> {
    const characterType = input.characterType ?? 'finance_expert';
    const normalizedReport = normalizeUnifiedCharacterReport({
      characterType,
      candidate: input.report,
      legacySummary: input.summary,
      legacySignals: input.signals
    });
    const normalizedSignals = normalizedReport.section.character_type === 'finance_expert' ? normalizedReport.section.signals : [];

    const created = await this.db.agentRunReport.create({
      data: {
        agentId: input.agentId,
        agentRunId: input.agentRunId,
        promptVersionId: input.promptVersionId,
        summary: input.summary,
        reportJson: JSON.stringify(normalizedReport),
        needsHumanReview: input.needsHumanReview,
        sourceWarningsJson: JSON.stringify(input.sourceWarnings),
        model: input.model ?? null,
        promptVersionNumber: input.promptVersionNumber ?? null,
        inputTokens: input.inputTokens ?? null,
        outputTokens: input.outputTokens ?? null,
        estimatedCostUsd: input.estimatedCostUsd ?? null,
        signals: {
          create: normalizedSignals.map((signal) => ({
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
      include: { signals: true, agent: { select: { characterType: true } } }
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
      include: { signals: true, agent: { select: { characterType: true } } }
    });

    return found ? this.toRecord(found as unknown as ReportRow) : null;
  }

  async listReportsForAgent(agentId: string): Promise<RunReportRecord[]> {
    const rows = await this.db.agentRunReport.findMany({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
      include: { signals: true, agent: { select: { characterType: true } } }
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
      include: { signals: true, agent: { select: { characterType: true } } }
    });

    return rows.map((row: unknown) => this.toRecord(row as ReportRow));
  }

  private toRecord(row: ReportRow): RunReportRecord {
    const signals = row.signals.map((signal): SignalRecord => ({
      symbol: signal.symbol,
      side: signal.side as SignalRecord['side'],
      confidence: signal.confidence,
      rationale: signal.rationale,
      citations: JSON.parse(signal.citationsJson) as string[]
    }));
    const report = normalizeUnifiedCharacterReport({
      characterType:
        row.agent?.characterType === 'finance_expert' ||
        row.agent?.characterType === 'teacher' ||
        row.agent?.characterType === 'trainer' ||
        row.agent?.characterType === 'philosopher' ||
        row.agent?.characterType === 'influencer' ||
        row.agent?.characterType === 'summarizer'
          ? row.agent.characterType
          : 'finance_expert',
      candidate: row.reportJson ? (JSON.parse(row.reportJson) as unknown) : undefined,
      legacySummary: row.summary,
      legacySignals: signals
    });

    return {
      id: row.id,
      agentId: row.agentId,
      agentRunId: row.agentRunId,
      promptVersionId: row.promptVersionId,
      summary: row.summary,
      sourceWarnings: JSON.parse(row.sourceWarningsJson) as string[],
      needsHumanReview: row.needsHumanReview,
      signals,
      report,
      createdAt: row.createdAt,
      model: row.model,
      promptVersionNumber: row.promptVersionNumber,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      estimatedCostUsd: row.estimatedCostUsd
    };
  }
}
