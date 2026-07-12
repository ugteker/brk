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
  const cursorRepository = { getCursor: vi.fn(async () => null), saveCursor: vi.fn(async () => undefined) };

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
    cursorRepository,
    sourceAdapters: {
      web_urls: {
        fetch: vi.fn(async () => ({
          evidence: [{ sourceId: 's1', sourceType: 'web_urls' as const, sourceRef: 'https://example.com/article', content: 'guidance', fidelity: 'high' as const, citations: [] }]
        }))
      },
      podcast_feeds: { fetch: vi.fn(async () => ({ evidence: [] })) }
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
    deps.agentRepository.getAgent = vi.fn(async () => ({
      id: 'agent-1',
      ownerUserId: 'admin-user-id',
      name: 'Housing Agent',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      sources: [
        { type: 'web_urls', value: 'https://example.com/article' },
        { type: 'podcast_feeds', value: 'https://example.com/feed' }
      ]
    }));
    deps.sourceAdapters.web_urls.fetch = vi.fn(async () => {
      throw new Error('network down');
    });
    deps.sourceAdapters.podcast_feeds.fetch = vi.fn(async () => ({
      evidence: [{ sourceId: 's2', sourceType: 'podcast_feeds' as const, sourceRef: 'https://example.com/feed', content: 'episode notes', fidelity: 'low' as const, citations: [] }]
    }));
    const runner = new AgentRunner(deps as never);

    const result = await runner.run('agent-1', 'run-1');

    expect(result.status).toBe('succeeded');
    const savedReport = deps.reportRepository.saveRunReport.mock.calls[0][0];
    expect(savedReport.sourceWarnings[0]).toContain('network down');
  });

  it('skips the Claude call/report and returns succeeded_no_new_content when no source has new evidence', async () => {
    const deps = createDeps();
    deps.sourceAdapters.web_urls.fetch = vi.fn(async () => ({ evidence: [] }));
    const runner = new AgentRunner(deps as never);

    const result = await runner.run('agent-1', 'run-1');

    expect(result.status).toBe('succeeded_no_new_content');
    expect(deps.claudeClient.analyze).not.toHaveBeenCalled();
    expect(deps.reportRepository.saveRunReport).not.toHaveBeenCalled();
  });

  it('applies pending cursor updates only after the report is saved successfully', async () => {
    const deps = createDeps();
    const cursorUpdate = { agentId: 'agent-1', sourceValue: 'https://example.com/article', strategy: 'content_hash' as const, seenItemIds: [], lastItemPublishedAt: null, lastContentHash: 'abc' };
    deps.sourceAdapters.web_urls.fetch = vi.fn(async () => ({
      evidence: [{ sourceId: 's1', sourceType: 'web_urls' as const, sourceRef: 'https://example.com/article', content: 'guidance', fidelity: 'high' as const, citations: [] }],
      cursorUpdate
    }));
    const runner = new AgentRunner(deps as never);

    await runner.run('agent-1', 'run-1');

    expect(deps.cursorRepository.saveCursor).toHaveBeenCalledWith(cursorUpdate);
  });

  it('captures the real error message (not just a generic code) when the Claude analysis call fails after evidence was already fetched', async () => {
    const deps = createDeps();
    deps.claudeClient.analyze = vi.fn(async () => {
      throw new Error('Claude API request timed out after 30000ms');
    });
    const runner = new AgentRunner(deps as never);

    const result = await runner.run('agent-1', 'run-1');

    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('agent_run_failed');
    expect(result.errorMessage).toBe('Claude API request timed out after 30000ms');
    // The artifact for the successfully-fetched evidence must still have been saved even though
    // the overall run failed later at the analysis step.
    expect(deps.artifactRepository.saveArtifact).toHaveBeenCalledTimes(1);
  });
});
