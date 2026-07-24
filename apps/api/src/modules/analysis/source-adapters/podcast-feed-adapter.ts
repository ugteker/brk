import { createHash } from 'node:crypto';
import type {
  CanonicalSourceAdapter,
  CanonicalSourceFetchResult,
  CanonicalSourceItemInput,
  CanonicalSourceRef,
  SourceConfig,
  SourceCursorState,
  SourceFetchOptions,
  SourceFetchResult
} from '../types';
import type { SmartCrawlerDeps } from './smart-crawler';
import { nextFeedCursor, parseFeedItems, parseFeedMetadata, selectFeedItems } from './feed-items';
import { stripHtml } from './html-extraction';

const DEFAULT_MAX_ITEMS_PER_RUN = 1;
const ABSOLUTE_MAX_ITEMS_PER_RUN = 10;

/**
 * Thin wrapper delegating to the shared smart-crawler orchestration. Podcast feed sources are
 * expected to sniff as valid RSS/Atom and use the deterministic feed-item cursor tier, but the
 * detection happens generically in `crawlSource` regardless of the configured source type.
 */
function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function publishedAtFromFeed(value: string | null): Date {
  const date = value ? new Date(value) : new Date(0);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function resolveMaxItems(limit: unknown): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 1) {
    return DEFAULT_MAX_ITEMS_PER_RUN;
  }
  return Math.min(Math.floor(limit), ABSOLUTE_MAX_ITEMS_PER_RUN);
}

function normalizeFetchOptions(configuredLimit: number | undefined, options?: SourceFetchOptions): SourceFetchOptions | undefined {
  if (options?.forcedItemLink) {
    return options;
  }
  return { ...options, limit: resolveMaxItems(options?.limit ?? configuredLimit) };
}

async function resolveFeedItemContent(
  item: ReturnType<typeof parseFeedItems>[number],
  httpGet: SmartCrawlerDeps['httpGet']
): Promise<{ content: string; fidelity: 'high' | 'medium' | 'low'; sourceRef: string }> {
  if (item.transcriptUrl) {
    try {
      const transcript = await httpGet(item.transcriptUrl);
      if (transcript.trim().length > 0) {
        return { content: transcript.trim(), fidelity: 'high', sourceRef: item.transcriptUrl };
      }
    } catch {
      // fall through
    }
  }

  if (item.link) {
    try {
      const page = await httpGet(item.link);
      const content = stripHtml(page);
      if (content.length > 0) {
        return { content, fidelity: 'medium', sourceRef: item.link };
      }
    } catch {
      // fall through
    }
  }

  return {
    content: `${item.title}. ${item.description}`.trim(),
    fidelity: 'low',
    sourceRef: item.link ?? item.itemId
  };
}

function canonicalItemFromFeedItem(
  item: ReturnType<typeof parseFeedItems>[number],
  resolved: Awaited<ReturnType<typeof resolveFeedItemContent>>
): CanonicalSourceItemInput {
  return {
    title: item.title || '(untitled)',
    content: resolved.content,
    link: item.link ?? item.itemId,
    publishedAt: publishedAtFromFeed(item.pubDate),
    contentHash: hashContent(resolved.content),
    metadata: {
      fidelity: resolved.fidelity,
      citations: [resolved.sourceRef],
      sourceRef: resolved.sourceRef,
      itemId: item.itemId,
      imageUrl: item.imageUrl ?? null
    }
  };
}

function legacyCursorToCanonical(cursor: SourceCursorState | null): Record<string, unknown> {
  return {
    seenItemIds: cursor?.seenItemIds ?? [],
    lastItemPublishedAt: cursor?.lastItemPublishedAt ?? null,
    lastContentHash: cursor?.lastContentHash ?? null
  };
}

