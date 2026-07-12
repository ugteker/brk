import { describe, expect, it } from 'vitest';
import { RunsRepository } from './repository';

interface FakeArtifactRow {
  id: string;
  agentId: string;
  agentRunId: string;
  sourceRef: string;
  payloadJson: string;
  fidelity: string;
}

interface FakeReportRow {
  id: string;
  agentRunId: string;
  summary: string;
  needsHumanReview: boolean;
  signals: unknown[];
}

interface FakeRunRow {
  id: string;
  agentId: string;
  status: string;
  scheduledFor: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  retryCount: number;
}

function createFakeDb(runs: FakeRunRow[], artifacts: FakeArtifactRow[], reports: FakeReportRow[]) {
  return {
    agentRun: {
      findMany: async ({ where, orderBy, take }: { where: { agentId: string }; orderBy: { scheduledFor: 'desc' }; take: number }) => {
        const matches = runs
          .filter((r) => r.agentId === where.agentId)
          .sort((a, b) => b.scheduledFor.getTime() - a.scheduledFor.getTime())
          .slice(0, take);
        return matches.map((run) => ({
          ...run,
          artifacts: artifacts.filter((a) => a.agentRunId === run.id),
          report: reports.find((r) => r.agentRunId === run.id) ?? null
        }));
      },
      findFirst: async ({ where }: { where: { id: string; agentId: string } }) => {
        const run = runs.find((r) => r.id === where.id && r.agentId === where.agentId);
        if (!run) return null;
        return { ...run, artifacts: artifacts.filter((a) => a.agentRunId === run.id) };
      }
    }
  };
}

