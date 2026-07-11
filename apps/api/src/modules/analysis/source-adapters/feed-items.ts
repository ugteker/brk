export interface FeedItem {
  itemId: string;
  link: string | null;
  title: string;
  description: string;
  pubDate: string | null;
  transcriptUrl: string | null;
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
        transcriptUrl: extractTranscriptUrl(block)
      };
    })
    .filter((item) => item.itemId.length > 0);
}
