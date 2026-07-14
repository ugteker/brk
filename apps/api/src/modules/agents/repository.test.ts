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
      }
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
    const fakeDb = { agent: { create } };

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
    const update = vi.fn(async ({ data }: { data: { status: string } }) => ({ status: data.status }));
    const fakeDb = { agent: { update } };
    const repo = new AgentRepository(fakeDb as never);

    await repo.enableAgent('agent_1');

    expect(update).toHaveBeenCalledWith({ where: { id: 'agent_1' }, data: { status: 'active' } });
  });

  it('deletes a agent and its related records inside a transaction', async () => {
    const findMany = vi.fn(async () => [{ id: 'report_1' }]);
    const deleteSignals = vi.fn(async () => ({ count: 0 }));
    const deleteRunReports = vi.fn(async () => ({ count: 0 }));
    const deleteRunArtifacts = vi.fn(async () => ({ count: 0 }));
    const deleteRuns = vi.fn(async () => ({ count: 0 }));
    const deletePromptVersions = vi.fn(async () => ({ count: 0 }));
    const deleteSchedules = vi.fn(async () => ({ count: 0 }));
    const deleteSources = vi.fn(async () => ({ count: 0 }));
    const deleteAccessGrants = vi.fn(async () => ({ count: 0 }));
    const deletePlaybooks = vi.fn(async () => ({ count: 0 }));
    const deleteAgent = vi.fn(async () => ({}));
    const tx = {
      agentRunReport: { findMany, deleteMany: deleteRunReports },
      agentSignal: { deleteMany: deleteSignals },
      agentRunArtifact: { deleteMany: deleteRunArtifacts },
      agentRun: { deleteMany: deleteRuns },
      agentPromptVersion: { deleteMany: deletePromptVersions },
      agentSchedule: { deleteMany: deleteSchedules },
      agentSource: { deleteMany: deleteSources },
      accessGrant: { deleteMany: deleteAccessGrants },
      playbook: { deleteMany: deletePlaybooks },
      agent: { delete: deleteAgent }
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
    expect(deleteSchedules).toHaveBeenCalledWith({ where: { agentId: 'agent_1' } });
    expect(deleteSources).toHaveBeenCalledWith({ where: { agentId: 'agent_1' } });
    expect(deleteAccessGrants).toHaveBeenCalledWith({ where: { OR: [{ agentId: 'agent_1' }, { granteeAgentId: 'agent_1' }] } });
    expect(deletePlaybooks).toHaveBeenCalledWith({ where: { agentId: 'agent_1' } });
    expect(deleteAgent).toHaveBeenCalledWith({ where: { id: 'agent_1' } });
  });
});
