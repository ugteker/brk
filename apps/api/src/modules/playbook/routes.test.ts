import { describe, expect, it } from 'vitest';
import { buildServer } from '../../server';
import { authCookieHeader, createTestAuthDeps } from '../../test-utils/auth';
import { InMemoryUserRepository } from '../auth/in-memory-user-repository';
import { DomainAccessResolver } from '../access/permissions';

interface PlaybookRecord {
  id: string;
  ownerUserId: string;
  agentId: string;
  agentVersionId: string | null;
  name: string;
  description: string;
  enabled: boolean;
  mode: 'manual' | 'interval' | 'daily' | 'weekly';
  intervalMinutes: number | null;
  dailyTime: string | null;
  timezone: string | null;
  daysOfWeek: number[];
  sourceIds: string[];
  recipients: string[];
  executionMode: 'latest_only' | 'all_sources';
  maxSourcesPerRun: number;
  maxItemsPerSource: number;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MarketplacePlaybookItem {
  publicationId: string;
  playbookId: string;
  publisherUserId: string;
  title: string;
  summary: string;
  visibility: 'public' | 'private';
  publishedAt: Date;
  playbook: PlaybookRecord;
}

interface ClonePlaybookResult {
  playbook: PlaybookRecord;
  cloned: boolean;
}

class InMemoryPlaybookRepository {
  private readonly playbooks = new Map<string, PlaybookRecord>();
  private readonly grants = new Set<string>();
  private readonly publications = new Map<string, MarketplacePlaybookItem>();
  private nextPlaybookId = 1;
  private nextPublicationId = 1;
  readonly events: Array<{ userId: string; topic: string; entityId?: string }> = [];

  async createPlaybook(ownerUserId: string, input: any): Promise<PlaybookRecord> {
    const created: PlaybookRecord = {
      id: `playbook-${this.nextPlaybookId++}`,
      ownerUserId,
      agentId: input.agentId,
      agentVersionId: input.agentVersionId ?? null,
      name: input.name,
      description: input.description ?? '',
      enabled: input.enabled ?? true,
      mode: input.schedule?.mode ?? 'interval',
      intervalMinutes: input.schedule?.mode === 'interval' ? input.schedule.intervalMinutes : input.intervalMinutes ?? 60,
      dailyTime: input.schedule?.mode === 'daily' || input.schedule?.mode === 'weekly' ? input.schedule.dailyTime : input.dailyTime ?? null,
      timezone: input.schedule?.mode === 'daily' || input.schedule?.mode === 'weekly' ? input.schedule.timezone : input.timezone ?? null,
      daysOfWeek: input.schedule?.mode === 'weekly' ? input.schedule.daysOfWeek : input.daysOfWeek ?? [],
      sourceIds: input.sourceIds ?? [],
      recipients: input.recipients ?? [],
      executionMode: input.executionMode ?? 'latest_only',
      maxSourcesPerRun: input.maxSourcesPerRun ?? 3,
      maxItemsPerSource: input.maxItemsPerSource ?? 1,
      nextRunAt: input.schedule?.mode === 'manual' ? null : new Date('2026-07-14T08:00:00.000Z'),
      lastRunAt: null,
      createdAt: new Date('2026-07-13T00:00:00.000Z'),
      updatedAt: new Date('2026-07-13T00:00:00.000Z')
    };
    this.playbooks.set(created.id, created);
    this.events.push({ userId: ownerUserId, topic: 'playbook.changed', entityId: created.id });
    return created;
  }

  async listPlaybooks(ownerUserId?: string): Promise<PlaybookRecord[]> {
    return ownerUserId ? [...this.playbooks.values()].filter((p) => p.ownerUserId === ownerUserId) : [...this.playbooks.values()];
  }

  async getPlaybook(playbookId: string): Promise<PlaybookRecord | null> {
    return this.playbooks.get(playbookId) ?? null;
  }

  async updatePlaybook(playbookId: string, patch: any): Promise<PlaybookRecord> {
    const existing = this.playbooks.get(playbookId);
    if (!existing) throw new Error('not_found');
    const updated: PlaybookRecord = {
      ...existing,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.sourceIds !== undefined ? { sourceIds: patch.sourceIds } : {}),
      updatedAt: new Date('2026-07-13T01:00:00.000Z')
    };
    this.playbooks.set(playbookId, updated);
    this.events.push({ userId: updated.ownerUserId, topic: 'playbook.changed', entityId: playbookId });
    return updated;
  }

