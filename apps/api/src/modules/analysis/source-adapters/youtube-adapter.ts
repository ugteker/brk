import type { EvidenceBlock, SourceAdapter, SourceConfig, SourceCursorState, SourceFetchOptions, SourceFetchResult } from '../types';
import type { HttpGet } from './web-url-adapter';
import type { SourceCursorRepositoryLike } from '../../crawler/source-cursor-repository';
import { parseFeedItems } from './feed-items';
import type { SourceProbeResult } from './smart-crawler';
import { toPreviewItems } from './smart-crawler';
import { ProxyAgent } from 'undici';

const DEFAULT_MAX_ITEMS_PER_RUN = 1;
const ABSOLUTE_MAX_ITEMS_PER_RUN = 10;
const MAX_SEEN_ITEM_IDS = 200;
// YouTube's public playlist/channel Atom feed is hard-capped by YouTube itself to the 15 most
// recent entries, regardless of how many videos the playlist/channel actually contains (e.g. a
// 500-video channel still only exposes its latest 15 here). This is a platform limitation, not a
// bug in this app: since `maxItems` is itself capped at ABSOLUTE_MAX_ITEMS_PER_RUN (10), the feed
// always has more than enough of the *most recent* videos for the configured per-run crawl.
const YOUTUBE_FEED_ITEM_CAP = 15;

/** POSTs a JSON body to `url` and returns the raw response text. */
export type HttpPostJson = (url: string, body: unknown, headers?: Record<string, string>) => Promise<string>;

// YouTube treats requests from known datacenter/VPS IP ranges (e.g. Hetzner) with much more
// suspicion than residential IPs, and a header-less request (Node's plain `fetch(url)` sends no
// User-Agent at all) is itself an easy bot signal on top of that - both the watch-page HTML fetch
// and the innertube API call below impersonate a real client's headers to reduce the chance of
// getting a stripped-down/bot-walled response.
const YOUTUBE_WATCH_PAGE_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9'
};

/**
 * Optional outbound proxy for YouTube requests only (watch-page fetch + innertube API calls),
 * configured via `YOUTUBE_PROXY_URL` (e.g. a residential/mobile proxy service's URL). This is the
 * guaranteed fallback lever if YouTube's IP-based blocking of datacenter/VPS ranges (like
 * Hetzner's) persists despite the header/client impersonation below: routing just these requests
 * through a non-datacenter IP reliably bypasses it. Left undefined (direct requests) if unset.
 */
const youtubeProxyDispatcher = process.env.YOUTUBE_PROXY_URL ? new ProxyAgent(process.env.YOUTUBE_PROXY_URL) : undefined;

/** `httpGet`/`httpPostJson` wrappers that route through `YOUTUBE_PROXY_URL` when configured -
 * use these (instead of the generic `defaultHttpGet`/`defaultHttpPostJson`) for any YouTube
 * request so the proxy config stays scoped to YouTube and doesn't affect other adapters. */
export const youtubeHttpGet: HttpGet = async (url, headers) => {
  const response = await fetch(url, { headers, dispatcher: youtubeProxyDispatcher } as RequestInit);
  return response.text();
};

export const defaultHttpPostJson: HttpPostJson = async (url, body, headers) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    dispatcher: youtubeProxyDispatcher
  } as RequestInit);
  return response.text();
};

export interface YouTubeAdapterDeps {
  httpGet: HttpGet;
  httpPostJson: HttpPostJson;
  cursorRepository: SourceCursorRepositoryLike;
}

/** Mirrors smart-crawler's resolveMaxItems: clamp the configured per-run cap to a sane 1-10 range. */
function resolveMaxItems(source: SourceConfig): number {
  const configured = source.maxItems;
  if (!configured || !Number.isFinite(configured) || configured < 1) return DEFAULT_MAX_ITEMS_PER_RUN;
  return Math.min(Math.floor(configured), ABSOLUTE_MAX_ITEMS_PER_RUN);
}

