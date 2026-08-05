import { describe, expect, it } from 'vitest';
import { buildServer } from '../../server';
import { InMemoryUserRepository } from '../auth/in-memory-user-repository';
import { authCookieHeader, createTestAuthDeps } from '../../test-utils/auth';

async function createApp(extra: { db?: unknown; agentActions?: { disabled: string[]; enabled: string[]; deleted: string[] } } = {}) {
  const userRepository = new InMemoryUserRepository();
  const admin = await userRepository.createWithPassword('admin@example.com', 'hash', 'Admin', 'admin');
  await userRepository.setEmailVerified(admin.id, true);
  const user = await userRepository.createWithPassword('trader@example.com', 'hash', 'Trader');
  await userRepository.setEmailVerified(user.id, true);

  const agentActions = extra.agentActions;

  const app = await buildServer({
    db: extra.db as never,
    agentRepository: {
      createAgent: async () => {
        throw new Error('unused');
      },
      updateAgent: async () => {
        throw new Error('unused');
      },
      disableAgent: async (agentId: string) => {
        agentActions?.disabled.push(agentId);
      },
      enableAgent: async (agentId: string) => {
        agentActions?.enabled.push(agentId);
      },
      deleteAgent: async (agentId: string) => {
        agentActions?.deleted.push(agentId);
      },
      listAgents: async () => [],
      getAgent: async () => null,
      listRecentRuns: async () => []
    },
    agents: {
      promptRepository: { savePromptVersion: async () => ({ id: 'prompt-1' } as never), getLatestPromptVersion: async () => null },
      reportRepository: { getLatestRunReport: async () => null, listReportsForAgent: async () => [] }
    },
    auth: { ...createTestAuthDeps(), userRepository }
  });

  return { app, admin, user, userRepository };
}

