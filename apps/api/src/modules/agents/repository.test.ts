import { describe, expect, it, vi } from 'vitest';
import { AgentRepository } from './repository';
import type { CreateAgentInput } from './types';

describe('AgentRepository', () => {
  it('creates agent with supported source types only', async () => {
    const fakeDb = {
      agent: {
        create: async ({ data }: { data: { ownerUserId: string; name: string; sources: { create: Array<{ type: string; value: string }> } } }) => ({
          id: 'agent_1',
          ownerUserId: data.ownerUserId,
          name: data.name,
          status: 'active',
          createdAt: new Date('2026-07-10T00:00:00.000Z'),
          updatedAt: new Date('2026-07-10T00:00:00.000Z'),
          sources: data.sources.create
        }),
        update: async () => ({})
      },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(fakeDb)
    };

    const repo = new AgentRepository(fakeDb as never);
    const input: CreateAgentInput = {
      name: 'Housing Agent',
      sources: [{ type: 'podcast_feeds', value: 'https://pod.example/feed.xml' }],
      preferences: { sector: ['housing'] },
      recipients: ['team@example.com'],
      schedule: { mode: 'interval', intervalMinutes: 120 }
    };

    const agent = await repo.createAgent('admin-user-id', input);
    expect(agent.name).toBe('Housing Agent');
    expect(agent.sources[0]?.type).toBe('podcast_feeds');
  });

  it('creates an agent as active by default and as disabled when active is false', async () => {
    const create = vi.fn(async ({ data }: { data: { status: string; sources: { create: unknown[] } } }) => ({
      id: 'agent_1',
      ownerUserId: 'admin-user-id',
      name: 'Housing Agent',
      status: data.status,
      createdAt: new Date('2026-07-10T00:00:00.000Z'),
      updatedAt: new Date('2026-07-10T00:00:00.000Z'),
      sources: data.sources.create
    }));
    const fakeDb: any = { agent: { create } };
    fakeDb.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(fakeDb);

    const repo = new AgentRepository(fakeDb as never);
    const baseInput: CreateAgentInput = {
      name: 'Housing Agent',
      sources: [{ type: 'web_urls', value: 'https://example.com' }],
      preferences: {},
      recipients: ['team@example.com'],
      schedule: { mode: 'interval', intervalMinutes: 120 }
    };

    const activeByDefault = await repo.createAgent('admin-user-id', baseInput);
    expect(activeByDefault.status).toBe('active');

    const explicitlyActive = await repo.createAgent('admin-user-id', { ...baseInput, active: true });
    expect(explicitlyActive.status).toBe('active');

    const paused = await repo.createAgent('admin-user-id', { ...baseInput, active: false });
    expect(paused.status).toBe('disabled');
  });

  it('updates agent status when active is included in the patch', async () => {
    const update = vi.fn(async ({ data }: { data: { status?: string } }) => ({
      id: 'agent_1',
      ownerUserId: 'admin-user-id',
      name: 'Housing Agent',
      status: data.status ?? 'active',
      createdAt: new Date('2026-07-10T00:00:00.000Z'),
      updatedAt: new Date('2026-07-10T00:00:00.000Z'),
      sources: []
    }));
    const fakeDb = { agent: { update }, $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(fakeDb) };

    const repo = new AgentRepository(fakeDb as never);

    const disabled = await repo.updateAgent('agent_1', { active: false });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'disabled' }) }));
    expect(disabled.status).toBe('disabled');

    const reenabled = await repo.updateAgent('agent_1', { active: true });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'active' }) }));
    expect(reenabled.status).toBe('active');
  });

  it('creates an immutable version when execution fields are patched and updates identity fields only on the agent row', async () => {
    const update = vi.fn(async ({ data }: { data: { name?: string; status?: string } }) => ({
      id: 'agent_1',
      ownerUserId: 'owner-1',
      name: data.name ?? 'Existing agent',
      description: 'Existing description',
      characterType: 'summarizer',
      promptConfigJson: JSON.stringify({ tone: 'brief' }),
      status: data.status ?? 'active',
      preferencesJson: '{}',
      createdAt: new Date('2026-07-10T00:00:00.000Z'),
      updatedAt: new Date('2026-07-10T00:00:00.000Z'),
      sources: []
    }));

    const createdVersion = vi.fn(async ({ data }: any) => ({ id: 'version-3', agentId: data.agentId, version: data.version }));

    const fakeDb: any = { agent: { update, findUnique: async () => ({ id: 'agent_1', ownerUserId: 'owner-1' }) }, agentPromptVersion: { findFirst: async () => ({ id: 'version-2', version: 2, model: 'm', systemPrompt: 's', name: 'v2', description: '', characterType: 'summarizer', promptConfigJson: '{}' }), create: createdVersion }, marketplacePublication: { findFirst: async () => null }, $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(fakeDb) };
    const repo = new AgentRepository(fakeDb as never);

    await repo.updateAgent('agent_1', { name: 'Market Watcher', characterType: 'teacher' });

    expect(createdVersion).toHaveBeenCalled();
    // Agent update should be called only for identity fields (name), not for execution fields
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'Market Watcher' }) })
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.not.objectContaining({ characterType: expect.anything(), promptConfigJson: expect.anything() }) })
    );
  });

  it('lists agents with their sources', async () => {
    const fakeDb = {
      agent: {
        findMany: async () => [
          {
            id: 'agent_1',
            ownerUserId: 'admin-user-id',
            name: 'Housing Agent',
            status: 'active',
            createdAt: new Date('2026-07-10T00:00:00.000Z'),
            updatedAt: new Date('2026-07-10T00:00:00.000Z'),
            sources: [{ type: 'web_urls', value: 'https://example.com' }]
          }
        ]
      }
    };

    const repo = new AgentRepository(fakeDb as never);
    const agents = await repo.listAgents('admin-user-id');

    expect(agents).toHaveLength(1);
    expect(agents[0]?.name).toBe('Housing Agent');
    expect(agents[0]?.sources[0]?.value).toBe('https://example.com');
    expect(agents[0]?.runCount).toBe(0);
    expect(agents[0]?.reportCount).toBe(0);
    expect(agents[0]?.latestReportAt).toBeNull();
  });

  it('includes run/report counts and the latest report timestamp when listing agents', async () => {
    const latestReportDate = new Date('2026-07-11T00:00:00.000Z');
    const fakeDb = {
      agent: {
        findMany: async () => [
          {
            id: 'agent_1',
            ownerUserId: 'admin-user-id',
            name: 'Housing Agent',
            status: 'active',
            createdAt: new Date('2026-07-10T00:00:00.000Z'),
            updatedAt: new Date('2026-07-10T00:00:00.000Z'),
            sources: [],
            _count: { runs: 5, runReports: 2 },
            runReports: [{ createdAt: latestReportDate }]
          }
        ]
      }
    };

    const repo = new AgentRepository(fakeDb as never);
    const agents = await repo.listAgents('admin-user-id');

    expect(agents[0]?.runCount).toBe(5);
    expect(agents[0]?.reportCount).toBe(2);
    expect(agents[0]?.latestReportAt).toEqual(latestReportDate);
  });

  it('gets a single agent with its sources', async () => {
    const fakeDb = {
      agent: {
        findUnique: async () => ({
          id: 'agent_1',
          ownerUserId: 'admin-user-id',
          name: 'Housing Agent',
          status: 'active',
          createdAt: new Date('2026-07-10T00:00:00.000Z'),
          updatedAt: new Date('2026-07-10T00:00:00.000Z'),
          sources: [{ type: 'web_urls', value: 'https://example.com' }]
        })
      }
    };

    const repo = new AgentRepository(fakeDb as never);
    const agent = await repo.getAgent('agent_1');
    expect(agent?.name).toBe('Housing Agent');
  });

  it('returns null when a agent does not exist', async () => {
    const fakeDb = { agent: { findUnique: async () => null } };
    const repo = new AgentRepository(fakeDb as never);
    expect(await repo.getAgent('missing')).toBeNull();
  });

  it('enables a disabled agent', async () => {
    const update = vi.fn(async ({ data }: { data: { status: string } }) => ({ status: data.status, ownerUserId: 'owner-1' }));
    const fakeDb: any = { agent: { update } };
    fakeDb.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(fakeDb);
    const repo = new AgentRepository(fakeDb as never);

    await repo.enableAgent('agent_1');

    expect(update).toHaveBeenCalledWith({ where: { id: 'agent_1' }, data: { status: 'active' } });
  });

  it('deletes a agent and its related records inside a transaction', async () => {
    const findMany = vi.fn(async () => [{ id: 'report_1' }]);
    const findPlaybooks = vi.fn(async () => [{ id: 'playbook_1' }]);
    const deleteSignals = vi.fn(async () => ({ count: 0 }));
    const deleteRunReports = vi.fn(async () => ({ count: 0 }));
    const deleteRunArtifacts = vi.fn(async () => ({ count: 0 }));
    const deleteRuns = vi.fn(async () => ({ count: 0 }));
    const deletePromptVersions = vi.fn(async () => ({ count: 0 }));
    const deleteSources = vi.fn(async () => ({ count: 0 }));
    const deleteAccessGrants = vi.fn(async () => ({ count: 0 }));
    const deletePlaybookSources = vi.fn(async () => ({ count: 0 }));
    const deleteMarketplacePublications = vi.fn(async () => ({ count: 0 }));
    const deletePlaybooks = vi.fn(async () => ({ count: 0 }));
    const deleteAgent = vi.fn(async () => ({}));
    const findAgent = vi.fn(async () => ({ id: 'agent_1', ownerUserId: 'owner-1' }));
    const tx = {
      agentRunReport: { findMany, deleteMany: deleteRunReports },
      agentSignal: { deleteMany: deleteSignals },
      agentRunArtifact: { deleteMany: deleteRunArtifacts },
      agentRun: { deleteMany: deleteRuns },
      agentPromptVersion: { deleteMany: deletePromptVersions },
      agentSource: { deleteMany: deleteSources },
      accessGrant: { deleteMany: deleteAccessGrants },
      playbookSource: { deleteMany: deletePlaybookSources },
      marketplacePublication: { deleteMany: deleteMarketplacePublications },
      playbook: { findMany: findPlaybooks, deleteMany: deletePlaybooks },
      agent: { findUnique: findAgent, delete: deleteAgent }
    };
    const $transaction = vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn(tx));
    const fakeDb = { $transaction };

    const repo = new AgentRepository(fakeDb as never);
    await repo.deleteAgent('agent_1');

    expect($transaction).toHaveBeenCalled();
    expect(findMany).toHaveBeenCalledWith({ where: { agentId: 'agent_1' }, select: { id: true } });
    expect(deleteSignals).toHaveBeenCalledWith({ where: { agentRunReportId: { in: ['report_1'] } } });
    expect(deleteRunReports).toHaveBeenCalledWith({ where: { agentId: 'agent_1' } });
    expect(deleteRunArtifacts).toHaveBeenCalledWith({ where: { agentId: 'agent_1' } });
    expect(deleteRuns).toHaveBeenCalledWith({ where: { agentId: 'agent_1' } });
    expect(deletePromptVersions).toHaveBeenCalledWith({ where: { agentId: 'agent_1' } });
    expect(deleteSources).toHaveBeenCalledWith({ where: { agentId: 'agent_1' } });
    expect(deleteAccessGrants).toHaveBeenCalledWith({ where: { OR: [{ agentId: 'agent_1' }, { granteeAgentId: 'agent_1' }] } });
    expect(findPlaybooks).toHaveBeenCalledWith({ where: { agentId: 'agent_1' }, select: { id: true } });
    expect(deletePlaybookSources).toHaveBeenCalledWith({ where: { playbookId: { in: ['playbook_1'] } } });
    expect(deleteAccessGrants).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ playbookId: { in: ['playbook_1'] } }) }));
    expect(deleteMarketplacePublications).toHaveBeenCalledWith({ where: { playbookId: { in: ['playbook_1'] } } });
    expect(deletePlaybooks).toHaveBeenCalledWith({ where: { agentId: 'agent_1' } });
    expect(deleteAgent).toHaveBeenCalledWith({ where: { id: 'agent_1' } });
  });

  it('creates a new immutable version when a private agent changes', async () => {
    const db: any = {
      agentPromptVersion: {
        findFirst: vi.fn(async ({ where }: any) => ({ id: 'version-2', agentId: where.agentId, version: 2 })),
        create: vi.fn(async ({ data }: any) => ({ id: 'version-3', agentId: data.agentId, version: data.version })),
        update: vi.fn(async () => ({}))
      },
      agent: { findUnique: vi.fn(async () => ({ id: 'agent-1', ownerUserId: 'owner-1' })) },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db)
    };

    const repo = new AgentRepository(db as never);
    const changed = await repo.createAgentVersion('agent-1', {
      name: 'Revised teacher',
      description: 'Explains difficult ideas',
      characterType: 'teacher',
      promptConfig: {},
      model: 'claude-sonnet-4-5',
      systemPrompt: 'Explain the evidence step by step.',
      iconAssetKey: 'chalkboard-teacher'
    } as any);

    expect(changed.version).toBe(3);
    expect(db.agentPromptVersion.update).not.toHaveBeenCalled();
  });

  it('saves a public version without cloning its agent', async () => {
    const db: any = {
      agentPromptVersion: {
        findUnique: vi.fn(async ({ where }: any) => ({ id: where.id ?? 'version-3', agentId: 'agent-1' }))
      },
      agent: { create: vi.fn(async () => ({})), findUnique: vi.fn(async () => ({ id: 'agent-1', ownerUserId: 'owner-1' })) },
      userLibraryAgent: { create: vi.fn(async () => ({ id: 'saved-1' })), updateMany: vi.fn(async () => ({ count: 1 })) },
      marketplacePublication: { findFirst: vi.fn(async () => ({ id: 'pub-1', resourceId: 'agent-1', status: 'published', visibility: 'public', retiredAt: null })) },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db)
    };

    const repo = new AgentRepository(db as never);
    await repo.saveAgentVersion('user-2', 'version-3');
    expect(db.agent.create).not.toHaveBeenCalled();
    expect(db.userLibraryAgent.create).toHaveBeenCalled();
  });

  it('rethrows unexpected create error and does not call updateMany when saving agent version', async () => {
    const db: any = {
      agentPromptVersion: {
        findUnique: vi.fn(async ({ where }: any) => ({ id: where.id ?? 'version-3', agentId: 'agent-1' }))
      },
      agent: { findUnique: vi.fn(async () => ({ id: 'agent-1', ownerUserId: 'owner-1' })) },
      userLibraryAgent: {
        create: vi.fn(async () => {
          const e = new Error('db_fail') as unknown as { message: string; code?: string };
          e.code = 'SOME_OTHER';
          throw e;
        }),
        updateMany: vi.fn(async () => ({ count: 1 }))
      },
      marketplacePublication: { findFirst: vi.fn(async () => ({ id: 'pub-1', resourceId: 'agent-1', status: 'published', visibility: 'public', retiredAt: null })) },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db)
    };

    const repo = new AgentRepository(db as never);
    await expect(repo.saveAgentVersion('user-2', 'version-3')).rejects.toThrow('db_fail');
    expect(db.userLibraryAgent.updateMany).not.toHaveBeenCalled();
  });

});

