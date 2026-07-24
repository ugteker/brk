import { describe, expect, it, vi } from 'vitest';
import { AgentRunner } from './agent-runner';
import { SourceIngestionService } from '../source/ingestion-service';
import { PodcastFeedAdapter } from './source-adapters/podcast-feed-adapter';
import { InMemorySourceCursorRepository } from '../crawler/source-cursor-repository';
import { InMemorySourceCrawlConfigRepository } from '../crawler/crawl-config-repository';
import { logger } from '../../lib/logger';
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

function createPromptVersion() {
  return {
    id: 'prompt-1',
    agentId: 'agent-1',
    version: 1,
    model: 'claude-sonnet-4-5',
    systemPrompt: 'Analyze for signals',
    enabled: true,
    createdAt: new Date()
  };
}

function createAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-1',
    ownerUserId: 'admin-user-id',
    name: 'Housing Agent',
    description: '',
    characterType: 'summarizer',
    promptConfig: {},
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    sources: [],
    preferences: {},
    schedule: null,
    ...overrides
  };
}

function createDeps(overrides: Partial<Parameters<typeof AgentRunner>[0]> = {}) {
  const artifactRepository = {
    saveArtifact: vi.fn(async (input) => ({ ...input, id: `artifact-${Math.random()}`, createdAt: new Date() }))
  };
  const reportRepository = {
    saveRunReport: vi.fn(async (input) => ({ ...input, id: 'report-1', createdAt: new Date() }))
  };
  const ingestionRepository = {
    listPlaybookSources: vi.fn(async () => [
      {
        playbookId: 'playbook-1',
        sourceId: 'source-1',
        source: { id: 'source-1', type: 'web_urls' as const, value: 'https://example.com/article' }
      }
    ]),
    listUnconsumed: vi.fn(async () => [
      {
        id: 'item-1',
        sourceId: 'source-1',
        sourceType: 'web_urls' as const,
        sourceValue: 'https://example.com/article',
        title: 'Article 1',
        content: 'guidance',
        link: 'https://example.com/article',
        publishedAt: new Date('2026-07-24T10:00:00.000Z'),
        contentHash: 'hash-1',
        metadata: { fidelity: 'high', citations: ['https://example.com/article'] },
        createdAt: new Date('2026-07-24T10:00:00.000Z')
      }
    ]),
    markConsumed: vi.fn(async () => undefined),
    getSourceItemByLink: vi.fn(async () => ({
      id: 'item-1',
      sourceId: 'source-1',
      sourceType: 'web_urls' as const,
      sourceValue: 'https://example.com/article',
      title: 'Article 1',
      content: 'guidance',
      link: 'https://example.com/article',
      publishedAt: new Date('2026-07-24T10:00:00.000Z'),
      contentHash: 'hash-1',
      metadata: { fidelity: 'high', citations: ['https://example.com/article'] },
      createdAt: new Date('2026-07-24T10:00:00.000Z')
    }))
  };
  const ingestionService = {
    ensureFresh: vi.fn(async () => ({ warning: undefined }))
  };
  const cursorRepository = {
    getCursor: vi.fn(async () => null),
    saveCursor: vi.fn(async () => undefined),
    touchCrawlAttempt: vi.fn(async () => undefined)
  };

  return {
    agentRepository: { getAgent: vi.fn(async () => createAgent()) },
    promptRepository: {
      getPromptVersionById: vi.fn(async () => createPromptVersion()),
      getLatestPromptVersion: vi.fn(async () => createPromptVersion())
    },
    artifactRepository,
    reportRepository,
    cursorRepository,
    ingestionRepository,
    ingestionService,
    claudeClient: {
      analyze: vi.fn(async () => ({
        summary: 'Bullish on AAPL',
        signals: [],
        report: summarizerReport(),
        sourceWarnings: [],
        needsHumanReview: false
      }))
    },
    sourceAdapters: {
      web_urls: {
        fetch: vi.fn(async () => ({
          evidence: [
            {
              sourceId: 'https://example.com/article',
              sourceType: 'web_urls' as const,
              sourceRef: 'https://example.com/article',
              content: 'legacy guidance',
              fidelity: 'high' as const,
              citations: ['https://example.com/article'],
              itemId: 'legacy-item-1',
              publishedAt: '2026-07-24T10:00:00.000Z',
              title: 'Legacy article'
            }
          ],
          cursorUpdate: {
            agentId: 'agent-1',
            sourceValue: 'https://example.com/article',
            strategy: 'content_hash' as const,
            seenItemIds: [],
            lastItemPublishedAt: null,
            lastContentHash: 'legacy-hash'
          }
        }))
      }
    },
    ...overrides
  };
}