describe('admin routes', () => {
  it('promotes and demotes a user role', async () => {
    const { app, admin, user } = await createApp();

    const promote = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${user.id}/promote`,
      headers: authCookieHeader(admin.id)
    });

    expect(promote.statusCode).toBe(200);
    expect(promote.json().role).toBe('admin');

    const demote = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${user.id}/demote`,
      headers: authCookieHeader(admin.id)
    });

    expect(demote.statusCode).toBe(200);
    expect(demote.json().role).toBe('user');
  });

  it('returns 503 for agents overview without a database', async () => {
    const { app, admin } = await createApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/agents/overview',
      headers: authCookieHeader(admin.id)
    });

    expect(res.statusCode).toBe(503);
  });

  it('rejects agents overview for non-admin users', async () => {
    const { app, user } = await createApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/agents/overview',
      headers: authCookieHeader(user.id)
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 503 for hub overviews without a database', async () => {
    const { app, admin } = await createApp();

    for (const url of ['/api/admin/reports/overview', '/api/admin/sources/overview', '/api/admin/discussions/overview']) {
      const res = await app.inject({ method: 'GET', url, headers: authCookieHeader(admin.id) });
      expect(res.statusCode).toBe(503);
    }
  });

  it('aggregates reports overview across all users', async () => {
    const now = new Date();
    const fakeDb = {
      agent: {
        findMany: async () => [{ id: 'a1', name: 'Agent One', ownerUserId: 'owner-1' }]
      },
      agentRunReport: {
        findMany: async (args: { take?: number }) =>
          args?.take
            ? [
                {
                  id: 'r1',
                  agentId: 'a1',
                  summary: 'Latest report',
                  model: 'claude',
                  needsHumanReview: true,
                  readAt: null,
                  inputTokens: 100,
                  outputTokens: 50,
                  estimatedCostUsd: 0.05,
                  createdAt: now
                }
              ]
            : [
                { readAt: null, needsHumanReview: true, inputTokens: 100, outputTokens: 50, estimatedCostUsd: 0.05 },
                { readAt: now, needsHumanReview: false, inputTokens: 300, outputTokens: 150, estimatedCostUsd: 0.15 }
              ],
        count: async () => 4
      }
    };

    const { app, admin } = await createApp({ db: fakeDb });
    const res = await app.inject({ method: 'GET', url: '/api/admin/reports/overview', headers: authCookieHeader(admin.id) });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totals.reports30d).toBe(2);
    expect(body.totals.unread30d).toBe(1);
    expect(body.totals.unreadRate30d).toBe(0.5);
    expect(body.totals.needsReviewTotal).toBe(4);
    expect(body.totals.inputTokens30d).toBe(400);
    expect(body.totals.costUsd30d).toBeCloseTo(0.2);
    expect(body.totals.avgTokensPerReport30d).toBe(300);
    expect(body.reports).toHaveLength(1);
    expect(body.reports[0].agentName).toBe('Agent One');
    expect(body.reports[0].tokens).toBe(150);
    expect(body.reports[0].read).toBe(false);
  });

  it('aggregates sources overview across all users', async () => {
    const now = new Date();
    const old = new Date(now.getTime() - 20 * 86_400_000);
    const fakeDb = {
      source: {
        findMany: async () => [
          { id: 's1', type: 'podcast', value: 'https://feed.example', status: 'active', ownerUserId: 'owner-1', createdAt: now },
          { id: 's2', type: 'youtube_channel', value: 'https://yt.example', status: 'active', ownerUserId: 'owner-2', createdAt: now },
          { id: 's3', type: 'podcast', value: 'https://other.example', status: 'disabled', ownerUserId: 'owner-1', createdAt: now }
        ]
      },
      sourceItem: {
        groupBy: async () => [{ sourceId: 's1', _count: { _all: 5 } }],
        findMany: async () => [
          { sourceId: 's1', createdAt: now },
          { sourceId: 's2', createdAt: old }
        ]
      },
      playbook: {
        findMany: async () => [
          { sourceId: 's1', agentId: 'a1' },
          { sourceId: 's1', agentId: 'a2' },
          { sourceId: 's2', agentId: 'a1' }
        ]
      }
    };

    const { app, admin } = await createApp({ db: fakeDb });
    const res = await app.inject({ method: 'GET', url: '/api/admin/sources/overview', headers: authCookieHeader(admin.id) });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totals.sources).toBe(3);
    expect(body.totals.activeSources).toBe(2);
    expect(body.totals.byType).toEqual({ podcast: 2, youtube_channel: 1 });
    expect(body.totals.items30d).toBe(5);
    expect(body.totals.staleSources).toBe(2);
    expect(body.totals.unfollowedSources).toBe(1);

    const s1 = body.sources.find((s: { id: string }) => s.id === 's1');
    expect(s1.agentCount).toBe(2);
    expect(s1.items30d).toBe(5);
    expect(s1.stale).toBe(false);

    const s3 = body.sources.find((s: { id: string }) => s.id === 's3');
    expect(s3.agentCount).toBe(0);
    expect(s3.lastItemAt).toBeNull();
    expect(s3.stale).toBe(true);
  });

  it('aggregates discussions overview across all users', async () => {
    const now = new Date();
    const fakeDb = {
      discussion: {
        findMany: async () => [
          { id: 'd1', name: 'Roundtable', format: 'free_form', ownerUserId: 'owner-1', createdAt: now, participants: [{ id: 'p1' }, { id: 'p2' }] },
          { id: 'd2', name: 'Empty', format: 'debate', ownerUserId: 'owner-2', createdAt: now, participants: [] }
        ]
      },
      discussionRun: {
        findMany: async () => [
          { discussionId: 'd1', status: 'completed', createdAt: now, audioUrl: 'https://audio.example', _count: { turns: 8 } },
          { discussionId: 'd1', status: 'failed', createdAt: now, audioUrl: null, _count: { turns: 2 } }
        ]
      }
    };

    const { app, admin } = await createApp({ db: fakeDb });
    const res = await app.inject({ method: 'GET', url: '/api/admin/discussions/overview', headers: authCookieHeader(admin.id) });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totals.discussions).toBe(2);
    expect(body.totals.runs30d).toBe(2);
    expect(body.totals.failedRuns30d).toBe(1);
    expect(body.totals.turns30d).toBe(10);
    expect(body.totals.audioRuns30d).toBe(1);

    const d1 = body.discussions.find((d: { id: string }) => d.id === 'd1');
    expect(d1.participantCount).toBe(2);
    expect(d1.runsTotal).toBe(2);
    expect(d1.failedRuns).toBe(1);
    expect(d1.turnsTotal).toBe(10);
    expect(d1.lastRunStatus).toBe('completed');

    const d2 = body.discussions.find((d: { id: string }) => d.id === 'd2');
    expect(d2.runsTotal).toBe(0);
    expect(d2.lastRunAt).toBeNull();
  });

  it('aggregates agents overview across all users', async () => {
    const now = new Date();
    const fakeDb = {
      agent: {
        findMany: async () => [
          { id: 'a1', name: 'Agent One', characterType: 'finance_expert', status: 'active', ownerUserId: 'owner-1', createdAt: now },
          { id: 'a2', name: 'Agent Two', characterType: 'generalist', status: 'disabled', ownerUserId: 'owner-2', createdAt: now }
        ]
      },
      playbook: {
        findMany: async () => [
          { agentId: 'a1', sourceId: 's1' },
          { agentId: 'a1', sourceId: 's2' },
          { agentId: 'a1', sourceId: 's1' }
        ]
      },
      agentRun: {
        findMany: async (args: { distinct?: string[] }) =>
          args?.distinct
            ? [{ agentId: 'a1', status: 'completed', createdAt: now }]
            : [
                { agentId: 'a1', status: 'completed', createdAt: now, startedAt: new Date(now.getTime() - 4000), finishedAt: now },
                { agentId: 'a1', status: 'failed', createdAt: now, startedAt: null, finishedAt: null }
              ]
      },
      agentRunReport: {
        groupBy: async (args: { where?: { needsHumanReview?: boolean }; _sum?: unknown }) => {
          if (args.where?.needsHumanReview) {
            return [{ agentId: 'a1', _count: { _all: 1 } }];
          }
          if (args._sum) {
            return [{ agentId: 'a1', _count: { _all: 2 }, _sum: { inputTokens: 1000, outputTokens: 500, estimatedCostUsd: 0.12 } }];
          }
          return [{ agentId: 'a1', _count: { _all: 3 } }];
        }
      },
      discussionParticipant: {
        findMany: async () => [
          { agentId: 'a1', discussionId: 'd1' },
          { agentId: 'a1', discussionId: 'd2' },
          { agentId: 'a1', discussionId: 'd1' }
        ]
      }
    };

    const { app, admin } = await createApp({ db: fakeDb });

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/agents/overview',
      headers: authCookieHeader(admin.id)
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.totals.agents).toBe(2);
    expect(body.totals.activeAgents).toBe(1);
    expect(body.totals.runs30d).toBe(2);
    expect(body.totals.successRate30d).toBe(0.5);
    expect(body.totals.failed24h).toBe(1);
    expect(body.totals.inputTokens30d).toBe(1000);
    expect(body.totals.costUsd30d).toBe(0.12);
    expect(body.totals.avgRunMs30d).toBe(4000);
    expect(body.totals.needsReviewCount).toBe(1);

    const a1 = body.agents.find((a: { id: string }) => a.id === 'a1');
    expect(a1.playbookCount).toBe(3);
    expect(a1.sourceCount).toBe(2);
    expect(a1.discussionCount).toBe(2);
    expect(a1.runs30d).toBe(2);
    expect(a1.failed30d).toBe(1);
    expect(a1.lastRunStatus).toBe('completed');
    expect(a1.reportsTotal).toBe(3);
    expect(a1.reports30d).toBe(2);
    expect(a1.needsReviewCount).toBe(1);

    const a2 = body.agents.find((a: { id: string }) => a.id === 'a2');
    expect(a2.runs30d).toBe(0);
    expect(a2.discussionCount).toBe(0);
    expect(a2.lastRunAt).toBeNull();
    expect(a2.reportsTotal).toBe(0);
  });

  it('pauses, resumes and deletes agents as admin', async () => {
    const agentActions = { disabled: [] as string[], enabled: [] as string[], deleted: [] as string[] };
    const { app, admin } = await createApp({ agentActions });

    const pause = await app.inject({
      method: 'POST',
      url: '/api/admin/agents/a1/pause',
      headers: authCookieHeader(admin.id)
    });
    expect(pause.statusCode).toBe(200);
    expect(agentActions.disabled).toEqual(['a1']);

    const resume = await app.inject({
      method: 'POST',
      url: '/api/admin/agents/a1/resume',
      headers: authCookieHeader(admin.id)
    });
    expect(resume.statusCode).toBe(200);
    expect(agentActions.enabled).toEqual(['a1']);

    const del = await app.inject({
      method: 'DELETE',
      url: '/api/admin/agents/a1',
      headers: authCookieHeader(admin.id)
    });
    expect(del.statusCode).toBe(204);
    expect(agentActions.deleted).toEqual(['a1']);
  });
});
