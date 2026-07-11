import { describe, expect, it, vi } from 'vitest';
import { AgentRunner } from './agent-runner';
import type { Agent } from '../agents/types';

function createDeps(overrides: Partial<Parameters<typeof AgentRunner>[0]> = {}) {
  const agent: Agent = {
    id: 'agent-1',
    ownerUserId: 'admin-user-id',
    name: 'Housing Agent',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    sources: [{ type: 'web_urls', value: 'https://example.com/article' }]
  };

  const artifactRepository = { saveArtifact: vi.fn(async (input) => ({ ...input, id: 'artifact-1', createdAt: new Date() })) };
  const reportRepository = {
    saveRunReport: vi.fn(async (input) => ({ ...input, id: 'report-1', createdAt: new Date() }))
  };

  return {
    agentRepository: { getAgent: vi.fn(async () => agent) },
    promptRepository: {
      getLatestPromptVersion: vi.fn(async () => ({
        id: 'prompt-1',
        agentId: 'agent-1',
        version: 1,
        model: 'claude-sonnet-4-5',
        systemPrompt: 'Analyze for signals',
        enabled: true,
        createdAt: new Date()
      }))
    },
    artifactRepository,
    reportRepository,
    claudeClient: {
      analyze: vi.fn(async () => ({
        summary: 'Bullish on AAPL',
        signals: [{ symbol: 'AAPL', side: 'long' as const, confidence: 82, rationale: 'guidance', citations: ['https://example.com/article'] }],
        sourceWarnings: [],
        needsHumanReview: false
      }))
    },
    sourceAdapters: {
      web_urls: { fetch: vi.fn(async () => [{ sourceId: 's1', sourceType: 'web_urls' as const, sourceRef: 'https://example.com/article', content: 'guidance', fidelity: 'high' as const, citations: [] }]) },
      podcast_feeds: { fetch: vi.fn(async () => []) }
    },
    ...overrides
  };
}

describe('AgentRunner', () => {
  it('stores artifacts and a report when a run succeeds', async () => {
    const deps = createDeps();
    const runner = new AgentRunner(deps as never);

    const result = await runner.run('agent-1', 'run-1');

    expect(result.status).toBe('succeeded');
    expect(deps.reportRepository.saveRunReport).toHaveBeenCalledTimes(1);
    expect(deps.artifactRepository.saveArtifact).toHaveBeenCalledTimes(1);
  });

  it('fails gracefully when no prompt version is configured', async () => {
    const deps = createDeps({
      promptRepository: { getLatestPromptVersion: vi.fn(async () => null) }
    } as never);
    const runner = new AgentRunner(deps as never);

    const result = await runner.run('agent-1', 'run-1');
    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('missing_prompt_version');
  });

  it('records a source warning and continues when a source adapter throws', async () => {
    const deps = createDeps();
    deps.sourceAdapters.web_urls.fetch = vi.fn(async () => {
      throw new Error('network down');
    });
    const runner = new AgentRunner(deps as never);

    const result = await runner.run('agent-1', 'run-1');

    expect(result.status).toBe('succeeded');
    const savedReport = deps.reportRepository.saveRunReport.mock.calls[0][0];
    expect(savedReport.sourceWarnings[0]).toContain('network down');
  });
});