function mergeSeenItemIds(existing: string[], processed: string[]): string[] {
  const merged = [...existing, ...processed];
  return merged.length > MAX_SEEN_ITEM_IDS ? merged.slice(-MAX_SEEN_ITEM_IDS) : merged;
}

/** Extracts a YouTube video ID from a watch/short/youtu.be URL, or null if the URL isn't a single video. */
export function extractVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) {
      const id = parsed.pathname.replace(/^\//, '');
      return id.length > 0 ? id : null;
    }
    if (!parsed.hostname.includes('youtube.com')) return null;
    const v = parsed.searchParams.get('v');
    if (v) return v;
    const shortsMatch = parsed.pathname.match(/\/shorts\/([\w-]+)/);
    if (shortsMatch) return shortsMatch[1];
    return null;
  } catch {
    return null;
  }
}

/**
 * Converts a YouTube playlist or channel URL into YouTube's public Atom feed URL, which lists
 * that playlist/channel's videos newest-first without requiring API credentials. Returns null
 * for URLs this can resolve without an extra network round-trip (e.g. `@handle` URLs, which need
 * an HTML lookup - see `resolveHandleFeedUrl`).
 */
export function toYouTubeFeedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('youtube.com')) return null;

    const playlistId = parsed.searchParams.get('list');
    if (playlistId) {
      return `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`;
    }

    const channelMatch = parsed.pathname.match(/\/channel\/([\w-]+)/);
    if (channelMatch) {
      return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelMatch[1]}`;
    }

    return null;
  } catch {
    return null;
  }
}

/** Resolves an `@handle` or `/c/name` or `/user/name` channel URL to its feed URL via an HTML lookup. */
async function resolveHandleFeedUrl(url: string, httpGet: HttpGet): Promise<string | null> {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('youtube.com')) return null;
    if (!/^\/(@|c\/|user\/)/.test(parsed.pathname)) return null;

    const html = await httpGet(url, YOUTUBE_WATCH_PAGE_HEADERS);
    const match = html.match(/"channelId":"(UC[\w-]{10,})"/);
    return match ? `https://www.youtube.com/feeds/videos.xml?channel_id=${match[1]}` : null;
  } catch {
    return null;
  }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * Extracts a caption track's `baseUrl` scraped directly from the watch page's embedded
 * `ytInitialPlayerResponse`. Kept as a last-resort fallback: as of 2024/2025 these URLs are
 * signed with an `exp=xpe` flag that requires a browser-generated "PO Token" to actually download
 * (unauthenticated requests succeed with HTTP 200 but an empty body), so `fetchCaptionTracks`
 * below prefers the Android-client innertube API, whose caption URLs carry no such restriction.
 */
function extractCaptionTrackBaseUrl(watchPageHtml: string): string | null {
  const match = watchPageHtml.match(/"captionTracks":(\[[^\]]*\])/);
  if (!match) return null;

  try {
    const tracks: Array<{ baseUrl: string; languageCode?: string; kind?: string }> = JSON.parse(
      decodeHtmlEntities(match[1]).replace(/\\u0026/g, '&')
    );
    if (tracks.length === 0) return null;

    const manual = tracks.find((track) => track.kind !== 'asr');
    const english = tracks.find((track) => track.languageCode?.startsWith('en'));
    const chosen = english ?? manual ?? tracks[0];
    return decodeHtmlEntities(chosen.baseUrl).replace(/\\u0026/g, '&');
  } catch {
    return null;
  }
}

const YOUTUBE_INNERTUBE_ANDROID_CONTEXT = { client: { clientName: 'ANDROID', clientVersion: '20.10.38' } };

interface YouTubeCaptionTrack {
  baseUrl: string;
  languageCode?: string;
  kind?: string;
}

