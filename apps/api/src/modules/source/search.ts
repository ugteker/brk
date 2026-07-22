import type { HttpGet } from '../analysis/source-adapters/web-url-adapter';

/** A single searchable/addable source hit (podcast feed or YouTube channel). */
export interface SourceSearchResultItem {
  type: 'podcast_feeds' | 'youtube_videos';
  value: string;
  title: string;
  author?: string;
  coverImageUrl: string | null;
}

export interface SourceSearchResult {
  results: SourceSearchResultItem[];
  /** Machine-readable provider failure markers - a partial outage must not fail the whole search. */
  warnings: string[];
}

export interface SourceSearchLike {
  searchSources(query: string): Promise<SourceSearchResult>;
}

export interface SourceSearchDeps {
  /** Generic HTTP GET used for the iTunes podcast search. */
  httpGet: HttpGet;
  /** Proxy-aware GET for YouTube requests (falls back to `httpGet` when omitted). */
  youtubeHttpGet?: HttpGet;
  /** Official YouTube Data API v3 key; when unset the scraping fallback is used. */
  youtubeApiKey?: string;
  /** Max results per provider (default 8). */
  limit?: number;
}

const DEFAULT_LIMIT = 8;

interface ItunesResult {
  feedUrl?: string;
  collectionName?: string;
  artistName?: string;
  artworkUrl600?: string;
  artworkUrl100?: string;
}

async function searchPodcasts(httpGet: HttpGet, query: string, limit: number): Promise<SourceSearchResultItem[]> {
  const url = `https://itunes.apple.com/search?media=podcast&limit=${limit}&term=${encodeURIComponent(query)}`;
  const raw = await httpGet(url);
  const parsed = JSON.parse(raw) as { results?: ItunesResult[] };
  return (parsed.results ?? [])
    .filter((entry): entry is ItunesResult & { feedUrl: string } => typeof entry.feedUrl === 'string' && entry.feedUrl.trim().length > 0)
    .map((entry) => ({
      type: 'podcast_feeds' as const,
      value: entry.feedUrl,
      title: entry.collectionName ?? entry.feedUrl,
      author: entry.artistName,
      coverImageUrl: entry.artworkUrl600 ?? entry.artworkUrl100 ?? null
    }));
}

interface YoutubeApiSearchItem {
  id?: { channelId?: string };
  snippet?: {
    channelId?: string;
    title?: string;
    thumbnails?: Record<string, { url?: string } | undefined>;
  };
}

function pickThumbnail(thumbnails: Record<string, { url?: string } | undefined> | undefined): string | null {
  if (!thumbnails) return null;
  for (const key of ['high', 'medium', 'default']) {
    const url = thumbnails[key]?.url;
    if (url) return url;
  }
  return null;
}

async function searchYoutubeChannelsViaApi(httpGet: HttpGet, query: string, apiKey: string, limit: number): Promise<SourceSearchResultItem[]> {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=${limit}&q=${encodeURIComponent(query)}&key=${encodeURIComponent(apiKey)}`;
  const raw = await httpGet(url);
  const parsed = JSON.parse(raw) as { items?: YoutubeApiSearchItem[] };
  const results: SourceSearchResultItem[] = [];
  for (const item of parsed.items ?? []) {
    const channelId = item.id?.channelId ?? item.snippet?.channelId;
    if (!channelId) continue;
    results.push({
      type: 'youtube_videos',
      value: `https://www.youtube.com/channel/${channelId}`,
      title: item.snippet?.title ?? channelId,
      coverImageUrl: pickThumbnail(item.snippet?.thumbnails)
    });
  }
  return results;
}

interface ChannelRenderer {
  channelId?: string;
  title?: { simpleText?: string };
  thumbnail?: { thumbnails?: Array<{ url?: string }> };
}

/** Recursively collects all `channelRenderer` objects from YouTube's ytInitialData tree. */
function collectChannelRenderers(node: unknown, out: ChannelRenderer[]): void {
  if (Array.isArray(node)) {
    for (const child of node) collectChannelRenderers(child, out);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const record = node as Record<string, unknown>;
  if (record.channelRenderer && typeof record.channelRenderer === 'object') {
    out.push(record.channelRenderer as ChannelRenderer);
  }
  for (const value of Object.values(record)) collectChannelRenderers(value, out);
}

/** Extracts the `ytInitialData` JSON blob embedded in a YouTube results page. */
export function extractYtInitialData(html: string): unknown {
  const marker = html.match(/ytInitialData\s*=\s*/);
  if (!marker || marker.index === undefined) throw new Error('ytInitialData not found');
  const start = marker.index + marker[0].length;
  if (html[start] !== '{') throw new Error('ytInitialData is not a JSON object');
  // Balanced-brace scan: a naive regex breaks on "};" sequences inside JSON string values.
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i += 1) {
    const char = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return JSON.parse(html.slice(start, i + 1));
    }
  }
  throw new Error('ytInitialData JSON is truncated');
}

async function searchYoutubeChannelsViaScraping(httpGet: HttpGet, query: string, limit: number): Promise<SourceSearchResultItem[]> {
  // sp=EgIQAg%3D%3D is YouTube's "channels only" search filter (the value itself contains
  // base64 padding "==", so it appears double-encoded in the final URL).
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=${encodeURIComponent('EgIQAg%3D%3D')}`;
  const html = await httpGet(url, {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9'
  });
  const data = extractYtInitialData(html);
  const renderers: ChannelRenderer[] = [];
  collectChannelRenderers(data, renderers);
  const results: SourceSearchResultItem[] = [];
  for (const renderer of renderers) {
    if (!renderer.channelId) continue;
    const thumbnailUrl = renderer.thumbnail?.thumbnails?.[0]?.url;
    results.push({
      type: 'youtube_videos',
      value: `https://www.youtube.com/channel/${renderer.channelId}`,
      title: renderer.title?.simpleText ?? renderer.channelId,
      coverImageUrl: thumbnailUrl ? (thumbnailUrl.startsWith('//') ? `https:${thumbnailUrl}` : thumbnailUrl) : null
    });
    if (results.length >= limit) break;
  }
  return results;
}

export function createSourceSearch(deps: SourceSearchDeps): SourceSearchLike {
  const limit = deps.limit ?? DEFAULT_LIMIT;
  const youtubeHttpGet = deps.youtubeHttpGet ?? deps.httpGet;
  return {
    async searchSources(query: string): Promise<SourceSearchResult> {
      const [podcasts, channels] = await Promise.allSettled([
        searchPodcasts(deps.httpGet, query, limit),
        deps.youtubeApiKey
          ? searchYoutubeChannelsViaApi(youtubeHttpGet, query, deps.youtubeApiKey, limit)
          : searchYoutubeChannelsViaScraping(youtubeHttpGet, query, limit)
      ]);

      const results: SourceSearchResultItem[] = [];
      const warnings: string[] = [];
      if (podcasts.status === 'fulfilled') results.push(...podcasts.value);
      else warnings.push('podcast_search_failed');
      if (channels.status === 'fulfilled') results.push(...channels.value);
      else warnings.push('youtube_search_failed');
      return { results, warnings };
    }
  };
}
