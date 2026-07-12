import { describe, expect, it } from 'vitest';
import { buildServer } from '../../server';
import type { Agent, CreateAgentInput } from './types';
import { authCookieHeader, createTestAuthDeps } from '../../test-utils/auth';

function createFakeRepo() {
  const agents = new Map<string, Agent>();
  return {
    async createAgent(ownerUserId: string, input: CreateAgentInput): Promise<Agent> {
      const agent: Agent = {
        id: 'agent-1',
        ownerUserId,
        name: input.name,
        description: input.description ?? '',
        status: 'active',
        createdAt: new Date('2026-07-10T00:00:00.000Z'),
        updatedAt: new Date('2026-07-10T00:00:00.000Z'),
        sources: input.sources.map((s) => ({ ...s, frequencyMinutes: s.frequencyMinutes ?? 60 })),
        preferences: input.preferences ?? {},
        recipients: input.recipients ?? [],
        schedule: input.schedule
      };
      agents.set(agent.id, agent);
      return agent;
    },
    async updateAgent(agentId: string, patch: Partial<CreateAgentInput>): Promise<Agent> {
      const existing = agents.get(agentId);
      if (!existing) throw new Error('not_found');
      const updated: Agent = {
        ...existing,
        name: patch.name ?? existing.name,
        description: patch.description ?? existing.description,
        sources: patch.sources
          ? patch.sources.map((s) => ({ ...s, frequencyMinutes: s.frequencyMinutes ?? 60 }))
          : existing.sources,
        preferences: patch.preferences ?? existing.preferences,
        recipients: patch.recipients ?? existing.recipients,
        schedule: patch.schedule ?? existing.schedule,
        updatedAt: new Date('2026-07-10T01:00:00.000Z')
      };
      agents.set(agentId, updated);
      return updated;
    },
    async disableAgent(agentId: string): Promise<void> {
      const existing = agents.get(agentId);
      if (!existing) throw new Error('not_found');
      agents.set(agentId, { ...existing, status: 'disabled' });
    },
    async enableAgent(agentId: string): Promise<void> {
      const existing = agents.get(agentId);
      if (!existing) throw new Error('not_found');
      agents.set(agentId, { ...existing, status: 'active' });
    },
    async deleteAgent(agentId: string): Promise<void> {
      if (!agents.has(agentId)) throw new Error('not_found');
      agents.delete(agentId);
    },
    async listAgents(ownerUserId: string): Promise<Agent[]> {
      return [...agents.values()].filter((agent) => agent.ownerUserId === ownerUserId);
    },
    async getAgent(agentId: string): Promise<Agent | null> {
      return agents.get(agentId) ?? null;
    },
    async listRecentRuns(ownerUserId: string, limit: number) {
      return [...agents.values()]
        .filter((agent) => agent.ownerUserId === ownerUserId)
        .map((agent, index) => ({
          id: `run-${index + 1}`,
          agentId: agent.id,
          agentName: agent.name,
          status: 'succeeded',
          scheduledFor: new Date(Date.now() - index * 60000),
          finishedAt: new Date(Date.now() - index * 60000 + 1000)
        }))
        .slice(0, limit);
    }
  };
}