/**
 * innertube client impersonations to try, in order, when fetching a video's caption track list.
 * YouTube's blocking of unauthenticated/datacenter-IP caption requests is often client-specific
 * (e.g. it may reject ANDROID but still serve WEB, or vice versa), so trying several before giving
 * up meaningfully improves success odds beyond a single hardcoded client - this mirrors what tools
 * like yt-dlp do for the same reason.
 */
const INNERTUBE_CLIENT_ATTEMPTS: Array<{ context: { client: Record<string, unknown> }; headers: Record<string, string> }> = [
  {
    context: YOUTUBE_INNERTUBE_ANDROID_CONTEXT,
    headers: {
      'User-Agent': 'com.google.android.youtube/19.30.36 (Linux; U; Android 14) gzip',
      'X-YouTube-Client-Name': '3',
      'X-YouTube-Client-Version': '19.30.36'
    }
  },
  {
    context: { client: { clientName: 'IOS', clientVersion: '19.30.4', deviceModel: 'iPhone16,2' } },
    headers: {
      'User-Agent': 'com.google.ios.youtube/19.30.4 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X)',
      'X-YouTube-Client-Name': '5',
      'X-YouTube-Client-Version': '19.30.4'
    }
  },
  {
    context: { client: { clientName: 'WEB', clientVersion: '2.20240726.00.00' } },
    headers: {
      ...YOUTUBE_WATCH_PAGE_HEADERS,
      'X-YouTube-Client-Name': '1',
      'X-YouTube-Client-Version': '2.20240726.00.00',
      Origin: 'https://www.youtube.com',
      Referer: 'https://www.youtube.com/'
    }
  }
];

function extractInnertubeApiKey(watchPageHtml: string): string | null {
  const match = watchPageHtml.match(/"INNERTUBE_API_KEY":\s*"([a-zA-Z0-9_-]+)"/);
  return match ? match[1] : null;
}

/**
 * Fetches the caption track list for a video via YouTube's internal "innertube" player API,
 * trying several client impersonations in turn (see `INNERTUBE_CLIENT_ATTEMPTS`) since YouTube's
 * blocking of unauthenticated caption requests (particularly from datacenter/VPS IPs) is often
 * client-specific. This is necessary because caption URLs scraped directly from the public watch
 * page are signed with a PO-Token requirement (see `extractCaptionTrackBaseUrl`) and silently
 * return empty bodies; the innertube clients' caption URLs have no such restriction and can be
 * downloaded directly. Falls back to scraping the watch page directly (as a single-item "track
 * list") if no innertube attempt succeeds, e.g. because the API key couldn't be found or every
 * client impersonation was rejected.
 */
