import { describe, expect, it, vi } from 'vitest';
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
          listReportsForAgent: async () => [], listSignalHistoryForSymbol: async () => []
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
        reportRepository: { getLatestRunReport: async () => null, listReportsForAgent: async () => [], listSignalHistoryForSymbol: async () => [] }
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
        reportRepository: { getLatestRunReport: async () => null, listReportsForAgent: async () => reports, listSignalHistoryForSymbol: async () => [] }
      }
    });

    const res = await app.inject({ method: 'GET', url: '/api/agents/agent-1/reports', headers: authCookieHeader() });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(2);
    expect(res.json()[0].summary).toBe('Bullish on AAPL');
  });

  it('returns signal history for a symbol', async () => {
    const history = [
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
      }
    ];

    const app = await buildServer({
      agentRepository: createFakeAgentRepo(),
      auth: createTestAuthDeps(),
      agents: {
        promptRepository: { savePromptVersion: async () => { throw new Error('unused'); }, getLatestPromptVersion: async () => null },
        reportRepository: {
          getLatestRunReport: async () => null,
          listReportsForAgent: async () => [],
          listSignalHistoryForSymbol: async (agentId: string, symbol: string) => (agentId === 'agent-1' && symbol === 'AAPL' ? history : [])
        }
      }
    });

    const res = await app.inject({ method: 'GET', url: '/api/agents/agent-1/signals/AAPL', headers: authCookieHeader() });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
    expect(res.json()[0].summary).toBe('Bullish on AAPL');
  });

  it('returns an empty array when there is no signal history for a symbol', async () => {
    const app = await buildServer({
      agentRepository: createFakeAgentRepo(),
      auth: createTestAuthDeps(),
      agents: {
        promptRepository: { savePromptVersion: async () => { throw new Error('unused'); }, getLatestPromptVersion: async () => null },
        reportRepository: {
          getLatestRunReport: async () => null,
          listReportsForAgent: async () => [],
          listSignalHistoryForSymbol: async () => []
        }
      }
    });

    const res = await app.inject({ method: 'GET', url: '/api/agents/agent-1/signals/MSFT', headers: authCookieHeader() });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
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
        reportRepository: { getLatestRunReport: async () => null, listReportsForAgent: async () => [], listSignalHistoryForSymbol: async () => [] }
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

  describe('POST /api/agents/:agentId/reports/:reportId/resend-notification', () => {
    const sampleReport = {
      id: 'report-1',
      agentId: 'agent-1',
      agentRunId: 'run-1',
      promptVersionId: 'prompt-1',
      summary: 'Bullish on AAPL',
      sourceWarnings: [],
      needsHumanReview: false,
      signals: [{ symbol: 'AAPL', side: 'long' as const, confidence: 82, rationale: 'guidance', citations: ['ep1@10:12'] }],
      createdAt: new Date('2026-07-10T00:00:00.000Z')
    };

    function unusedPromptRepo() {
      return { savePromptVersion: async () => { throw new Error('unused'); }, getLatestPromptVersion: async () => null };
    }

    it('sends the notification and returns the recipient count', async () => {
      const send = vi.fn().mockResolvedValue(undefined);
      const app = await buildServer({
        agentRepository: createFakeAgentRepo(),
        auth: { ...createTestAuthDeps(), mailer: { send } },
        agents: {
          promptRepository: unusedPromptRepo(),
          reportRepository: { getLatestRunReport: async () => null, listReportsForAgent: async () => [], listSignalHistoryForSymbol: async () => [], getReportById: async () => sampleReport },
          agentRepository: { getAgent: async () => ({ id: 'agent-1', ownerUserId: 'user-1', name: 'Agent One', description: '', status: 'active', createdAt: new Date(), updatedAt: new Date(), sources: [], preferences: {}, recipients: ['a@example.com', 'b@example.com'], schedule: null }) },
          mailer: { send }
        }
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/agents/agent-1/reports/report-1/resend-notification',
        headers: authCookieHeader()
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: 'sent', recipientCount: 2 });
      expect(send).toHaveBeenCalledTimes(2);
    });

    it('returns 404 when the agent does not exist', async () => {
      const app = await buildServer({
        agentRepository: createFakeAgentRepo(),
        auth: createTestAuthDeps(),
        agents: {
          promptRepository: unusedPromptRepo(),
          reportRepository: { getLatestRunReport: async () => null, listReportsForAgent: async () => [], listSignalHistoryForSymbol: async () => [], getReportById: async () => sampleReport },
          agentRepository: { getAgent: async () => null }
        }
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/agents/agent-missing/reports/report-1/resend-notification',
        headers: authCookieHeader()
      });

      expect(res.statusCode).toBe(404);
    });

    it('returns 404 when the report does not exist', async () => {
      const app = await buildServer({
        agentRepository: createFakeAgentRepo(),
        auth: createTestAuthDeps(),
        agents: {
          promptRepository: unusedPromptRepo(),
          reportRepository: { getLatestRunReport: async () => null, listReportsForAgent: async () => [], listSignalHistoryForSymbol: async () => [], getReportById: async () => null },
          agentRepository: { getAgent: async () => ({ id: 'agent-1', ownerUserId: 'user-1', name: 'Agent One', description: '', status: 'active', createdAt: new Date(), updatedAt: new Date(), sources: [], preferences: {}, recipients: ['a@example.com'], schedule: null }) }
        }
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/agents/agent-1/reports/report-missing/resend-notification',
        headers: authCookieHeader()
      });

      expect(res.statusCode).toBe(404);
    });

    it('returns 404 when the report belongs to a different agent', async () => {
      const app = await buildServer({
        agentRepository: createFakeAgentRepo(),
        auth: createTestAuthDeps(),
        agents: {
          promptRepository: unusedPromptRepo(),
          reportRepository: {
            getLatestRunReport: async () => null,
            listReportsForAgent: async () => [], listSignalHistoryForSymbol: async () => [],
            getReportById: async () => ({ ...sampleReport, agentId: 'agent-2' })
          },
          agentRepository: { getAgent: async () => ({ id: 'agent-1', ownerUserId: 'user-1', name: 'Agent One', description: '', status: 'active', createdAt: new Date(), updatedAt: new Date(), sources: [], preferences: {}, recipients: ['a@example.com'], schedule: null }) }
        }
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/agents/agent-1/reports/report-1/resend-notification',
        headers: authCookieHeader()
      });

      expect(res.statusCode).toBe(404);
    });

    it('returns 400 when the agent has no recipients configured', async () => {
      const app = await buildServer({
        agentRepository: createFakeAgentRepo(),
        auth: createTestAuthDeps(),
        agents: {
          promptRepository: unusedPromptRepo(),
          reportRepository: { getLatestRunReport: async () => null, listReportsForAgent: async () => [], listSignalHistoryForSymbol: async () => [], getReportById: async () => sampleReport },
          agentRepository: { getAgent: async () => ({ id: 'agent-1', ownerUserId: 'user-1', name: 'Agent One', description: '', status: 'active', createdAt: new Date(), updatedAt: new Date(), sources: [], preferences: {}, recipients: [], schedule: null }) }
        }
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/agents/agent-1/reports/report-1/resend-notification',
        headers: authCookieHeader()
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('no_recipients');
    });
  });
});
