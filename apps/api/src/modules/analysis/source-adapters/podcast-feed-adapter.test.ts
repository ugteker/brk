import { describe, expect, it } from 'vitest';
import { PodcastFeedAdapter } from './podcast-feed-adapter';

describe('PodcastFeedAdapter', () => {
  it('falls back to show notes when a podcast transcript is missing', async () => {
    const httpGet = async (url: string) => {
      expect(url).toBe('https://example.com/feed.xml');
      return `<rss><channel><item>
        <title>Episode 12: Markets Update</title>
        <description>Discussion of AAPL guidance and housing sector trends.</description>
      </item></channel></rss>`;
    };

    const adapter = new PodcastFeedAdapter(httpGet);
    const evidence = await adapter.fetch({ type: 'podcast_feeds', value: 'https://example.com/feed.xml' });

    expect(evidence[0]?.fidelity).toBe('low');
    expect(evidence[0]?.content).toContain('AAPL guidance');
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

    const adapter = new PodcastFeedAdapter(httpGet);
    const evidence = await adapter.fetch({ type: 'podcast_feeds', value: 'https://example.com/feed.xml' });

    expect(evidence[0]?.fidelity).toBe('high');
    expect(evidence[0]?.content).toContain('AAPL guidance');
  });
});
