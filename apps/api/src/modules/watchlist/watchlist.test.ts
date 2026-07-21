import { describe, expect, it, vi } from 'vitest';
import { buildServer } from '../../server';
import { authCookieHeader, createTestAuthDeps } from '../../test-utils/auth';
import { InMemoryWatchlistRepository, normalizeWatchlistSymbol } from './repository';
import { WatchlistNotifier } from './notifier';
import type { RunReportRecord } from '../reports/types';

function makeReport(overrides: Partial<RunReportRecord> = {}): RunReportRecord {
  return {
    id: 'report-1',
    agentId: 'agent-1',
    agentRunId: 'run-1',
    promptVersionId: 'prompt-1',
    summary: 'Bullish on AAPL, bearish on TSLA.',
    sourceWarnings: [],
    needsHumanReview: false,
    signals: [
      { symbol: 'AAPL', side: 'long', confidence: 82, rationale: 'guidance', citations: [] },
      { symbol: 'TSLA', side: 'short', confidence: 64, rationale: 'margins', citations: [] }
    ],
    report: { common: { summary: '', key_takeaways: [], sources_used: [], citations: [] }, section: { character_type: 'summarizer', bullet_digest: [] } },
    createdAt: new Date(),
    model: null,
    promptVersionNumber: null,
    inputTokens: null,
    outputTokens: null,
    estimatedCostUsd: null,
    ...overrides
  };
}

describe('normalizeWatchlistSymbol', () => {
  it('trims and uppercases', () => {
    expect(normalizeWatchlistSymbol('  aapl ')).toBe('AAPL');
    expect(normalizeWatchlistSymbol('nasdaq:tsla')).toBe('NASDAQ:TSLA');
  });
});

describe('watchlist routes', () => {
  async function buildApp(repository: InMemoryWatchlistRepository) {
    return buildServer({
      agentRepository: {
        createAgent: async () => { throw new Error('unused'); },
        updateAgent: async () => { throw new Error('unused'); },
        disableAgent: async () => {},
        enableAgent: async () => {},
        deleteAgent: async () => {},
        listAgents: async () => [],
        getAgent: async () => null,
        listRecentRuns: async () => [],
        shareAgent: async () => {},
        listAgentShares: async () => [],
        revokeAgentShare: async () => {}
      } as any,
      agents: {
        promptRepository: { savePromptVersion: async () => { throw new Error('unused'); }, getLatestPromptVersion: async () => null },
        reportRepository: {
          getLatestRunReport: async () => null,
          listReportsForAgent: async () => [],
          getReportById: async () => null,
          listSignalHistoryForSymbol: async () => []
        }
      } as any,
      auth: createTestAuthDeps(),
      watchlist: { watchlistRepository: repository }
    });
  }

  it('adds, lists, and removes watchlist entries for the signed-in user', async () => {
    const repository = new InMemoryWatchlistRepository();
    const app = await buildApp(repository);

    const addRes = await app.inject({
      method: 'POST',
      url: '/api/watchlist',
      headers: { ...authCookieHeader(), 'content-type': 'application/json' },
      payload: { symbol: ' aapl ' }
    });
    expect(addRes.statusCode).toBe(201);
    expect(addRes.json()).toMatchObject({ symbol: 'AAPL' });

    // Adding the same symbol twice is idempotent, not an error.
    const dupRes = await app.inject({
      method: 'POST',
      url: '/api/watchlist',
      headers: { ...authCookieHeader(), 'content-type': 'application/json' },
      payload: { symbol: 'AAPL' }
    });
    expect(dupRes.statusCode).toBe(201);

    const listRes = await app.inject({ method: 'GET', url: '/api/watchlist', headers: authCookieHeader() });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json()).toHaveLength(1);

    const delRes = await app.inject({ method: 'DELETE', url: '/api/watchlist/AAPL', headers: authCookieHeader() });
    expect(delRes.statusCode).toBe(204);
    expect(repository.entries).toHaveLength(0);
  });

  it('rejects invalid symbols', async () => {
    const app = await buildApp(new InMemoryWatchlistRepository());
    const res = await app.inject({
      method: 'POST',
      url: '/api/watchlist',
      headers: { ...authCookieHeader(), 'content-type': 'application/json' },
      payload: { symbol: 'not a symbol!!' }
    });
    expect(res.statusCode).toBe(400);
  });

  it('requires authentication', async () => {
    const app = await buildApp(new InMemoryWatchlistRepository());
    const res = await app.inject({ method: 'GET', url: '/api/watchlist' });
    expect(res.statusCode).toBe(401);
  });
});