describe('agent routes', () => {
  function createFakeAgentsDeps() {
    return {
      promptRepository: {
        savePromptVersion: async () => ({
          id: 'prompt-1',
          agentId: 'agent-1',
          version: 1,
          model: 'claude-sonnet-4-5',
          systemPrompt: '',
          enabled: true,
          createdAt: new Date()
        }),
        getLatestPromptVersion: async () => null
      },
      reportRepository: {
        getLatestRunReport: async () => null,
        listReportsForAgent: async () => []
      }
    };
  }

  it('returns 400 for invalid schedule interval', async () => {
    const app = await buildServer({ agentRepository: createFakeRepo(), agents: createFakeAgentsDeps(), auth: createTestAuthDeps() });
    const res = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: authCookieHeader(),
      payload: {
        name: 'Bad Agent',
        sources: [{ type: 'web_urls', value: 'https://example.com' }],
        schedule: { mode: 'interval', intervalMinutes: 30 },
        preferences: { sector: ['tech'] },
        recipients: ['team@example.com']
      }
    });

    expect(res.statusCode).toBe(400);
  });

  it('disables agent without deleting it', async () => {
    const app = await buildServer({ agentRepository: createFakeRepo(), agents: createFakeAgentsDeps(), auth: createTestAuthDeps() });
    await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: authCookieHeader(),
      payload: {
        name: 'Good Agent',
        sources: [{ type: 'web_urls', value: 'https://example.com' }],
        schedule: { mode: 'interval', intervalMinutes: 120 },
        preferences: { sector: ['tech'] },
        recipients: ['team@example.com']
      }
    });

    const disable = await app.inject({
      method: 'POST',
      url: '/api/agents/agent-1/disable',
      headers: authCookieHeader()
    });

    expect(disable.statusCode).toBe(204);
  });

  it('enables a disabled agent', async () => {
    const app = await buildServer({ agentRepository: createFakeRepo(), agents: createFakeAgentsDeps(), auth: createTestAuthDeps() });
    await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: authCookieHeader(),
      payload: {
        name: 'Good Agent',
        sources: [{ type: 'web_urls', value: 'https://example.com' }],
        schedule: { mode: 'interval', intervalMinutes: 120 },
        preferences: { sector: ['tech'] },
        recipients: ['team@example.com']
      }
    });

    await app.inject({ method: 'POST', url: '/api/agents/agent-1/disable', headers: authCookieHeader() });
    const enable = await app.inject({ method: 'POST', url: '/api/agents/agent-1/enable', headers: authCookieHeader() });

    expect(enable.statusCode).toBe(204);
  });

  it('lists agents for the dashboard', async () => {
    const app = await buildServer({ agentRepository: createFakeRepo(), agents: createFakeAgentsDeps(), auth: createTestAuthDeps() });
    await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: authCookieHeader(),
      payload: {
        name: 'Good Agent',
        sources: [{ type: 'web_urls', value: 'https://example.com' }],
        schedule: { mode: 'interval', intervalMinutes: 120 },
        preferences: { sector: ['tech'] },
        recipients: ['team@example.com']
      }
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/agents',
      headers: authCookieHeader()
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
  });

  it('deletes a agent', async () => {
    const app = await buildServer({ agentRepository: createFakeRepo(), agents: createFakeAgentsDeps(), auth: createTestAuthDeps() });
    await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: authCookieHeader(),
      payload: {
        name: 'Good Agent',
        sources: [{ type: 'web_urls', value: 'https://example.com' }],
        schedule: { mode: 'interval', intervalMinutes: 120 },
        preferences: { sector: ['tech'] },
        recipients: ['team@example.com']
      }
    });

    const del = await app.inject({ method: 'DELETE', url: '/api/agents/agent-1', headers: authCookieHeader() });
    expect(del.statusCode).toBe(204);

    const res2 = await app.inject({ method: 'GET', url: '/api/agents', headers: authCookieHeader() });
    expect(res2.json()).toHaveLength(0);
  });

  it('returns 404 when deleting a agent that does not exist', async () => {
    const app = await buildServer({ agentRepository: createFakeRepo(), agents: createFakeAgentsDeps(), auth: createTestAuthDeps() });
    const del = await app.inject({ method: 'DELETE', url: '/api/agents/missing-agent', headers: authCookieHeader() });
    expect(del.statusCode).toBe(404);
  });

  it('lists recent runs with agent names', async () => {
    const app = await buildServer({ agentRepository: createFakeRepo(), agents: createFakeAgentsDeps(), auth: createTestAuthDeps() });
    await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: authCookieHeader(),
      payload: {
        name: 'Runner Agent',
        sources: [{ type: 'web_urls', value: 'https://example.com' }],
        schedule: { mode: 'interval', intervalMinutes: 120 },
        preferences: { sector: ['tech'] },
        recipients: ['team@example.com']
      }
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/agents/runs/recent?limit=3',
      headers: authCookieHeader()
    });

    expect(res.statusCode).toBe(200);
    const runs = res.json();
    expect(runs).toHaveLength(1);
    expect(runs[0].agentName).toBe('Runner Agent');
  });

  it('returns full agent detail including preferences, recipients, and schedule', async () => {
    const app = await buildServer({ agentRepository: createFakeRepo(), agents: createFakeAgentsDeps(), auth: createTestAuthDeps() });
    await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: authCookieHeader(),
      payload: {
        name: 'Detailed Agent',
        description: 'Watches tech news podcasts',
        sources: [{ type: 'web_urls', value: 'https://example.com', frequencyMinutes: 90 }],
        schedule: { mode: 'interval', intervalMinutes: 120 },
        preferences: { sector: ['tech'] },
        recipients: ['team@example.com']
      }
    });

    const res = await app.inject({ method: 'GET', url: '/api/agents/agent-1', headers: authCookieHeader() });

    expect(res.statusCode).toBe(200);
    const detail = res.json();
    expect(detail.description).toBe('Watches tech news podcasts');
    expect(detail.preferences).toEqual({ sector: ['tech'] });
    expect(detail.recipients).toEqual(['team@example.com']);
    expect(detail.schedule).toEqual({ mode: 'interval', intervalMinutes: 120 });
    expect(detail.sources[0]).toMatchObject({ frequencyMinutes: 90 });
  });

  it('returns 404 for a missing agent detail lookup', async () => {
    const app = await buildServer({ agentRepository: createFakeRepo(), agents: createFakeAgentsDeps(), auth: createTestAuthDeps() });
    const res = await app.inject({ method: 'GET', url: '/api/agents/missing-agent', headers: authCookieHeader() });
    expect(res.statusCode).toBe(404);
  });

  it('updates preferences, recipients, and schedule via PATCH', async () => {
    const app = await buildServer({ agentRepository: createFakeRepo(), agents: createFakeAgentsDeps(), auth: createTestAuthDeps() });
    await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: authCookieHeader(),
      payload: {
        name: 'Editable Agent',
        sources: [{ type: 'web_urls', value: 'https://example.com' }],
        schedule: { mode: 'interval', intervalMinutes: 120 },
        preferences: { sector: ['tech'] },
        recipients: ['team@example.com']
      }
    });

    const patchRes = await app.inject({
      method: 'PATCH',
      url: '/api/agents/agent-1',
      headers: authCookieHeader(),
      payload: {
        description: 'Updated description',
        recipients: ['new@example.com'],
        schedule: { mode: 'daily', dailyTime: '08:00', timezone: 'UTC' }
      }
    });

    expect(patchRes.statusCode).toBe(200);
    const updated = patchRes.json();
    expect(updated.description).toBe('Updated description');
    expect(updated.recipients).toEqual(['new@example.com']);
    expect(updated.schedule).toEqual({ mode: 'daily', dailyTime: '08:00', timezone: 'UTC' });
  });

  it('returns 503 when source probing is not configured', async () => {
    const app = await buildServer({ agentRepository: createFakeRepo(), agents: createFakeAgentsDeps(), auth: createTestAuthDeps() });
    const res = await app.inject({
      method: 'POST',
      url: '/api/agents/sources/probe',
      headers: authCookieHeader(),
      payload: { type: 'web_urls', value: 'https://example.com' }
    });
    expect(res.statusCode).toBe(503);
  });

  it('returns 400 when probing with a missing value', async () => {
    const app = await buildServer({
      agentRepository: createFakeRepo(),
      agents: createFakeAgentsDeps(),
      auth: createTestAuthDeps(),
      sourceProbe: { probeSource: async () => ({ reachable: true, kind: 'feed' }) }
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/agents/sources/probe',
      headers: authCookieHeader(),
      payload: { type: 'web_urls', value: '' }
    });
    expect(res.statusCode).toBe(400);
  });

  it('delegates to the configured source prober and returns its result', async () => {
    const probeSource = async (source: { type: string; value: string }) => {
      expect(source).toEqual({ type: 'web_urls', value: 'https://example.com/blog' });
      return { reachable: true, kind: 'listing_page' as const, confidence: 0.9 };
    };

    const app = await buildServer({
      agentRepository: createFakeRepo(),
      agents: createFakeAgentsDeps(),
      auth: createTestAuthDeps(),
      sourceProbe: { probeSource }
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/agents/sources/probe',
      headers: authCookieHeader(),
      payload: { type: 'web_urls', value: 'https://example.com/blog' }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ reachable: true, kind: 'listing_page', confidence: 0.9 });
  });

  it('passes the configured maxItems through to the source prober', async () => {
    const probeSource = async (source: { type: string; value: string; maxItems?: number }) => {
      expect(source).toEqual({ type: 'youtube_videos', value: 'https://www.youtube.com/playlist?list=PLxyz', maxItems: 5 });
      return { reachable: true, kind: 'feed' as const, itemCount: 15, maxItemsPerRun: 5 };
    };

    const app = await buildServer({
      agentRepository: createFakeRepo(),
      agents: createFakeAgentsDeps(),
      auth: createTestAuthDeps(),
      sourceProbe: { probeSource }
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/agents/sources/probe',
      headers: authCookieHeader(),
      payload: { type: 'youtube_videos', value: 'https://www.youtube.com/playlist?list=PLxyz', maxItems: 5 }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ reachable: true, kind: 'feed', itemCount: 15, maxItemsPerRun: 5 });
  });

  it('returns 503 for episode options when source probing is not configured', async () => {
    const repo = createFakeRepo();
    await repo.createAgent('admin-user-id', {
      name: 'Podcast Agent',
      sources: [{ type: 'podcast_feeds', value: 'https://example.com/feed.xml' }]
    } as CreateAgentInput);

    const app = await buildServer({ agentRepository: repo, agents: createFakeAgentsDeps(), auth: createTestAuthDeps() });
    const res = await app.inject({ method: 'GET', url: '/api/agents/agent-1/episode-options', headers: authCookieHeader() });
    expect(res.statusCode).toBe(503);
  });

  it('returns 404 for episode options on an unknown agent', async () => {
    const app = await buildServer({
      agentRepository: createFakeRepo(),
      agents: createFakeAgentsDeps(),
      auth: createTestAuthDeps(),
      sourceProbe: { probeSource: async () => ({ reachable: true, kind: 'feed' }) }
    });
    const res = await app.inject({ method: 'GET', url: '/api/agents/unknown-agent/episode-options', headers: authCookieHeader() });
    expect(res.statusCode).toBe(404);
  });

  it('combines and sorts episode options across an agent\'s episodic sources by recency, capped to 10', async () => {
    const repo = createFakeRepo();
    await repo.createAgent('admin-user-id', {
      name: 'Multi Agent',
      sources: [
        { type: 'podcast_feeds', value: 'https://example.com/feed.xml' },
        { type: 'youtube_videos', value: 'https://www.youtube.com/playlist?list=PLxyz' },
        { type: 'web_urls', value: 'https://example.com/blog' }
      ]
    } as CreateAgentInput);

    const probeSource = async (source: { type: string; value: string }) => {
      if (source.type === 'podcast_feeds') {
        return {
          reachable: true,
          kind: 'feed' as const,
          previewItems: [{ title: 'Podcast Ep 1', link: 'https://example.com/ep-1', pubDate: '2026-07-01T00:00:00.000Z' }]
        };
      }
      if (source.type === 'youtube_videos') {
        return {
          reachable: true,
          kind: 'feed' as const,
          previewItems: [{ title: 'Video 1', link: 'https://www.youtube.com/watch?v=vid1', pubDate: '2026-07-05T00:00:00.000Z' }]
        };
      }
      throw new Error('web_urls sources should not be probed for episode options');
    };

    const app = await buildServer({
      agentRepository: repo,
      agents: createFakeAgentsDeps(),
      auth: createTestAuthDeps(),
      sourceProbe: { probeSource }
    });

    const res = await app.inject({ method: 'GET', url: '/api/agents/agent-1/episode-options', headers: authCookieHeader() });
    expect(res.statusCode).toBe(200);
    const options = res.json();
    expect(options).toHaveLength(2);
    // Most recent (YouTube, 2026-07-05) first.
    expect(options[0]).toMatchObject({ sourceType: 'youtube_videos', title: 'Video 1', link: 'https://www.youtube.com/watch?v=vid1' });
    expect(options[1]).toMatchObject({ sourceType: 'podcast_feeds', title: 'Podcast Ep 1', link: 'https://example.com/ep-1' });
  });

  it('passes a forcedEpisode selection from the run request body through to the run trigger', async () => {
    const repo = createFakeRepo();
    await repo.createAgent('admin-user-id', {
      name: 'Podcast Agent',
      sources: [{ type: 'podcast_feeds', value: 'https://example.com/feed.xml' }]
    } as CreateAgentInput);

    const triggerRun = async (agentId: string, options?: { forcedEpisode?: { sourceType: string; sourceValue: string; itemLink: string } }) => {
      expect(agentId).toBe('agent-1');
      expect(options?.forcedEpisode).toEqual({
        sourceType: 'podcast_feeds',
        sourceValue: 'https://example.com/feed.xml',
        itemLink: 'https://example.com/ep-2'
      });
      return { status: 'succeeded' };
    };

    const app = await buildServer({
      agentRepository: repo,
      agents: createFakeAgentsDeps(),
      auth: createTestAuthDeps(),
      runTrigger: { triggerRun }
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/agents/agent-1/run',
      headers: authCookieHeader(),
      payload: { sourceType: 'podcast_feeds', sourceValue: 'https://example.com/feed.xml', itemLink: 'https://example.com/ep-2' }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'succeeded' });
  });
});
