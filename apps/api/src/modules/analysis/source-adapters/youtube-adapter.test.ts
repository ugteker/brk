import { describe, expect, it } from 'vitest';
import {
  YouTubeAdapter,
  extractVideoId,
  toYouTubeFeedUrl,
  fetchYouTubeTranscript,
  probeYouTubeSource
} from './youtube-adapter';
import { InMemorySourceCursorRepository } from '../../crawler/source-cursor-repository';

const SAMPLE_WATCH_HTML = `<html><body><script>var INNERTUBE_API_KEY = "test-api-key"; var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://example.com/timedtext?v=abc123\\u0026lang=en\\u0026exp=xpe","languageCode":"en","kind":"asr"}]}}};</script></body></html>`;

const SAMPLE_INNERTUBE_PLAYER_RESPONSE = JSON.stringify({
  playabilityStatus: { status: 'OK' },
  captions: {
    playerCaptionsTracklistRenderer: {
      captionTracks: [{ baseUrl: 'https://example.com/innertube-timedtext?v=abc123&lang=en', languageCode: 'en', kind: 'asr' }]
    }
  }
});

// New-style `<body><p><s>...</s></p></body>` format returned for tracks fetched via the innertube API.
const SAMPLE_TIMEDTEXT_XML = `<?xml version="1.0" encoding="utf-8" ?><timedtext format="3"><head><ws id="0"/></head><body><p t="0" d="2000"><s>Hello there</s></p><p t="2000" d="2000"><s>welcome to the show</s></p></body></timedtext>`;

// Legacy `<transcript><text>...</text></transcript>` format, still scraped directly off the watch
// page as a fallback when the innertube API call can't be made.
const SAMPLE_LEGACY_TIMEDTEXT_XML = `<?xml version="1.0" encoding="utf-8" ?><transcript><text start="0" dur="2">Hello there</text><text start="2" dur="2">welcome to the show</text></transcript>`;

const SAMPLE_PLAYLIST_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>yt:video:vid1</id>
    <title>Episode 1</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=vid1"/>
    <published>2026-07-01T00:00:00+00:00</published>
  </entry>
  <entry>
    <id>yt:video:vid2</id>
    <title>Episode 2</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=vid2"/>
    <published>2026-06-24T00:00:00+00:00</published>
  </entry>
