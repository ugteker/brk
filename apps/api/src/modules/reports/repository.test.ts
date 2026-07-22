import { describe, expect, it } from 'vitest';
import { ReportRepository } from './repository';

function createFakeDb(agentCharacterTypes: Record<string, string> = {}) {
  const rows: Array<{
    id: string;
    agentId: string;
    agentRunId: string;
    promptVersionId: string;
    summary: string;
    reportJson: string | null;
    sourceWarningsJson: string;
    needsHumanReview: boolean;
    createdAt: Date;
    model: string | null;
    promptVersionNumber: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    estimatedCostUsd: number | null;
    signals: Array<{ symbol: string; side: string; confidence: number; rationale: string; citationsJson: string }>;
  }> = [];
  let seq = 0;

  // Mirrors real Prisma: the `agent` relation is only attached when a query's own
  // `include` actually asks for it - independent per query, just like a real join,
  // so this can regression-test create()'s include specifically without masking it.
  function withAgent<T extends { agentId: string }>(row: T, include?: { agent?: unknown }): T & { agent?: { characterType: string } } {
    return { ...row, agent: include?.agent && agentCharacterTypes[row.agentId] ? { characterType: agentCharacterTypes[row.agentId] } : undefined };
  }

  const db: any = {
    agent: {
      findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id, ownerUserId: `owner-of-${where.id}` })
    },
    agentRunReport: {
      create: async ({
        data,
        include
      }: {
        data: {
          agentId: string;
          agentRunId: string;
          promptVersionId: string;
          summary: string;
          reportJson: string;
          sourceWarningsJson: string;
          needsHumanReview: boolean;
          model: string | null;
          promptVersionNumber: number | null;
          inputTokens: number | null;
          outputTokens: number | null;
          estimatedCostUsd: number | null;
          signals: { create: Array<{ symbol: string; side: string; confidence: number; rationale: string; citationsJson: string }> };
        };
        include?: { agent?: unknown };
      }) => {
        seq += 1;
        const row = {
          id: `report_${seq}`,
          agentId: data.agentId,
          agentRunId: data.agentRunId,
          promptVersionId: data.promptVersionId,
          summary: data.summary,
          reportJson: data.reportJson,
          sourceWarningsJson: data.sourceWarningsJson,
          needsHumanReview: data.needsHumanReview,
          createdAt: new Date('2026-07-10T00:00:00.000Z'),
          model: data.model,
          promptVersionNumber: data.promptVersionNumber,
          inputTokens: data.inputTokens,
          outputTokens: data.outputTokens,
          estimatedCostUsd: data.estimatedCostUsd,
          signals: data.signals.create
        };
        rows.push(row);
        return withAgent(row, include);
      },
      findFirst: async ({
        where,
        include
      }: {
        where: { agentId?: string; id?: string };
        include?: { agent?: unknown };
      }) => {
        if (where.id) {
          const found = rows.find((r) => r.id === where.id);
          return found ? withAgent(found, include) : null;
        }
        const matches = rows.filter((r) => r.agentId === where.agentId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return matches[0] ? withAgent(matches[0], include) : null;
      },
      findMany: async ({
        where,
        orderBy,
        include
      }: {
        where: { agentId: string; signals?: { some: { symbol: string } } };
        orderBy?: { createdAt: 'asc' | 'desc' };
        include?: { agent?: unknown };
      }) => {
        let matches = rows.filter((r) => r.agentId === where.agentId);
        if (where.signals) {
          const symbol = where.signals.some.symbol;
          matches = matches.filter((r) => r.signals.some((s) => s.symbol === symbol));
        }
        const direction = orderBy?.createdAt === 'asc' ? 1 : -1;
        return matches
          .sort((a, b) => direction * (a.createdAt.getTime() - b.createdAt.getTime()))
          .map((r) => withAgent(r, include));
      }
    }
  };
  db.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(db);
  return db;
}