function canonicalCursorToLegacy(agentId: string, sourceValue: string, cursor: Record<string, unknown>): SourceCursorState {
  return {
    agentId,
    sourceValue,
    strategy: 'feed_items',
    seenItemIds: Array.isArray(cursor.seenItemIds) ? cursor.seenItemIds.filter((entry): entry is string => typeof entry === 'string') : [],
    lastItemPublishedAt: typeof cursor.lastItemPublishedAt === 'string' ? cursor.lastItemPublishedAt : null,
    lastContentHash: typeof cursor.lastContentHash === 'string' ? cursor.lastContentHash : null
  };
}

function toLegacyResult(
  source: SourceConfig,
  agentId: string,
  result: CanonicalSourceFetchResult
): SourceFetchResult {
  return {
    evidence: result.items.map((item) => ({
      sourceId: source.value,
      sourceType: source.type,
      sourceRef: typeof item.metadata.sourceRef === 'string' ? item.metadata.sourceRef : item.link,
      content: item.content,
      fidelity:
        item.metadata.fidelity === 'medium' || item.metadata.fidelity === 'low' || item.metadata.fidelity === 'high'
          ? item.metadata.fidelity
          : 'high',
      citations: Array.isArray(item.metadata.citations)
        ? item.metadata.citations.filter((entry): entry is string => typeof entry === 'string')
        : [item.link],
      itemId: typeof item.metadata.itemId === 'string' ? item.metadata.itemId : item.link,
      publishedAt: item.publishedAt.toISOString(),
      title: item.title
    })),
    cursorUpdate: canonicalCursorToLegacy(agentId, source.value, result.cursor),
    warning: result.warning
  };
}

export class PodcastFeedAdapter implements CanonicalSourceAdapter {
  constructor(private readonly deps: SmartCrawlerDeps) {}

  async fetch(agentId: string, source: SourceConfig, options?: SourceFetchOptions): Promise<SourceFetchResult>;
  async fetch(source: CanonicalSourceRef, cursor: Record<string, unknown>, options?: SourceFetchOptions): Promise<CanonicalSourceFetchResult>;
  async fetch(
    first: string | CanonicalSourceRef,
    second: SourceConfig | Record<string, unknown>,
    third?: SourceFetchOptions
  ): Promise<SourceFetchResult | CanonicalSourceFetchResult> {
    if (typeof first === 'string') {
      const agentId = first;
      const source = second as SourceConfig;
      const existingCursor = this.deps.cursorRepository
        ? await this.deps.cursorRepository.getCursor(agentId, source.value)
        : null;
      const result = await this.fetchCanonical(
        { id: source.value, type: source.type, value: source.value },
        legacyCursorToCanonical(existingCursor),
        normalizeFetchOptions(source.maxItems, third)
      );
      return toLegacyResult(source, agentId, result);
    }

    return this.fetchCanonical(first, second as Record<string, unknown>, normalizeFetchOptions(undefined, third));
  }

  private async fetchCanonical(
    source: CanonicalSourceRef,
    cursor: Record<string, unknown>,
    options?: SourceFetchOptions
  ): Promise<CanonicalSourceFetchResult> {
    const fetchOptions = normalizeFetchOptions(undefined, options);
    const xml = await this.deps.httpGet(source.value);
    const metadata = parseFeedMetadata(xml);
    if (metadata.coverImageUrl) {
      await this.deps.cursorRepository.refreshSourceCoverImageUrl?.(source.type, source.value, metadata.coverImageUrl);
    }
    await this.deps.onFeedMetadata?.({ type: source.type, value: source.value }, metadata);

    const items = parseFeedItems(xml);
    const selected = selectFeedItems(items, cursor, fetchOptions);
    if (selected.length === 0) {
      return {
        items: [],
        cursor,
        warning: fetchOptions?.forcedItemLink
          ? `Could not find the requested episode (${fetchOptions.forcedItemLink}) in the current feed fetch — it may have been removed or the feed may have changed.`
          : undefined
      };
    }

    const canonicalItems: CanonicalSourceItemInput[] = [];
    for (const item of selected) {
      canonicalItems.push(canonicalItemFromFeedItem(item, await resolveFeedItemContent(item, this.deps.httpGet)));
    }

    return {
      items: canonicalItems,
      cursor: nextFeedCursor(cursor, selected)
    };
  }
}