</feed>`;

function createDeps(httpGet: (url: string) => Promise<string>, httpPostJson: (url: string, body: unknown) => Promise<string> = async () => SAMPLE_INNERTUBE_PLAYER_RESPONSE) {
  return { httpGet, httpPostJson, cursorRepository: new InMemorySourceCursorRepository() };
}

describe('extractVideoId', () => {
  it('extracts the video id from a standard watch URL', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=abc123')).toBe('abc123');
  });

  it('extracts the video id from a youtu.be short link', () => {
    expect(extractVideoId('https://youtu.be/abc123')).toBe('abc123');
  });

  it('extracts the video id from a shorts URL', () => {
    expect(extractVideoId('https://www.youtube.com/shorts/abc123')).toBe('abc123');
  });

  it('returns null for a playlist URL (no direct video id)', () => {
    expect(extractVideoId('https://www.youtube.com/playlist?list=PLxyz')).toBeNull();
  });

  it('returns null for a non-YouTube URL', () => {
    expect(extractVideoId('https://example.com/watch?v=abc123')).toBeNull();
  });
});

describe('toYouTubeFeedUrl', () => {
  it('converts a playlist URL to the public playlist feed', () => {
    expect(toYouTubeFeedUrl('https://www.youtube.com/playlist?list=PLxyz')).toBe(
      'https://www.youtube.com/feeds/videos.xml?playlist_id=PLxyz'
    );
  });

  it('converts a /channel/UC... URL to the public channel feed', () => {
    expect(toYouTubeFeedUrl('https://www.youtube.com/channel/UC1234567890')).toBe(
      'https://www.youtube.com/feeds/videos.xml?channel_id=UC1234567890'
    );
  });

  it('returns null for an @handle URL (requires HTML lookup)', () => {
    expect(toYouTubeFeedUrl('https://www.youtube.com/@somepodcast')).toBeNull();
  });
});

describe('fetchYouTubeTranscript', () => {
  it('fetches caption tracks via the innertube API and flattens the new-style timed-text XML', async () => {
    const httpGet = async (url: string) => {
      if (url.includes('/watch?v=')) return SAMPLE_WATCH_HTML;
      return SAMPLE_TIMEDTEXT_XML;
    };
    const httpPostJson = async () => SAMPLE_INNERTUBE_PLAYER_RESPONSE;

    const transcript = await fetchYouTubeTranscript('abc123', httpGet, httpPostJson);
    expect(transcript).toBe('Hello there welcome to the show');
  });

  it('falls back to scraping the watch page directly when the innertube API call fails', async () => {
    const httpGet = async (url: string) => {
      if (url.includes('/watch?v=')) return SAMPLE_WATCH_HTML;
      return SAMPLE_LEGACY_TIMEDTEXT_XML;
    };
    const httpPostJson = async () => {
      throw new Error('network error');
    };

    const transcript = await fetchYouTubeTranscript('abc123', httpGet, httpPostJson);
    expect(transcript).toBe('Hello there welcome to the show');
  });

  it('falls back to scraping the watch page directly when the innertube API key cannot be found', async () => {
    const httpGet = async (url: string) => {
      if (url.includes('/watch?v=')) {
        return '<html><body><script>var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://example.com/timedtext?v=abc123\\u0026lang=en","languageCode":"en","kind":"asr"}]}}};</script></body></html>';
      }
      return SAMPLE_LEGACY_TIMEDTEXT_XML;
    };
    const httpPostJson = async () => {
      throw new Error('should not be called without an API key');
    };

    const transcript = await fetchYouTubeTranscript('abc123', httpGet, httpPostJson);
    expect(transcript).toBe('Hello there welcome to the show');
  });

  it('throws when the video has no caption tracks', async () => {
    const httpGet = async () => '<html><body>no captions here</body></html>';
    const httpPostJson = async () => JSON.stringify({ playabilityStatus: { status: 'OK' } });
    await expect(fetchYouTubeTranscript('novid', httpGet, httpPostJson)).rejects.toThrow(/No transcript/);
  });

  it('includes the full watch URL (not just the bare video id) in the "no captions" error, so it can be linked to in the UI', async () => {
    const httpGet = async () => '<html><body>no captions here</body></html>';
    const httpPostJson = async () => JSON.stringify({ playabilityStatus: { status: 'OK' } });
    await expect(fetchYouTubeTranscript('novid', httpGet, httpPostJson)).rejects.toThrow(
      'https://www.youtube.com/watch?v=novid'
    );
  });

  it('tries the next innertube client impersonation when an earlier one comes back with no caption tracks', async () => {
    const watchHtmlWithApiKey = '<html><body><script>"INNERTUBE_API_KEY":"test-api-key"</script></body></html>';
    const httpGet = async (url: string) => {
      if (url.includes('/watch?v=')) return watchHtmlWithApiKey;
      return SAMPLE_TIMEDTEXT_XML;
    };
    let callCount = 0;
    const httpPostJson = async () => {
      callCount += 1;
      // First client impersonation comes back with no tracks (simulating a client-specific block);
      // a later attempt succeeds.
      if (callCount === 1) return JSON.stringify({ playabilityStatus: { status: 'OK' } });
      return SAMPLE_INNERTUBE_PLAYER_RESPONSE;
    };

    const transcript = await fetchYouTubeTranscript('abc123', httpGet, httpPostJson);
    expect(transcript).toBe('Hello there welcome to the show');
    expect(callCount).toBeGreaterThan(1);
  });
});

describe('YouTubeAdapter', () => {
  it('fetches the transcript for a single video URL and marks it seen', async () => {
    const httpGet = async (url: string) => {
      if (url.includes('/watch?v=')) return SAMPLE_WATCH_HTML;
      return SAMPLE_TIMEDTEXT_XML;
    };
    const deps = createDeps(httpGet);
    const adapter = new YouTubeAdapter(deps);
    const source = { type: 'youtube_videos' as const, value: 'https://www.youtube.com/watch?v=abc123' };

    const result = await adapter.fetch('agent-1', source);
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].content).toContain('welcome to the show');
    expect(result.evidence[0].fidelity).toBe('high');
    expect(result.cursorUpdate?.seenItemIds).toContain('abc123');

    if (result.cursorUpdate) await deps.cursorRepository.saveCursor(result.cursorUpdate);
    const second = await adapter.fetch('agent-1', source);
    expect(second.evidence).toHaveLength(0);

    // Forcing (episode picker) re-processes the same already-seen single video.
    const forced = await adapter.fetch('agent-1', source, { forcedItemLink: source.value });
    expect(forced.evidence).toHaveLength(1);
  });

  it('resolves a playlist URL to its feed and fetches transcripts for the N most recent unseen videos', async () => {
    const httpGet = async (url: string) => {
      if (url.includes('feeds/videos.xml')) return SAMPLE_PLAYLIST_FEED;
      if (url.includes('/watch?v=')) return SAMPLE_WATCH_HTML;
      return SAMPLE_TIMEDTEXT_XML;
    };
    const deps = createDeps(httpGet);
    const adapter = new YouTubeAdapter(deps);
    const source = { type: 'youtube_videos' as const, value: 'https://www.youtube.com/playlist?list=PLxyz', maxItems: 1 };

    const result = await adapter.fetch('agent-1', source);
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].itemId).toBe('vid1');
    expect(result.cursorUpdate?.seenItemIds).toEqual(['vid1']);
  });

  it('forces crawling one specific already-seen video by link, ignoring maxItems and seen-status (episode picker)', async () => {
    const httpGet = async (url: string) => {
      if (url.includes('feeds/videos.xml')) return SAMPLE_PLAYLIST_FEED;
      if (url.includes('/watch?v=')) return SAMPLE_WATCH_HTML;
      return SAMPLE_TIMEDTEXT_XML;
    };
    const deps = createDeps(httpGet);
    const adapter = new YouTubeAdapter(deps);
    const source = { type: 'youtube_videos' as const, value: 'https://www.youtube.com/playlist?list=PLxyz', maxItems: 1 };

    // A normal run already marked vid1 as seen.
    const first = await adapter.fetch('agent-1', source);
    if (first.cursorUpdate) await deps.cursorRepository.saveCursor(first.cursorUpdate);

    const forced = await adapter.fetch('agent-1', source, { forcedItemLink: 'https://www.youtube.com/watch?v=vid1' });
    expect(forced.evidence).toHaveLength(1);
    expect(forced.evidence[0].itemId).toBe('vid1');
  });

  it('returns a warning when the source cannot be resolved to a video, playlist, or channel', async () => {
    const deps = createDeps(async () => '');
    const adapter = new YouTubeAdapter(deps);
    const result = await adapter.fetch('agent-1', { type: 'youtube_videos', value: 'https://example.com/not-youtube' });

    expect(result.evidence).toHaveLength(0);
    expect(result.warning).toMatch(/Could not resolve/);
  });
});

describe('probeYouTubeSource', () => {
  it('reports item count for a playlist feed', async () => {
    const httpGet = async (url: string) => (url.includes('feeds/videos.xml') ? SAMPLE_PLAYLIST_FEED : '');
    const httpPostJson = async () => SAMPLE_INNERTUBE_PLAYER_RESPONSE;
    const result = await probeYouTubeSource({ httpGet, httpPostJson }, { type: 'youtube_videos', value: 'https://www.youtube.com/playlist?list=PLxyz' });

    expect(result.reachable).toBe(true);
    expect(result.kind).toBe('feed');
    expect(result.itemCount).toBe(2);
  });

  it('includes a sneak preview of the last 5 videos, independent of maxItems', async () => {
    const httpGet = async (url: string) => (url.includes('feeds/videos.xml') ? SAMPLE_PLAYLIST_FEED : '');
    const httpPostJson = async () => SAMPLE_INNERTUBE_PLAYER_RESPONSE;
    const result = await probeYouTubeSource(
      { httpGet, httpPostJson },
      { type: 'youtube_videos', value: 'https://www.youtube.com/playlist?list=PLxyz', maxItems: 1 }
    );

    expect(result.maxItemsPerRun).toBe(1);
    expect(result.previewItems).toHaveLength(2);
    expect(result.previewItems?.[0]).toMatchObject({ title: 'Episode 1', link: 'https://www.youtube.com/watch?v=vid1' });
    expect(result.previewItems?.[1]).toMatchObject({ title: 'Episode 2', link: 'https://www.youtube.com/watch?v=vid2' });
  });

  it('notes YouTube\'s 15-item feed cap for large channels/playlists without treating it as an error', async () => {
    const manyEntriesFeed = `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom">${Array.from(
      { length: 15 },
      (_, i) => `<entry><id>yt:video:vid${i}</id><title>Episode ${i}</title><link rel="alternate" href="https://www.youtube.com/watch?v=vid${i}"/></entry>`
    ).join('')}</feed>`;
    const httpGet = async (url: string) => (url.includes('feeds/videos.xml') ? manyEntriesFeed : '');
    const httpPostJson = async () => SAMPLE_INNERTUBE_PLAYER_RESPONSE;
    const result = await probeYouTubeSource(
      { httpGet, httpPostJson },
      { type: 'youtube_videos', value: 'https://www.youtube.com/playlist?list=PLbig', maxItems: 2 }
    );

    expect(result.reachable).toBe(true);
    expect(result.itemCount).toBe(15);
    expect(result.maxItemsPerRun).toBe(2);
    expect(result.previewItems).toHaveLength(5);
    expect(result.warning).toMatch(/15 most recent uploads/);
  });

  it('reports reachable single_page for a video with captions available', async () => {
    const httpGet = async (url: string) => (url.includes('/watch?v=') ? SAMPLE_WATCH_HTML : SAMPLE_TIMEDTEXT_XML);
    const httpPostJson = async () => SAMPLE_INNERTUBE_PLAYER_RESPONSE;
    const result = await probeYouTubeSource({ httpGet, httpPostJson }, { type: 'youtube_videos', value: 'https://www.youtube.com/watch?v=abc123' });

    expect(result.reachable).toBe(true);
    expect(result.kind).toBe('single_page');
    expect(result.warning).toBeUndefined();
    expect(result.previewItems).toHaveLength(1);
    expect(result.previewItems?.[0].link).toBe('https://www.youtube.com/watch?v=abc123');
  });
});
