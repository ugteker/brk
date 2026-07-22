import { describe, expect, it, vi } from 'vitest';
import { PlaybookRepository } from './repository';

describe('PlaybookRepository marketplace clone', () => {
  it('clones marketplace playbook by composing owner-scoped cloned components', async () => {
    const playbookCreate = vi.fn(async ({ data }: any) => ({
      id: 'playbook-cloned',
      agentId: data.agentId,
      name: data.name,
      description: data.description,
      mode: data.mode,
      intervalMinutes: data.intervalMinutes,
      dailyTime: data.dailyTime,
      timezone: data.timezone,
      daysOfWeekJson: data.daysOfWeekJson,
      nextRunAt: new Date('2026-07-13T09:00:00.000Z'),
      enabled: data.enabled,
      executionMode: data.executionMode,
      maxSourcesPerRun: data.maxSourcesPerRun,
      maxItemsPerSource: data.maxItemsPerSource,
      createdAt: new Date('2026-07-13T09:00:00.000Z'),
      updatedAt: new Date('2026-07-13T09:00:00.000Z'),
      sources: data.sources.create.map((source: any) => ({
        sourceId: source.sourceId,
        enabled: source.enabled,
        position: source.position
      })),
      agent: { runs: [] }
    }));

    const fakeDb = {
      marketplacePublication: {
        findFirst: vi.fn(async () => ({
          id: 'pub-1',
          playbook: {
            id: 'playbook-original',
            agentId: 'agent-original',
            name: 'Morning Brief',
            description: 'desc',
            mode: 'interval',
            intervalMinutes: 60,
            dailyTime: null,
            timezone: null,
            daysOfWeekJson: null,
            nextRunAt: new Date('2026-07-13T08:00:00.000Z'),
            enabled: true,
            executionMode: 'latest_only',
            maxSourcesPerRun: 3,
            maxItemsPerSource: 1,
            sources: [
              { sourceId: 'source-a', enabled: true, position: 0 },
              { sourceId: 'source-b', enabled: true, position: 1 }
            ]
          }
        }))
      },
      playbook: {
        findFirst: vi.fn(async () => null),
        create: playbookCreate
      },
      agent: {
        findFirst: vi.fn(async () => null),
        findUnique: vi.fn(async () => ({
          id: 'agent-original',
          ownerUserId: 'owner-1',
          name: 'Agent Original',
          description: 'agent desc',
          characterType: 'summarizer',
          promptConfigJson: '{}',
          status: 'active',
          preferencesJson: '{}',
          recipientsJson: '[]',
          createdAt: new Date('2026-07-13T00:00:00.000Z'),
          updatedAt: new Date('2026-07-13T00:00:00.000Z'),
          sources: [],
          schedules: []
        })),
        create: vi.fn(async () => ({ id: 'agent-cloned' }))
      },
      source: {
        findFirst: vi.fn(async ({ where }: any) => (where.value === 'https://example.com/a' ? { id: 'source-existing' } : null)),
        findUnique: vi.fn(async ({ where }: any) =>
          where.id === 'source-a'
            ? {
                id: 'source-a',
                ownerUserId: 'owner-1',
                type: 'web_urls',
                value: 'https://example.com/a',
                status: 'active',
                configJson: '{}',
                createdAt: new Date(),
                updatedAt: new Date()
              }
            : {
                id: 'source-b',
                ownerUserId: 'owner-1',
                type: 'web_urls',
                value: 'https://example.com/b',
                status: 'active',
                configJson: '{}',
                createdAt: new Date(),
                updatedAt: new Date()
              }
        ),
        create: vi.fn(async () => ({ id: 'source-cloned' }))
      },
      accessGrant: { create: vi.fn() },
      playbookSource: { deleteMany: vi.fn(), createMany: vi.fn() },
      $transaction: vi.fn(async (callback: any) => callback(fakeDb))
    };

    const repository = new PlaybookRepository(fakeDb as any);
    await repository.cloneFromMarketplace('pub-1', 'owner-2');

    expect(playbookCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          agentId: 'agent-cloned',
          sources: {
            create: [
              expect.objectContaining({ sourceId: 'source-existing' }),
              expect.objectContaining({ sourceId: 'source-cloned' })
            ]
          }
        })
      })
    );
  });
});

