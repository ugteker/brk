import { describe, expect, it } from 'vitest';
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
} {
  const agents = new Map<string, Agent>();
  return {
    async createAgent(ownerUserId: string, input: CreateAgentInput): Promise<Agent> {
      const agent: Agent = {
        id: 'agent-1',
        ownerUserId,
        name: input.name,
        description: input.description ?? '',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        sources: input.sources.map((s) => ({ ...s, frequencyMinutes: s.frequencyMinutes ?? 60 })),
        preferences: input.preferences,
        recipients: input.recipients,
        schedule: input.schedule
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
    }
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
      runs: { runsRepository: createFakeRunsRepo([runDetail]) }
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
      runs: { runsRepository: createFakeRunsRepo([runDetail]) }
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
      runs: { runsRepository: createFakeRunsRepo([]) }
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/agents/agent-1/runs/run-1/artifacts/missing/download',
      headers: authCookieHeader()
    });
    expect(res.statusCode).toBe(404);
  });
});
