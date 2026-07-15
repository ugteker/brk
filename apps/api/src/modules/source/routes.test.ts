import { describe, expect, it } from 'vitest';
import { buildServer } from '../../server';
import { authCookieHeader, createTestAuthDeps } from '../../test-utils/auth';
import { InMemoryUserRepository } from '../auth/in-memory-user-repository';
import { DomainAccessResolver } from '../access/permissions';
import type { AccessRepositoryLike } from '../access/repository';
import type {
  CloneSourceResult,
  CreateSourceInput,
  MarketplaceSourceListItem,
  PublishSourceInput,
  ShareSourceInput,
  SourceRecord,
  UpdateSourceInput
} from './types';
import type { SourceRepositoryLike } from './repository';

class InMemorySourceRepository implements SourceRepositoryLike, AccessRepositoryLike {
  private readonly sources = new Map<string, SourceRecord>();
  private readonly grants = new Set<string>();
  private readonly publications = new Map<string, MarketplaceSourceListItem>();
  private nextSourceId = 1;
  private nextPublicationId = 1;

  async createSource(ownerUserId: string, input: CreateSourceInput): Promise<SourceRecord> {
    const source: SourceRecord = {
      id: `source-${this.nextSourceId++}`,
      ownerUserId,
      type: input.type,
      value: input.value,
      status: input.status ?? 'active',
      config: input.config ?? {},
      metadata: {
        title: input.metadata?.title,
        coverImageUrl: input.metadata?.coverImageUrl ?? null,
        previewItems: input.metadata?.previewItems ?? []
      },
      createdAt: new Date('2026-07-13T00:00:00.000Z'),
      updatedAt: new Date('2026-07-13T00:00:00.000Z')
    };
    this.sources.set(source.id, source);
    return source;
  }

  async listSources(ownerUserId?: string): Promise<SourceRecord[]> {
    return ownerUserId ? [...this.sources.values()].filter((source) => source.ownerUserId === ownerUserId) : [...this.sources.values()];
  }

  async getSource(sourceId: string): Promise<SourceRecord | null> {
    return this.sources.get(sourceId) ?? null;
  }

  async updateSource(sourceId: string, patch: UpdateSourceInput): Promise<SourceRecord> {
    const existing = this.sources.get(sourceId);
    if (!existing) {
      throw new Error('not_found');
    }
    const updated: SourceRecord = {
      ...existing,
      value: patch.value ?? existing.value,
      status: patch.status ?? existing.status,
      config: patch.config ?? existing.config,
      metadata: patch.metadata
        ? {
            title: patch.metadata.title,
            coverImageUrl: patch.metadata.coverImageUrl ?? null,
            previewItems: patch.metadata.previewItems ?? []
          }
        : existing.metadata,
      updatedAt: new Date('2026-07-13T01:00:00.000Z')
    };
    this.sources.set(sourceId, updated);
    return updated;
  }

  async deleteSource(sourceId: string): Promise<void> {
    if (!this.sources.has(sourceId)) {
      throw new Error('not_found');
    }
    this.sources.delete(sourceId);
  }

  async shareSource(sourceId: string, grantedByUserId: string, input: ShareSourceInput): Promise<void> {
    if (!this.sources.has(sourceId)) {
      throw new Error('not_found');
    }
    this.grants.add(`${input.granteeUserId}:${sourceId}:${input.permission}`);
    this.grants.add(`${input.granteeUserId}:${sourceId}:*`);
    this.grants.add(`${grantedByUserId}:${sourceId}:*`);
  }

  async publishSource(sourceId: string, publisherUserId: string, input: PublishSourceInput): Promise<MarketplaceSourceListItem> {
    const source = this.sources.get(sourceId);
    if (!source) {
      throw new Error('not_found');
    }
    const publication: MarketplaceSourceListItem = {
      publicationId: `publication-${this.nextPublicationId++}`,
      sourceId: source.id,
      publisherUserId,
      type: source.type,
      value: source.value,
      title: input.title,
      summary: input.summary ?? '',
      visibility: input.visibility ?? 'public',
      publishedAt: new Date('2026-07-13T01:30:00.000Z'),
      metadata: source.metadata
    };
    this.publications.set(publication.publicationId, publication);
    return publication;
  }

