import type { PrismaClient } from '@prisma/client';
import type { CreateRunReportInput, RunReportRecord, SignalRecord } from './types';
import { normalizeUnifiedCharacterReport } from './unified-report';
import { DEFAULT_CHARACTER_TYPE } from '../agents/types';
import type { RealtimeEventWriter } from '../realtime/types';

type ReportDb = Pick<PrismaClient, 'agentRunReport' | 'agent' | '$transaction'>;

/** Used when a caller doesn't wire a real RealtimeEventWriter (e.g. legacy tests); keeps
 * mutation behavior identical while emitting no realtime events. */
const noopRealtimeEventWriter: RealtimeEventWriter = { append: async () => {} };

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
  agentRun?: { playbookId: string | null };
  model: string | null;
  promptVersionNumber: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
};

export class ReportRepository {
  constructor(
    private readonly db: ReportDb,
    private readonly realtime: RealtimeEventWriter = noopRealtimeEventWriter
  ) {}

  async saveRunReport(input: CreateRunReportInput): Promise<RunReportRecord> {
    const characterType =
      input.characterType ?? (input.signals && input.signals.length > 0 ? ('finance_expert' as const) : DEFAULT_CHARACTER_TYPE);
    const normalizedReport = normalizeUnifiedCharacterReport({
      characterType,
      candidate: input.report,
      legacySummary: input.summary,
      legacySignals: input.signals
    });
    const normalizedSignals = normalizedReport.section.character_type === 'finance_expert' ? normalizedReport.section.signals : [];

    const created = await this.db.$transaction(async (tx) => {
      const created = await tx.agentRunReport.create({
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
        // agent must be included here - toRecord() below derives characterType from
        // row.agent?.characterType, and without it this always fell back to 'finance_expert'
        // and threw a ReportShapeValidationError for any non-finance_expert agent, even though
        // the row above had already been durably saved.
        include: { signals: true, agent: { select: { characterType: true } }, agentRun: { select: { playbookId: true } } }
      });

      const agent = await tx.agent.findUnique({ where: { id: input.agentId }, select: { ownerUserId: true } });
      if (agent) {
        await this.realtime.append(tx, { userId: agent.ownerUserId, topic: 'report.changed', entityId: created.id });
      }

      return created;
    });

    return this.toRecord(created as unknown as ReportRow);
  }

  async getLatestRunReport(agentId: string): Promise<RunReportRecord | null> {
    const latest = await this.db.agentRunReport.findFirst({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
      include: { signals: true, agent: { select: { characterType: true } }, agentRun: { select: { playbookId: true } } }
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
      include: { signals: true, agent: { select: { characterType: true } }, agentRun: { select: { playbookId: true } } }
    });

    return found ? this.toRecord(found as unknown as ReportRow) : null;
  }

  async listReportsForAgent(agentId: string): Promise<RunReportRecord[]> {
    const rows = await this.db.agentRunReport.findMany({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
      include: { signals: true, agent: { select: { characterType: true } }, agentRun: { select: { playbookId: true } } }
    });

    return rows.map((row: unknown) => this.toRecord(row as ReportRow));
  }

  /**
   * Lists reports whose generating run actually crawled the given source, across all agents.
   * Attribution goes through the run's saved evidence artifacts: every adapter serializes its
   * EvidenceBlock (which carries `sourceId = source.value`) into `payloadJson`, so a substring
   * match on that JSON key/value pair scopes reports to the concrete source - unlike the
   * agent-scoped listing, which would surface an agent's unrelated reports on every source
   * its playbook merely links to.
   */
  async listReportsForSource(sourceValue: string): Promise<RunReportRecord[]> {
    const rows = await this.db.agentRunReport.findMany({
      where: {
        agentRun: {
          artifacts: { some: { payloadJson: { contains: `"sourceId":${JSON.stringify(sourceValue)}` } } }
        }
      },
      orderBy: { createdAt: 'desc' },
      include: { signals: true, agent: { select: { characterType: true } }, agentRun: { select: { playbookId: true } } }
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
          : signals.length > 0
            ? 'finance_expert'
            : DEFAULT_CHARACTER_TYPE,
      candidate: row.reportJson ? (JSON.parse(row.reportJson) as unknown) : undefined,
      legacySummary: row.summary,
      legacySignals: signals
    });

    return {
      id: row.id,
      agentId: row.agentId,
      agentRunId: row.agentRunId,
      playbookId: row.agentRun?.playbookId ?? null,
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
