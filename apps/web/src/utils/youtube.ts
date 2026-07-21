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
