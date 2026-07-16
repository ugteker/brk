import { describe, expect, it } from 'vitest';
import { buildServer } from '../../server';
import { authCookieHeader, createTestAuthDeps } from '../../test-utils/auth';
import { currentMonthStart, InMemoryUsageStore, UsageService } from './budget';

const TEST_USER_ID = 'test-user';

function makeStoreWithReports(input: {
  userId: string;
  reports: Array<{ costUsd: number; createdAt?: Date; inputTokens?: number; outputTokens?: number }>;
  budgetUsd?: number | null;
}) {
  const store = new InMemoryUsageStore();
  if (input.budgetUsd !== undefined) store.budgets.set(input.userId, input.budgetUsd);
  for (const report of input.reports) {
    store.reports.push({
      ownerUserId: input.userId,
      createdAt: report.createdAt ?? new Date(),
      estimatedCostUsd: report.costUsd,
      inputTokens: report.inputTokens ?? 1000,
      outputTokens: report.outputTokens ?? 500
    });
  }
  return store;
}

describe('currentMonthStart', () => {
  it('returns the first UTC instant of the month', () => {
    const start = currentMonthStart(new Date('2026-07-15T13:45:00Z'));
    expect(start.toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });
});

describe('UsageService', () => {
  it('summarizes only this month usage', async () => {
    const store = makeStoreWithReports({
      userId: 'u1',
      reports: [
        { costUsd: 0.5 },
        { costUsd: 0.25 },
        { costUsd: 99, createdAt: new Date('2020-01-01T00:00:00Z') } // previous month - ignored
      ],
      budgetUsd: 10
    });
    const service = new UsageService(store);

    const summary = await service.getUsageSummary('u1');

    expect(summary.spentUsd).toBeCloseTo(0.75);
    expect(summary.reportCount).toBe(2);
    expect(summary.budgetUsd).toBe(10);
  });

  it('allows runs when no budget is configured', async () => {
    const store = makeStoreWithReports({ userId: 'u1', reports: [{ costUsd: 12345 }] });
    const service = new UsageService(store);

    const check = await service.checkRunAllowed('u1');

    expect(check.allowed).toBe(true);
    expect(check.budgetUsd).toBeNull();
  });

  it('allows runs below budget and blocks at/above budget', async () => {
    const store = makeStoreWithReports({ userId: 'u1', reports: [{ costUsd: 4 }], budgetUsd: 5 });
    const service = new UsageService(store);
    expect((await service.checkRunAllowed('u1')).allowed).toBe(true);

    store.reports.push({ ownerUserId: 'u1', createdAt: new Date(), estimatedCostUsd: 1, inputTokens: 0, outputTokens: 0 });
    const blocked = await service.checkRunAllowed('u1');
    expect(blocked.allowed).toBe(false);
    expect(blocked.spentUsd).toBeCloseTo(5);
    expect(blocked.budgetUsd).toBe(5);
  });
});

describe('usage routes', () => {
  async function buildApp(store: InMemoryUsageStore) {
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
      usage: { usageService: new UsageService(store) }
    });
  }

  it('returns the usage summary for the signed-in user', async () => {
    const store = makeStoreWithReports({ userId: TEST_USER_ID, reports: [{ costUsd: 1.5 }], budgetUsd: 20 });
    const app = await buildApp(store);

    const res = await app.inject({ method: 'GET', url: '/api/usage', headers: authCookieHeader() });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.spentUsd).toBeCloseTo(1.5);
    expect(body.budgetUsd).toBe(20);
  });

  it('updates and clears the budget', async () => {
    const store = makeStoreWithReports({ userId: TEST_USER_ID, reports: [] });
    const app = await buildApp(store);

    const setRes = await app.inject({
      method: 'PATCH',
      url: '/api/usage/budget',
      headers: { ...authCookieHeader(), 'content-type': 'application/json' },
      payload: { budgetUsd: 25 }
    });
    expect(setRes.statusCode).toBe(200);
    expect(setRes.json().budgetUsd).toBe(25);

    const clearRes = await app.inject({
      method: 'PATCH',
      url: '/api/usage/budget',
      headers: { ...authCookieHeader(), 'content-type': 'application/json' },
      payload: { budgetUsd: null }
    });
    expect(clearRes.statusCode).toBe(200);
    expect(clearRes.json().budgetUsd).toBeNull();
  });

  it('rejects invalid budgets', async () => {
    const app = await buildApp(makeStoreWithReports({ userId: TEST_USER_ID, reports: [] }));
    for (const budgetUsd of [-5, 0, 'ten']) {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/usage/budget',
        headers: { ...authCookieHeader(), 'content-type': 'application/json' },
        payload: { budgetUsd }
      });
      expect(res.statusCode).toBe(400);
    }
  });
});
