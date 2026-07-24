import { describe, expect, it, vi } from 'vitest';
import { PodcastFeedAdapter } from './podcast-feed-adapter';
import { InMemorySourceCursorRepository } from '../../crawler/source-cursor-repository';
import { InMemorySourceCrawlConfigRepository } from '../../crawler/crawl-config-repository';
import type { SmartCrawlerDeps } from './smart-crawler';

function createDeps(httpGet: SmartCrawlerDeps['httpGet']): SmartCrawlerDeps {
  return {
    httpGet,
    cursorRepository: new InMemorySourceCursorRepository(),
    crawlConfigRepository: new InMemorySourceCrawlConfigRepository(),
    siteInspector: { inspect: async () => null }
  };
}

describe('PodcastFeedAdapter', () => {
  it('falls back to show notes when a podcast transcript is missing', async () => {
    const httpGet = async (url: string) => {
      expect(url).toBe('https://example.com/feed.xml');
      return `<rss><channel><item>
        <title>Episode 12: Markets Update</title>
        <description>Discussion of AAPL guidance and housing sector trends.</description>
      </item></channel></rss>`;
    };

    const adapter = new PodcastFeedAdapter(createDeps(httpGet));
    const result = await adapter.fetch('agent-1', { type: 'podcast_feeds', value: 'https://example.com/feed.xml' });

    expect(result.evidence[0]?.fidelity).toBe('low');
    expect(result.evidence[0]?.content).toContain('AAPL guidance');
    expect(result.cursorUpdate?.seenItemIds).toHaveLength(1);
  });

  it('uses the transcript when a podcast:transcript tag is present', async () => {
    const httpGet = async (url: string) => {
      if (url === 'https://example.com/feed.xml') {
        return `<rss><channel><item>
          <title>Episode 12</title>
          <description>Show notes</description>
          <podcast:transcript url="https://example.com/transcript.txt" type="text/plain"/>
        </item></channel></rss>`;
      }
      return 'Full transcript mentions strong AAPL guidance at 12:44.';
    };

    const adapter = new PodcastFeedAdapter(createDeps(httpGet));
    const result = await adapter.fetch('agent-1', { type: 'podcast_feeds', value: 'https://example.com/feed.xml' });

    expect(result.evidence[0]?.fidelity).toBe('high');
    expect(result.evidence[0]?.content).toContain('AAPL guidance');
  });

  it('does not re-emit an already-seen episode on a subsequent run', async () => {
    const feedXml = `<rss><channel><item>
      <title>Episode 12: Markets Update</title>
      <description>Discussion of AAPL guidance.</description>
    </item></channel></rss>`;
    const httpGet = async () => feedXml;
    const deps = createDeps(httpGet);
    const adapter = new PodcastFeedAdapter(deps);
    const source = { type: 'podcast_feeds' as const, value: 'https://example.com/feed.xml' };

    const first = await adapter.fetch('agent-1', source);
    expect(first.evidence).toHaveLength(1);
    if (first.cursorUpdate) await deps.cursorRepository.saveCursor(first.cursorUpdate);

    const second = await adapter.fetch('agent-1', source);
    expect(second.evidence).toHaveLength(0);
  });

  it('reports parsed feed-level cover metadata during a crawl', async () => {
    const feedXml = `<rss><channel>
      <title>Market Pulse</title>
      <itunes:image href="https://cdn.example.com/new-cover.jpg"/>
      <item><guid>ep-1</guid><title>Episode 1</title><description>Notes</description></item>
    </channel></rss>`;
    const onFeedMetadata = vi.fn();
    const cursorRepository = new InMemorySourceCursorRepository() as InMemorySourceCursorRepository & {
      refreshSourceCoverImageUrl: NonNullable<SmartCrawlerDeps['cursorRepository']['refreshSourceCoverImageUrl']>;
    };
    cursorRepository.refreshSourceCoverImageUrl = vi.fn(async () => 1);
    const adapter = new PodcastFeedAdapter({
      ...createDeps(async () => feedXml),
      cursorRepository,
      onFeedMetadata
    });

    await adapter.fetch('agent-1', { type: 'podcast_feeds', value: 'https://example.com/feed.xml' });

    expect(cursorRepository.refreshSourceCoverImageUrl).toHaveBeenCalledWith(
      'podcast_feeds',
      'https://example.com/feed.xml',
      'https://cdn.example.com/new-cover.jpg'
    );
    expect(onFeedMetadata).toHaveBeenCalledWith(
      { type: 'podcast_feeds', value: 'https://example.com/feed.xml' },
      { title: 'Market Pulse', coverImageUrl: 'https://cdn.example.com/new-cover.jpg' }
    );
  });

  it('honors an explicit canonical limit when refreshing a feed source directly', async () => {
    const feedXml = `<rss><channel>
      <item><guid>ep-1</guid><title>Episode 1</title><description>Notes 1</description></item>
      <item><guid>ep-2</guid><title>Episode 2</title><description>Notes 2</description></item>
      <item><guid>ep-3</guid><title>Episode 3</title><description>Notes 3</description></item>
    </channel></rss>`;
    const adapter = new PodcastFeedAdapter(createDeps(async () => feedXml));

    const result = await adapter.fetch(
      { id: 'source-1', type: 'podcast_feeds', value: 'https://example.com/feed.xml' },
      {},
      { limit: 2 } as any
    );

    expect(result.items).toHaveLength(2);
    expect(result.items.map((item) => item.metadata.itemId)).toEqual(['ep-1', 'ep-2']);
  });
});
