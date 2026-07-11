import { describe, expect, it } from 'vitest';
import { buildServer } from '../../server';
import type { Agent, CreateAgentInput } from '../agents/types';
import { authCookieHeader, createTestAuthDeps } from '../../test-utils/auth';

function createFakeAgentRepo() {
  const agents = new Map<string, Agent>();
  return {
    async createAgent(ownerUserId: string, input: CreateAgentInput): Promise<Agent> {
      const agent: Agent = {
        id: 'agent-1',
        ownerUserId,
        name: input.name,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        sources: input.sources
      };
      agents.set(agent.id, agent);
      return agent;
    },
    async updateAgent(agentId: string, patch: Partial<CreateAgentInput>): Promise<Agent> {
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

describe('agent routes', () => {
  it('returns latest agent report and prompt version through the API', async () => {
    const app = await buildServer({
      agentRepository: createFakeAgentRepo(),
      auth: createTestAuthDeps(),
      agents: {
        promptRepository: {
          savePromptVersion: async () => {
            throw new Error('not used in this test');
          },
          getLatestPromptVersion: async () => ({
            id: 'prompt-1',
            agentId: 'agent-1',
            version: 1,
            model: 'claude-sonnet-4-5',
            systemPrompt: 'Analyze for signals',
            enabled: true,
            createdAt: new Date()
          })
        },
        reportRepository: {
          getLatestRunReport: async () => ({
            id: 'report-1',
            agentId: 'agent-1',
            agentRunId: 'run-1',
            promptVersionId: 'prompt-1',
            summary: 'Bullish on AAPL',
            sourceWarnings: [],
            needsHumanReview: false,
            signals: [{ symbol: 'AAPL', side: 'long', confidence: 82, rationale: 'guidance', citations: ['ep1@10:12'] }],
            createdAt: new Date()
          }),
          listReportsForAgent: async () => []
        }
      }
    });

    const res = await app.inject({ method: 'GET', url: '/api/agents/agent-1/report/latest', headers: authCookieHeader() });

    expect(res.statusCode).toBe(200);
    expect(res.json().signals[0].symbol).toBe('AAPL');

    const promptRes = await app.inject({ method: 'GET', url: '/api/agents/agent-1/prompt/latest', headers: authCookieHeader() });
    expect(promptRes.statusCode).toBe(200);
    expect(promptRes.json().model).toBe('claude-sonnet-4-5');
  });

  it('returns 404 when no report exists yet', async () => {
    const app = await buildServer({
      agentRepository: createFakeAgentRepo(),
      auth: createTestAuthDeps(),
      agents: {
        promptRepository: { savePromptVersion: async () => { throw new Error('unused'); }, getLatestPromptVersion: async () => null },
        reportRepository: { getLatestRunReport: async () => null, listReportsForAgent: async () => [] }
      }
    });

    const res = await app.inject({ method: 'GET', url: '/api/agents/agent-1/report/latest', headers: authCookieHeader() });
    expect(res.statusCode).toBe(404);
  });

  it('lists all reports for an agent', async () => {
    const reports = [
      {
        id: 'report-1',
        agentId: 'agent-1',
        agentRunId: 'run-1',
        promptVersionId: 'prompt-1',
        summary: 'Bullish on AAPL',
        sourceWarnings: [],
        needsHumanReview: false,
        signals: [{ symbol: 'AAPL', side: 'long', confidence: 82, rationale: 'guidance', citations: ['ep1@10:12'] }],
        createdAt: new Date('2026-07-10T00:00:00.000Z')
      },
      {
        id: 'report-2',
        agentId: 'agent-1',
        agentRunId: 'run-2',
        promptVersionId: 'prompt-1',
        summary: 'Bearish on TSLA',
        sourceWarnings: [],
        needsHumanReview: false,
        signals: [{ symbol: 'TSLA', side: 'short', confidence: 60, rationale: 'weak demand', citations: ['ep2@01:12'] }],
        createdAt: new Date('2026-07-09T00:00:00.000Z')
      }
    ];

    const app = await buildServer({
      agentRepository: createFakeAgentRepo(),
      auth: createTestAuthDeps(),
      agents: {
        promptRepository: { savePromptVersion: async () => { throw new Error('unused'); }, getLatestPromptVersion: async () => null },
        reportRepository: { getLatestRunReport: async () => null, listReportsForAgent: async () => reports }
      }
    });

    const res = await app.inject({ method: 'GET', url: '/api/agents/agent-1/reports', headers: authCookieHeader() });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(2);
    expect(res.json()[0].summary).toBe('Bullish on AAPL');
  });

  it('saves a new system prompt version', async () => {
    const app = await buildServer({
      agentRepository: createFakeAgentRepo(),
      auth: createTestAuthDeps(),
      agents: {
        promptRepository: {
          savePromptVersion: async (agentId, input) => ({
            id: 'prompt-2',
            agentId,
            version: 2,
            model: input.model,
            systemPrompt: input.systemPrompt,
            enabled: input.enabled,
            createdAt: new Date()
          }),
          getLatestPromptVersion: async () => null
        },
        reportRepository: { getLatestRunReport: async () => null, listReportsForAgent: async () => [] }
      }
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/agents/agent-1/prompt',
      headers: authCookieHeader(),
      payload: { model: 'claude-sonnet-4-5', systemPrompt: 'Analyze for signals', enabled: true }
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().version).toBe(2);
  });
});
