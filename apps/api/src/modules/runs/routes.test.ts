import { describe, expect, it, vi } from 'vitest';
import { buildServer } from '../../server';
import type { Agent, CreateAgentInput } from '../agents/types';
import { authCookieHeader, createTestAuthDeps } from '../../test-utils/auth';
import type { RunDetailRecord } from './types';

function createFakeAgentRepo(): {
  createAgent(ownerUserId: string, input: CreateAgentInput): Promise<Agent>;
  updateAgent(agentId: string, patch: Partial<CreateAgentInput>): Promise<Agent>;
  disableAgent(): Promise<void>;
  enableAgent(): Promise<void>;
  deleteAgent(): Promise<void>;
  listAgents(): Promise<Agent[]>;
  getAgent(agentId: string): Promise<Agent | null>;
  listRecentRuns(ownerUserId: string, limit: number): Promise<unknown[]>;
  shareAgent(): Promise<void>;
  listAgentShares(): Promise<unknown[]>;
  revokeAgentShare(): Promise<void>;
} {
  const agents = new Map<string, Agent>();
  return {
    async createAgent(ownerUserId: string, input: CreateAgentInput): Promise<Agent> {
      const agent: Agent = {
        id: 'agent-1',
        ownerUserId,
        name: input.name,
        description: input.description ?? '',
        characterType: input.characterType ?? 'summarizer',
        promptConfig: input.promptConfig ?? {},
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        sources: (input.sources ?? []).map((s) => ({ ...s, frequencyMinutes: s.frequencyMinutes ?? 60, maxItems: s.maxItems ?? 1 })),
        preferences: input.preferences ?? {},
        recipients: input.recipients ?? [],
        schedule: input.schedule ?? null
      };
      agents.set(agent.id, agent);
      return agent;
    },
    async updateAgent(agentId: string): Promise<Agent> {
      const existing = agents.get(agentId);
      if (!existing) throw new Error('not_found');
      return existing;
    },
    async disableAgent(): Promise<void> {},
    async enableAgent(): Promise<void> {},
    async deleteAgent(): Promise<void> {},
    async listAgents(): Promise<Agent[]> {
      return [...agents.values()];
    },
    async getAgent(agentId: string): Promise<Agent | null> {
      return agents.get(agentId) ?? null;
    },
    async listRecentRuns(): Promise<unknown[]> {
      return [];
    },
    async shareAgent(): Promise<void> {},
    async listAgentShares(): Promise<unknown[]> {
      return [];
    },
    async revokeAgentShare(): Promise<void> {}
  };
}

function createFakeRunsRepo(runs: RunDetailRecord[]) {
  return {
    async listRunDetailsForAgent(agentId: string): Promise<RunDetailRecord[]> {
      return runs.filter((r) => r.agentId === agentId);
    },
    async getArtifactContent(agentId: string, runId: string, artifactId: string) {
      const run = runs.find((r) => r.id === runId && r.agentId === agentId);
      const artifact = run?.artifacts.find((a) => a.id === artifactId);
      if (!artifact) return null;
      return { sourceRef: artifact.sourceRef, content: 'full content for ' + artifact.sourceRef };
    }
  };
}

function createAccessResolver(allow: (input: { actorUserId: string; action: string; resourceId: string }) => boolean = () => true) {
  return {
    resolve: vi.fn(async (input: { actorUserId: string; action: string; resourceId: string }) =>
      allow(input) ? { allowed: true as const, reason: 'owner' as const } : { allowed: false as const, reason: 'denied' as const }
    )
  };
}