async function fetchCaptionTracks(
  videoId: string,
  watchPageHtml: string,
  httpPostJson: HttpPostJson
): Promise<YouTubeCaptionTrack[]> {
  const apiKey = extractInnertubeApiKey(watchPageHtml);
  // Diagnostic logging: only fires on the failure path (caller already treats "no tracks" as
  // exceptional), so this stays silent for the overwhelming majority of successful fetches while
  // giving enough detail to tell apart the possible causes (bot-walled watch page vs. a
  // client-specific innertube rejection vs. a network-level block) without needing server access.
  if (!apiKey) {
    console.warn(`[youtube-adapter] video ${videoId}: no INNERTUBE_API_KEY found in watch page HTML (len=${watchPageHtml.length}) - likely served a stripped-down/bot-walled page`);
  }
  if (apiKey) {
    for (const attempt of INNERTUBE_CLIENT_ATTEMPTS) {
      try {
        const responseText = await httpPostJson(
          `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`,
          { context: attempt.context, videoId },
          attempt.headers
        );
        const data = JSON.parse(responseText);
        const tracks: YouTubeCaptionTrack[] | undefined = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (tracks && tracks.length > 0) return tracks;
        console.warn(
          `[youtube-adapter] video ${videoId}: innertube client "${attempt.context.client.clientName}" returned 0 caption tracks ` +
            `(playabilityStatus=${JSON.stringify(data?.playabilityStatus?.status)}, responseLen=${responseText.length})`
        );
      } catch (error) {
        console.warn(
          `[youtube-adapter] video ${videoId}: innertube client "${attempt.context.client.clientName}" request threw: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  const fallbackBaseUrl = extractCaptionTrackBaseUrl(watchPageHtml);
  if (!fallbackBaseUrl) {
    console.warn(`[youtube-adapter] video ${videoId}: watch-page scrape fallback also found no captionTracks in the embedded player response`);
  }
  return fallbackBaseUrl ? [{ baseUrl: fallbackBaseUrl }] : [];
}

/**
 * Flattens YouTube's timed-text XML into plain text. Handles both the legacy
 * `<transcript><text ...>...</text></transcript>` format and the newer `<timedtext><body><p
 * ...><s ...>word</s>...</p></body></timedtext>` format (returned by the Android client) by
 * extracting the `<body>` element when present (to exclude non-textual `<head>` styling metadata)
 * and otherwise stripping all tags from the full document.
 */
function stripTimedTextXml(xml: string): string {
  const bodyMatch = xml.match(/<body[^>]*>([\s\S]*?)<\/body>/);
  const content = bodyMatch ? bodyMatch[1] : xml;
  return decodeHtmlEntities(content.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extracts the video's display title from its watch page's `og:title` meta tag, for preview purposes. */
function extractVideoTitle(watchPageHtml: string): string | null {
  const match = watchPageHtml.match(/<meta\s+property="og:title"\s+content="([^"]*)"/i);
  return match ? decodeHtmlEntities(match[1]) : null;
}

/**
 * Fetches the full transcript for a YouTube video by reading the caption track list embedded in
 * the watch page, then downloading and flattening the chosen track's timed-text XML into plain
 * text. Prefers manually-authored captions in English, falling back to auto-generated ("asr")
 * captions or whatever single track is available. Throws if the video has no captions at all.
 * Accepts an already-fetched watch page HTML (`preloadedWatchPageHtml`) to avoid a redundant
 * request when the caller (e.g. the probe) already has it.
 */
export async function fetchYouTubeTranscript(
  videoId: string,
  httpGet: HttpGet,
  httpPostJson: HttpPostJson,
  preloadedWatchPageHtml?: string
): Promise<string> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const html = preloadedWatchPageHtml ?? (await httpGet(watchUrl, YOUTUBE_WATCH_PAGE_HEADERS));

  const tracks = await fetchCaptionTracks(videoId, html, httpPostJson);
  if (tracks.length === 0) {
    throw new Error(`No transcript/captions available for YouTube video ${watchUrl}`);
  }

  const manual = tracks.find((track) => track.kind !== 'asr');
  const english = tracks.find((track) => track.languageCode?.startsWith('en'));
  const chosen = english ?? manual ?? tracks[0];

  const timedText = await httpGet(chosen.baseUrl);
  const transcript = stripTimedTextXml(timedText);
  if (!transcript) {
    throw new Error(`Transcript for YouTube video ${watchUrl} was empty`);
  }
  return transcript;
}

/**
 * Crawls a YouTube source: a single video URL is treated as a one-item source (fetched once,
 * tracked by video ID so it isn't re-fetched every run); a playlist or channel URL is resolved to
 * its public Atom feed and the N most recent not-yet-seen videos (per the source's configured
 * `maxItems`, mirroring the episode-count setting used elsewhere) have their transcripts fetched.
 */
export class YouTubeAdapter implements SourceAdapter {
  constructor(private readonly deps: YouTubeAdapterDeps) {}

  async fetch(agentId: string, source: SourceConfig, options?: SourceFetchOptions): Promise<SourceFetchResult> {
    const directVideoId = extractVideoId(source.value);
    if (directVideoId) {
      return this.fetchSingleVideo(agentId, source, directVideoId, options);
    }

    const feedUrl = toYouTubeFeedUrl(source.value) ?? (await resolveHandleFeedUrl(source.value, this.deps.httpGet));
    if (!feedUrl) {
      return {
        evidence: [],
        warning: `Could not resolve ${source.value} to a YouTube video, playlist, or channel.`
      };
    }

    return this.fetchFromFeed(agentId, source, feedUrl, options);
  }

  private async fetchSingleVideo(
    agentId: string,
    source: SourceConfig,
    videoId: string,
    options?: SourceFetchOptions
  ): Promise<SourceFetchResult> {
    const cursor = await this.deps.cursorRepository.getCursor(agentId, source.value);
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    // A forced re-run (episode picker) always processes the video, even if already seen.
    if (!options?.forcedItemLink && cursor?.seenItemIds.includes(videoId)) {
      return { evidence: [] };
    }

    try {
      const transcript = await fetchYouTubeTranscript(videoId, this.deps.httpGet, this.deps.httpPostJson);
      const evidence: EvidenceBlock = {
        sourceId: source.value,
        sourceType: source.type,
        sourceRef: videoUrl,
        content: transcript,
        fidelity: 'high',
        citations: [videoUrl],
        itemId: videoId
      };
      const cursorUpdate: SourceCursorState = {
        agentId,
        sourceValue: source.value,
        strategy: 'feed_items',
        seenItemIds: mergeSeenItemIds(cursor?.seenItemIds ?? [], [videoId]),
        lastItemPublishedAt: cursor?.lastItemPublishedAt ?? null,
        lastContentHash: cursor?.lastContentHash ?? null
      };
      return { evidence: [evidence], cursorUpdate };
    } catch (error) {
      return {
        evidence: [],
        warning: error instanceof Error ? error.message : `Failed to fetch transcript for ${videoUrl}`
      };
    }
  }

  private async fetchFromFeed(
    agentId: string,
    source: SourceConfig,
    feedUrl: string,
    options?: SourceFetchOptions
  ): Promise<SourceFetchResult> {
    const feedXml = await this.deps.httpGet(feedUrl, YOUTUBE_WATCH_PAGE_HEADERS);
    const items = parseFeedItems(feedXml);
    const cursor = await this.deps.cursorRepository.getCursor(agentId, source.value);
    const seenIds = new Set(cursor?.seenItemIds ?? []);

    const candidates = options?.forcedItemLink
      ? items
          .map((item) => ({ item, videoId: item.link ? extractVideoId(item.link) : null }))
          .filter(
            (entry): entry is { item: (typeof items)[number]; videoId: string } =>
              entry.videoId !== null && entry.item.link === options.forcedItemLink
          )
      : items
          .map((item) => ({ item, videoId: item.link ? extractVideoId(item.link) : null }))
          .filter((entry): entry is { item: (typeof items)[number]; videoId: string } => entry.videoId !== null && !seenIds.has(entry.videoId))
          .slice(0, resolveMaxItems(source));

    if (candidates.length === 0) {
      // If a specific episode was requested (episode picker) but isn't found in the current feed
      // fetch, surface a clear warning instead of silently reporting "no content" - the feed may
      // only expose a limited recent window (e.g. YouTube's public playlist/channel feeds cap at
      // 15 items) and no longer include the requested video, or the stored link may not match
      // exactly.
      return {
        evidence: [],
        warning: options?.forcedItemLink
          ? `Could not find the requested episode (${options.forcedItemLink}) in the current feed fetch — it may have been removed, or no longer appear in YouTube's recent-items feed.`
          : undefined
      };
    }

    const evidence: EvidenceBlock[] = [];
    const warnings: string[] = [];
    const processedIds: string[] = [];

    for (const { item, videoId } of candidates) {
      const videoUrl = item.link ?? `https://www.youtube.com/watch?v=${videoId}`;
      try {
        const transcript = await fetchYouTubeTranscript(videoId, this.deps.httpGet, this.deps.httpPostJson);
        evidence.push({
          sourceId: source.value,
          sourceType: source.type,
          sourceRef: videoUrl,
          content: transcript,
          fidelity: 'high',
          citations: [videoUrl],
          itemId: videoId,
          publishedAt: item.pubDate ?? undefined
        });
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : `Failed to fetch transcript for ${videoUrl}`);
      }
      // Mark as seen regardless of success so a captionless video isn't retried every run.
      processedIds.push(videoId);
    }

    const cursorUpdate: SourceCursorState = {
      agentId,
      sourceValue: source.value,
      strategy: 'feed_items',
      seenItemIds: mergeSeenItemIds(cursor?.seenItemIds ?? [], processedIds),
      lastItemPublishedAt: cursor?.lastItemPublishedAt ?? null,
      lastContentHash: cursor?.lastContentHash ?? null
    };

    return {
      evidence,
      cursorUpdate,
      warning: warnings.length > 0 ? warnings.join(' ') : undefined
    };
  }
}