  async listMarketplaceSources(): Promise<MarketplaceSourceListItem[]> {
    return [...this.publications.values()].filter((publication) => publication.visibility === 'public');
  }

  async cloneFromMarketplace(publicationId: string, targetOwnerUserId: string): Promise<CloneSourceResult> {
    const publication = this.publications.get(publicationId);
    if (!publication) {
      throw new Error('not_found');
    }
    const existing = [...this.sources.values()].find(
      (source) => source.ownerUserId === targetOwnerUserId && source.type === publication.type && source.value === publication.value
    );
    if (existing) {
      return { source: existing, cloned: false };
    }
    const cloned = await this.createSource(targetOwnerUserId, {
      type: publication.type,
      value: publication.value,
      metadata: publication.metadata
    });
    return { source: cloned, cloned: true };
  }

  async unpublishSource(sourceId: string): Promise<void> {
    const publication = [...this.publications.values()].find((row) => row.sourceId === sourceId && row.visibility === 'public');
    if (!publication) throw new Error('not_found');
    this.publications.set(publication.publicationId, { ...publication, visibility: 'private' });
  }

  async findOwnerUserId(_resourceType: 'agent' | 'source' | 'playbook', resourceId: string): Promise<string | null> {
    return this.sources.get(resourceId)?.ownerUserId ?? null;
  }

  async hasGrant(input: { granteeUserId: string; resourceType: 'agent' | 'source' | 'playbook'; resourceId: string; permission: string }): Promise<boolean> {
    return this.grants.has(`${input.granteeUserId}:${input.resourceId}:${input.permission}`) || this.grants.has(`${input.granteeUserId}:${input.resourceId}:*`);
  }

  async isPubliclyPublished(_resourceType: 'agent' | 'source' | 'playbook', resourceId: string): Promise<boolean> {
    return [...this.publications.values()].some((publication) => publication.sourceId === resourceId && publication.visibility === 'public');
  }
}