  async deletePlaybook(playbookId: string): Promise<void> {
    const existing = this.playbooks.get(playbookId);
    if (!existing) throw new Error('not_found');
    this.playbooks.delete(playbookId);
    this.events.push({ userId: existing.ownerUserId, topic: 'playbook.changed', entityId: playbookId });
  }

  async markExecuted(playbookId: string): Promise<void> {
    const existing = this.playbooks.get(playbookId);
    if (!existing) throw new Error('not_found');
    this.playbooks.set(playbookId, {
      ...existing,
      lastRunAt: new Date('2026-07-13T06:00:00.000Z'),
      nextRunAt: new Date('2026-07-13T07:00:00.000Z')
    });
  }

  async sharePlaybook(playbookId: string, grantedByUserId: string, input: any): Promise<void> {
    const existing = this.playbooks.get(playbookId);
    if (!existing) throw new Error('not_found');
    this.grants.add(`${input.granteeUserId}:${playbookId}:${input.permission}`);
    this.grants.add(`${grantedByUserId}:${playbookId}:*`);
    this.events.push({ userId: existing.ownerUserId, topic: 'playbook.changed', entityId: playbookId });
  }

  async publishPlaybook(playbookId: string, publisherUserId: string, input: any): Promise<MarketplacePlaybookItem> {
    const playbook = this.playbooks.get(playbookId);
    if (!playbook) throw new Error('not_found');
    const publication: MarketplacePlaybookItem = {
      publicationId: `publication-${this.nextPublicationId++}`,
      playbookId,
      publisherUserId,
      title: input.title,
      summary: input.summary ?? '',
      visibility: input.visibility ?? 'public',
      publishedAt: new Date('2026-07-13T02:00:00.000Z'),
      playbook
    };
    this.publications.set(publication.publicationId, publication);
    this.events.push({ userId: playbook.ownerUserId, topic: 'playbook.changed', entityId: playbookId });
    this.events.push({ userId: playbook.ownerUserId, topic: 'marketplace.changed', entityId: publication.publicationId });
    return publication;
  }

  async listMarketplacePlaybooks(): Promise<MarketplacePlaybookItem[]> {
    return [...this.publications.values()].filter((p) => p.visibility === 'public');
  }

  async cloneFromMarketplace(publicationId: string, targetOwnerUserId: string): Promise<ClonePlaybookResult> {
    const publication = this.publications.get(publicationId);
    if (!publication) throw new Error('not_found');
    const existing = [...this.playbooks.values()].find(
      (playbook) => playbook.ownerUserId === targetOwnerUserId && playbook.agentId === publication.playbook.agentId && playbook.name === publication.playbook.name
    );
    if (existing) {
      return { playbook: existing, cloned: false };
    }
    const created = await this.createPlaybook(targetOwnerUserId, publication.playbook);
    this.events.push({ userId: targetOwnerUserId, topic: 'marketplace.changed', entityId: publicationId });
    return { playbook: created, cloned: true };
  }

  async unpublishPlaybook(playbookId: string): Promise<void> {
    const publication = [...this.publications.values()].find((row) => row.playbookId === playbookId && row.visibility === 'public');
    if (!publication) throw new Error('not_found');
    this.publications.set(publication.publicationId, { ...publication, visibility: 'private' });
    const playbook = this.playbooks.get(playbookId);
    // Fall back to the publication's recorded publisher if the playbook lookup is
    // unexpectedly missing, rather than silently omitting the realtime events.
    const targetUserId = playbook ? playbook.ownerUserId : publication.publisherUserId;
    this.events.push({ userId: targetUserId, topic: 'playbook.changed', entityId: playbookId });
    this.events.push({ userId: targetUserId, topic: 'marketplace.changed', entityId: publication.publicationId });
  }

  async findOwnerUserId(_resourceType: 'agent' | 'source' | 'playbook', resourceId: string): Promise<string | null> {
    return this.playbooks.get(resourceId)?.ownerUserId ?? null;
  }

  async hasGrant(input: { granteeUserId: string; resourceType: 'agent' | 'source' | 'playbook'; resourceId: string; permission: string }): Promise<boolean> {
    return this.grants.has(`${input.granteeUserId}:${input.resourceId}:${input.permission}`) || this.grants.has(`${input.granteeUserId}:${input.resourceId}:*`);
  }

