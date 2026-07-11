import { describe, expect, it } from 'vitest';
import { ReportRepository } from './repository';

function createFakeDb() {
  const rows: Array<{
    id: string;
    agentId: string;
    agentRunId: string;
    promptVersionId: string;
    summary: string;
    sourceWarningsJson: string;
    needsHumanReview: boolean;
    createdAt: Date;
    signals: Array<{ symbol: string; side: string; confidence: number; rationale: string; citationsJson: string }>;
  }> = [];
  let seq = 0;

  return {
    agentRunReport: {
      create: async ({
        data
      }: {
        data: {
          agentId: string;
          agentRunId: string;
          promptVersionId: string;
          summary: string;
          sourceWarningsJson: string;
          needsHumanReview: boolean;
          signals: { create: Array<{ symbol: string; side: string; confidence: number; rationale: string; citationsJson: string }> };
        };
      }) => {
        seq += 1;
        const row = {
          id: `report_${seq}`,
          agentId: data.agentId,
          agentRunId: data.agentRunId,
          promptVersionId: data.promptVersionId,
          summary: data.summary,
          sourceWarningsJson: data.sourceWarningsJson,
          needsHumanReview: data.needsHumanReview,
          createdAt: new Date('2026-07-10T00:00:00.000Z'),
          signals: data.signals.create
        };
        rows.push(row);
        return row;
      },
      findFirst: async ({ where }: { where: { agentId: string } }) => {
        const matches = rows.filter((r) => r.agentId === where.agentId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return matches[0] ?? null;
      },
      findMany: async ({ where }: { where: { agentId: string } }) =>
        rows.filter((r) => r.agentId === where.agentId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    }
  };
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
});