function createSharedSourceHarness() {
  const source = { id: 'source-1', type: 'web_urls' as const, value: 'https://example.com/article' };
  const state = {
    cursor: {} as Record<string, unknown>,
    refreshedAt: null as Date | null,
    leased: false,
    items: [] as any[],
    consumptions: new Set<string>()
  };

  const repository = {
    getSource: vi.fn(async () => source),
    getRefreshState: vi.fn(async () => ({ cursor: state.cursor, refreshedAt: state.refreshedAt })),
    claimRefresh: vi.fn(async (_sourceId: string, now: Date, _leaseMs: number, freshnessMs: number) => {
      if (state.leased) return false;
      if (state.refreshedAt && now.getTime() - state.refreshedAt.getTime() < freshnessMs) return false;
      state.leased = true;
      return true;
    }),
    completeRefresh: vi.fn(async (_sourceId: string, items: any[], cursor: Record<string, unknown>, now: Date) => {
      state.items = items.map((item, index) => ({
        id: `item-${index + 1}`,
        sourceId: source.id,
        sourceType: source.type,
        sourceValue: source.value,
        createdAt: now,
        ...item
      }));
      state.cursor = cursor;
      state.refreshedAt = now;
      state.leased = false;
    }),
    releaseRefresh: vi.fn(async () => {
      state.leased = false;
    }),
    listPlaybookSources: vi.fn(async (playbookId: string) => [{ playbookId, sourceId: source.id, source }]),
    listUnconsumed: vi.fn(async (playbookId: string) =>
      state.items.filter((item) => !state.consumptions.has(`${playbookId}::${item.id}`))
    ),
    markConsumed: vi.fn(async (playbookId: string, sourceItemIds: string[]) => {
      for (const sourceItemId of sourceItemIds) {
        state.consumptions.add(`${playbookId}::${sourceItemId}`);
      }
    }),
    getSourceItemByLink: vi.fn(async (_sourceId: string, link: string) => state.items.find((item) => item.link === link) ?? null)
  };

  const adapter = {
    fetch: vi.fn(async () => ({
      items: [
        {
          title: 'Shared article',
          content: 'shared guidance',
          link: 'https://example.com/article',
          publishedAt: new Date('2026-07-24T10:00:00.000Z'),
          contentHash: 'shared-hash',
          metadata: { fidelity: 'high', citations: ['https://example.com/article'] }
        }
      ],
      cursor: { lastContentHash: 'shared-hash' }
    }))
  };

  return { repository, adapter };
}