describe('WatchlistNotifier', () => {
  function createNotifier(input: {
    entries: Array<{ userId: string; symbol: string }>;
    users: Record<string, { id: string; email: string }>;
  }) {
    const repository = new InMemoryWatchlistRepository();
    for (const entry of input.entries) {
      void repository.add(entry.userId, entry.symbol);
    }
    const send = vi.fn(async () => {});
    const notifier = new WatchlistNotifier({
      watchlistRepository: repository,
      userRepository: { findById: async (id) => input.users[id] ?? null },
      mailer: { send }
    });
    return { notifier, send };
  }

  it('emails each watcher only their own watched symbols', async () => {
    const { notifier, send } = createNotifier({
      entries: [
        { userId: 'u1', symbol: 'AAPL' },
        { userId: 'u2', symbol: 'TSLA' },
        { userId: 'u2', symbol: 'MSFT' }
      ],
      users: { u1: { id: 'u1', email: 'one@example.com' }, u2: { id: 'u2', email: 'two@example.com' } }
    });

    await notifier.notifyForReport({ agentId: 'agent-1', agentName: 'Analyst', report: makeReport() });

    expect(send).toHaveBeenCalledTimes(2);
    const byRecipient = new Map(send.mock.calls.map((call: any[]) => [call[0].to, call[0]]));
    expect(byRecipient.get('one@example.com').subject).toContain('AAPL');
    expect(byRecipient.get('one@example.com').subject).not.toContain('TSLA');
    expect(byRecipient.get('two@example.com').subject).toContain('TSLA');
    expect(byRecipient.get('two@example.com').html).toContain('margins');
  });

  it('matches symbols case-insensitively', async () => {
    const { notifier, send } = createNotifier({
      entries: [{ userId: 'u1', symbol: 'aapl' }],
      users: { u1: { id: 'u1', email: 'one@example.com' } }
    });

    await notifier.notifyForReport({ agentId: 'agent-1', agentName: 'Analyst', report: makeReport() });

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('sends nothing when no watcher matches', async () => {
    const { notifier, send } = createNotifier({
      entries: [{ userId: 'u1', symbol: 'NVDA' }],
      users: { u1: { id: 'u1', email: 'one@example.com' } }
    });

    await notifier.notifyForReport({ agentId: 'agent-1', agentName: 'Analyst', report: makeReport() });

    expect(send).not.toHaveBeenCalled();
  });

  it('never throws even when the mailer fails', async () => {
    const { notifier, send } = createNotifier({
      entries: [{ userId: 'u1', symbol: 'AAPL' }],
      users: { u1: { id: 'u1', email: 'one@example.com' } }
    });
    send.mockRejectedValue(new Error('smtp down'));

    await expect(
      notifier.notifyForReport({ agentId: 'agent-1', agentName: 'Analyst', report: makeReport() })
    ).resolves.toBeUndefined();
  });

  it('writes German copy when language is de', async () => {
    const { notifier, send } = createNotifier({
      entries: [{ userId: 'u1', symbol: 'AAPL' }],
      users: { u1: { id: 'u1', email: 'one@example.com' } }
    });

    await notifier.notifyForReport({ agentId: 'agent-1', agentName: 'Analyst', report: makeReport(), language: 'de' });

    const call = send.mock.calls[0][0] as any;
    expect(call.subject).toContain('Watchlist-Alarm');
    expect(call.text).toContain('Watchlist');
  });
});