function createFakeAgentRepo() {
  return {
    async createAgent() {
      throw new Error('not_implemented');
    },
    async updateAgent() {
      throw new Error('not_implemented');
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
      throw new Error('not_implemented');
    },
    async unpublishAgent() {
      throw new Error('not_implemented');
    },
    async listMarketplaceAgents() {
      return [];
    },
    async cloneFromMarketplace() {
      throw new Error('not_implemented');
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

describe('source routes', () => {
  it('supports owner-scoped CRUD with library-card metadata fields', async () => {
    const sourceRepo = new InMemorySourceRepository();
    const app = await buildServer({
      agentRepository: createFakeAgentRepo(),
      agents: createFakePromptDeps(),
      auth: createTestAuthDeps(),
      source: { sourceRepository: sourceRepo, accessResolver: new DomainAccessResolver(sourceRepo) }
    });

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/sources',
      headers: authCookieHeader(),
      payload: {
        type: 'podcast_feeds',
        value: 'https://example.com/feed.xml',
        metadata: {
          title: 'Market Pulse',
          coverImageUrl: null,
          previewItems: [{ title: 'Episode 1', link: 'https://example.com/ep-1', pubDate: '2026-07-01T00:00:00.000Z' }]
        }
      }
    });

    expect(createRes.statusCode).toBe(201);
    const created = createRes.json<SourceRecord>();
    expect(created.metadata.title).toBe('Market Pulse');
    expect(created.metadata.coverImageUrl).toBeNull();
    expect(created.metadata.previewItems).toHaveLength(1);

    const listRes = await app.inject({ method: 'GET', url: '/api/sources', headers: authCookieHeader() });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json<SourceRecord[]>()).toHaveLength(1);

    const updateRes = await app.inject({
      method: 'PATCH',
      url: `/api/sources/${created.id}`,
      headers: authCookieHeader(),
      payload: { value: 'https://example.com/new-feed.xml' }
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json<SourceRecord>().value).toBe('https://example.com/new-feed.xml');

    const deleteRes = await app.inject({ method: 'DELETE', url: `/api/sources/${created.id}`, headers: authCookieHeader() });
    expect(deleteRes.statusCode).toBe(204);
  });

  it('enforces ownership for non-admin users and allows admins to access all sources', async () => {
    const sourceRepo = new InMemorySourceRepository();
    const userRepository = new InMemoryUserRepository();
    const owner = await userRepository.createWithPassword('owner@example.com', 'hash', 'Owner', 'user');
    const other = await userRepository.createWithPassword('other@example.com', 'hash', 'Other', 'user');
    const admin = await userRepository.createWithPassword('admin@example.com', 'hash', 'Admin', 'admin');
    await userRepository.setEmailVerified(owner.id, true);
    await userRepository.setEmailVerified(other.id, true);
    await userRepository.setEmailVerified(admin.id, true);

    const source = await sourceRepo.createSource(owner.id, { type: 'web_urls', value: 'https://example.com' });

    const app = await buildServer({
      agentRepository: createFakeAgentRepo(),
      agents: createFakePromptDeps(),
      auth: { ...createTestAuthDeps(), userRepository },
      source: { sourceRepository: sourceRepo, accessResolver: new DomainAccessResolver(sourceRepo) }
    });

    const forbidden = await app.inject({
      method: 'GET',
      url: `/api/sources/${source.id}`,
      headers: authCookieHeader(other.id)
    });
    expect(forbidden.statusCode).toBe(403);

    const adminList = await app.inject({
      method: 'GET',
      url: '/api/sources',
      headers: authCookieHeader(admin.id)
    });
    expect(adminList.statusCode).toBe(200);
    expect(adminList.json<SourceRecord[]>()).toHaveLength(1);
  });

  it('supports share, publish, marketplace listing and clone behavior', async () => {
    const sourceRepo = new InMemorySourceRepository();
    const userRepository = new InMemoryUserRepository();
    const owner = await userRepository.createWithPassword('owner@example.com', 'hash', 'Owner', 'user');
    const teammate = await userRepository.createWithPassword('teammate@example.com', 'hash', 'Teammate', 'user');
    await userRepository.setEmailVerified(owner.id, true);
    await userRepository.setEmailVerified(teammate.id, true);

    const app = await buildServer({
      agentRepository: createFakeAgentRepo(),
      agents: createFakePromptDeps(),
      auth: { ...createTestAuthDeps(), userRepository },
      source: { sourceRepository: sourceRepo, accessResolver: new DomainAccessResolver(sourceRepo) }
    });

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/sources',
      headers: authCookieHeader(owner.id),
      payload: { type: 'youtube_videos', value: 'https://www.youtube.com/@markets', metadata: { title: 'Markets Channel' } }
    });
    const source = createRes.json<SourceRecord>();

    const shareRes = await app.inject({
      method: 'POST',
      url: `/api/sources/${source.id}/share`,
      headers: authCookieHeader(owner.id),
      payload: { granteeUserId: teammate.id, permission: 'read' } satisfies ShareSourceInput
    });
    expect(shareRes.statusCode).toBe(204);

    const teammateRead = await app.inject({
      method: 'GET',
      url: `/api/sources/${source.id}`,
      headers: authCookieHeader(teammate.id)
    });
    expect(teammateRead.statusCode).toBe(200);

    const publishRes = await app.inject({
      method: 'POST',
      url: `/api/sources/${source.id}/publish`,
      headers: authCookieHeader(owner.id),
      payload: { title: 'Markets Source Pack', summary: 'Curated source', visibility: 'public' } satisfies PublishSourceInput
    });
    expect(publishRes.statusCode).toBe(201);
    const publication = publishRes.json<MarketplaceSourceListItem>();

    const marketplaceRes = await app.inject({ method: 'GET', url: '/api/sources/marketplace', headers: authCookieHeader(teammate.id) });
    expect(marketplaceRes.statusCode).toBe(200);
    expect(marketplaceRes.json<MarketplaceSourceListItem[]>()).toHaveLength(1);

    const cloneRes = await app.inject({
      method: 'POST',
      url: `/api/sources/marketplace/${publication.publicationId}/clone`,
      headers: authCookieHeader(teammate.id)
    });
    expect(cloneRes.statusCode).toBe(201);
    const cloneBody = cloneRes.json<CloneSourceResult>();
    expect(cloneBody.cloned).toBe(true);
    expect(cloneBody.source.ownerUserId).toBe(teammate.id);
  });

  it('supports unpublish for source marketplace publications', async () => {
    const sourceRepo = new InMemorySourceRepository();
    const app = await buildServer({
      agentRepository: createFakeAgentRepo(),
      agents: createFakePromptDeps(),
      auth: createTestAuthDeps(),
      source: { sourceRepository: sourceRepo, accessResolver: new DomainAccessResolver(sourceRepo) }
    });

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/sources',
      headers: authCookieHeader('owner-1'),
      payload: { type: 'web_urls', value: 'https://example.com/unpublish' }
    });
    const source = createRes.json<SourceRecord>();

    const publishRes = await app.inject({
      method: 'POST',
      url: `/api/sources/${source.id}/publish`,
      headers: authCookieHeader('owner-1'),
      payload: { title: 'Unpublishable source', visibility: 'public' } satisfies PublishSourceInput
    });
    expect(publishRes.statusCode).toBe(201);

    const unpublishRes = await app.inject({
      method: 'POST',
      url: `/api/sources/${source.id}/unpublish`,
      headers: authCookieHeader('owner-1')
    });
    expect(unpublishRes.statusCode).toBe(204);

    const marketplaceRes = await app.inject({ method: 'GET', url: '/api/sources/marketplace', headers: authCookieHeader('owner-1') });
    expect(marketplaceRes.statusCode).toBe(200);
    expect(marketplaceRes.json<MarketplaceSourceListItem[]>()).toHaveLength(0);
  });

  it('restricts source publish/unpublish to owner or admin', async () => {
    const sourceRepo = new InMemorySourceRepository();
    const userRepository = new InMemoryUserRepository();
    const owner = await userRepository.createWithPassword('owner-source@example.com', 'hash', 'Owner', 'user');
    const editor = await userRepository.createWithPassword('editor-source@example.com', 'hash', 'Editor', 'user');
    await userRepository.setEmailVerified(owner.id, true);
    await userRepository.setEmailVerified(editor.id, true);

    const app = await buildServer({
      agentRepository: createFakeAgentRepo(),
      agents: createFakePromptDeps(),
      auth: { ...createTestAuthDeps(), userRepository },
      source: { sourceRepository: sourceRepo, accessResolver: new DomainAccessResolver(sourceRepo) }
    });

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/sources',
      headers: authCookieHeader(owner.id),
      payload: { type: 'web_urls', value: 'https://example.com/private' }
    });
    const source = createRes.json<SourceRecord>();

    const shareRes = await app.inject({
      method: 'POST',
      url: `/api/sources/${source.id}/share`,
      headers: authCookieHeader(owner.id),
      payload: { granteeUserId: editor.id, permission: 'update' }
    });
    expect(shareRes.statusCode).toBe(204);

    const publishDenied = await app.inject({
      method: 'POST',
      url: `/api/sources/${source.id}/publish`,
      headers: authCookieHeader(editor.id),
      payload: { title: 'No access' }
    });
    expect(publishDenied.statusCode).toBe(403);
  });

  it('reuses probe metadata contract for source probing', async () => {
    const sourceRepo = new InMemorySourceRepository();
    const app = await buildServer({
      agentRepository: createFakeAgentRepo(),
      agents: createFakePromptDeps(),
      auth: createTestAuthDeps(),
      source: {
        sourceRepository: sourceRepo,
        accessResolver: new DomainAccessResolver(sourceRepo),
        sourceProbe: {
          probeSource: async () => ({
            reachable: true,
            kind: 'feed',
            title: 'Smart Probe Title',
            coverImageUrl: 'https://cdn.example.com/cover.png',
            previewItems: [{ title: 'Episode 1', link: 'https://example.com/ep-1', pubDate: null }]
          })
        }
      }
    });

    const probeRes = await app.inject({
      method: 'POST',
      url: '/api/sources/probe',
      headers: authCookieHeader(),
      payload: { type: 'podcast_feeds', value: 'https://example.com/feed.xml', maxItems: 5 }
    });

    expect(probeRes.statusCode).toBe(200);
    expect(probeRes.json()).toMatchObject({
      title: 'Smart Probe Title',
      coverImageUrl: 'https://cdn.example.com/cover.png'
    });
  });
});