describe('AgentRunner', () => {
  it('stores artifacts and a report when a playbook run succeeds, then marks the consumed source items', async () => {
    const sequence: string[] = [];
    const deps = createDeps();
    deps.reportRepository.saveRunReport = vi.fn(async (input) => {
      sequence.push('report');
      return { ...input, id: 'report-1', createdAt: new Date() };
    });
    deps.ingestionRepository.markConsumed = vi.fn(async () => {
      sequence.push('consumed');
    });
    const runner = new AgentRunner(deps as never);

    const result = await runner.run('agent-1', 'run-1', {
      playbookId: 'playbook-1',
      playbookMaxItemsPerSource: 1
    });

    expect(result.status).toBe('succeeded');
    expect(deps.reportRepository.saveRunReport).toHaveBeenCalledTimes(1);
    expect(deps.artifactRepository.saveArtifact).toHaveBeenCalledTimes(1);
    expect(deps.ingestionRepository.markConsumed).toHaveBeenCalledWith('playbook-1', ['item-1'], expect.any(Date));
    expect(sequence).toEqual(['report', 'consumed']);
  });

  it('does not mark source items consumed when saving the report fails', async () => {
    const deps = createDeps();
    deps.reportRepository.saveRunReport = vi.fn(async () => {
      throw new Error('db down');
    });
    const runner = new AgentRunner(deps as never);

    const result = await runner.run('agent-1', 'run-1', {
      playbookId: 'playbook-1',
      playbookMaxItemsPerSource: 1
    });

    expect(result.status).toBe('failed');
    expect(deps.ingestionRepository.markConsumed).not.toHaveBeenCalled();
  });

  it('keeps forced episode runs retryable by resolving the stored item by link instead of marking it consumed', async () => {
    const deps = createDeps();
    const runner = new AgentRunner(deps as never);
    const options = {
      playbookId: 'playbook-1',
      forcedEpisode: {
        sourceType: 'web_urls' as const,
        sourceValue: 'https://example.com/article',
        itemLink: 'https://example.com/article'
      }
    };

    const first = await runner.run('agent-1', 'run-1', options);
    const second = await runner.run('agent-1', 'run-2', options);

    expect(first.status).toBe('succeeded');
    expect(second.status).toBe('succeeded');
    expect(deps.ingestionRepository.getSourceItemByLink).toHaveBeenCalledTimes(2);
    expect(deps.ingestionRepository.markConsumed).not.toHaveBeenCalled();
  });

  it('lets two playbooks analyze the same stored source item after one shared refresh', async () => {
    const { repository, adapter } = createSharedSourceHarness();
    const ingestionService = new SourceIngestionService({
      repository: repository as never,
      adapters: { web_urls: adapter as never }
    });
    const agentRepository = {
      getAgent: vi.fn(async (agentId: string) =>
        createAgent({
          id: agentId,
          name: agentId === 'agent-1' ? 'First Agent' : 'Second Agent'
        })
      )
    };
    const promptRepository = {
      getPromptVersionById: vi.fn(async () => createPromptVersion()),
      getLatestPromptVersion: vi.fn(async () => createPromptVersion())
    };
    const claudeClient = {
      analyze: vi.fn(async () => ({
        summary: 'Shared source summary',
        signals: [],
        report: summarizerReport('Shared source summary'),
        sourceWarnings: [],
        needsHumanReview: false
      }))
    };
    const runner = new AgentRunner({
      agentRepository,
      promptRepository,
      artifactRepository: { saveArtifact: vi.fn(async () => ({ id: 'artifact-1' })) },
      reportRepository: { saveRunReport: vi.fn(async (input) => ({ ...input, id: 'report-1', createdAt: new Date() })) },
      claudeClient,
      ingestionRepository: repository as never,
      ingestionService: ingestionService as never,
      sourceAdapters: {}
    } as never);

    const first = await runner.run('agent-1', 'run-1', { playbookId: 'playbook-1', playbookMaxItemsPerSource: 1 });
    const second = await runner.run('agent-2', 'run-2', { playbookId: 'playbook-2', playbookMaxItemsPerSource: 1 });

    expect(first.status).toBe('succeeded');
    expect(second.status).toBe('succeeded');
    expect(adapter.fetch).toHaveBeenCalledTimes(1);
  });

  it('warns and falls back to legacy agent.sources when a run has no playbook id', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const deps = createDeps({
      agentRepository: {
        getAgent: vi.fn(async () =>
          createAgent({
            sources: [{ type: 'web_urls', value: 'https://example.com/article', frequencyMinutes: 60, maxItems: 1 }]
          })
        )
      }
    });
    const runner = new AgentRunner(deps as never);

    const result = await runner.run('agent-1', 'run-1');

    expect(result.status).toBe('succeeded');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('playbookId'));
    expect(deps.reportRepository.saveRunReport).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('preserves legacy cursor persistence and source cadence for runs without a playbook id', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    try {
      const httpGet = vi.fn(async () => `<rss><channel>
        <item><guid>ep-1</guid><title>Episode 1</title><description>Notes 1</description></item>
      </channel></rss>`);
      const cursorRepository = new InMemorySourceCursorRepository();
      const adapter = new PodcastFeedAdapter({
        httpGet,
        cursorRepository,
        crawlConfigRepository: new InMemorySourceCrawlConfigRepository(),
        siteInspector: { inspect: async () => null }
      });
      const runner = new AgentRunner({
        ...createDeps({
          agentRepository: {
            getAgent: vi.fn(async () =>
              createAgent({
                sources: [{ type: 'podcast_feeds', value: 'https://example.com/feed.xml', frequencyMinutes: 60, maxItems: 1 }]
              })
            )
          },
          sourceAdapters: { podcast_feeds: adapter as never }
        }),
        cursorRepository
      } as never);

      vi.setSystemTime(new Date('2026-07-24T10:00:00.000Z'));
      const first = await runner.run('agent-1', 'run-1');
      vi.setSystemTime(new Date('2026-07-24T10:30:00.000Z'));
      const second = await runner.run('agent-1', 'run-2');
      vi.setSystemTime(new Date('2026-07-24T11:01:00.000Z'));
      const third = await runner.run('agent-1', 'run-3');

      const storedCursor = await cursorRepository.getCursor('agent-1', 'https://example.com/feed.xml');

      expect(first.status).toBe('succeeded');
      expect(second.status).toBe('succeeded_no_new_content');
      expect(third.status).toBe('succeeded_no_new_content');
      expect(httpGet).toHaveBeenCalledTimes(2);
      expect(storedCursor?.seenItemIds).toEqual(['ep-1']);
      expect(storedCursor?.lastCrawledAt).toBe('2026-07-24T11:01:00.000Z');
    } finally {
      warn.mockRestore();
      vi.useRealTimers();
    }
  });
});