describe('runs routes', () => {
  it('lists run details for an agent', async () => {
    const runDetail: RunDetailRecord = {
      id: 'run-1',
      agentId: 'agent-1',
      status: 'succeeded',
      scheduledFor: new Date('2026-07-10T09:00:00.000Z'),
      startedAt: new Date('2026-07-10T09:00:00.000Z'),
      finishedAt: new Date('2026-07-10T09:00:05.000Z'),
      durationMs: 5000,
      errorCode: null,
      errorMessage: null,
      retryCount: 0,
      report: { id: 'report-1', summary: 'Bullish', needsHumanReview: false, signalCount: 1 },
      artifacts: [{ id: 'artifact-1', sourceRef: 'https://example.com', fidelity: 'high', contentPreview: 'preview', contentLength: 200 }]
    };

    const app = await buildServer({
      agentRepository: createFakeAgentRepo(),
      auth: createTestAuthDeps(),
      agents: {
        promptRepository: {
          savePromptVersion: async () => {
            throw new Error('not used');
          },
          getLatestPromptVersion: async () => null
        },
        reportRepository: {
          getLatestRunReport: async () => null,
          listReportsForAgent: async () => []
        }
      },
      runs: { runsRepository: createFakeRunsRepo([runDetail]) },
      accessResolver: createAccessResolver() as any
    });

    const res = await app.inject({ method: 'GET', url: '/api/agents/agent-1/runs', headers: authCookieHeader() });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe('run-1');
    expect(body[0].report.summary).toBe('Bullish');
    expect(body[0].artifacts[0].sourceRef).toBe('https://example.com');
  });

  it('downloads the full artifact content', async () => {
    const runDetail: RunDetailRecord = {
      id: 'run-1',
      agentId: 'agent-1',
      status: 'succeeded',
      scheduledFor: new Date('2026-07-10T09:00:00.000Z'),
      startedAt: new Date('2026-07-10T09:00:00.000Z'),
      finishedAt: new Date('2026-07-10T09:00:05.000Z'),
      durationMs: 5000,
      errorCode: null,
      errorMessage: null,
      retryCount: 0,
      report: null,
      artifacts: [{ id: 'artifact-1', sourceRef: 'https://example.com', fidelity: 'high', contentPreview: 'preview', contentLength: 200 }]
    };

    const app = await buildServer({
      agentRepository: createFakeAgentRepo(),
      auth: createTestAuthDeps(),
      agents: {
        promptRepository: {
          savePromptVersion: async () => {
            throw new Error('not used');
          },
          getLatestPromptVersion: async () => null
        },
        reportRepository: {
          getLatestRunReport: async () => null,
          listReportsForAgent: async () => []
        }
      },
      runs: { runsRepository: createFakeRunsRepo([runDetail]) },
      accessResolver: createAccessResolver() as any
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/agents/agent-1/runs/run-1/artifacts/artifact-1/download',
      headers: authCookieHeader()
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.body).toBe('full content for https://example.com');
  });

  it('returns 404 when downloading a non-existent artifact', async () => {
    const app = await buildServer({
      agentRepository: createFakeAgentRepo(),
      auth: createTestAuthDeps(),
      agents: {
        promptRepository: {
          savePromptVersion: async () => {
            throw new Error('not used');
          },
          getLatestPromptVersion: async () => null
        },
        reportRepository: {
          getLatestRunReport: async () => null,
          listReportsForAgent: async () => []
        }
      },
      runs: { runsRepository: createFakeRunsRepo([]) },
      accessResolver: createAccessResolver() as any
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/agents/agent-1/runs/run-1/artifacts/missing/download',
      headers: authCookieHeader()
    });
    expect(res.statusCode).toBe(404);
  });

  it('denies run list access before reading data', async () => {
    const listRunDetailsForAgent = vi.fn(async () => []);
    const app = await buildServer({
      agentRepository: createFakeAgentRepo(),
      auth: createTestAuthDeps(),
      agents: {
        promptRepository: { savePromptVersion: async () => { throw new Error('unused'); }, getLatestPromptVersion: async () => null },
        reportRepository: { getLatestRunReport: async () => null, listReportsForAgent: async () => [] }
      },
      runs: {
        runsRepository: {
          listRunDetailsForAgent,
          getArtifactContent: async () => null
        }
      },
      accessResolver: createAccessResolver(() => false) as any
    });

    const res = await app.inject({ method: 'GET', url: '/api/agents/agent-1/runs', headers: authCookieHeader('blocked-user') });
    expect(res.statusCode).toBe(403);
    expect(listRunDetailsForAgent).not.toHaveBeenCalled();
  });

  it('denies artifact download before reading artifact content', async () => {
    const getArtifactContent = vi.fn(async () => ({ sourceRef: 'https://example.com', content: 'x' }));
    const app = await buildServer({
      agentRepository: createFakeAgentRepo(),
      auth: createTestAuthDeps(),
      agents: {
        promptRepository: { savePromptVersion: async () => { throw new Error('unused'); }, getLatestPromptVersion: async () => null },
        reportRepository: { getLatestRunReport: async () => null, listReportsForAgent: async () => [] }
      },
      runs: {
        runsRepository: {
          listRunDetailsForAgent: async () => [],
          getArtifactContent
        }
      },
      accessResolver: createAccessResolver(() => false) as any
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/agents/agent-1/runs/run-1/artifacts/artifact-1/download',
      headers: authCookieHeader('blocked-user')
    });
    expect(res.statusCode).toBe(403);
    expect(getArtifactContent).not.toHaveBeenCalled();
  });
});
