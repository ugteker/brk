import { describe, expect, it, vi } from 'vitest';
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
import type { SourceRoutesDeps } from './routes';
import { CURATED_SOURCES } from './curated-sources';

class InMemorySourceRepository implements SourceRepositoryLike, AccessRepositoryLike {
  private readonly sources = new Map<string, SourceRecord>();
  private readonly grants = new Set<string>();
  private readonly publications = new Map<string, MarketplaceSourceListItem>();
  private nextSourceId = 1;
  private nextPublicationId = 1;
  readonly events: Array<{ userId: string; topic: string; entityId?: string }> = [];

  private emit(userId: string, topic: string, entityId?: string) {
    this.events.push({ userId, topic, entityId });
  }

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
    this.emit(ownerUserId, 'source.changed', source.id);
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
    this.emit(updated.ownerUserId, 'source.changed', sourceId);
    return updated;
  }

  async deleteSource(sourceId: string): Promise<void> {
    const existing = this.sources.get(sourceId);
    if (!existing) {
      throw new Error('not_found');
    }
    this.sources.delete(sourceId);
    this.emit(existing.ownerUserId, 'source.changed', sourceId);
  }

  async shareSource(sourceId: string, grantedByUserId: string, input: ShareSourceInput): Promise<void> {
    const existing = this.sources.get(sourceId);
    if (!existing) {
      throw new Error('not_found');
    }
    this.grants.add(`${input.granteeUserId}:${sourceId}:${input.permission}`);
    this.grants.add(`${input.granteeUserId}:${sourceId}:*`);
    this.grants.add(`${grantedByUserId}:${sourceId}:*`);
    this.emit(existing.ownerUserId, 'source.changed', sourceId);
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
    this.emit(source.ownerUserId, 'source.changed', sourceId);
    this.emit(source.ownerUserId, 'marketplace.changed', publication.publicationId);
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
    this.emit(targetOwnerUserId, 'marketplace.changed', publicationId);
    return { source: cloned, cloned: true };
  }

  async unpublishSource(sourceId: string): Promise<void> {
    const publication = [...this.publications.values()].find((row) => row.sourceId === sourceId && row.visibility === 'public');
    if (!publication) throw new Error('not_found');
    this.publications.set(publication.publicationId, { ...publication, visibility: 'private' });
    const source = this.sources.get(sourceId);
    if (source) {
      this.emit(source.ownerUserId, 'source.changed', sourceId);
      this.emit(source.ownerUserId, 'marketplace.changed', publication.publicationId);
    }
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

  it('adds source-scoped report counts to the library list', async () => {
    const sourceRepo = new InMemorySourceRepository();
    const countReportsForSourceValues = vi.fn(async () => ({
      'https://example.com/feed-a.xml': 2
    }));
    const app = await buildServer({
      agentRepository: createFakeAgentRepo(),
      agents: createFakePromptDeps(),
      auth: createTestAuthDeps(),
      source: {
        sourceRepository: sourceRepo,
        accessResolver: new DomainAccessResolver(sourceRepo),
        reportRepository: { listReportsForSource: vi.fn(async () => []), countReportsForSourceValues } as never
      }
    });

    const createA = await app.inject({
      method: 'POST',
      url: '/api/sources',
      headers: authCookieHeader(),
      payload: { type: 'podcast_feeds', value: 'https://example.com/feed-a.xml' }
    });
    const sourceA = createA.json<SourceRecord>();
    const createB = await app.inject({
      method: 'POST',
      url: '/api/sources',
      headers: authCookieHeader(),
      payload: { type: 'podcast_feeds', value: 'https://example.com/feed-b.xml' }
    });
    const sourceB = createB.json<SourceRecord>();

    const response = await app.inject({ method: 'GET', url: '/api/sources', headers: authCookieHeader() });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: sourceA.id, reportCount: 2 }),
      expect.objectContaining({ id: sourceB.id, reportCount: 0 })
    ]));
    expect(countReportsForSourceValues).toHaveBeenCalledWith([sourceA.value, sourceB.value]);
  });

  it('defaults every source report count to zero when no reportRepository is configured', async () => {
    const sourceRepo = new InMemorySourceRepository();
    const app = await buildServer({
      agentRepository: createFakeAgentRepo(),
      agents: createFakePromptDeps(),
      auth: createTestAuthDeps(),
      source: { sourceRepository: sourceRepo, accessResolver: new DomainAccessResolver(sourceRepo) }
    });

    await app.inject({
      method: 'POST',
      url: '/api/sources',
      headers: authCookieHeader(),
      payload: { type: 'web_urls', value: 'https://example.com' }
    });

    const response = await app.inject({ method: 'GET', url: '/api/sources', headers: authCookieHeader() });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([expect.objectContaining({ reportCount: 0 })]);
  });

  it('lists only reports whose runs actually reference the source (source-scoped, not agent-scoped)', async () => {
    const sourceRepo = new InMemorySourceRepository();
    const listReportsForSource = vi.fn(async (sourceValue: string) =>
      sourceValue === 'https://example.com/feed.xml'
        ? [{ id: 'report-1', agentId: 'agent-1', summary: 'about this source' }]
        : []
    );
    const app = await buildServer({
      agentRepository: createFakeAgentRepo(),
      agents: createFakePromptDeps(),
      auth: createTestAuthDeps(),
      source: {
        sourceRepository: sourceRepo,
        accessResolver: new DomainAccessResolver(sourceRepo),
        reportRepository: { listReportsForSource, countReportsForSourceValues: vi.fn(async () => ({})) } as never
      }
    });

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/sources',
      headers: authCookieHeader(),
      payload: { type: 'podcast_feeds', value: 'https://example.com/feed.xml' }
    });
    const source = createRes.json<SourceRecord>();

    const res = await app.inject({
      method: 'GET',
      url: `/api/sources/${source.id}/reports`,
      headers: authCookieHeader()
    });

    expect(res.statusCode).toBe(200);
    expect(listReportsForSource).toHaveBeenCalledWith('https://example.com/feed.xml');
    const body = res.json<Array<{ id: string }>>();
    expect(body).toHaveLength(1);
    expect(body[0]?.id).toBe('report-1');
  });

  it('denies source-scoped report listing to users without access to the source', async () => {
    const sourceRepo = new InMemorySourceRepository();
    const userRepository = new InMemoryUserRepository();
    const owner = await userRepository.createWithPassword('owner@example.com', 'hash', 'Owner', 'user');
    const other = await userRepository.createWithPassword('other@example.com', 'hash', 'Other', 'user');
    await userRepository.setEmailVerified(owner.id, true);
    await userRepository.setEmailVerified(other.id, true);
    const source = await sourceRepo.createSource(owner.id, { type: 'web_urls', value: 'https://example.com' });

    const listReportsForSource = vi.fn(async () => []);
    const app = await buildServer({
      agentRepository: createFakeAgentRepo(),
      agents: createFakePromptDeps(),
      auth: { ...createTestAuthDeps(), userRepository },
      source: {
        sourceRepository: sourceRepo,
        accessResolver: new DomainAccessResolver(sourceRepo),
        reportRepository: { listReportsForSource, countReportsForSourceValues: vi.fn(async () => ({})) } as never
      }
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/sources/${source.id}/reports`,
      headers: authCookieHeader(other.id)
    });

    expect(res.statusCode).toBe(403);
    expect(listReportsForSource).not.toHaveBeenCalled();
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

    expect(sourceRepo.events).toContainEqual(expect.objectContaining({ userId: owner.id, topic: 'source.changed' }));
    expect(sourceRepo.events).toContainEqual(expect.objectContaining({ userId: teammate.id, topic: 'source.changed' }));
    expect(sourceRepo.events).toContainEqual(expect.objectContaining({ userId: owner.id, topic: 'marketplace.changed' }));
    expect(sourceRepo.events).toContainEqual(expect.objectContaining({ userId: teammate.id, topic: 'marketplace.changed' }));
  });

  it('emits source.changed for a newly created source owner', async () => {
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
      payload: { type: 'podcast_feeds', value: 'https://example.com/feed.xml' }
    });
    expect(createRes.statusCode).toBe(201);

    expect(sourceRepo.events).toContainEqual(
      expect.objectContaining({ userId: 'test-user', topic: 'source.changed' })
    );
  });

  it('emits source.changed and marketplace.changed after a successful marketplace clone', async () => {
    const sourceRepo = new InMemorySourceRepository();
    const userRepository = new InMemoryUserRepository();
    const owner = await userRepository.createWithPassword('owner2@example.com', 'hash', 'Owner', 'user');
    const requester = await userRepository.createWithPassword('requester@example.com', 'hash', 'Requester', 'user');
    await userRepository.setEmailVerified(owner.id, true);
    await userRepository.setEmailVerified(requester.id, true);

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
      payload: { type: 'youtube_videos', value: 'https://www.youtube.com/@clonable', metadata: { title: 'Clonable Channel' } }
    });
    const source = createRes.json<SourceRecord>();

    const publishRes = await app.inject({
      method: 'POST',
      url: `/api/sources/${source.id}/publish`,
      headers: authCookieHeader(owner.id),
      payload: { title: 'Clonable Pack', summary: 'Clonable', visibility: 'public' } satisfies PublishSourceInput
    });
    const publication = publishRes.json<MarketplaceSourceListItem>();

    sourceRepo.events.length = 0;

    const cloneRes = await app.inject({
      method: 'POST',
      url: `/api/sources/marketplace/${publication.publicationId}/clone`,
      headers: authCookieHeader(requester.id)
    });
    expect(cloneRes.statusCode).toBe(201);
    expect(cloneRes.json<CloneSourceResult>().cloned).toBe(true);

    expect(sourceRepo.events).toContainEqual(
      expect.objectContaining({ userId: requester.id, topic: 'source.changed' })
    );
    expect(sourceRepo.events).toContainEqual(
      expect.objectContaining({ userId: requester.id, topic: 'marketplace.changed' })
    );
    expect(sourceRepo.events.every((event) => event.userId === requester.id)).toBe(true);
  });

  it('does not emit realtime events for failed, denied, not-found or already-cloned requests', async () => {
    const sourceRepo = new InMemorySourceRepository();
    const userRepository = new InMemoryUserRepository();
    const owner = await userRepository.createWithPassword('owner3@example.com', 'hash', 'Owner', 'user');
    const other = await userRepository.createWithPassword('other3@example.com', 'hash', 'Other', 'user');
    await userRepository.setEmailVerified(owner.id, true);
    await userRepository.setEmailVerified(other.id, true);

    const source = await sourceRepo.createSource(owner.id, { type: 'web_urls', value: 'https://example.com' });
    sourceRepo.events.length = 0;

    const app = await buildServer({
      agentRepository: createFakeAgentRepo(),
      agents: createFakePromptDeps(),
      auth: { ...createTestAuthDeps(), userRepository },
      source: { sourceRepository: sourceRepo, accessResolver: new DomainAccessResolver(sourceRepo) }
    });

    const denied = await app.inject({
      method: 'PATCH',
      url: `/api/sources/${source.id}`,
      headers: authCookieHeader(other.id),
      payload: { value: 'https://example.com/blocked.xml' }
    });
    expect(denied.statusCode).toBe(403);

    const notFound = await app.inject({
      method: 'DELETE',
      url: '/api/sources/does-not-exist',
      headers: authCookieHeader(owner.id)
    });
    expect(notFound.statusCode).toBe(404);

    const cloneNotFound = await app.inject({
      method: 'POST',
      url: '/api/sources/marketplace/does-not-exist/clone',
      headers: authCookieHeader(other.id)
    });
    expect(cloneNotFound.statusCode).toBe(404);

    expect(sourceRepo.events).toHaveLength(0);
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

describe('source search route', () => {
  async function buildAppWithSearch(sourceRepo: InMemorySourceRepository, sourceSearch?: SourceRoutesDeps['sourceSearch']) {
    return buildServer({
      agentRepository: createFakeAgentRepo(),
      agents: createFakePromptDeps(),
      auth: createTestAuthDeps(),
      source: { sourceRepository: sourceRepo, accessResolver: new DomainAccessResolver(sourceRepo), sourceSearch }
    });
  }

  it('returns mapped results and warnings from the search service', async () => {
    const searchSources = vi.fn(async () => ({
      results: [
        { type: 'podcast_feeds' as const, value: 'https://example.com/feed.xml', title: 'Market Pulse', author: 'Jane', coverImageUrl: null },
        { type: 'youtube_videos' as const, value: 'https://www.youtube.com/channel/UC1', title: 'Finance TV', coverImageUrl: 'https://img.example.com/c.jpg' }
      ],
      warnings: ['youtube_search_failed']
    }));
    const app = await buildAppWithSearch(new InMemorySourceRepository(), { searchSources });

    const res = await app.inject({ method: 'GET', url: '/api/sources/search?q=market', headers: authCookieHeader() });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      results: [{ title: 'Market Pulse' }, { title: 'Finance TV' }],
      warnings: ['youtube_search_failed']
    });
    expect(searchSources).toHaveBeenCalledWith('market');
  });

  it('rejects an empty query with 400', async () => {
    const app = await buildAppWithSearch(new InMemorySourceRepository(), { searchSources: async () => ({ results: [], warnings: [] }) });

    const missing = await app.inject({ method: 'GET', url: '/api/sources/search', headers: authCookieHeader() });
    expect(missing.statusCode).toBe(400);

    const blank = await app.inject({ method: 'GET', url: '/api/sources/search?q=%20%20', headers: authCookieHeader() });
    expect(blank.statusCode).toBe(400);
  });

  it('returns 503 when no search service is configured', async () => {
    const app = await buildAppWithSearch(new InMemorySourceRepository());

    const res = await app.inject({ method: 'GET', url: '/api/sources/search?q=market', headers: authCookieHeader() });
    expect(res.statusCode).toBe(503);
  });

  it('requires authentication', async () => {
    const app = await buildAppWithSearch(new InMemorySourceRepository(), { searchSources: async () => ({ results: [], warnings: [] }) });

    const res = await app.inject({ method: 'GET', url: '/api/sources/search?q=market' });
    expect(res.statusCode).toBe(401);
  });
});

describe('source suggestions route', () => {
  async function buildApp(sourceRepo: InMemorySourceRepository) {
    return buildServer({
      agentRepository: createFakeAgentRepo(),
      agents: createFakePromptDeps(),
      auth: createTestAuthDeps(),
      source: { sourceRepository: sourceRepo, accessResolver: new DomainAccessResolver(sourceRepo) }
    });
  }

  it('lists marketplace publications first, then curated fallback entries, deduped by value', async () => {
    const sourceRepo = new InMemorySourceRepository();
    // Publish a marketplace source that shadows a curated entry by value
    const curatedShadowValue = CURATED_SOURCES[0].value;
    const publisherSource = await sourceRepo.createSource('publisher-1', { type: CURATED_SOURCES[0].type, value: curatedShadowValue });
    await sourceRepo.publishSource(publisherSource.id, 'publisher-1', { title: 'Marketplace Wins', visibility: 'public' });

    const app = await buildApp(sourceRepo);
    const res = await app.inject({ method: 'GET', url: '/api/sources/suggestions', headers: authCookieHeader('user-1') });

    expect(res.statusCode).toBe(200);
    const suggestions = res.json<Array<{ value: string; title: string; origin: string }>>();
    // Marketplace entry comes first and wins the dedupe against the curated entry with the same value
    expect(suggestions[0]).toMatchObject({ value: curatedShadowValue, title: 'Marketplace Wins', origin: 'marketplace' });
    expect(suggestions.filter((item) => item.value === curatedShadowValue)).toHaveLength(1);
    // Remaining curated entries are appended
    expect(suggestions.filter((item) => item.origin === 'curated')).toHaveLength(CURATED_SOURCES.length - 1);
  });

  it('falls back to the curated list when the marketplace is empty', async () => {
    const app = await buildApp(new InMemorySourceRepository());

    const res = await app.inject({ method: 'GET', url: '/api/sources/suggestions', headers: authCookieHeader('user-1') });

    expect(res.statusCode).toBe(200);
    const suggestions = res.json<Array<{ value: string; origin: string }>>();
    expect(suggestions).toHaveLength(CURATED_SOURCES.length);
    expect(suggestions.every((item) => item.origin === 'curated')).toBe(true);
  });

  it('marks sources the user already follows as followed instead of hiding them', async () => {
    const sourceRepo = new InMemorySourceRepository();
    await sourceRepo.createSource('user-1', { type: CURATED_SOURCES[0].type, value: CURATED_SOURCES[0].value });

    const app = await buildApp(sourceRepo);
    const res = await app.inject({ method: 'GET', url: '/api/sources/suggestions', headers: authCookieHeader('user-1') });

    expect(res.statusCode).toBe(200);
    const suggestions = res.json<Array<{ value: string; followed: boolean }>>();
    expect(suggestions).toHaveLength(CURATED_SOURCES.length);
    const followedEntry = suggestions.find((item) => item.value === CURATED_SOURCES[0].value);
    expect(followedEntry).toMatchObject({ followed: true });
    expect(suggestions.filter((item) => item.followed)).toHaveLength(1);

    // A different user sees the full curated list with nothing marked as followed
    const otherRes = await app.inject({ method: 'GET', url: '/api/sources/suggestions', headers: authCookieHeader('user-2') });
    const otherSuggestions = otherRes.json<Array<{ followed: boolean }>>();
    expect(otherSuggestions).toHaveLength(CURATED_SOURCES.length);
    expect(otherSuggestions.every((item) => item.followed === false)).toBe(true);
  });
});
