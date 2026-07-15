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