/**
 * Stateless "fail fast" probe used by the wizard's Test source button: resolves the URL to a
 * video/playlist/channel, checks reachability, and (for playlists/channels) counts how many
 * videos are currently listed - without fetching every transcript or persisting anything.
 */
export async function probeYouTubeSource(
  deps: Pick<YouTubeAdapterDeps, 'httpGet' | 'httpPostJson'>,
  source: SourceConfig,
  previewLimit?: number
): Promise<SourceProbeResult> {
  const videoId = extractVideoId(source.value);

  if (videoId) {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    let watchPageHtml: string | null = null;
    let title: string | null = null;
    try {
      watchPageHtml = await deps.httpGet(watchUrl, YOUTUBE_WATCH_PAGE_HEADERS);
      title = extractVideoTitle(watchPageHtml);
    } catch {
      // best-effort only - the transcript fetch below still determines reachability/warning
    }

    try {
      await fetchYouTubeTranscript(videoId, deps.httpGet, deps.httpPostJson, watchPageHtml ?? undefined);
      return {
        reachable: true,
        kind: 'single_page',
        previewItems: [{ title: title ?? `Video ${videoId}`, link: source.value, pubDate: null }]
      };
    } catch (error) {
      return {
        reachable: true,
        kind: 'single_page',
        previewItems: [{ title: title ?? `Video ${videoId}`, link: source.value, pubDate: null }],
        warning: error instanceof Error ? error.message : `Could not fetch a transcript for ${source.value}`
      };
    }
  }

  const feedUrl = toYouTubeFeedUrl(source.value) ?? (await resolveHandleFeedUrl(source.value, deps.httpGet));
  if (!feedUrl) {
    return {
      reachable: false,
      kind: 'unknown',
      warning: `Could not resolve ${source.value} to a YouTube video, playlist, or channel.`
    };
  }

  try {
    const feedXml = await deps.httpGet(feedUrl, YOUTUBE_WATCH_PAGE_HEADERS);
    const items = parseFeedItems(feedXml);
    const maxItemsPerRun = resolveMaxItems(source);
    return {
      reachable: true,
      kind: 'feed',
      itemCount: items.length,
      maxItemsPerRun,
      previewItems: toPreviewItems(items, previewLimit),
      warning:
        items.length === 0
          ? 'No videos could be found for this channel/playlist yet.'
          : items.length >= YOUTUBE_FEED_ITEM_CAP
            ? `YouTube only exposes the ${YOUTUBE_FEED_ITEM_CAP} most recent uploads via this feed, even for larger channels/playlists — that's still enough to pick the top ${maxItemsPerRun} most recent unseen video(s) per run.`
            : undefined
    };
  } catch (error) {
    return {
      reachable: false,
      kind: 'unknown',
      warning: `Could not reach ${source.value}: ${error instanceof Error ? error.message : 'unknown error'}`
    };
  }
}
