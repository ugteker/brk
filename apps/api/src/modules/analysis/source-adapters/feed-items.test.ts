import { describe, expect, it } from 'vitest';
import { parseFeedItems } from './feed-items';

describe('parseFeedItems', () => {
  it('parses RSS items with guid, link, and pubDate', () => {
    const xml = `<rss><channel>
      <item>
        <title>Episode 12: Markets Update</title>
        <link>https://example.com/ep12</link>
        <guid isPermaLink="false">https://example.com/?p=12</guid>
        <pubDate>Tue, 01 Jul 2026 10:00:00 GMT</pubDate>
        <description>AAPL guidance discussion</description>
      </item>
      <item>
        <title>Episode 11</title>
        <link>https://example.com/ep11</link>
        <guid isPermaLink="false">https://example.com/?p=11</guid>
        <pubDate>Tue, 24 Jun 2026 10:00:00 GMT</pubDate>
        <description>Housing sector trends</description>
      </item>
    </channel></rss>`;

    const items = parseFeedItems(xml);
    expect(items).toHaveLength(2);
    expect(items[0].itemId).toBe('https://example.com/?p=12');
    expect(items[0].link).toBe('https://example.com/ep12');
    expect(items[0].title).toBe('Episode 12: Markets Update');
    expect(items[0].description).toContain('AAPL guidance');
    expect(items[1].itemId).toBe('https://example.com/?p=11');
  });

  it('extracts a podcast:transcript url when present on an item', () => {
    const xml = `<rss><channel><item>
      <title>Episode 12</title>
      <guid>https://example.com/?p=12</guid>
      <podcast:transcript url="https://example.com/transcript.txt" type="text/plain"/>
    </item></channel></rss>`;

    const items = parseFeedItems(xml);
    expect(items[0].transcriptUrl).toBe('https://example.com/transcript.txt');
  });

  it('falls back to link when guid is missing, and to title when both are missing', () => {
    const xml = `<rss><channel>
      <item><title>No guid</title><link>https://example.com/no-guid</link></item>
      <item><title>Only title</title></item>
    </channel></rss>`;

    const items = parseFeedItems(xml);
    expect(items[0].itemId).toBe('https://example.com/no-guid');
    expect(items[1].itemId).toBe('Only title');
  });

  it('parses Atom entries', () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <title>Atom episode</title>
        <link href="https://example.com/atom-ep" />
        <updated>2026-07-01T10:00:00Z</updated>
        <summary>Atom summary text</summary>
      </entry>
    </feed>`;

    const items = parseFeedItems(xml);
    expect(items).toHaveLength(1);
    expect(items[0].link).toBe('https://example.com/atom-ep');
    expect(items[0].description).toContain('Atom summary text');
    expect(items[0].pubDate).toBe('2026-07-01T10:00:00Z');
  });

  it('returns an empty array for a feed with no items', () => {
    expect(parseFeedItems('<rss><channel></channel></rss>')).toEqual([]);
  });
});