describe('AgentRepository realtime event production', () => {
  function createMockRealtime() {
    const events: Array<{ userId: string; topic: string; entityId?: string }> = [];
    return {
      events,
      append: vi.fn(async (_tx: unknown, event: { userId: string; topic: string; entityId?: string }) => {
        events.push(event);
      })
    };
  }

  function createFakeDb() {
    let publication: any = null;
    const fakeDb: any = {
      agent: {
        create: vi.fn(async ({ data }: any) => ({ id: 'agent_1', ownerUserId: data.ownerUserId, name: data.name, sources: [] })),
        update: vi.fn(async ({ where, data }: any) => ({ id: where.id, ownerUserId: 'owner-1', status: data.status ?? 'active', sources: [] })),
        findUnique: vi.fn(async ({ where }: any) => ({ id: where.id, ownerUserId: 'owner-1', sources: [] })),
        findFirst: vi.fn(async () => null),
        delete: vi.fn(async () => ({})),
        findMany: vi.fn(async () => [])
      },
      accessGrant: { create: vi.fn(async () => ({})), deleteMany: vi.fn(async () => ({ count: 0 })) },
      marketplacePublication: {
        findFirst: vi.fn(async () => publication),
        create: vi.fn(async () => {
          publication = { id: 'publication-1', publisherUserId: 'owner-1', title: 't', summary: '', visibility: 'public', publishedAt: new Date(), retiredAt: null };
          return publication;
        }),
        update: vi.fn(async ({ data }: any) => {
          publication = { ...publication, ...data };
          return publication;
        }),
        deleteMany: vi.fn(async () => ({ count: 0 }))
      },
      agentRunReport: { findMany: vi.fn(async () => []), deleteMany: vi.fn(async () => ({ count: 0 })) },
      agentSignal: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      agentRunArtifact: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      agentRun: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      agentPromptVersion: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      agentSource: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      playbookSource: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      playbook: { findMany: vi.fn(async () => []), deleteMany: vi.fn(async () => ({ count: 0 })) }
    };
    fakeDb.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(fakeDb));
    return fakeDb;
  }

  it('appends agent.changed to the owner on create, update, share, enable, and disable', async () => {
    const fakeDb = createFakeDb();
    const realtime = createMockRealtime();
    const repo = new AgentRepository(fakeDb, realtime);

    const created = await repo.createAgent('owner-1', { name: 'Agent', sources: [], preferences: {}, recipients: [] });
    await repo.updateAgent(created.id, { description: 'Updated' });
    await repo.shareAgent(created.id, 'owner-1', { granteeUserId: 'grantee-1', permission: 'read' });
    await repo.enableAgent(created.id);
    await repo.disableAgent(created.id);

    expect(realtime.events.filter((e) => e.topic === 'agent.changed').every((e) => e.userId === 'owner-1')).toBe(true);
    expect(realtime.events.filter((e) => e.topic === 'agent.changed')).toHaveLength(5);
  });

  it('appends agent.changed to the fetched owner (not the caller) on delete', async () => {
    const fakeDb = createFakeDb();
    const realtime = createMockRealtime();
    const repo = new AgentRepository(fakeDb, realtime);

    await repo.deleteAgent('agent_1');

    expect(realtime.events).toContainEqual(expect.objectContaining({ userId: 'owner-1', topic: 'agent.changed', entityId: 'agent_1' }));
  });

  it('appends both agent.changed and marketplace.changed on publish, unpublish, and clone', async () => {
    const fakeDb = createFakeDb();
    fakeDb.agent.findFirst = vi.fn(async () => null);
    const realtime = createMockRealtime();
    const repo = new AgentRepository(fakeDb, realtime);

    await repo.publishAgent('agent_1', 'owner-1', { title: 'Pack' });
    await repo.unpublishAgent('agent_1');

    fakeDb.marketplacePublication.findFirst = vi.fn(async () => ({
      id: 'publication-1',
      agent: { id: 'agent_1', ownerUserId: 'owner-1', description: '', characterType: 'summarizer', promptConfigJson: '{}', status: 'active', preferencesJson: '{}', sources: [] }
    }));
    await repo.cloneFromMarketplace('publication-1', 'owner-2');

    const publishAndUnpublish = realtime.events.filter((e) => e.userId === 'owner-1');
    expect(publishAndUnpublish.filter((e) => e.topic === 'agent.changed').length).toBeGreaterThanOrEqual(2);
    expect(publishAndUnpublish.filter((e) => e.topic === 'marketplace.changed').length).toBeGreaterThanOrEqual(2);

    const cloneEvents = realtime.events.filter((e) => e.userId === 'owner-2');
    expect(cloneEvents).toContainEqual(expect.objectContaining({ topic: 'agent.changed' }));
    expect(cloneEvents).toContainEqual(expect.objectContaining({ topic: 'marketplace.changed' }));
  });

  it('does not append agent.changed when create/update/share/delete fail', async () => {
    const fakeDb = createFakeDb();
    fakeDb.agent.findUnique = vi.fn(async () => null);
    fakeDb.agent.update = vi.fn(async () => {
      throw new Error('db_error');
    });
    const realtime = createMockRealtime();
    const repo = new AgentRepository(fakeDb, realtime);

    await expect(repo.shareAgent('missing-agent', 'owner-1', { granteeUserId: 'grantee-1', permission: 'read' })).rejects.toThrow('not_found');
    await expect(repo.updateAgent('agent_1', { description: 'x' })).rejects.toThrow('db_error');
    await expect(repo.deleteAgent('missing-agent')).rejects.toThrow('not_found');

    expect(realtime.events).toHaveLength(0);
  });
});
