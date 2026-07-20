import { describe, expect, it } from 'vitest';
import { extractYoutubeVideoId, getYoutubeThumbnailUrl } from './youtube';

describe('extractYoutubeVideoId', () => {
  it('extracts the id from a youtube.com/watch URL', () => {
    expect(extractYoutubeVideoId('https://www.youtube.com/watch?v=abc123')).toBe('abc123');
  });

  it('extracts the id from a youtu.be short URL', () => {
    expect(extractYoutubeVideoId('https://youtu.be/abc123')).toBe('abc123');
  });

  it('extracts the id from a /shorts/ URL', () => {
    expect(extractYoutubeVideoId('https://www.youtube.com/shorts/abc123')).toBe('abc123');
  });

  it('returns null for a non-YouTube URL', () => {
    expect(extractYoutubeVideoId('https://example.com/episode-12')).toBeNull();
  });

  it('returns null for a non-URL citation like a podcast timestamp ref', () => {
    expect(extractYoutubeVideoId('ep1@10:12')).toBeNull();
  });

  it('returns null for a channel/playlist URL', () => {
    expect(extractYoutubeVideoId('https://www.youtube.com/playlist?list=PLxyz')).toBeNull();
  });

  it('returns null for undefined/null input', () => {
    expect(extractYoutubeVideoId(undefined)).toBeNull();
    expect(extractYoutubeVideoId(null)).toBeNull();
  });
});

describe('getYoutubeThumbnailUrl', () => {
  it('defaults to hqdefault quality', () => {
    expect(getYoutubeThumbnailUrl('abc123')).toBe('https://i.ytimg.com/vi/abc123/hqdefault.jpg');
  });

  it('supports mqdefault quality', () => {
    expect(getYoutubeThumbnailUrl('abc123', 'mqdefault')).toBe('https://i.ytimg.com/vi/abc123/mqdefault.jpg');
  });
});