describe('PlaybookRepository realtime event production', () => {
  function createMockRealtime() {
    const events: Array<{ userId: string; topic: string; entityId?: string }> = [];
    return {
      events,
      append: vi.fn(async (_tx: unknown, event: { userId: string; topic: string; entityId?: string }) => {
        events.push(event);
      })
    };
  }

  function baseAgentRow(overrides: Partial<{ id: string; ownerUserId: string }> = {}) {
    return {
      id: overrides.id ?? 'agent-1',
      ownerUserId: overrides.ownerUserId ?? 'owner-1',
      name: 'Agent',
      description: '',
      characterType: 'summarizer',
      promptConfigJson: '{}',
      status: 'active',
      preferencesJson: '{}',
      recipientsJson: '[]',
      createdAt: new Date(),
      updatedAt: new Date(),
      sources: [],
      schedules: []
    };
  }

  function basePlaybookRow(overrides: Partial<{ id: string; agentId: string }> = {}) {
    return {
      id: overrides.id ?? 'playbook-1',
      agentId: overrides.agentId ?? 'agent-1',
      name: 'Playbook',
      description: '',
      mode: 'interval',
      intervalMinutes: 60,
      dailyTime: null,
      timezone: null,
      daysOfWeekJson: null,
      nextRunAt: new Date(),
      enabled: true,
      notificationsEnabled: true,
      digestFrequency: 'immediate',
      lastDigestSentAt: null,
      executionMode: 'latest_only',
      maxSourcesPerRun: 3,
      maxItemsPerSource: 1,
      recipientsJson: '[]',
      followTargetType: null,
      followTargetKey: null,
      followTargetTitle: null,
      language: 'en',
      createdAt: new Date(),
      updatedAt: new Date(),
      sources: []
    };
  }

  function createFakeDb() {
    let publication: any = null;
    const fakeDb: any = {
      playbook: {
        create: vi.fn(async ({ data }: any) => ({ ...basePlaybookRow({ agentId: data.agentId }), sources: [], agent: { runs: [] } })),
        update: vi.fn(async ({ where }: any) => ({ ...basePlaybookRow({ id: where.id }), sources: [], agent: { runs: [] } })),
        findUnique: vi.fn(async ({ where }: any) => basePlaybookRow({ id: where.id })),
        findFirst: vi.fn(async () => null),
        delete: vi.fn(async () => ({}))
      },
      playbookSource: { deleteMany: vi.fn(async () => ({ count: 0 })), createMany: vi.fn(async () => ({ count: 0 })) },
      accessGrant: { create: vi.fn(async () => ({})) },
      agent: {
        findUnique: vi.fn(async ({ where }: any) => baseAgentRow({ id: where.id })),
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({ id: 'agent-cloned' }))
      },
      marketplacePublication: {
        findFirst: vi.fn(async () => publication),
        create: vi.fn(async ({ data }: any) => {
          publication = { id: 'publication-1', publisherUserId: data.publisherUserId, title: data.title, summary: data.summary, visibility: data.visibility, publishedAt: data.publishedAt, retiredAt: null };
          return publication;
        }),
        update: vi.fn(async ({ data }: any) => {
          publication = { ...publication, ...data };
          return publication;
        })
      }
    };
    fakeDb.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(fakeDb));
    return fakeDb;
  }

  it('appends playbook.changed to the linked agent owner on create, update, share, and delete', async () => {
    const fakeDb = createFakeDb();
    const realtime = createMockRealtime();
    const repo = new PlaybookRepository(fakeDb, realtime);

    const created = await repo.createPlaybook('owner-1', { agentId: 'agent-1', name: 'P', sourceIds: [] });
    await repo.updatePlaybook(created.id, { description: 'Updated' });
    await repo.sharePlaybook(created.id, 'owner-1', { granteeUserId: 'grantee-1', permission: 'read' });
    await repo.deletePlaybook(created.id);

    const playbookChanged = realtime.events.filter((e) => e.topic === 'playbook.changed');
    expect(playbookChanged.every((e) => e.userId === 'owner-1')).toBe(true);
    expect(playbookChanged).toHaveLength(4);
  });

  it('does not append playbook.changed when update/share/delete fail', async () => {
    const fakeDb = createFakeDb();
    fakeDb.playbook.findUnique = vi.fn(async () => null);
    const realtime = createMockRealtime();
    const repo = new PlaybookRepository(fakeDb, realtime);

    await expect(repo.updatePlaybook('missing', { description: 'x' })).rejects.toThrow('not_found');
    await expect(repo.sharePlaybook('missing', 'owner-1', { granteeUserId: 'grantee-1', permission: 'read' })).rejects.toThrow('not_found');
    await expect(repo.deletePlaybook('missing')).rejects.toThrow('not_found');

    expect(realtime.events).toHaveLength(0);
  });

  it('surfaces an invariant violation instead of silently skipping the event when the linked agent is missing', async () => {
    const fakeDb = createFakeDb();
    fakeDb.agent.findUnique = vi.fn(async () => null);
    const realtime = createMockRealtime();
    const repo = new PlaybookRepository(fakeDb, realtime);

    await expect(repo.updatePlaybook('playbook-1', { description: 'x' })).rejects.toThrow(/invariant_violation/);
    expect(realtime.events).toHaveLength(0);
  });

  it('appends both playbook.changed and marketplace.changed on publish, unpublish, and clone', async () => {
    const fakeDb = createFakeDb();
    const realtime = createMockRealtime();
    const repo = new PlaybookRepository(fakeDb, realtime);

    await repo.publishPlaybook('playbook-1', 'owner-1', { title: 'Pack' });
    await repo.unpublishPlaybook('playbook-1');

    fakeDb.marketplacePublication.findFirst = vi.fn(async () => ({
      id: 'publication-1',
      playbook: { ...basePlaybookRow(), sources: [] }
    }));
    fakeDb.agent.findFirst = vi.fn(async () => null);
    fakeDb.agent.create = vi.fn(async () => ({ id: 'agent-cloned' }));
    await repo.cloneFromMarketplace('publication-1', 'owner-2');

    const ownerEvents = realtime.events.filter((e) => e.userId === 'owner-1');
    expect(ownerEvents.filter((e) => e.topic === 'playbook.changed').length).toBeGreaterThanOrEqual(2);
    expect(ownerEvents.filter((e) => e.topic === 'marketplace.changed').length).toBeGreaterThanOrEqual(2);

    const cloneEvents = realtime.events.filter((e) => e.userId === 'owner-2');
    expect(cloneEvents).toContainEqual(expect.objectContaining({ topic: 'playbook.changed' }));
    expect(cloneEvents).toContainEqual(expect.objectContaining({ topic: 'marketplace.changed' }));
  });

  it('falls back to the known publisher for publish/unpublish events when the linked agent is unexpectedly missing', async () => {
    const fakeDb = createFakeDb();
    fakeDb.agent.findUnique = vi.fn(async () => null);
    const realtime = createMockRealtime();
    const repo = new PlaybookRepository(fakeDb, realtime);

    await repo.publishPlaybook('playbook-1', 'publisher-1', { title: 'Pack' });
    expect(realtime.events).toContainEqual(expect.objectContaining({ userId: 'publisher-1', topic: 'playbook.changed' }));
    expect(realtime.events).toContainEqual(expect.objectContaining({ userId: 'publisher-1', topic: 'marketplace.changed' }));

    realtime.events.length = 0;
    await repo.unpublishPlaybook('playbook-1');
    expect(realtime.events).toContainEqual(expect.objectContaining({ userId: 'publisher-1', topic: 'playbook.changed' }));
    expect(realtime.events).toContainEqual(expect.objectContaining({ userId: 'publisher-1', topic: 'marketplace.changed' }));
  });
});

