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
import { InMemorySourceCursorRepository } from '../../crawler/source-cursor-repository';
import { isFeedDocument } from './feed-detection';
import { crawlSource, type SmartCrawlerDeps } from './smart-crawler';
import { PodcastFeedAdapter } from './podcast-feed-adapter';

export type HttpGet = (url: string, headers?: Record<string, string>) => Promise<string>;

export const defaultHttpGet: HttpGet = async (url, headers) => {
  const response = await fetch(url, headers ? { headers } : undefined);
  return response.text();
};

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function resolveMaxItems(limit: unknown): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 1) {
    return 1;
  }
  return Math.min(Math.floor(limit), 10);
}

function normalizeFetchOptions(configuredLimit: number | undefined, options?: SourceFetchOptions): SourceFetchOptions | undefined {
  if (options?.forcedItemLink) {
    return options;
  }
  return { ...options, limit: resolveMaxItems(options?.limit ?? configuredLimit) };
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
    strategy: Array.isArray(cursor.seenItemIds) && cursor.seenItemIds.length > 0 ? 'feed_items' : 'content_hash',
    seenItemIds: Array.isArray(cursor.seenItemIds) ? cursor.seenItemIds.filter((entry): entry is string => typeof entry === 'string') : [],
    lastItemPublishedAt: typeof cursor.lastItemPublishedAt === 'string' ? cursor.lastItemPublishedAt : null,
    lastContentHash: typeof cursor.lastContentHash === 'string' ? cursor.lastContentHash : null
  };
}

function toLegacyResult(source: SourceConfig, agentId: string, result: CanonicalSourceFetchResult): SourceFetchResult {
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
      itemId: typeof item.metadata.itemId === 'string' ? item.metadata.itemId : undefined,
      publishedAt: item.publishedAt.toISOString(),
      title: item.title
    })),
    cursorUpdate: canonicalCursorToLegacy(agentId, source.value, result.cursor),
    warning: result.warning
  };
}

/**
 * Thin wrapper delegating to the shared smart-crawler orchestration, which auto-detects whether
 * a source is feed-like (regardless of the wizard's configured type) and applies the appropriate
 * deterministic or AI-assisted crawling strategy.
 */
export class WebUrlAdapter implements CanonicalSourceAdapter {
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
    const initial = await this.deps.httpGet(source.value);
    if (isFeedDocument(initial)) {
      return new PodcastFeedAdapter(this.deps).fetch(source, cursor, fetchOptions);
    }

    const cursorRepository = new InMemorySourceCursorRepository();
    const syntheticAgentId = `canonical:${source.id}`;
    await cursorRepository.saveCursor(canonicalCursorToLegacy(syntheticAgentId, source.value, cursor));
    const result = await crawlSource(
      { ...this.deps, cursorRepository },
      syntheticAgentId,
      { type: source.type, value: source.value, maxItems: fetchOptions?.limit },
      fetchOptions
    );

    const items: CanonicalSourceItemInput[] = result.evidence.map((block) => ({
      title: block.title ?? block.sourceRef,
      content: block.content,
      link: block.sourceRef,
      publishedAt: block.publishedAt ? new Date(block.publishedAt) : new Date(0),
      contentHash: hashContent(block.content),
      metadata: {
        fidelity: block.fidelity,
        citations: block.citations,
        sourceRef: block.sourceRef,
        itemId: block.itemId ?? null
      }
    }));

    return {
      items,
      cursor: result.cursorUpdate ? legacyCursorToCanonical(result.cursorUpdate) : cursor,
      warning: result.warning
    };
  }
}
