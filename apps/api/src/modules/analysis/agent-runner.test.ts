import { describe, expect, it, vi } from 'vitest';
import { AgentRunner } from './agent-runner';
import type { Agent } from '../agents/types';

function summarizerReport(summary = 'Bullish on AAPL') {
  return {
    common: { summary, key_takeaways: [], sources_used: [], citations: [] },
    section: {
      character_type: 'summarizer' as const,
      bullet_digest: []
    }
  };
}

function createDeps(overrides: Partial<Parameters<typeof AgentRunner>[0]> = {}) {
  const agent: Agent = {
    id: 'agent-1',
    ownerUserId: 'admin-user-id',
    name: 'Housing Agent',
    description: '',
    characterType: 'summarizer',
    promptConfig: {},
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    sources: [{ type: 'web_urls', value: 'https://example.com/article', frequencyMinutes: 60, maxItems: 1 }],
    preferences: {},
    schedule: null
  };

  const artifactRepository = { saveArtifact: vi.fn(async (input) => ({ ...input, id: 'artifact-1', createdAt: new Date() })) };
  const reportRepository = {
    saveRunReport: vi.fn(async (input) => ({ ...input, id: 'report-1', createdAt: new Date() }))
  };
  const cursorRepository = {
    getCursor: vi.fn(async () => null),
    saveCursor: vi.fn(async () => undefined),
    touchCrawlAttempt: vi.fn(async () => undefined)
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
        signals: [],
        report: summarizerReport(),
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

  it('builds the effective staged system prompt before calling Claude analyze', async () => {
    const deps = createDeps({
      agentRepository: {
        getAgent: vi.fn(async () => ({
          id: 'agent-1',
          ownerUserId: 'admin-user-id',
          name: 'Housing Agent',
          description: '',
          characterType: 'teacher',
          promptConfig: {
            tone: 'encouraging',
            custom_instructions: 'Use mini examples first, then definitions.'
          },
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
          sources: [{ type: 'web_urls', value: 'https://example.com/article', frequencyMinutes: 60, maxItems: 1 }],
          preferences: {},
          schedule: null
        }))
      },
      promptRepository: {
        getLatestPromptVersion: vi.fn(async () => ({
          id: 'prompt-1',
          agentId: 'agent-1',
          version: 1,
          model: 'claude-sonnet-4-5',
          systemPrompt: 'Explain signal confidence assumptions clearly.',
          enabled: true,
          createdAt: new Date()
        }))
      }
    });
    const runner = new AgentRunner(deps as never);

    await runner.run('agent-1', 'run-1');

    const analyzeInput = deps.claudeClient.analyze.mock.calls[0][0];
    expect(analyzeInput.systemPrompt).toContain('clear and patient teacher');
    expect(analyzeInput.systemPrompt).toContain('- tone: encouraging');
    expect(analyzeInput.systemPrompt).toContain('Explain signal confidence assumptions clearly.');
    expect(analyzeInput.systemPrompt).toContain('Use mini examples first, then definitions.');
  });

  it('skips fetching a source whose frequencyMinutes has not elapsed since its last crawl', async () => {
    const deps = createDeps({
      cursorRepository: {
        getCursor: vi.fn(async () => ({
          agentId: 'agent-1',
          sourceValue: 'https://example.com/article',
          strategy: 'content_hash' as const,
          seenItemIds: [],
          lastItemPublishedAt: null,
          lastContentHash: null,
          lastCrawledAt: new Date(Date.now() - 5 * 60_000).toISOString() // crawled 5 min ago
        })),
        saveCursor: vi.fn(async () => undefined),
        touchCrawlAttempt: vi.fn(async () => undefined)
      }
    });
    const runner = new AgentRunner(deps as never);

    const result = await runner.run('agent-1', 'run-1');

    expect(deps.sourceAdapters.web_urls.fetch).not.toHaveBeenCalled();
    expect(deps.cursorRepository.touchCrawlAttempt).not.toHaveBeenCalled();
    expect(result.status).toBe('succeeded_no_new_content');
  });

  it('re-fetches a source once its frequencyMinutes has elapsed since its last crawl', async () => {
    const deps = createDeps({
      cursorRepository: {
        getCursor: vi.fn(async () => ({
          agentId: 'agent-1',
          sourceValue: 'https://example.com/article',
          strategy: 'content_hash' as const,
          seenItemIds: [],
          lastItemPublishedAt: null,
          lastContentHash: null,
          lastCrawledAt: new Date(Date.now() - 120 * 60_000).toISOString() // crawled 2h ago, frequency is 60 min
        })),
        saveCursor: vi.fn(async () => undefined),
        touchCrawlAttempt: vi.fn(async () => undefined)
      }
    });
    const runner = new AgentRunner(deps as never);

    const result = await runner.run('agent-1', 'run-1');

    expect(deps.sourceAdapters.web_urls.fetch).toHaveBeenCalledTimes(1);
    expect(deps.cursorRepository.touchCrawlAttempt).toHaveBeenCalledWith(
      'agent-1',
      'https://example.com/article',
      expect.any(String)
    );
    expect(result.status).toBe('succeeded');
  });

  it('forces crawling one specific episode from one source when forcedEpisode is given, skipping other sources', async () => {
    const podcastFetch = vi.fn(async () => ({
      evidence: [{ sourceId: 'https://example.com/feed.xml', sourceType: 'podcast_feeds' as const, sourceRef: 'https://example.com/ep-2', content: 'transcript', fidelity: 'high' as const, citations: [] }]
    }));
    const webUrlsFetch = vi.fn(async () => ({ evidence: [] }));
    const deps = createDeps({
      agentRepository: {
        getAgent: vi.fn(async () => ({
          id: 'agent-1',
          ownerUserId: 'admin-user-id',
          name: 'Housing Agent',
          description: '',
          characterType: 'summarizer',
          promptConfig: {},
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
          sources: [
            { type: 'web_urls', value: 'https://example.com/article', frequencyMinutes: 60, maxItems: 1 },
            { type: 'podcast_feeds', value: 'https://example.com/feed.xml', frequencyMinutes: 60, maxItems: 1 }
          ],
          preferences: {},
          schedule: null
        }))
      },
      sourceAdapters: {
        web_urls: { fetch: webUrlsFetch },
        podcast_feeds: { fetch: podcastFetch }
      }
    });
    const runner = new AgentRunner(deps as never);

    const result = await runner.run('agent-1', 'run-1', {
      forcedEpisode: { sourceType: 'podcast_feeds', sourceValue: 'https://example.com/feed.xml', itemLink: 'https://example.com/ep-2' }
    });

    expect(result.status).toBe('succeeded');
    expect(webUrlsFetch).not.toHaveBeenCalled();
    expect(podcastFetch).toHaveBeenCalledWith('agent-1', expect.objectContaining({ value: 'https://example.com/feed.xml' }), {
      forcedItemLink: 'https://example.com/ep-2'
    });
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
      description: '',
      characterType: 'summarizer',
      promptConfig: {},
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

  it('passes model, prompt version, token usage, and estimated cost to saveRunReport when Claude reports usage', async () => {
    const deps = createDeps();
    deps.claudeClient.analyze = vi.fn(async () => ({
      summary: 'Bullish on AAPL',
      signals: [],
      report: summarizerReport(),
      sourceWarnings: [],
      needsHumanReview: false,
      usage: { inputTokens: 1000, outputTokens: 200 }
    }));
    const runner = new AgentRunner(deps as never);

    await runner.run('agent-1', 'run-1');

    const savedReport = deps.reportRepository.saveRunReport.mock.calls[0][0];
    expect(savedReport.model).toBe('claude-sonnet-4-5');
    expect(savedReport.promptVersionNumber).toBe(1);
    expect(savedReport.inputTokens).toBe(1000);
    expect(savedReport.outputTokens).toBe(200);
    expect(savedReport.estimatedCostUsd).toBeCloseTo((1000 * 3 + 200 * 15) / 1_000_000);
  });

  it('saves null usage/cost fields when Claude does not report usage (best-effort, never fails the run)', async () => {
    const deps = createDeps();
    const runner = new AgentRunner(deps as never);

    const result = await runner.run('agent-1', 'run-1');

    expect(result.status).toBe('succeeded');
    const savedReport = deps.reportRepository.saveRunReport.mock.calls[0][0];
    expect(savedReport.model).toBe('claude-sonnet-4-5');
    expect(savedReport.promptVersionNumber).toBe(1);
    expect(savedReport.inputTokens).toBeNull();
    expect(savedReport.outputTokens).toBeNull();
    expect(savedReport.estimatedCostUsd).toBeNull();
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

  it('reports crawling, analyzing, notifying phases in order for a successful run', async () => {
    const onPhaseChange = vi.fn(async () => undefined);
    const deps = createDeps({ onPhaseChange } as never);
    const runner = new AgentRunner(deps as never);

    await runner.run('agent-1', 'run-1');

    expect(onPhaseChange.mock.calls.map((call) => call[1])).toEqual(['crawling', 'analyzing', 'notifying']);
    expect(onPhaseChange.mock.calls[0][0]).toBe('run-1');
  });

  it('does not report analyzing/notifying phases when there is no new evidence', async () => {
    const onPhaseChange = vi.fn(async () => undefined);
    const deps = createDeps({ onPhaseChange } as never);
    deps.sourceAdapters.web_urls.fetch = vi.fn(async () => ({ evidence: [] }));
    const runner = new AgentRunner(deps as never);

    await runner.run('agent-1', 'run-1');

    expect(onPhaseChange.mock.calls.map((call) => call[1])).toEqual(['crawling']);
  });

  it('never fails the run when onPhaseChange itself throws', async () => {
    const deps = createDeps({ onPhaseChange: vi.fn(async () => { throw new Error('db down'); }) } as never);
    const runner = new AgentRunner(deps as never);

    const result = await runner.run('agent-1', 'run-1');

    expect(result.status).toBe('succeeded');
  });

  it('sends a best-effort report notification via the mailer after a successful run', async () => {
    const send = vi.fn(async () => undefined);
    const deps = createDeps();
    deps.agentRepository.getAgent = vi.fn(async () => ({
      id: 'agent-1',
      ownerUserId: 'admin-user-id',
      name: 'Housing Agent',
      description: '',
      characterType: 'summarizer',
      promptConfig: {},
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      sources: [{ type: 'web_urls', value: 'https://example.com/article', frequencyMinutes: 60, maxItems: 1 }],
      preferences: {},
      schedule: null
    }));
    const runner = new AgentRunner({ ...deps, mailer: { send } } as never);

    await runner.run('agent-1', 'run-1', { playbookRecipients: ['alerts@example.com'] });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].to).toBe('alerts@example.com');
  });

  it('does not fail the run when the mailer send throws', async () => {
    const send = vi.fn(async () => { throw new Error('smtp down'); });
    const deps = createDeps();
    deps.agentRepository.getAgent = vi.fn(async () => ({
      id: 'agent-1',
      ownerUserId: 'admin-user-id',
      name: 'Housing Agent',
      description: '',
      characterType: 'summarizer',
      promptConfig: {},
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      sources: [{ type: 'web_urls', value: 'https://example.com/article', frequencyMinutes: 60, maxItems: 1 }],
      preferences: {},
      schedule: null
    }));
    const runner = new AgentRunner({ ...deps, mailer: { send } } as never);

    const result = await runner.run('agent-1', 'run-1');

    expect(result.status).toBe('succeeded');
  });
});
