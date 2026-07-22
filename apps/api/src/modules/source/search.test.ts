import { describe, expect, it } from 'vitest';
import { createSourceSearch } from './search';
import type { HttpGet } from '../analysis/source-adapters/web-url-adapter';

const ITUNES_RESPONSE = JSON.stringify({
  resultCount: 3,
  results: [
    {
      collectionName: 'Market Pulse Daily',
      artistName: 'Jane Trader',
      feedUrl: 'https://example.com/market-pulse/feed.xml',
      artworkUrl600: 'https://example.com/market-pulse/cover-600.jpg'
    },
    {
      // No feedUrl — must be skipped (some iTunes entries lack a public feed)
      collectionName: 'Feedless Show',
      artistName: 'Nobody'
    },
    {
      collectionName: 'Alpha Signals',
      artistName: 'Alpha Team',
      feedUrl: 'https://example.com/alpha/feed.xml',
      artworkUrl100: 'https://example.com/alpha/cover-100.jpg'
    }
  ]
});

const YOUTUBE_API_SEARCH_RESPONSE = JSON.stringify({
  items: [
    {
      id: { kind: 'youtube#channel', channelId: 'UCfinance123' },
      snippet: {
        channelId: 'UCfinance123',
        title: 'Finance Explained',
        thumbnails: { high: { url: 'https://yt.example.com/finance-high.jpg' }, default: { url: 'https://yt.example.com/finance-default.jpg' } }
      }
    },
    {
      id: { kind: 'youtube#channel', channelId: 'UCmarkets456' },
      snippet: {
        channelId: 'UCmarkets456',
        title: 'Markets Live',
        thumbnails: { default: { url: 'https://yt.example.com/markets-default.jpg' } }
      }
    }
  ]
});

const YOUTUBE_SCRAPE_HTML = `<!DOCTYPE html><html><head><script>var something = 1;</script></head><body>
<script>var ytInitialData = {"contents":{"twoColumnSearchResultsRenderer":{"primaryContents":{"sectionListRenderer":{"contents":[{"itemSectionRenderer":{"contents":[
{"channelRenderer":{"channelId":"UCscrape789","title":{"simpleText":"Scraped Finance Channel"},"thumbnail":{"thumbnails":[{"url":"//yt3.example.com/scraped.jpg","width":88}]}}},
{"videoRenderer":{"videoId":"abc"}},
{"channelRenderer":{"channelId":"UCscrape000","title":{"simpleText":"Second Channel"},"thumbnail":{"thumbnails":[]}}}
]}}]}}}}};</script>
</body></html>`;

function httpGetStub(routes: Record<string, string | Error>): HttpGet {
  return async (url: string) => {
    for (const [needle, response] of Object.entries(routes)) {
      if (url.includes(needle)) {
        if (response instanceof Error) throw response;
        return response;
      }
    }
    throw new Error(`Unexpected URL in test: ${url}`);
  };
}

describe('createSourceSearch', () => {
  it('maps iTunes podcast results and skips entries without a feedUrl', async () => {
    const search = createSourceSearch({
      httpGet: httpGetStub({ 'itunes.apple.com': ITUNES_RESPONSE, 'youtube.com': YOUTUBE_SCRAPE_HTML })
    });

    const { results } = await search.searchSources('market');
    const podcasts = results.filter((item) => item.type === 'podcast_feeds');

    expect(podcasts).toHaveLength(2);
    expect(podcasts[0]).toEqual({
      type: 'podcast_feeds',
      value: 'https://example.com/market-pulse/feed.xml',
      title: 'Market Pulse Daily',
      author: 'Jane Trader',
      coverImageUrl: 'https://example.com/market-pulse/cover-600.jpg'
    });
    // Falls back to artworkUrl100 when no artworkUrl600 is present
    expect(podcasts[1].coverImageUrl).toBe('https://example.com/alpha/cover-100.jpg');
  });

  it('uses the YouTube Data API when an API key is configured', async () => {
    const requestedUrls: string[] = [];
    const httpGet: HttpGet = async (url) => {
      requestedUrls.push(url);
      if (url.includes('itunes.apple.com')) return ITUNES_RESPONSE;
      if (url.includes('googleapis.com/youtube/v3/search')) return YOUTUBE_API_SEARCH_RESPONSE;
      throw new Error(`Unexpected URL in test: ${url}`);
    };
    const search = createSourceSearch({ httpGet, youtubeApiKey: 'test-key' });

    const { results, warnings } = await search.searchSources('finance');
    const channels = results.filter((item) => item.type === 'youtube_videos');

    expect(warnings).toEqual([]);
    expect(channels).toEqual([
      {
        type: 'youtube_videos',
        value: 'https://www.youtube.com/channel/UCfinance123',
        title: 'Finance Explained',
        coverImageUrl: 'https://yt.example.com/finance-high.jpg'
      },
      {
        type: 'youtube_videos',
        value: 'https://www.youtube.com/channel/UCmarkets456',
        title: 'Markets Live',
        coverImageUrl: 'https://yt.example.com/markets-default.jpg'
      }
    ]);
    const apiUrl = requestedUrls.find((url) => url.includes('googleapis.com'));
    expect(apiUrl).toContain('type=channel');
    expect(apiUrl).toContain('key=test-key');
    expect(apiUrl).toContain('q=finance');
  });

  it('falls back to scraping the YouTube results page when no API key is set', async () => {
    const youtubeUrls: string[] = [];
    const youtubeHttpGet: HttpGet = async (url) => {
      youtubeUrls.push(url);
      return YOUTUBE_SCRAPE_HTML;
    };
    const search = createSourceSearch({
      httpGet: httpGetStub({ 'itunes.apple.com': ITUNES_RESPONSE }),
      youtubeHttpGet
    });

    const { results, warnings } = await search.searchSources('finance channel');
    const channels = results.filter((item) => item.type === 'youtube_videos');

    expect(warnings).toEqual([]);
    expect(channels).toEqual([
      {
        type: 'youtube_videos',
        value: 'https://www.youtube.com/channel/UCscrape789',
        title: 'Scraped Finance Channel',
        coverImageUrl: 'https://yt3.example.com/scraped.jpg'
      },
      {
        type: 'youtube_videos',
        value: 'https://www.youtube.com/channel/UCscrape000',
        title: 'Second Channel',
        coverImageUrl: null
      }
    ]);
    // Channel-only search filter param must be present
    expect(youtubeUrls[0]).toContain('sp=EgIQAg%253D%253D');
    expect(youtubeUrls[0]).toContain('search_query=finance%20channel');
  });

  it('reports a warning instead of failing when one provider errors', async () => {
    const search = createSourceSearch({
      httpGet: httpGetStub({
        'itunes.apple.com': new Error('itunes down'),
        'youtube.com': YOUTUBE_SCRAPE_HTML
      })
    });

    const { results, warnings } = await search.searchSources('finance');

    expect(results.some((item) => item.type === 'youtube_videos')).toBe(true);
    expect(results.some((item) => item.type === 'podcast_feeds')).toBe(false);
    expect(warnings).toEqual(['podcast_search_failed']);
  });

  it('returns warnings for both providers when everything fails', async () => {
    const search = createSourceSearch({
      httpGet: httpGetStub({
        'itunes.apple.com': new Error('itunes down'),
        'youtube.com': new Error('youtube down')
      })
    });

    const { results, warnings } = await search.searchSources('finance');

    expect(results).toEqual([]);
    expect(warnings).toEqual(['podcast_search_failed', 'youtube_search_failed']);
  });
});
