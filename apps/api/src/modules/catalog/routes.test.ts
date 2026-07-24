import { describe, expect, it, vi } from 'vitest';
import { buildServer } from '../../server';
import { authCookieHeader, createTestAuthDeps } from '../../test-utils/auth';

function createFakeAgentRepo() {
  return {
    async createAgent() {
      throw new Error('unused');
    },
    async updateAgent() {
      throw new Error('unused');
    },
    async disableAgent() {},
    async enableAgent() {},
    async deleteAgent() {},
    async listAgents() {
      return [];
    },
    async getAgent() {
      return null;
    },
    async listRecentRuns() {
      return [];
    },
    async shareAgent() {},
    async listAgentShares() {
      return [];
    },
    async revokeAgentShare() {},
    async publishAgent() {
      throw new Error('unused');
    },
    async unpublishAgent() {
      throw new Error('unused');
    },
    async listMarketplaceAgents() {
      return [];
    },
    async cloneFromMarketplace() {
      throw new Error('unused');
    }
  };
}

function createFakePromptDeps() {
  return {
    promptRepository: {
      savePromptVersion: async () => ({
        id: 'prompt-1',
        agentId: 'agent-1',
        version: 1,
        model: 'claude-sonnet-4-5',
        systemPrompt: '',
        enabled: true,
        name: '',
        description: '',
        characterType: 'summarizer',
        promptConfigJson: '{}',
        iconAssetKey: null,
        basedOnAgentVersionId: null,
        publishedAt: null,
        createdAt: new Date()
      }),
      getLatestPromptVersion: async () => null
    },
    reportRepository: {
      getLatestRunReport: async () => null,
      listReportsForAgent: async () => [],
      getReportById: async () => null,
      listSignalHistoryForSymbol: async () => []
    }
  };
}

function createFakeCatalogRepo(overrides: Partial<{
  getCatalog: (input: { userId: string; locale: string }) => Promise<unknown>;
  getAgentMatches: (input: { userId: string; sourceId: string }) => Promise<unknown>;
  useAgentForSource: (input: { userId: string; sourceId: string; agentVersionId: string }) => Promise<unknown>;
  updateSavedAgentVersion: (input: {
    userId: string;
    fromAgentVersionId: string;
    toAgentVersionId: string;
    updateManualPlaybooks: boolean;
  }) => Promise<unknown>;
}> = {}) {
  return {
    getCatalog: async () => ({ sources: [], agents: [], demos: [] }),
    getAgentMatches: async () => [],
    useAgentForSource: async () => ({
      playbook: {
        id: 'playbook-1',
        agentId: 'agent-1',
        agentVersionId: 'version-3',
        name: 'Manual analysis',
        description: '',
        enabled: true,
        notificationsEnabled: true,
        digestFrequency: 'immediate',
        schedule: { mode: 'manual' },
        sourceIds: ['source-1'],
        recipients: [],
        executionMode: 'latest_only',
        maxSourcesPerRun: 3,
        maxItemsPerSource: 1,
        followTargetType: null,
        followTargetKey: null,
        followTargetTitle: null,
        language: 'en',
        lastRunAt: null,
        nextRunAt: null,
        createdAt: new Date('2026-07-24T09:00:00.000Z'),
        updatedAt: new Date('2026-07-24T09:00:00.000Z')
      },
      created: true
    }),
    updateSavedAgentVersion: async () => ({
      fromAgentVersionId: 'version-2',
      toAgentVersionId: 'version-3',
      playbooksUpdated: 1
    }),
    ...overrides
  };
}

