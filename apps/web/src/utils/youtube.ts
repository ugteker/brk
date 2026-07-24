/**
 * Extracts the video ID from a youtube.com/watch, youtu.be, or /shorts/ URL. Returns null
 * for any other shape (e.g. channel/playlist URLs) rather than guessing.
 */
export function extractYoutubeVideoId(url?: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.replace('/', '') || null;
    }
    if (parsed.hostname.includes('youtube.com')) {
      if (parsed.pathname === '/watch') {
        return parsed.searchParams.get('v');
      }
      if (parsed.pathname.startsWith('/shorts/')) {
        return parsed.pathname.split('/')[2] ?? null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function getYoutubeThumbnailUrl(videoId: string, quality: 'mqdefault' | 'hqdefault' = 'hqdefault'): string {
  return `https://i.ytimg.com/vi/${videoId}/${quality}.jpg`;
}

/**
 * Extracts channel handle/id tokens from common youtube.com channel URL shapes.
 */
export function extractYoutubeChannelToken(url?: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('youtube.com')) return null;
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length === 0) return null;
    const [first, second] = segments;
    if (first.startsWith('@')) return first.slice(1) || null;
    if ((first === 'channel' || first === 'c' || first === 'user') && second) return second;
  } catch {
    return null;
  }
  return null;
}

export function getYoutubeChannelAvatarUrl(channelToken: string): string {
  return `https://unavatar.io/youtube/${encodeURIComponent(channelToken)}`;
}

export function getYoutubeCoverImageFallback(url?: string | null): string | null {
  const videoId = extractYoutubeVideoId(url);
  if (videoId) return getYoutubeThumbnailUrl(videoId);
  const channelToken = extractYoutubeChannelToken(url);
  if (channelToken) return getYoutubeChannelAvatarUrl(channelToken);
  return null;
}