describe('ReportRepository', () => {
  it('stores a run report with signals and citations', async () => {
    const repo = new ReportRepository(createFakeDb() as never);

    const saved = await repo.saveRunReport({
      agentId: 'agent-1',
      agentRunId: 'run-1',
      promptVersionId: 'prompt-1',
      summary: 'Bullish on AAPL',
      needsHumanReview: false,
      sourceWarnings: ['one podcast transcript was missing'],
      signals: [
        {
          symbol: 'AAPL',
          side: 'long',
          confidence: 82,
          rationale: 'Strong product cycle',
          citations: ['podcast-ep-12@12:44']
        }
      ]
    });

    expect(saved.signals[0]?.symbol).toBe('AAPL');
    expect(saved.sourceWarnings[0]).toBe('one podcast transcript was missing');
    expect(saved.report.section.character_type).toBe('finance_expert');
  });

  it('returns the latest run report for a agent', async () => {
    const repo = new ReportRepository(createFakeDb() as never);

    await repo.saveRunReport({
      agentId: 'agent-1',
      agentRunId: 'run-1',
      promptVersionId: 'prompt-1',
      summary: 'first',
      needsHumanReview: false,
      sourceWarnings: [],
      signals: []
    });

    const latest = await repo.getLatestRunReport('agent-1');
    expect(latest?.summary).toBe('first');
  });

  it('returns null when a agent has no reports yet', async () => {
    const repo = new ReportRepository(createFakeDb() as never);
    expect(await repo.getLatestRunReport('agent-unknown')).toBeNull();
  });

  it('lists all reports for a agent ordered most-recent first', async () => {
    const repo = new ReportRepository(createFakeDb() as never);

    await repo.saveRunReport({
      agentId: 'agent-1',
      agentRunId: 'run-1',
      promptVersionId: 'prompt-1',
      summary: 'first report',
      needsHumanReview: false,
      sourceWarnings: [],
      signals: []
    });
    await repo.saveRunReport({
      agentId: 'agent-1',
      agentRunId: 'run-2',
      promptVersionId: 'prompt-1',
      summary: 'second report',
      needsHumanReview: false,
      sourceWarnings: [],
      signals: []
    });
    await repo.saveRunReport({
      agentId: 'agent-2',
      agentRunId: 'run-3',
      promptVersionId: 'prompt-2',
      summary: 'other agent report',
      needsHumanReview: false,
      sourceWarnings: [],
      signals: []
    });

    const reports = await repo.listReportsForAgent('agent-1');
    expect(reports).toHaveLength(2);
    expect(reports.every((r) => r.agentId === 'agent-1')).toBe(true);
  });

  it('gets a report by its own id', async () => {
    const repo = new ReportRepository(createFakeDb() as never);

    const saved = await repo.saveRunReport({
      agentId: 'agent-1',
      agentRunId: 'run-1',
      promptVersionId: 'prompt-1',
      summary: 'findable report',
      needsHumanReview: false,
      sourceWarnings: [],
      signals: []
    });

    const found = await repo.getReportById(saved.id);
    expect(found?.summary).toBe('findable report');
  });

  it('returns null when getReportById is given an unknown id', async () => {
    const repo = new ReportRepository(createFakeDb() as never);
    expect(await repo.getReportById('report-unknown')).toBeNull();
  });

  it('filters source-scoped reports by run artifacts that reference the source value', async () => {
    // The nested relation filter is what makes this query source-scoped; a fake in-memory
    // join would only re-test the fake, so this asserts the exact Prisma filter shape.
    let captured: { where?: unknown } | undefined;
    const db = {
      agentRunReport: {
        findMany: async (args: { where?: unknown }) => {
          captured = args;
          return [];
        }
      }
    };
    const repo = new ReportRepository(db as never);

    const result = await repo.listReportsForSource('https://example.com/feed.xml');

    expect(result).toEqual([]);
    expect(captured?.where).toEqual({
      agentRun: {
        artifacts: { some: { payloadJson: { contains: '"sourceId":"https://example.com/feed.xml"' } } }
      }
    });
  });

  it('persists AI usage/cost stats when provided', async () => {
    const repo = new ReportRepository(createFakeDb() as never);

    const saved = await repo.saveRunReport({
      agentId: 'agent-1',
      agentRunId: 'run-1',
      promptVersionId: 'prompt-1',
      summary: 'with stats',
      needsHumanReview: false,
      sourceWarnings: [],
      signals: [],
      model: 'claude-sonnet-4-5',
      promptVersionNumber: 3,
      inputTokens: 1200,
      outputTokens: 340,
      estimatedCostUsd: 0.00846
    });

    expect(saved.model).toBe('claude-sonnet-4-5');
    expect(saved.promptVersionNumber).toBe(3);
    expect(saved.inputTokens).toBe(1200);
    expect(saved.outputTokens).toBe(340);
    expect(saved.estimatedCostUsd).toBeCloseTo(0.00846);
  });

  it('defaults AI usage/cost stats to null when omitted (legacy-style report)', async () => {
    const repo = new ReportRepository(createFakeDb() as never);

    const saved = await repo.saveRunReport({
      agentId: 'agent-1',
      agentRunId: 'run-1',
      promptVersionId: 'prompt-1',
      summary: 'no stats',
      needsHumanReview: false,
      sourceWarnings: [],
      signals: []
    });

    expect(saved.model).toBeNull();
    expect(saved.promptVersionNumber).toBeNull();
    expect(saved.inputTokens).toBeNull();
    expect(saved.outputTokens).toBeNull();
    expect(saved.estimatedCostUsd).toBeNull();
  });

  it('lists signal history for a symbol across multiple reports for the same agent', async () => {
    const repo = new ReportRepository(createFakeDb() as never);

    await repo.saveRunReport({
      agentId: 'agent-1',
      agentRunId: 'run-1',
      promptVersionId: 'prompt-1',
      summary: 'first AAPL call',
      needsHumanReview: false,
      sourceWarnings: [],
      signals: [{ symbol: 'AAPL', side: 'long', confidence: 70, rationale: 'r1', citations: [] }]
    });
    await repo.saveRunReport({
      agentId: 'agent-1',
      agentRunId: 'run-2',
      promptVersionId: 'prompt-1',
      summary: 'no AAPL here',
      needsHumanReview: false,
      sourceWarnings: [],
      signals: [{ symbol: 'TSLA', side: 'short', confidence: 60, rationale: 'r2', citations: [] }]
    });
    await repo.saveRunReport({
      agentId: 'agent-1',
      agentRunId: 'run-3',
      promptVersionId: 'prompt-1',
      summary: 'second AAPL call',
      needsHumanReview: false,
      sourceWarnings: [],
      signals: [{ symbol: 'AAPL', side: 'short', confidence: 55, rationale: 'r3', citations: [] }]
    });

    const history = await repo.listSignalHistoryForSymbol('agent-1', 'AAPL');
    expect(history).toHaveLength(2);
    expect(history.map((r) => r.summary)).toEqual(['first AAPL call', 'second AAPL call']);
    expect(history.every((r) => r.signals.some((s) => s.symbol === 'AAPL'))).toBe(true);
  });

  it('returns an empty array when no reports have the requested symbol', async () => {
    const repo = new ReportRepository(createFakeDb() as never);

    await repo.saveRunReport({
      agentId: 'agent-1',
      agentRunId: 'run-1',
      promptVersionId: 'prompt-1',
      summary: 'no match report',
      needsHumanReview: false,
      sourceWarnings: [],
      signals: [{ symbol: 'MSFT', side: 'long', confidence: 40, rationale: 'r', citations: [] }]
    });

    expect(await repo.listSignalHistoryForSymbol('agent-1', 'AAPL')).toEqual([]);
  });

  it('does not include another agent\'s reports in the symbol history', async () => {
    const repo = new ReportRepository(createFakeDb() as never);

    await repo.saveRunReport({
      agentId: 'agent-2',
      agentRunId: 'run-1',
      promptVersionId: 'prompt-1',
      summary: 'other agent AAPL call',
      needsHumanReview: false,
      sourceWarnings: [],
      signals: [{ symbol: 'AAPL', side: 'long', confidence: 40, rationale: 'r', citations: [] }]
    });

    expect(await repo.listSignalHistoryForSymbol('agent-1', 'AAPL')).toEqual([]);
  });

  it('normalizes a legacy-style report into v2 shape', async () => {
    const repo = new ReportRepository(createFakeDb() as never);

    const saved = await repo.saveRunReport({
      agentId: 'agent-1',
      agentRunId: 'run-legacy',
      promptVersionId: 'prompt-1',
      summary: 'legacy summary',
      needsHumanReview: false,
      sourceWarnings: [],
      signals: [{ symbol: 'AAPL', side: 'long', confidence: 70, rationale: 'legacy', citations: ['c1'] }]
    });

    expect(saved.report.common.summary).toBe('legacy summary');
    expect(saved.report.section.character_type).toBe('finance_expert');
  });

  it('rejects non-finance report payloads that include signals', async () => {
    const repo = new ReportRepository(createFakeDb() as never);

    await expect(() =>
      repo.saveRunReport({
        agentId: 'agent-1',
        agentRunId: 'run-2',
        promptVersionId: 'prompt-1',
        characterType: 'teacher',
        summary: 'teacher summary',
        needsHumanReview: false,
        sourceWarnings: [],
        signals: [],
        report: {
          common: { summary: 'teacher summary', key_takeaways: [], sources_used: [], citations: [] },
          section: { character_type: 'teacher', lesson_explanation: 'lesson', signals: [{ symbol: 'AAPL' }] } as never
        }
      })
    ).rejects.toThrow('signals are only allowed for finance_expert');
  });

  it('saves and re-reads a non-finance_expert report without throwing (regression: create() must include the agent relation)', async () => {
    // Bug: saveRunReport's agentRunReport.create() call omitted `include: { agent: ... } }`,
    // so toRecord()'s characterType detection always fell back to 'finance_expert' - which then
    // mismatched the already-correctly-normalized reportJson for any non-finance_expert agent and
    // threw ReportShapeValidationError, even though the row had already been durably saved.
    const repo = new ReportRepository(createFakeDb({ 'agent-1': 'teacher' }) as never);

    const saved = await repo.saveRunReport({
      agentId: 'agent-1',
      agentRunId: 'run-teacher-1',
      promptVersionId: 'prompt-1',
      characterType: 'teacher',
      summary: 'teacher summary',
      needsHumanReview: false,
      sourceWarnings: [],
      signals: [],
      report: {
        common: { summary: 'teacher summary', key_takeaways: [], sources_used: [], citations: [] },
        section: { character_type: 'teacher', lesson_explanation: 'lesson content' }
      }
    });

    expect(saved.report.section.character_type).toBe('teacher');

    const reRead = await repo.getReportById(saved.id);
    expect(reRead?.report.section.character_type).toBe('teacher');
  });
});