describe('RunsRepository', () => {
  it('lists run details for an agent, most recent first, with duration and report/artifact summaries', async () => {
    const runs: FakeRunRow[] = [
      {
        id: 'run-1',
        agentId: 'agent-1',
        status: 'succeeded',
        scheduledFor: new Date('2026-07-10T09:00:00.000Z'),
        startedAt: new Date('2026-07-10T09:00:00.000Z'),
        finishedAt: new Date('2026-07-10T09:00:05.000Z'),
        errorCode: null,
        errorMessage: null,
        retryCount: 0
      },
      {
        id: 'run-2',
        agentId: 'agent-1',
        status: 'succeeded',
        scheduledFor: new Date('2026-07-10T10:00:00.000Z'),
        startedAt: new Date('2026-07-10T10:00:00.000Z'),
        finishedAt: new Date('2026-07-10T10:00:03.000Z'),
        errorCode: null,
        errorMessage: null,
        retryCount: 0
      }
    ];
    const artifacts: FakeArtifactRow[] = [
      {
        id: 'artifact-1',
        agentId: 'agent-1',
        agentRunId: 'run-2',
        sourceRef: 'https://example.com/blog',
        payloadJson: JSON.stringify({ content: 'x'.repeat(400) }),
        fidelity: 'high'
      }
    ];
    const reports: FakeReportRow[] = [
      {
        id: 'report-1',
        agentRunId: 'run-2',
        summary: 'Bullish on AAPL',
        needsHumanReview: false,
        signals: [{ symbol: 'AAPL' }]
      }
    ];

    const repo = new RunsRepository(createFakeDb(runs, artifacts, reports) as never);
    const result = await repo.listRunDetailsForAgent('agent-1');

    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe('run-2');
    expect(result[0]?.durationMs).toBe(3000);
    expect(result[0]?.report).toMatchObject({ id: 'report-1', summary: 'Bullish on AAPL', signalCount: 1 });
    expect(result[0]?.artifacts[0]?.contentLength).toBe(400);
    expect(result[0]?.artifacts[0]?.contentPreview).toHaveLength(300);
    expect(result[1]?.id).toBe('run-1');
    expect(result[1]?.report).toBeNull();
    expect(result[1]?.artifacts).toEqual([]);
  });

  it('returns null durationMs when a run has not finished', async () => {
    const runs: FakeRunRow[] = [
      {
        id: 'run-1',
        agentId: 'agent-1',
        status: 'running',
        scheduledFor: new Date('2026-07-10T09:00:00.000Z'),
        startedAt: new Date('2026-07-10T09:00:00.000Z'),
        finishedAt: null,
        errorCode: null,
        errorMessage: null,
        retryCount: 0
      }
    ];
    const repo = new RunsRepository(createFakeDb(runs, [], []) as never);
    const result = await repo.listRunDetailsForAgent('agent-1');
    expect(result[0]?.durationMs).toBeNull();
  });

  it('gets the full content of a single artifact scoped to its agent and run', async () => {
    const runs: FakeRunRow[] = [
      {
        id: 'run-1',
        agentId: 'agent-1',
        status: 'succeeded',
        scheduledFor: new Date('2026-07-10T09:00:00.000Z'),
        startedAt: new Date('2026-07-10T09:00:00.000Z'),
        finishedAt: new Date('2026-07-10T09:00:05.000Z'),
        errorCode: null,
        errorMessage: null,
        retryCount: 0
      }
    ];
    const artifacts: FakeArtifactRow[] = [
      {
        id: 'artifact-1',
        agentId: 'agent-1',
        agentRunId: 'run-1',
        sourceRef: 'https://example.com/blog',
        payloadJson: JSON.stringify({ content: 'full evidence text' }),
        fidelity: 'high'
      }
    ];

    const repo = new RunsRepository(createFakeDb(runs, artifacts, []) as never);
    const content = await repo.getArtifactContent('agent-1', 'run-1', 'artifact-1');
    expect(content).toEqual({ sourceRef: 'https://example.com/blog', content: 'full evidence text' });
  });

  it('returns null when the artifact does not belong to the given agent/run', async () => {
    const runs: FakeRunRow[] = [
      {
        id: 'run-1',
        agentId: 'agent-1',
        status: 'succeeded',
        scheduledFor: new Date('2026-07-10T09:00:00.000Z'),
        startedAt: null,
        finishedAt: null,
        errorCode: null,
        errorMessage: null,
        retryCount: 0
      }
    ];
    const repo = new RunsRepository(createFakeDb(runs, [], []) as never);
    expect(await repo.getArtifactContent('agent-1', 'run-1', 'missing-artifact')).toBeNull();
    expect(await repo.getArtifactContent('other-agent', 'run-1', 'artifact-1')).toBeNull();
  });

  it('exposes the errorMessage for a failed run alongside its errorCode', async () => {
    const runs: FakeRunRow[] = [
      {
        id: 'run-1',
        agentId: 'agent-1',
        status: 'failed',
        scheduledFor: new Date('2026-07-10T09:00:00.000Z'),
        startedAt: new Date('2026-07-10T09:00:00.000Z'),
        finishedAt: new Date('2026-07-10T09:00:05.000Z'),
        errorCode: 'agent_run_failed',
        errorMessage: 'Claude API request timed out after 30000ms',
        retryCount: 1
      }
    ];
    const repo = new RunsRepository(createFakeDb(runs, [], []) as never);
    const result = await repo.listRunDetailsForAgent('agent-1');
    expect(result[0]?.errorCode).toBe('agent_run_failed');
    expect(result[0]?.errorMessage).toBe('Claude API request timed out after 30000ms');
  });

  it('gracefully handles malformed artifact payload JSON', async () => {
    const runs: FakeRunRow[] = [
      {
        id: 'run-1',
        agentId: 'agent-1',
        status: 'succeeded',
        scheduledFor: new Date('2026-07-10T09:00:00.000Z'),
        startedAt: new Date('2026-07-10T09:00:00.000Z'),
        finishedAt: new Date('2026-07-10T09:00:05.000Z'),
        errorCode: null,
        errorMessage: null,
        retryCount: 0
      }
    ];
    const artifacts: FakeArtifactRow[] = [
      {
        id: 'artifact-1',
        agentId: 'agent-1',
        agentRunId: 'run-1',
        sourceRef: 'https://example.com/blog',
        payloadJson: 'not valid json',
        fidelity: 'high'
      }
    ];
    const repo = new RunsRepository(createFakeDb(runs, artifacts, []) as never);
    const result = await repo.listRunDetailsForAgent('agent-1');
    expect(result[0]?.artifacts[0]?.contentPreview).toBe('');
    expect(result[0]?.artifacts[0]?.contentLength).toBe(0);
  });
});
