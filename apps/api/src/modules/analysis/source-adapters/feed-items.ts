export interface FeedItem {
  itemId: string;
  link: string | null;
  title: string;
  description: string;
  pubDate: string | null;
  transcriptUrl: string | null;
  imageUrl?: string;
}

export interface FeedMetadata {
  title?: string;
  coverImageUrl?: string;
}

interface FeedCursorState {
  seenItemIds: string[];
  lastItemPublishedAt: string | null;
  lastContentHash: string | null;
}

function extractItemBlocks(xml: string): string[] {
  const rssItems = xml.match(/<item[\s\S]*?<\/item>/gi);
  if (rssItems && rssItems.length > 0) return rssItems;
  return xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? [];
}

function extractTag(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? match[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : null;
}

function extractChannelOrFeedBlock(xml: string): string {
  const channelMatch = xml.match(/<channel[^>]*>([\s\S]*?)<\/channel>/i);
  if (channelMatch) return channelMatch[1];
  const feedMatch = xml.match(/<feed[^>]*>([\s\S]*?)<\/feed>/i);
  if (feedMatch) return feedMatch[1];
  return xml;
}

function stripEntryBlocks(xml: string): string {
  return xml.replace(/<item[\s\S]*?<\/item>/gi, '').replace(/<entry[\s\S]*?<\/entry>/gi, '');
}

function extractAttributeValue(block: string, tag: string, attribute: string): string | null {
  const escapedTag = tag.replace(':', '\\:');
  const match = block.match(new RegExp(`<${escapedTag}[^>]*${attribute}=["']([^"']+)["'][^>]*\\/?>`, 'i'));
  return match ? match[1].trim() : null;
}

function extractGuid(block: string): string | null {
  return extractTag(block, 'guid');
}

function extractLink(block: string): string | null {
  const rssLink = extractTag(block, 'link');
  if (rssLink) return rssLink.trim();
  const atomLink = block.match(/<link[^>]*href="([^"]+)"[^>]*\/?>/i);
  return atomLink ? atomLink[1] : null;
}

function extractTranscriptUrl(block: string): string | null {
  const match = block.match(/<podcast:transcript[^>]*url="([^"]+)"[^>]*\/?>/i);
  return match ? match[1] : null;
}

/**
 * Parses every `<item>` (RSS) or `<entry>` (Atom) block out of a feed document, in document
 * order (feeds conventionally list newest-first). Each item's stable identifier prefers the
 * feed-provided `<guid>`, falling back to the item's link, and finally its title, so items can
 * still be tracked even for minimal/non-conformant feeds.
 */
export function parseFeedItems(xml: string): FeedItem[] {
  const feedCoverImageUrl = parseFeedMetadata(xml).coverImageUrl;
  return extractItemBlocks(xml)
    .map((block): FeedItem => {
      const guid = extractGuid(block);
      const link = extractLink(block);
      const title = extractTag(block, 'title') ?? '';
      return {
        itemId: guid ?? link ?? title,
        link,
        title,
        description: extractTag(block, 'description') ?? extractTag(block, 'summary') ?? '',
        pubDate: extractTag(block, 'pubDate') ?? extractTag(block, 'published') ?? extractTag(block, 'updated'),
        transcriptUrl: extractTranscriptUrl(block),
        imageUrl: extractAttributeValue(block, 'itunes:image', 'href') ?? feedCoverImageUrl
      };
    })
    .filter((item) => item.itemId.length > 0);
}

export function parseFeedMetadata(xml: string): FeedMetadata {
  const block = stripEntryBlocks(extractChannelOrFeedBlock(xml));
  const title = extractTag(block, 'title') ?? undefined;
  const coverImageUrl =
    extractAttributeValue(block, 'itunes:image', 'href') ??
    extractTag(block, 'logo') ??
    extractTag(block, 'icon') ??
    extractTag(extractTag(block, 'image') ?? '', 'url') ??
    undefined;

  return {
    title,
    coverImageUrl
  };
}

function mergeSeenItemIds(existing: string[], processed: string[]): string[] {
  const merged = [...existing, ...processed];
  return merged.length > 200 ? merged.slice(-200) : merged;
}

function latestPublishedAt(current: string | null, candidates: Array<string | null>): string | null {
  let latest = current ? new Date(current).getTime() : null;
  for (const candidate of candidates) {
    if (!candidate) continue;
    const time = new Date(candidate).getTime();
    if (Number.isNaN(time)) continue;
    if (latest === null || time > latest) latest = time;
  }
  return latest === null ? null : new Date(latest).toISOString();
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

export function readFeedCursor(cursor: Record<string, unknown>): FeedCursorState {
  return {
    seenItemIds: readStringArray(cursor.seenItemIds),
    lastItemPublishedAt: typeof cursor.lastItemPublishedAt === 'string' ? cursor.lastItemPublishedAt : null,
    lastContentHash: typeof cursor.lastContentHash === 'string' ? cursor.lastContentHash : null
  };
}

export function selectFeedItems(
  items: FeedItem[],
  cursor: Record<string, unknown>,
  options?: { forcedItemLink?: string; limit?: number }
): FeedItem[] {
  const state = readFeedCursor(cursor);
  if (options?.forcedItemLink) {
    return items.filter((item) => item.link === options.forcedItemLink);
  }

  const seenIds = new Set(state.seenItemIds);
  const unseen = items.filter((item) => !seenIds.has(item.itemId));
  return typeof options?.limit === 'number' ? unseen.slice(0, options.limit) : unseen;
}

export function nextFeedCursor(cursor: Record<string, unknown>, processed: FeedItem[]): Record<string, unknown> {
  const state = readFeedCursor(cursor);
  return {
    seenItemIds: mergeSeenItemIds(
      state.seenItemIds,
      processed.map((item) => item.itemId)
    ),
    lastItemPublishedAt: latestPublishedAt(
      state.lastItemPublishedAt,
      processed.map((item) => item.pubDate)
    ),
    lastContentHash: state.lastContentHash
  };
}