describe('PlaybookRepository follow target metadata', () => {
  it('persists and maps follow target fields on create', async () => {
    const fakeDb = {
      playbook: {
        create: vi.fn(async ({ data }: any) => ({
          id: 'playbook-1',
          agentId: data.agentId,
          name: data.name,
          description: data.description,
          enabled: true,
          mode: data.mode,
          intervalMinutes: data.intervalMinutes,
          dailyTime: data.dailyTime,
          timezone: data.timezone,
          daysOfWeekJson: data.daysOfWeekJson,
          nextRunAt: new Date('2026-07-14T12:00:00.000Z'),
          executionMode: data.executionMode,
          maxSourcesPerRun: data.maxSourcesPerRun,
          maxItemsPerSource: data.maxItemsPerSource,
          recipientsJson: data.recipientsJson,
          followTargetType: data.followTargetType,
          followTargetKey: data.followTargetKey,
          followTargetTitle: data.followTargetTitle,
          createdAt: new Date('2026-07-14T10:00:00.000Z'),
          updatedAt: new Date('2026-07-14T10:00:00.000Z'),
          sources: [{ sourceId: 'source-1', position: 0, enabled: true }],
          agent: { runs: [] }
        })),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        findFirst: vi.fn()
      },
      playbookSource: { deleteMany: vi.fn(), createMany: vi.fn() },
      accessGrant: { create: vi.fn() },
      marketplacePublication: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
      agent: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
      source: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
      $transaction: vi.fn(async (callback: any) => callback(fakeDb))
    };

    const repository = new PlaybookRepository(fakeDb as any);
    const created = await repository.createPlaybook('owner-1', {
      agentId: 'agent-1',
      name: 'Follow this',
      sourceIds: ['source-1'],
      followTargetType: 'episode',
      followTargetKey: 'source-1:item-42',
      followTargetTitle: 'Episode 42'
    });

    expect(fakeDb.playbook.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          followTargetType: 'episode',
          followTargetKey: 'source-1:item-42',
          followTargetTitle: 'Episode 42'
        })
      })
    );
    expect(created.followTargetType).toBe('episode');
    expect(created.followTargetKey).toBe('source-1:item-42');
    expect(created.followTargetTitle).toBe('Episode 42');
  });
});
