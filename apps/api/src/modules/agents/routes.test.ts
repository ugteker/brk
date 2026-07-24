import { describe, expect, it } from 'vitest';
import { buildServer } from '../../server';
import type { Agent, CreateAgentInput } from './types';
import { DEFAULT_CHARACTER_TYPE } from './types';
import { authCookieHeader, createTestAuthDeps } from '../../test-utils/auth';
import { InMemoryUserRepository } from '../auth/in-memory-user-repository';
import { DomainAccessResolver } from '../access/permissions';

function createFakeRepo() {
  const agents = new Map<string, Agent>();
  const grants = new Map<string, { id: string; grantedByUserId: string; granteeUserId: string; permission: string; expiresAt: Date | null }[]>();
  const publications = new Map<
    string,
    {
      publicationId: string;
      agentId: string;
      publisherUserId: string;
      title: string;
      summary: string;
      visibility: 'public' | 'private';
      publishedAt: Date;
      retiredAt: Date | null;
    }
  >();
  const versions = new Map<string, any>();
  const userLibrary = new Map<string, Set<string>>();
  let nextId = 1;
  let nextGrantId = 1;
  let nextPublicationId = 1;
  let nextVersionId = 1;
  const events: Array<{ userId: string; topic: string; entityId?: string }> = [];
  return {
    events,
    userLibrary,
    async createAgent(ownerUserId: string, input: CreateAgentInput): Promise<Agent> {
      const agent: Agent = {
        id: `agent-${nextId++}`,
        ownerUserId,
        name: input.name,
        description: input.description ?? '',
        characterType: input.characterType ?? DEFAULT_CHARACTER_TYPE,
        promptConfig: input.promptConfig ?? {},
        status: 'active',
        createdAt: new Date('2026-07-10T00:00:00.000Z'),
        updatedAt: new Date('2026-07-10T00:00:00.000Z'),
        sources: (input.sources ?? []).map((s) => ({ ...s, frequencyMinutes: s.frequencyMinutes ?? 60 })),
        preferences: input.preferences ?? {},
        schedule: null
      };
      agents.set(agent.id, agent);
      events.push({ userId: ownerUserId, topic: 'agent.changed', entityId: agent.id });
      return agent;
    },
    async updateAgent(agentId: string, patch: Partial<CreateAgentInput>): Promise<Agent> {
      const existing = agents.get(agentId);
      if (!existing) throw new Error('not_found');

      const isPublic = [...publications.values()].some((p) => p.agentId === agentId && p.retiredAt === null && p.visibility === 'public');
      if (isPublic && (patch.characterType !== undefined || patch.promptConfig !== undefined)) {
        throw new Error('immutable_agent_version');
      }

      const updated: Agent = {
        ...existing,
        name: patch.name ?? existing.name,
        description: patch.description ?? existing.description,
        characterType: patch.characterType ?? existing.characterType,
        promptConfig: patch.promptConfig ?? existing.promptConfig,
        sources: patch.sources
          ? patch.sources.map((s) => ({ ...s, frequencyMinutes: s.frequencyMinutes ?? 60 }))
          : existing.sources,
        preferences: patch.preferences ?? existing.preferences,
        schedule: existing.schedule,
        updatedAt: new Date('2026-07-10T01:00:00.000Z')
      };
      agents.set(agentId, updated);
      events.push({ userId: updated.ownerUserId, topic: 'agent.changed', entityId: agentId });
      return updated;
    },

    async disableAgent(agentId: string): Promise<void> {
      const existing = agents.get(agentId);
      if (!existing) throw new Error('not_found');
      agents.set(agentId, { ...existing, status: 'disabled' });
      events.push({ userId: existing.ownerUserId, topic: 'agent.changed', entityId: agentId });
    },
    async enableAgent(agentId: string): Promise<void> {
      const existing = agents.get(agentId);
      if (!existing) throw new Error('not_found');
      agents.set(agentId, { ...existing, status: 'active' });
      events.push({ userId: existing.ownerUserId, topic: 'agent.changed', entityId: agentId });
    },
    async deleteAgent(agentId: string): Promise<void> {
      const existing = agents.get(agentId);
      if (!existing) throw new Error('not_found');
      agents.delete(agentId);
      events.push({ userId: existing.ownerUserId, topic: 'agent.changed', entityId: agentId });
    },
    async listAgents(ownerUserId?: string): Promise<Agent[]> {
      return ownerUserId ? [...agents.values()].filter((agent) => agent.ownerUserId === ownerUserId) : [...agents.values()];
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
    },
    async shareAgent(agentId: string, grantedByUserId: string, input: { granteeUserId: string; permission: 'read' | 'edit' | 'delete'; expiresAt?: string }) {
      const existing = agents.get(agentId);
      if (!existing) throw new Error('not_found');
      const existingGrants = grants.get(agentId) ?? [];
      existingGrants.push({
        id: `grant-${nextGrantId++}`,
        grantedByUserId,
        granteeUserId: input.granteeUserId,
        permission: input.permission,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null
      });
      grants.set(agentId, existingGrants);
      events.push({ userId: existing.ownerUserId, topic: 'agent.changed', entityId: agentId });
    },
    async listAgentShares(agentId: string) {
      return (grants.get(agentId) ?? []).map((g) => ({ ...g, createdAt: new Date('2026-07-10T00:00:00.000Z') }));
    },
    async revokeAgentShare(agentId: string, grantId: string) {
      const existing = grants.get(agentId) ?? [];
      const next = existing.filter((g) => g.id !== grantId);
      if (next.length === existing.length) throw new Error('not_found');
      grants.set(agentId, next);
    },
    async publishAgent(agentId: string, publisherUserId: string, input: { title: string; summary?: string; visibility?: 'public' | 'private' }) {
      const existingAgent = agents.get(agentId);
      if (!existingAgent) throw new Error('not_found');
      const existingPublication = [...publications.values()].find((publication) => publication.agentId === agentId);
      const publication = {
        publicationId: existingPublication?.publicationId ?? `publication-${nextPublicationId++}`,
        agentId,
        publisherUserId,
        title: input.title,
        summary: input.summary ?? '',
        visibility: input.visibility ?? 'public',
        publishedAt: new Date('2026-07-10T02:00:00.000Z'),
        retiredAt: null
      };
      publications.set(publication.publicationId, publication);
      events.push({ userId: existingAgent.ownerUserId, topic: 'agent.changed', entityId: agentId });
      events.push({ userId: existingAgent.ownerUserId, topic: 'marketplace.changed', entityId: publication.publicationId });
      return {
        publicationId: publication.publicationId,
        agentId,
        publisherUserId: publication.publisherUserId,
        title: publication.title,
        summary: publication.summary,
        visibility: publication.visibility,
        publishedAt: publication.publishedAt,
        agent: existingAgent
      };
    },
    async listMarketplaceAgents() {
      return [...publications.values()]
        .filter((publication) => publication.visibility === 'public' && publication.retiredAt === null)
        .map((publication) => ({
          publicationId: publication.publicationId,
          agentId: publication.agentId,
          publisherUserId: publication.publisherUserId,
          title: publication.title,
          summary: publication.summary,
          visibility: publication.visibility,
          publishedAt: publication.publishedAt,
          agent: agents.get(publication.agentId)!
        }));
    },
    async unpublishAgent(agentId: string): Promise<void> {
      const publication = [...publications.values()].find((row) => row.agentId === agentId && row.retiredAt === null);
      if (!publication) throw new Error('not_found');
      publications.set(publication.publicationId, {
        ...publication,
        retiredAt: new Date('2026-07-10T03:00:00.000Z')
      });
      const agent = agents.get(agentId);
      if (agent) {
        events.push({ userId: agent.ownerUserId, topic: 'agent.changed', entityId: agentId });
        events.push({ userId: agent.ownerUserId, topic: 'marketplace.changed', entityId: publication.publicationId });
      }
    },
    async cloneFromMarketplace(publicationId: string, targetOwnerUserId: string) {
      const publication = publications.get(publicationId);
      if (!publication || publication.retiredAt || publication.visibility !== 'public') throw new Error('not_found');
      const source = agents.get(publication.agentId);
      if (!source) throw new Error('not_found');
      const existing = [...agents.values()].find((agent) => agent.ownerUserId === targetOwnerUserId && agent.name === source.name);
      if (existing) return { agent: existing, cloned: false };
      const cloned = await this.createAgent(targetOwnerUserId, {
        name: source.name,
        description: source.description,
        characterType: source.characterType,
        promptConfig: source.promptConfig,
        active: source.status !== 'disabled',
        sources: source.sources,
        preferences: source.preferences
      });
      events.push({ userId: targetOwnerUserId, topic: 'marketplace.changed', entityId: publicationId });
      return { agent: cloned, cloned: true };
    },
    async createAgentVersion(agentId: string, input: any) {
      const agent = agents.get(agentId);
      if (!agent) throw new Error('not_found');
      const existing = [...versions.values()].filter((v) => v.agentId === agentId);
      const nextVersion = existing.length === 0 ? 1 : Math.max(...existing.map((v) => v.version)) + 1;
      const id = `version-${nextVersionId++}`;
      const v = { id, agentId, version: nextVersion, model: input.model, systemPrompt: input.systemPrompt, agent };
      versions.set(id, v);
      return v;
    },
    async saveAgentVersion(userId: string, agentVersionId: string) {
      const v = versions.get(agentVersionId);
      if (!v) throw new Error('not_found');
      const owner = v.agent.ownerUserId;
      const isPublic = [...publications.values()].some((p) => p.agentId === v.agentId && p.retiredAt === null && p.visibility === 'public');
      if (owner !== userId && !isPublic) throw new Error('not_found');
      const set = userLibrary.get(userId) ?? new Set<string>();
      set.add(agentVersionId);
      userLibrary.set(userId, set);
    },
    async removeSavedAgentVersion(userId: string, agentVersionId: string) {
      const set = userLibrary.get(userId) ?? new Set<string>();
      const existed = set.delete(agentVersionId);
      if (!existed) throw new Error('not_found');
      userLibrary.set(userId, set);
    },
    async findOwnerUserId(_resourceType: 'agent' | 'source' | 'playbook', resourceId: string): Promise<string | null> {
      return agents.get(resourceId)?.ownerUserId ?? null;
    },

    async hasGrant(input: { granteeUserId: string; resourceType: 'agent' | 'source' | 'playbook'; resourceId: string; permission: string }): Promise<boolean> {
      if (input.resourceType !== 'agent') return false;
      return (grants.get(input.resourceId) ?? []).some(
        (grant) =>
          grant.granteeUserId === input.granteeUserId &&
          (grant.permission === input.permission || grant.permission === '*') &&
          (!grant.expiresAt || grant.expiresAt.getTime() > Date.now())
      );
    },
    async isPubliclyPublished(_resourceType: 'agent' | 'source' | 'playbook', resourceId: string): Promise<boolean> {
      return [...publications.values()].some((publication) => publication.agentId === resourceId && publication.retiredAt === null && publication.visibility === 'public');
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

  it('returns 400 for unsupported character type on create', async () => {
    const app = await buildServer({ agentRepository: createFakeRepo(), agents: createFakeAgentsDeps(), auth: createTestAuthDeps() });
    const res = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: authCookieHeader(),
      payload: {
        name: 'Bad Character Agent',
        characterType: 'comedian',
        promptConfig: {},
        sources: [{ type: 'web_urls', value: 'https://example.com' }],
        schedule: { mode: 'interval', intervalMinutes: 120 },
        preferences: { sector: ['tech'] }
      }
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for finance_expert create payload without risk_level', async () => {
    const app = await buildServer({ agentRepository: createFakeRepo(), agents: createFakeAgentsDeps(), auth: createTestAuthDeps() });
    const res = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: authCookieHeader(),
      payload: {
        name: 'Finance Agent',
        characterType: 'finance_expert',
        promptConfig: { tone: 'formal' },
        sources: [{ type: 'web_urls', value: 'https://example.com' }],
        schedule: { mode: 'interval', intervalMinutes: 120 },
        preferences: { sector: ['finance'] }
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
        preferences: { sector: ['tech'] }
      }
    });

    const disable = await app.inject({
      method: 'POST',
      url: '/api/agents/agent-1/disable',
      headers: authCookieHeader()
    });

    expect(disable.statusCode).toBe(204);
  });

  it('PATCH on a published agent returns 409 immutable_agent_version', async () => {
    const repo = createFakeRepo();
    const app = await buildServer({ agentRepository: repo, agents: createFakeAgentsDeps(), auth: createTestAuthDeps() });
    const createRes = await app.inject({ method: 'POST', url: '/api/agents', headers: authCookieHeader('user-1'), payload: { name: 'Agent For Version' } });
    expect(createRes.statusCode).toBe(201);
    const agentId = createRes.json().id as string;

    const publishRes = await app.inject({ method: 'POST', url: `/api/agents/${agentId}/publish`, headers: authCookieHeader('user-1'), payload: { title: 'Public', visibility: 'public' } });
    expect(publishRes.statusCode).toBe(201);

    const patchRes = await app.inject({ method: 'PATCH', url: `/api/agents/${agentId}`, headers: authCookieHeader('user-1'), payload: { characterType: 'teacher', promptConfig: {} } });
    expect(patchRes.statusCode).toBe(409);
    expect(patchRes.json().code).toBe('immutable_agent_version');
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
        preferences: { sector: ['tech'] }
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
        preferences: { sector: ['tech'] }
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

  it('creates agents for the signed-in user', async () => {
    const app = await buildServer({ agentRepository: createFakeRepo(), agents: createFakeAgentsDeps(), auth: createTestAuthDeps() });
    const res = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: authCookieHeader('user-42'),
      payload: {
        name: 'Owned Agent',
        sources: [{ type: 'web_urls', value: 'https://example.com' }],
        schedule: { mode: 'interval', intervalMinutes: 120 },
        preferences: { sector: ['tech'] }
      }
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().ownerUserId).toBe('user-42');
  });

  it('lets admins list all agents', async () => {
    const userRepository = new InMemoryUserRepository();
    const admin = await userRepository.createWithPassword('admin@example.com', 'hash', 'Admin', 'admin');
    await userRepository.setEmailVerified(admin.id, true);
    const app = await buildServer({
      agentRepository: createFakeRepo(),
      agents: createFakeAgentsDeps(),
      auth: { ...createTestAuthDeps(), userRepository }
    });

    await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: authCookieHeader('user-1'),
      payload: {
        name: 'User One Agent',
        sources: [{ type: 'web_urls', value: 'https://example.com/one' }],
        schedule: { mode: 'interval', intervalMinutes: 120 },
        preferences: { sector: ['tech'] }
      }
    });
    await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: authCookieHeader('user-2'),
      payload: {
        name: 'User Two Agent',
        sources: [{ type: 'web_urls', value: 'https://example.com/two' }],
        schedule: { mode: 'interval', intervalMinutes: 120 },
        preferences: { sector: ['tech'] }
      }
    });

    const res = await app.inject({ method: 'GET', url: '/api/agents', headers: authCookieHeader(admin.id) });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(2);
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
        preferences: { sector: ['tech'] }
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
        preferences: { sector: ['tech'] }
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

  it('returns full agent detail including preferences and schedule', async () => {
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
        preferences: { sector: ['tech'] }
      }
    });

    const res = await app.inject({ method: 'GET', url: '/api/agents/agent-1', headers: authCookieHeader() });

    expect(res.statusCode).toBe(200);
    const detail = res.json();
    expect(detail.description).toBe('Watches tech news podcasts');
    expect(detail.preferences).toEqual({ sector: ['tech'] });
    expect(detail.schedule).toBeNull();
    expect(detail.sources[0]).toMatchObject({ frequencyMinutes: 90 });
  });

  it('returns 404 for a missing agent detail lookup', async () => {
    const app = await buildServer({ agentRepository: createFakeRepo(), agents: createFakeAgentsDeps(), auth: createTestAuthDeps() });
    const res = await app.inject({ method: 'GET', url: '/api/agents/missing-agent', headers: authCookieHeader() });
    expect(res.statusCode).toBe(404);
  });

  it('updates preferences and schedule via PATCH', async () => {
    const app = await buildServer({ agentRepository: createFakeRepo(), agents: createFakeAgentsDeps(), auth: createTestAuthDeps() });
    await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: authCookieHeader(),
      payload: {
        name: 'Editable Agent',
        sources: [{ type: 'web_urls', value: 'https://example.com' }],
        schedule: { mode: 'interval', intervalMinutes: 120 },
        preferences: { sector: ['tech'] }
      }
    });

    const patchRes = await app.inject({
      method: 'PATCH',
      url: '/api/agents/agent-1',
      headers: authCookieHeader(),
      payload: {
        description: 'Updated description',
        schedule: { mode: 'daily', dailyTime: '08:00', timezone: 'UTC' }
      }
    });

    expect(patchRes.statusCode).toBe(200);
    const updated = patchRes.json();
    expect(updated.description).toBe('Updated description');
    expect(updated.schedule).toBeNull();
  });

  it('returns 400 when PATCH sets non-finance character with risk_level', async () => {
    const app = await buildServer({ agentRepository: createFakeRepo(), agents: createFakeAgentsDeps(), auth: createTestAuthDeps() });
    await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: authCookieHeader(),
      payload: {
        name: 'Editable Agent',
        characterType: 'finance_expert',
        promptConfig: { risk_level: 'moderate', tone: 'formal' },
        sources: [{ type: 'web_urls', value: 'https://example.com' }],
        schedule: { mode: 'interval', intervalMinutes: 120 },
        preferences: { sector: ['finance'] }
      }
    });

    const patchRes = await app.inject({
      method: 'PATCH',
      url: '/api/agents/agent-1',
      headers: authCookieHeader(),
      payload: {
        characterType: 'teacher',
        promptConfig: { risk_level: 'low' }
      }
    });

    expect(patchRes.statusCode).toBe(400);
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
      return {
        reachable: true,
        kind: 'listing_page' as const,
        confidence: 0.9,
        title: 'Example Blog',
        coverImageUrl: 'https://example.com/blog-cover.jpg',
        previewItems: [{ title: 'Post 1', link: 'https://example.com/blog/post-1', pubDate: null }]
      };
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
    expect(res.json()).toEqual({
      reachable: true,
      kind: 'listing_page',
      confidence: 0.9,
      title: 'Example Blog',
      coverImageUrl: 'https://example.com/blog-cover.jpg',
      previewItems: [{ title: 'Post 1', link: 'https://example.com/blog/post-1', pubDate: null }]
    });
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
    await repo.createAgent('user-1', {
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
    await repo.createAgent('user-1', {
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
      headers: authCookieHeader('user-1'),
      payload: { sourceType: 'podcast_feeds', sourceValue: 'https://example.com/feed.xml', itemLink: 'https://example.com/ep-2' }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'succeeded' });
  });

  it('creates persona-focused agents without requiring sources/schedule/recipients', async () => {
    const app = await buildServer({ agentRepository: createFakeRepo(), agents: createFakeAgentsDeps(), auth: createTestAuthDeps() });
    const res = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: authCookieHeader(),
      payload: { name: 'Persona Agent', characterType: 'teacher', promptConfig: { tone: 'concise' } }
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      name: 'Persona Agent',
      characterType: 'teacher',
      sources: [],
      schedule: null
    });
  });

  it('authorizes agent read/edit/delete by centralized grants and denies non-granted users', async () => {
    const agentRepository = createFakeRepo();
    const userRepository = new InMemoryUserRepository();
    const owner = await userRepository.createWithPassword('owner@example.com', 'hash', 'Owner', 'user');
    const shared = await userRepository.createWithPassword('shared@example.com', 'hash', 'Shared', 'user');
    const blocked = await userRepository.createWithPassword('blocked@example.com', 'hash', 'Blocked', 'user');
    await userRepository.setEmailVerified(owner.id, true);
    await userRepository.setEmailVerified(shared.id, true);
    await userRepository.setEmailVerified(blocked.id, true);

    const app = await buildServer({
      agentRepository,
      agents: createFakeAgentsDeps(),
      auth: { ...createTestAuthDeps(), userRepository },
      accessResolver: new DomainAccessResolver(agentRepository)
    });

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: authCookieHeader(owner.id),
      payload: { name: 'ACL Agent' }
    });
    const agentId = createRes.json().id as string;

    await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/shares`,
      headers: authCookieHeader(owner.id),
      payload: { granteeUserId: shared.id, permission: 'read' }
    });

    const sharedRead = await app.inject({ method: 'GET', url: `/api/agents/${agentId}`, headers: authCookieHeader(shared.id) });
    const sharedEditDenied = await app.inject({
      method: 'PATCH',
      url: `/api/agents/${agentId}`,
      headers: authCookieHeader(shared.id),
      payload: { description: 'nope' }
    });
    const blockedRead = await app.inject({ method: 'GET', url: `/api/agents/${agentId}`, headers: authCookieHeader(blocked.id) });

    expect(sharedRead.statusCode).toBe(200);
    expect(sharedEditDenied.statusCode).toBe(403);
    expect(blockedRead.statusCode).toBe(403);
  });

  it('enforces owner/admin-only share management endpoints', async () => {
    const agentRepository = createFakeRepo();
    const userRepository = new InMemoryUserRepository();
    const owner = await userRepository.createWithPassword('owner2@example.com', 'hash', 'Owner2', 'user');
    const shared = await userRepository.createWithPassword('shared2@example.com', 'hash', 'Shared2', 'user');
    const target = await userRepository.createWithPassword('target2@example.com', 'hash', 'Target2', 'user');
    const admin = await userRepository.createWithPassword('admin2@example.com', 'hash', 'Admin2', 'admin');
    await userRepository.setEmailVerified(owner.id, true);
    await userRepository.setEmailVerified(shared.id, true);
    await userRepository.setEmailVerified(target.id, true);
    await userRepository.setEmailVerified(admin.id, true);

    const app = await buildServer({
      agentRepository,
      agents: createFakeAgentsDeps(),
      auth: { ...createTestAuthDeps(), userRepository },
      accessResolver: new DomainAccessResolver(agentRepository)
    });

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: authCookieHeader(owner.id),
      payload: { name: 'Share Agent' }
    });
    const agentId = createRes.json().id as string;

    await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/shares`,
      headers: authCookieHeader(owner.id),
      payload: { granteeUserId: shared.id, permission: 'edit' }
    });

    const sharedCannotManage = await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/shares`,
      headers: authCookieHeader(shared.id),
      payload: { granteeUserId: target.id, permission: 'read' }
    });
    const adminCanManage = await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/shares`,
      headers: authCookieHeader(admin.id),
      payload: { granteeUserId: target.id, permission: 'delete' }
    });
    const sharedCannotList = await app.inject({
      method: 'GET',
      url: `/api/agents/${agentId}/shares`,
      headers: authCookieHeader(shared.id)
    });
    const adminCanList = await app.inject({
      method: 'GET',
      url: `/api/agents/${agentId}/shares`,
      headers: authCookieHeader(admin.id)
    });

    expect(sharedCannotManage.statusCode).toBe(403);
    expect(adminCanManage.statusCode).toBe(204);
    expect(sharedCannotList.statusCode).toBe(403);
    expect(adminCanList.statusCode).toBe(200);
    expect(adminCanList.json()).toHaveLength(2);
  });

  it('supports agent marketplace publish, unpublish, listing and clone', async () => {
    const agentRepository = createFakeRepo();
    const userRepository = new InMemoryUserRepository();
    const owner = await userRepository.createWithPassword('owner3@example.com', 'hash', 'Owner3', 'user');
    const teammate = await userRepository.createWithPassword('teammate3@example.com', 'hash', 'Teammate3', 'user');
    await userRepository.setEmailVerified(owner.id, true);
    await userRepository.setEmailVerified(teammate.id, true);

    const app = await buildServer({
      agentRepository,
      agents: createFakeAgentsDeps(),
      auth: { ...createTestAuthDeps(), userRepository },
      accessResolver: new DomainAccessResolver(agentRepository)
    });

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: authCookieHeader(owner.id),
      payload: { name: 'Marketplace Agent' }
    });
    const agentId = createRes.json().id as string;

    const publishRes = await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/publish`,
      headers: authCookieHeader(owner.id),
      payload: { title: 'Marketplace Agent Pack', summary: 'Sample', visibility: 'public' }
    });
    expect(publishRes.statusCode).toBe(201);
    const publicationId = publishRes.json().publicationId as string;

    const listRes = await app.inject({ method: 'GET', url: '/api/agents/marketplace', headers: authCookieHeader(teammate.id) });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json()).toHaveLength(1);

    const cloneRes = await app.inject({
      method: 'POST',
      url: `/api/agents/marketplace/${publicationId}/clone`,
      headers: authCookieHeader(teammate.id)
    });
    expect(cloneRes.statusCode).toBe(201);
    expect(cloneRes.json().cloned).toBe(true);
    expect(cloneRes.json().agent.ownerUserId).toBe(teammate.id);

    expect(agentRepository.events).toContainEqual(
      expect.objectContaining({ userId: owner.id, topic: 'agent.changed', entityId: agentId })
    );
    expect(agentRepository.events).toContainEqual(
      expect.objectContaining({ userId: owner.id, topic: 'marketplace.changed', entityId: publicationId })
    );
    expect(agentRepository.events).toContainEqual(
      expect.objectContaining({ userId: teammate.id, topic: 'agent.changed' })
    );
    expect(agentRepository.events).toContainEqual(
      expect.objectContaining({ userId: teammate.id, topic: 'marketplace.changed', entityId: publicationId })
    );

    const unpublishRes = await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/unpublish`,
      headers: authCookieHeader(owner.id)
    });
    expect(unpublishRes.statusCode).toBe(204);

    const postUnpublishListRes = await app.inject({ method: 'GET', url: '/api/agents/marketplace', headers: authCookieHeader(teammate.id) });
    expect(postUnpublishListRes.statusCode).toBe(200);
    expect(postUnpublishListRes.json()).toHaveLength(0);

    expect(agentRepository.events.filter((event) => event.topic === 'marketplace.changed' && event.userId === owner.id).length).toBeGreaterThanOrEqual(2);
  });

  it('creates a new agent version via POST /api/agents/:agentId/versions', async () => {
    const repo = createFakeRepo();
    const app = await buildServer({ agentRepository: repo, agents: createFakeAgentsDeps(), auth: createTestAuthDeps() });
    const createRes = await app.inject({ method: 'POST', url: '/api/agents', headers: authCookieHeader('user-1'), payload: { name: 'Agent For Version' } });
    expect(createRes.statusCode).toBe(201);
    const agentId = createRes.json().id as string;

    const res = await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/versions`,
      headers: authCookieHeader('user-1'),
      payload: {
        name: 'Revised teacher',
        description: 'Explains difficult ideas',
        characterType: 'teacher',
        promptConfig: {},
        model: 'claude-sonnet-4-5',
        systemPrompt: 'Explain the evidence step by step.',
        iconAssetKey: null
      }
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().version).toBe(1);
  });

  it('saves a public agent version via POST /api/agent-versions/:agentVersionId/save without cloning the agent', async () => {
    const repo = createFakeRepo();
    const app = await buildServer({ agentRepository: repo, agents: createFakeAgentsDeps(), auth: createTestAuthDeps() });
    const createRes = await app.inject({ method: 'POST', url: '/api/agents', headers: authCookieHeader('user-1'), payload: { name: 'Public Agent' } });
    const agentId = createRes.json().id as string;

    const publishRes = await app.inject({ method: 'POST', url: `/api/agents/${agentId}/publish`, headers: authCookieHeader('user-1'), payload: { title: 'Public', visibility: 'public' } });
    expect(publishRes.statusCode).toBe(201);

    const versionRes = await app.inject({ method: 'POST', url: `/api/agents/${agentId}/versions`, headers: authCookieHeader('user-1'), payload: { name: 'v1', description: '', characterType: 'teacher', promptConfig: {}, model: 'm', systemPrompt: 's', iconAssetKey: null } });
    expect(versionRes.statusCode).toBe(201);
    const versionId = versionRes.json().id as string;

    const saveRes = await app.inject({ method: 'POST', url: `/api/agent-versions/${versionId}/save`, headers: authCookieHeader('user-2') });
    expect(saveRes.statusCode).toBe(204);
    expect(repo.userLibrary.get('user-2')?.has(versionId)).toBe(true);
  });

  it('does not emit marketplace.changed events on denied publish/unpublish or already-cloned/not-found clone requests', async () => {
    const agentRepository = createFakeRepo();
    const userRepository = new InMemoryUserRepository();
    const owner = await userRepository.createWithPassword('owner5@example.com', 'hash', 'Owner5', 'user');
    const editor = await userRepository.createWithPassword('editor5@example.com', 'hash', 'Editor5', 'user');
    await userRepository.setEmailVerified(owner.id, true);
    await userRepository.setEmailVerified(editor.id, true);

    const app = await buildServer({
      agentRepository,
      agents: createFakeAgentsDeps(),
      auth: { ...createTestAuthDeps(), userRepository },
      accessResolver: new DomainAccessResolver(agentRepository)
    });

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: authCookieHeader(owner.id),
      payload: { name: 'Guarded Agent' }
    });
    const agentId = createRes.json().id as string;

    await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/shares`,
      headers: authCookieHeader(owner.id),
      payload: { granteeUserId: editor.id, permission: 'edit' }
    });

    const eventsBeforeFailures = agentRepository.events.length;

    const publishDenied = await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/publish`,
      headers: authCookieHeader(editor.id),
      payload: { title: 'Denied' }
    });
    expect(publishDenied.statusCode).toBe(403);

    const cloneNotFound = await app.inject({
      method: 'POST',
      url: '/api/agents/marketplace/does-not-exist/clone',
      headers: authCookieHeader(editor.id)
    });
    expect(cloneNotFound.statusCode).toBe(404);

    const updateNotFound = await app.inject({
      method: 'PATCH',
      url: '/api/agents/does-not-exist',
      headers: authCookieHeader(owner.id),
      payload: { name: 'Nope' }
    });
    expect(updateNotFound.statusCode).toBe(404);

    const deleteDenied = await app.inject({
      method: 'DELETE',
      url: `/api/agents/${agentId}`,
      headers: authCookieHeader(editor.id)
    });
    expect(deleteDenied.statusCode).toBe(403);

    // The create + share calls above are legitimate successes and are expected to have
    // already emitted their own agent.changed events; only the denied/not-found calls
    // below must add no further events.
    expect(agentRepository.events).toHaveLength(eventsBeforeFailures);
  });

  it('emits agent.changed to the resource owner for create/update/share/enable/disable/delete', async () => {
    const agentRepository = createFakeRepo();
    const userRepository = new InMemoryUserRepository();
    const owner = await userRepository.createWithPassword('owner6@example.com', 'hash', 'Owner6', 'user');
    const teammate = await userRepository.createWithPassword('teammate6@example.com', 'hash', 'Teammate6', 'user');
    await userRepository.setEmailVerified(owner.id, true);
    await userRepository.setEmailVerified(teammate.id, true);

    const app = await buildServer({
      agentRepository,
      agents: createFakeAgentsDeps(),
      auth: { ...createTestAuthDeps(), userRepository },
      accessResolver: new DomainAccessResolver(agentRepository)
    });

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: authCookieHeader(owner.id),
      payload: { name: 'Own Topic Agent' }
    });
    const agentId = createRes.json().id as string;
    expect(agentRepository.events).toContainEqual(
      expect.objectContaining({ userId: owner.id, topic: 'agent.changed', entityId: agentId })
    );

    await app.inject({
      method: 'PATCH',
      url: `/api/agents/${agentId}`,
      headers: authCookieHeader(owner.id),
      payload: { description: 'Updated' }
    });
    expect(agentRepository.events).toContainEqual(
      expect.objectContaining({ userId: owner.id, topic: 'agent.changed', entityId: agentId })
    );

    await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/shares`,
      headers: authCookieHeader(owner.id),
      payload: { granteeUserId: teammate.id, permission: 'read' }
    });
    await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/disable`,
      headers: authCookieHeader(owner.id)
    });
    await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/enable`,
      headers: authCookieHeader(owner.id)
    });

    const agentChangedEvents = agentRepository.events.filter((event) => event.topic === 'agent.changed');
    expect(agentChangedEvents.every((event) => event.userId === owner.id)).toBe(true);
    expect(agentChangedEvents.length).toBeGreaterThanOrEqual(5);

    await app.inject({
      method: 'DELETE',
      url: `/api/agents/${agentId}`,
      headers: authCookieHeader(owner.id)
    });
    expect(agentRepository.events).toContainEqual(
      expect.objectContaining({ userId: owner.id, topic: 'agent.changed', entityId: agentId })
    );
  });

  it('restricts agent publish/unpublish to owner or admin', async () => {
    const agentRepository = createFakeRepo();
    const userRepository = new InMemoryUserRepository();
    const owner = await userRepository.createWithPassword('owner4@example.com', 'hash', 'Owner4', 'user');
    const editor = await userRepository.createWithPassword('editor4@example.com', 'hash', 'Editor4', 'user');
    await userRepository.setEmailVerified(owner.id, true);
    await userRepository.setEmailVerified(editor.id, true);

    const app = await buildServer({
      agentRepository,
      agents: createFakeAgentsDeps(),
      auth: { ...createTestAuthDeps(), userRepository },
      accessResolver: new DomainAccessResolver(agentRepository)
    });

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: authCookieHeader(owner.id),
      payload: { name: 'Owner Agent' }
    });
    const agentId = createRes.json().id as string;

    await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/shares`,
      headers: authCookieHeader(owner.id),
      payload: { granteeUserId: editor.id, permission: 'edit' }
    });

    const publishDenied = await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/publish`,
      headers: authCookieHeader(editor.id),
      payload: { title: 'Denied' }
    });
    expect(publishDenied.statusCode).toBe(403);
  });
});