describe('catalog routes', () => {
  it('returns ranked agent matches for a library source', async () => {
    const getCatalog = vi.fn(async () => ({ sources: [], agents: [], demos: [] }));
    const getAgentMatches = vi.fn(async () => [
      {
        publicationId: 'agent-pub-1',
        agentVersionId: 'agent-version-1',
        ownership: 'curated',
        name: 'Market analyst',
        purpose: 'Tracks business signals',
        iconAssetKey: 'chart-line',
        reasons: [
          { code: 'topic', value: 'business' },
          { code: 'source_type', value: 'podcast_feeds' }
        ],
        score: 11115
      }
    ]);
    const app = await buildServer({
      agentRepository: createFakeAgentRepo(),
      agents: createFakePromptDeps(),
      auth: createTestAuthDeps(),
      catalog: { repository: createFakeCatalogRepo({ getCatalog, getAgentMatches }) }
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/catalog/agent-matches?sourceId=source-1',
      headers: authCookieHeader('user-42')
    });

    expect(res.statusCode).toBe(200);
    expect(getAgentMatches).toHaveBeenCalledWith({ userId: 'user-42', sourceId: 'source-1' });
    expect(res.json()).toEqual([
      {
        publicationId: 'agent-pub-1',
        agentVersionId: 'agent-version-1',
        ownership: 'curated',
        name: 'Market analyst',
        purpose: 'Tracks business signals',
        iconAssetKey: 'chart-line',
        reasons: [
          { code: 'topic', value: 'business' },
          { code: 'source_type', value: 'podcast_feeds' }
        ],
        score: 11115
      }
    ]);
  });

  it('returns source_not_in_library when the source is inaccessible', async () => {
    const getCatalog = vi.fn(async () => ({ sources: [], agents: [], demos: [] }));
    const getAgentMatches = vi.fn(async () => {
      throw new Error('source_not_in_library');
    });
    const app = await buildServer({
      agentRepository: createFakeAgentRepo(),
      agents: createFakePromptDeps(),
      auth: createTestAuthDeps(),
      catalog: { repository: createFakeCatalogRepo({ getCatalog, getAgentMatches }) }
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/catalog/agent-matches?sourceId=source-404',
      headers: authCookieHeader('user-42')
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ code: 'source_not_in_library', message: 'Source not in library' });
  });

  it('requires a non-empty sourceId query for agent matches', async () => {
    const getCatalog = vi.fn(async () => ({ sources: [], agents: [], demos: [] }));
    const getAgentMatches = vi.fn(async () => []);
    const app = await buildServer({
      agentRepository: createFakeAgentRepo(),
      agents: createFakePromptDeps(),
      auth: createTestAuthDeps(),
      catalog: { repository: createFakeCatalogRepo({ getCatalog, getAgentMatches }) }
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/catalog/agent-matches',
      headers: authCookieHeader('user-42')
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ code: 'validation_error', message: 'sourceId is required' });
    expect(getAgentMatches).not.toHaveBeenCalled();
  });

  it('returns the authenticated user catalog for the requested locale', async () => {
    const getCatalog = vi.fn(async () => ({
      sources: [{ publicationId: 'source-pub-1', slug: 'acquired', title: 'Übernahme', summary: 'Deutsch', saved: false }],
      agents: [{ publicationId: 'agent-pub-1', slug: 'market-analyst', agentVersionId: 'version-2', title: 'Marktanalyst', saved: true }],
      demos: [{ slug: 'acquired-analyst-demo', title: 'Beispielbericht', disclosure: 'Beispielbericht', report: { headline: 'Demo' } }]
    }));
    const app = await buildServer({
      agentRepository: createFakeAgentRepo(),
      agents: createFakePromptDeps(),
      auth: createTestAuthDeps(),
      catalog: { repository: createFakeCatalogRepo({ getCatalog }) }
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/catalog?locale=de',
      headers: authCookieHeader('user-42')
    });

    expect(res.statusCode).toBe(200);
    expect(getCatalog).toHaveBeenCalledWith({ userId: 'user-42', locale: 'de' });
    expect(res.json()).toEqual({
      sources: [{ publicationId: 'source-pub-1', slug: 'acquired', title: 'Übernahme', summary: 'Deutsch', saved: false }],
      agents: [{ publicationId: 'agent-pub-1', slug: 'market-analyst', agentVersionId: 'version-2', title: 'Marktanalyst', saved: true }],
      demos: [{ slug: 'acquired-analyst-demo', title: 'Beispielbericht', disclosure: 'Beispielbericht', report: { headline: 'Demo' } }]
    });
  });

  it('defaults locale to English when the query string is omitted', async () => {
    const getCatalog = vi.fn(async () => ({ sources: [], agents: [], demos: [] }));
    const app = await buildServer({
      agentRepository: createFakeAgentRepo(),
      agents: createFakePromptDeps(),
      auth: createTestAuthDeps(),
      catalog: { repository: createFakeCatalogRepo({ getCatalog }) }
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/catalog',
      headers: authCookieHeader()
    });

    expect(res.statusCode).toBe(200);
    expect(getCatalog).toHaveBeenCalledWith({ userId: 'test-user', locale: 'en' });
  });

  it('requires authentication', async () => {
    const app = await buildServer({
      agentRepository: createFakeAgentRepo(),
      agents: createFakePromptDeps(),
      auth: createTestAuthDeps(),
      catalog: { repository: createFakeCatalogRepo() }
    });

    const res = await app.inject({ method: 'GET', url: '/api/catalog?locale=de' });

    expect(res.statusCode).toBe(401);
  });

  it('uses the selected agent version for a saved source and returns the created manual playbook', async () => {
    const useAgentForSource = vi.fn(async () => ({
      playbook: {
        id: 'playbook-1',
        agentId: 'agent-1',
        agentVersionId: 'version-3',
        name: 'Manual analysis',
        description: '',
        enabled: true,
        notificationsEnabled: true,
        digestFrequency: 'immediate',
        schedule: { mode: 'manual' },
        sourceIds: ['source-1'],
        recipients: [],
        executionMode: 'latest_only',
        maxSourcesPerRun: 3,
        maxItemsPerSource: 1,
        followTargetType: null,
        followTargetKey: null,
        followTargetTitle: null,
        language: 'en',
        lastRunAt: null,
        nextRunAt: null,
        createdAt: new Date('2026-07-24T09:00:00.000Z'),
        updatedAt: new Date('2026-07-24T09:00:00.000Z')
      },
      created: true
    }));
    const app = await buildServer({
      agentRepository: createFakeAgentRepo(),
      agents: createFakePromptDeps(),
      auth: createTestAuthDeps(),
      catalog: { repository: createFakeCatalogRepo({ useAgentForSource }) }
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/catalog/agent-versions/version-3/use',
      headers: authCookieHeader('user-42'),
      payload: { sourceId: 'source-1' }
    });

    expect(res.statusCode).toBe(201);
    expect(useAgentForSource).toHaveBeenCalledWith({
      userId: 'user-42',
      sourceId: 'source-1',
      agentVersionId: 'version-3'
    });
    expect(res.json()).toEqual(
      expect.objectContaining({
        created: true,
        playbook: expect.objectContaining({
          agentVersionId: 'version-3',
          schedule: { mode: 'manual' },
          nextRunAt: null
        })
      })
    );
  });

  it('updates a saved agent version only after explicit confirmation', async () => {
    const updateSavedAgentVersion = vi.fn(async () => ({
      fromAgentVersionId: 'version-2',
      toAgentVersionId: 'version-3',
      playbooksUpdated: 0
    }));
    const app = await buildServer({
      agentRepository: createFakeAgentRepo(),
      agents: createFakePromptDeps(),
      auth: createTestAuthDeps(),
      catalog: { repository: createFakeCatalogRepo({ updateSavedAgentVersion }) }
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/catalog/agent-versions/version-3/update',
      headers: authCookieHeader('user-42'),
      payload: { fromAgentVersionId: 'version-2', updateManualPlaybooks: false }
    });

    expect(res.statusCode).toBe(200);
    expect(updateSavedAgentVersion).toHaveBeenCalledWith({
      userId: 'user-42',
      fromAgentVersionId: 'version-2',
      toAgentVersionId: 'version-3',
      updateManualPlaybooks: false
    });
    expect(res.json()).toEqual({
      fromAgentVersionId: 'version-2',
      toAgentVersionId: 'version-3',
      playbooksUpdated: 0
    });
  });
});
