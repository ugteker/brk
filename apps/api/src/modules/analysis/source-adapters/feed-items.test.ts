import { describe, expect, it } from 'vitest';
import { parseFeedItems, parseFeedMetadata } from './feed-items';

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

  describe('parseFeedMetadata', () => {
    it('extracts podcast/library card metadata from RSS channel title and itunes:image', () => {
      const xml = `<rss><channel>
        <title>Market Pulse Podcast</title>
        <itunes:image href="https://cdn.example.com/podcast-cover.jpg" />
        <item><title>Episode 1</title></item>
      </channel></rss>`;

      const metadata = parseFeedMetadata(xml);
      expect(metadata).toEqual({
        title: 'Market Pulse Podcast',
        coverImageUrl: 'https://cdn.example.com/podcast-cover.jpg'
      });
    });

    it('extracts metadata from Atom feed title and logo', () => {
      const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
        <title>YouTube Uploads</title>
        <logo>https://yt3.ggpht.com/channel-cover.png</logo>
        <entry><title>Episode 1</title></entry>
      </feed>`;

      const metadata = parseFeedMetadata(xml);
      expect(metadata).toEqual({
        title: 'YouTube Uploads',
        coverImageUrl: 'https://yt3.ggpht.com/channel-cover.png'
      });
    });
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

  it('extracts episode-level itunes images and falls back to the feed-level cover', () => {
    const xml = `<rss><channel>
      <title>Market Pulse</title>
      <itunes:image href="https://cdn.example.com/show-cover.jpg"/>
      <item>
        <guid>ep-12</guid>
        <title>Episode 12</title>
        <itunes:image href="https://cdn.example.com/ep-12.jpg"/>
      </item>
      <item>
        <guid>ep-11</guid>
        <title>Episode 11</title>
      </item>
    </channel></rss>`;

    const items = parseFeedItems(xml);

    expect(items[0].imageUrl).toBe('https://cdn.example.com/ep-12.jpg');
    expect(items[1].imageUrl).toBe('https://cdn.example.com/show-cover.jpg');
  });

  it('extracts YouTube media thumbnails as episode images', () => {
    const xml = `<feed>
      <entry>
        <id>yt:video:abc123</id>
        <title>Episode 12</title>
        <link href="https://www.youtube.com/watch?v=abc123"/>
        <media:thumbnail url="https://i.ytimg.com/vi/abc123/hqdefault.jpg"/>
      </entry>
    </feed>`;

    expect(parseFeedItems(xml)[0].imageUrl).toBe('https://i.ytimg.com/vi/abc123/hqdefault.jpg');
  });

  it('does not treat episode-level itunes images as feed metadata', () => {
    const xml = `<rss><channel>
      <title>Market Pulse</title>
      <item>
        <guid>ep-12</guid>
        <title>Episode 12</title>
        <itunes:image href="https://cdn.example.com/ep-12.jpg"/>
      </item>
    </channel></rss>`;

    expect(parseFeedMetadata(xml)).toEqual({
      title: 'Market Pulse',
      coverImageUrl: undefined
    });
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