  async isPubliclyPublished(_resourceType: 'agent' | 'source' | 'playbook', resourceId: string): Promise<boolean> {
    return [...this.publications.values()].some((publication) => publication.playbookId === resourceId && publication.visibility === 'public');
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

describe('playbook routes', () => {
  it('supports full parity endpoint set with card metadata', async () => {
    const playbookRepo = new InMemoryPlaybookRepository();
    const app = await buildServer({
      agentRepository: createFakeAgentRepo(),
      agents: createFakePromptDeps(),
      auth: createTestAuthDeps(),
      playbook: { playbookRepository: playbookRepo, accessResolver: new DomainAccessResolver(playbookRepo), runTrigger: { triggerRun: async () => ({ status: 'queued' }) } }
    } as any);

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/playbooks',
      headers: authCookieHeader('owner-1'),
      payload: {
        agentId: 'agent-1',
        name: 'Morning Brief',
        sourceIds: ['source-1', 'source-2'],
        recipients: ['alerts@example.com'],
        mode: 'interval',
        intervalMinutes: 60
      }
    });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json<PlaybookRecord>();
    expect(created.lastRunAt).toBeNull();
    expect(created.nextRunAt).toBeTruthy();
    expect(created.recipients).toEqual(['alerts@example.com']);

    const listRes = await app.inject({ method: 'GET', url: '/api/playbooks', headers: authCookieHeader('owner-1') });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json<PlaybookRecord[]>()).toHaveLength(1);

    const getRes = await app.inject({ method: 'GET', url: `/api/playbooks/${created.id}`, headers: authCookieHeader('owner-1') });
    expect(getRes.statusCode).toBe(200);

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/playbooks/${created.id}`,
      headers: authCookieHeader('owner-1'),
      payload: { description: 'Updated' }
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json<PlaybookRecord>().description).toBe('Updated');

    const runRes = await app.inject({ method: 'POST', url: `/api/playbooks/${created.id}/run`, headers: authCookieHeader('owner-1') });
    expect(runRes.statusCode).toBe(200);

    const publishRes = await app.inject({
      method: 'POST',
      url: `/api/playbooks/${created.id}/publish`,
      headers: authCookieHeader('owner-1'),
      payload: { title: 'Morning Brief Pack', summary: 'Daily runbook', visibility: 'public' }
    });
    expect(publishRes.statusCode).toBe(201);
    const publication = publishRes.json<MarketplacePlaybookItem>();

    const marketplaceRes = await app.inject({ method: 'GET', url: '/api/playbooks/marketplace', headers: authCookieHeader('owner-1') });
    expect(marketplaceRes.statusCode).toBe(200);
    expect(marketplaceRes.json<MarketplacePlaybookItem[]>()).toHaveLength(1);

    const cloneRes = await app.inject({
      method: 'POST',
      url: `/api/playbooks/marketplace/${publication.publicationId}/clone`,
      headers: authCookieHeader('user-2')
    });
    expect(cloneRes.statusCode).toBe(201);
    expect(cloneRes.json<ClonePlaybookResult>().cloned).toBe(true);

    expect(playbookRepo.events).toContainEqual(
      expect.objectContaining({ userId: 'owner-1', topic: 'playbook.changed', entityId: created.id })
    );
    expect(playbookRepo.events).toContainEqual(
      expect.objectContaining({ userId: 'owner-1', topic: 'marketplace.changed', entityId: publication.publicationId })
    );
    expect(playbookRepo.events).toContainEqual(
      expect.objectContaining({ userId: 'user-2', topic: 'playbook.changed' })
    );
    expect(playbookRepo.events).toContainEqual(
      expect.objectContaining({ userId: 'user-2', topic: 'marketplace.changed' })
    );

    const deleteRes = await app.inject({ method: 'DELETE', url: `/api/playbooks/${created.id}`, headers: authCookieHeader('owner-1') });
    expect(deleteRes.statusCode).toBe(204);
  });

  it('enforces execute permission separately from read/edit/delete', async () => {
    const playbookRepo = new InMemoryPlaybookRepository();
    const userRepository = new InMemoryUserRepository();
    const owner = await userRepository.createWithPassword('owner@example.com', 'hash', 'Owner', 'user');
    const reader = await userRepository.createWithPassword('reader@example.com', 'hash', 'Reader', 'user');
    const runner = await userRepository.createWithPassword('runner@example.com', 'hash', 'Runner', 'user');
    await userRepository.setEmailVerified(owner.id, true);
    await userRepository.setEmailVerified(reader.id, true);
    await userRepository.setEmailVerified(runner.id, true);

    const app = await buildServer({
      agentRepository: createFakeAgentRepo(),
      agents: createFakePromptDeps(),
      auth: { ...createTestAuthDeps(), userRepository },
      playbook: { playbookRepository: playbookRepo, accessResolver: new DomainAccessResolver(playbookRepo), runTrigger: { triggerRun: async () => ({ status: 'queued' }) } }
    } as any);

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/playbooks',
      headers: authCookieHeader(owner.id),
      payload: { agentId: 'agent-1', name: 'Execute ACL', sourceIds: ['source-1'] }
    });
    const playbookId = createRes.json<PlaybookRecord>().id;

    const readShare = await app.inject({
      method: 'POST',
      url: `/api/playbooks/${playbookId}/share`,
      headers: authCookieHeader(owner.id),
      payload: { granteeUserId: reader.id, permission: 'read' }
    });
    expect(readShare.statusCode).toBe(204);

    const executeShare = await app.inject({
      method: 'POST',
      url: `/api/playbooks/${playbookId}/share`,
      headers: authCookieHeader(owner.id),
      payload: { granteeUserId: runner.id, permission: 'execute' }
    });
    expect(executeShare.statusCode).toBe(204);

    const readerCanRead = await app.inject({ method: 'GET', url: `/api/playbooks/${playbookId}`, headers: authCookieHeader(reader.id) });
    expect(readerCanRead.statusCode).toBe(200);

    const readerRunDenied = await app.inject({ method: 'POST', url: `/api/playbooks/${playbookId}/run`, headers: authCookieHeader(reader.id) });
    expect(readerRunDenied.statusCode).toBe(403);

    const runnerRunAllowed = await app.inject({ method: 'POST', url: `/api/playbooks/${playbookId}/run`, headers: authCookieHeader(runner.id) });
    expect(runnerRunAllowed.statusCode).toBe(200);
  });

  it('supports unpublish for playbook marketplace publications', async () => {
    const playbookRepo = new InMemoryPlaybookRepository();
    const app = await buildServer({
      agentRepository: createFakeAgentRepo(),
      agents: createFakePromptDeps(),
      auth: createTestAuthDeps(),
      playbook: { playbookRepository: playbookRepo, accessResolver: new DomainAccessResolver(playbookRepo), runTrigger: { triggerRun: async () => ({ status: 'queued' }) } }
    } as any);

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/playbooks',
      headers: authCookieHeader('owner-1'),
      payload: { agentId: 'agent-1', name: 'Unpublishable Playbook', sourceIds: ['source-1'] }
    });
    const playbook = createRes.json<PlaybookRecord>();

    const publishRes = await app.inject({
      method: 'POST',
      url: `/api/playbooks/${playbook.id}/publish`,
      headers: authCookieHeader('owner-1'),
      payload: { title: 'Pack', visibility: 'public' }
    });
    expect(publishRes.statusCode).toBe(201);

    const unpublishRes = await app.inject({
      method: 'POST',
      url: `/api/playbooks/${playbook.id}/unpublish`,
      headers: authCookieHeader('owner-1')
    });
    expect(unpublishRes.statusCode).toBe(204);

    const listRes = await app.inject({ method: 'GET', url: '/api/playbooks/marketplace', headers: authCookieHeader('owner-1') });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json<MarketplacePlaybookItem[]>()).toHaveLength(0);
  });

  it('restricts playbook publish/unpublish to owner or admin', async () => {
    const playbookRepo = new InMemoryPlaybookRepository();
    const userRepository = new InMemoryUserRepository();
    const owner = await userRepository.createWithPassword('owner-playbook@example.com', 'hash', 'Owner', 'user');
    const editor = await userRepository.createWithPassword('editor-playbook@example.com', 'hash', 'Editor', 'user');
    await userRepository.setEmailVerified(owner.id, true);
    await userRepository.setEmailVerified(editor.id, true);

    const app = await buildServer({
      agentRepository: createFakeAgentRepo(),
      agents: createFakePromptDeps(),
      auth: { ...createTestAuthDeps(), userRepository },
      playbook: { playbookRepository: playbookRepo, accessResolver: new DomainAccessResolver(playbookRepo), runTrigger: { triggerRun: async () => ({ status: 'queued' }) } }
    } as any);

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/playbooks',
      headers: authCookieHeader(owner.id),
      payload: { agentId: 'agent-1', name: 'Owner Playbook', sourceIds: ['source-1'] }
    });
    const playbook = createRes.json<PlaybookRecord>();

    await app.inject({
      method: 'POST',
      url: `/api/playbooks/${playbook.id}/share`,
      headers: authCookieHeader(owner.id),
      payload: { granteeUserId: editor.id, permission: 'edit' }
    });

    const eventsBeforeFailures = playbookRepo.events.length;

    const publishDenied = await app.inject({
      method: 'POST',
      url: `/api/playbooks/${playbook.id}/publish`,
      headers: authCookieHeader(editor.id),
      payload: { title: 'No publish' }
    });
    expect(publishDenied.statusCode).toBe(403);

    const cloneNotFound = await app.inject({
      method: 'POST',
      url: '/api/playbooks/marketplace/does-not-exist/clone',
      headers: authCookieHeader(editor.id)
    });
    expect(cloneNotFound.statusCode).toBe(404);

    const updateNotFound = await app.inject({
      method: 'PATCH',
      url: '/api/playbooks/does-not-exist',
      headers: authCookieHeader(owner.id),
      payload: { name: 'Nope' }
    });
    expect(updateNotFound.statusCode).toBe(404);

    const deleteDenied = await app.inject({
      method: 'DELETE',
      url: `/api/playbooks/${playbook.id}`,
      headers: authCookieHeader(editor.id)
    });
    expect(deleteDenied.statusCode).toBe(403);

    // The create + share calls above are legitimate successes and are expected to have
    // already emitted their own playbook.changed events; only the denied/not-found calls
    // below must add no further events.
    expect(playbookRepo.events).toHaveLength(eventsBeforeFailures);
  });

  it('emits playbook.changed to the resource owner for create/update/share/delete', async () => {
    const playbookRepo = new InMemoryPlaybookRepository();
    const userRepository = new InMemoryUserRepository();
    const owner = await userRepository.createWithPassword('owner-topic@example.com', 'hash', 'Owner', 'user');
    const teammate = await userRepository.createWithPassword('teammate-topic@example.com', 'hash', 'Teammate', 'user');
    await userRepository.setEmailVerified(owner.id, true);
    await userRepository.setEmailVerified(teammate.id, true);

    const app = await buildServer({
      agentRepository: createFakeAgentRepo(),
      agents: createFakePromptDeps(),
      auth: { ...createTestAuthDeps(), userRepository },
      playbook: { playbookRepository: playbookRepo, accessResolver: new DomainAccessResolver(playbookRepo), runTrigger: { triggerRun: async () => ({ status: 'queued' }) } }
    } as any);

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/playbooks',
      headers: authCookieHeader(owner.id),
      payload: { agentId: 'agent-1', name: 'Own Topic Playbook', sourceIds: ['source-1'] }
    });
    const playbook = createRes.json<PlaybookRecord>();
    expect(playbookRepo.events).toContainEqual(
      expect.objectContaining({ userId: owner.id, topic: 'playbook.changed', entityId: playbook.id })
    );

    await app.inject({
      method: 'PATCH',
      url: `/api/playbooks/${playbook.id}`,
      headers: authCookieHeader(owner.id),
      payload: { description: 'Updated' }
    });
    expect(playbookRepo.events).toContainEqual(
      expect.objectContaining({ userId: owner.id, topic: 'playbook.changed', entityId: playbook.id })
    );

    await app.inject({
      method: 'POST',
      url: `/api/playbooks/${playbook.id}/share`,
      headers: authCookieHeader(owner.id),
      payload: { granteeUserId: teammate.id, permission: 'read' }
    });

    const playbookChangedEvents = playbookRepo.events.filter((event) => event.topic === 'playbook.changed');
    expect(playbookChangedEvents.every((event) => event.userId === owner.id)).toBe(true);
    expect(playbookChangedEvents.length).toBeGreaterThanOrEqual(3);

    await app.inject({
      method: 'DELETE',
      url: `/api/playbooks/${playbook.id}`,
      headers: authCookieHeader(owner.id)
    });
    expect(playbookRepo.events).toContainEqual(
      expect.objectContaining({ userId: owner.id, topic: 'playbook.changed', entityId: playbook.id })
    );
  });
});