describe('ReportRepository realtime event production', () => {
  function createMockRealtime() {
    const events: Array<{ userId: string; topic: string; entityId?: string }> = [];
    return {
      events,
      append: async (_tx: unknown, event: { userId: string; topic: string; entityId?: string }) => {
        events.push(event);
      }
    };
  }

  it('emits report.changed for the report agent owner in the same transaction as the create', async () => {
    const db = createFakeDb();
    const realtime = createMockRealtime();
    const repo = new ReportRepository(db as never, realtime);

    const saved = await repo.saveRunReport({
      agentId: 'agent-1',
      agentRunId: 'run-1',
      promptVersionId: 'prompt-1',
      summary: 'Bullish on AAPL',
      needsHumanReview: false,
      sourceWarnings: [],
      signals: []
    });

    expect(realtime.events).toContainEqual(
      expect.objectContaining({ userId: 'owner-of-agent-1', topic: 'report.changed', entityId: saved.id })
    );
  });

  it('does not emit report.changed when the domain write fails', async () => {
    const db = createFakeDb();
    db.agentRunReport.create = async () => {
      throw new Error('db_error');
    };
    const realtime = createMockRealtime();
    const repo = new ReportRepository(db as never, realtime);

    await expect(
      repo.saveRunReport({
        agentId: 'agent-1',
        agentRunId: 'run-1',
        promptVersionId: 'prompt-1',
        summary: 'will fail',
        needsHumanReview: false,
        sourceWarnings: [],
        signals: []
      })
    ).rejects.toThrow('db_error');

    expect(realtime.events).toHaveLength(0);
  });

  it('throws invariant_violation instead of silently skipping the event when the owning agent is missing', async () => {
    const db = createFakeDb();
    db.agent = { findUnique: async () => null };
    const realtime = createMockRealtime();
    const repo = new ReportRepository(db as never, realtime);

    await expect(
      repo.saveRunReport({
        agentId: 'agent-missing',
        agentRunId: 'run-1',
        promptVersionId: 'prompt-1',
        summary: 'orphaned report',
        needsHumanReview: false,
        sourceWarnings: [],
        signals: []
      })
    ).rejects.toThrow(/invariant_violation: report report_1 references missing agent agent-missing/);

    expect(realtime.events).toHaveLength(0);
  });
});
