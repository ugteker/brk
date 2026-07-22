import { createHash } from 'node:crypto';
import type { EvidenceBlock, SiteProfile, SourceConfig, SourceCursorState, SourceFetchOptions, SourceFetchResult } from '../types';
import type { SiteInspectorClient } from '../site-inspector-client';
import { validateSiteProfile } from '../site-inspector-client';
import { isFeedDocument } from './feed-detection';
import { parseFeedItems, parseFeedMetadata, type FeedItem } from './feed-items';
import { extractLinks, extractText, stripHtml } from './html-extraction';
import type { SourceCursorRepositoryLike } from '../../crawler/source-cursor-repository';
import type { SourceCrawlConfigRepositoryLike } from '../../crawler/crawl-config-repository';
import { canReinspect, nextReinspectionState } from '../../crawler/crawl-config-repository';
import type { HttpGet } from './web-url-adapter';

const DEFAULT_MAX_ITEMS_PER_RUN = 1;
const ABSOLUTE_MAX_ITEMS_PER_RUN = 10;
export { DEFAULT_MAX_ITEMS_PER_RUN, ABSOLUTE_MAX_ITEMS_PER_RUN };

/** Resolves the effective per-run item cap for a source: its configured `maxItems` (clamped to a
 * sane 1-10 range as a defensive measure, in case validation was bypassed), or the default of 1. */
function resolveMaxItems(source: SourceConfig): number {
  const configured = source.maxItems;
  if (!configured || !Number.isFinite(configured) || configured < 1) return DEFAULT_MAX_ITEMS_PER_RUN;
  return Math.min(Math.floor(configured), ABSOLUTE_MAX_ITEMS_PER_RUN);
}
const MAX_SEEN_ITEM_IDS = 200;
export const LOW_CONFIDENCE_THRESHOLD = 0.4;

export interface SmartCrawlerDeps {
  httpGet: HttpGet;
  cursorRepository: SourceCursorRepositoryLike;
  crawlConfigRepository: SourceCrawlConfigRepositoryLike;
  siteInspector: Pick<SiteInspectorClient, 'inspect'>;
  now?: () => Date;
  onFeedMetadata?: (source: SourceConfig, metadata: ReturnType<typeof parseFeedMetadata>) => Promise<void> | void;
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function mergeSeenItemIds(existing: string[], processed: string[]): string[] {
  const merged = [...existing, ...processed];
  return merged.length > MAX_SEEN_ITEM_IDS ? merged.slice(-MAX_SEEN_ITEM_IDS) : merged;
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

function deriveItemId(link: string, itemIdHint: string | null): string {
  if (itemIdHint === 'url_path') {
    try {
      return new URL(link).pathname;
    } catch {
      return link;
    }
  }
  return link;
}

async function resolveFeedItemContent(
  item: FeedItem,
  httpGet: HttpGet
): Promise<{ content: string; fidelity: EvidenceBlock['fidelity']; sourceRef: string }> {
  if (item.transcriptUrl) {
    try {
      const transcript = await httpGet(item.transcriptUrl);
      if (transcript.trim().length > 0) {
        return { content: transcript.trim(), fidelity: 'high', sourceRef: item.transcriptUrl };
      }
    } catch {
      // fall through to permalink fetch
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
      // fall through to title+description fallback
    }
  }

  return {
    content: `${item.title}. ${item.description}`.trim(),
    fidelity: 'low',
    sourceRef: item.link ?? item.title
  };
}

async function crawlFeed(
  deps: SmartCrawlerDeps,
  agentId: string,
  source: SourceConfig,
  feedXml: string,
  options?: SourceFetchOptions
): Promise<SourceFetchResult> {
  const cursor = await deps.cursorRepository.getCursor(agentId, source.value);
  const seenIds = new Set(cursor?.seenItemIds ?? []);
  const items = parseFeedItems(feedXml);
  const selected = options?.forcedItemLink
    ? items.filter((item) => item.link === options.forcedItemLink)
    : items.filter((item) => !seenIds.has(item.itemId)).slice(0, resolveMaxItems(source));

  if (selected.length === 0) {
    // If a specific episode was requested (episode picker) but isn't found in the current feed
    // fetch, surface a clear warning instead of silently reporting "no content" - the feed may
    // have changed/rotated the item out, or the stored link no longer matches exactly.
    return {
      evidence: [],
      warning: options?.forcedItemLink
        ? `Could not find the requested episode (${options.forcedItemLink}) in the current feed fetch — it may have been removed or the feed may have changed.`
        : undefined
    };
  }

  const evidence: EvidenceBlock[] = [];
  for (const item of selected) {
    const resolved = await resolveFeedItemContent(item, deps.httpGet);
    evidence.push({
      sourceId: source.value,
      sourceType: source.type,
      sourceRef: resolved.sourceRef,
      content: resolved.content,
      fidelity: resolved.fidelity,
      citations: [resolved.sourceRef],
      itemId: item.itemId,
      publishedAt: item.pubDate ?? undefined,
      title: item.title || undefined
    });
  }

  const cursorUpdate: SourceCursorState = {
    agentId,
    sourceValue: source.value,
    strategy: 'feed_items',
    seenItemIds: mergeSeenItemIds(cursor?.seenItemIds ?? [], selected.map((item) => item.itemId)),
    lastItemPublishedAt: latestPublishedAt(
      cursor?.lastItemPublishedAt ?? null,
      selected.map((item) => item.pubDate)
    ),
    lastContentHash: cursor?.lastContentHash ?? null
  };

  return { evidence, cursorUpdate };
}

async function crawlSinglePageByHash(
  agentId: string,
  source: SourceConfig,
  content: string,
  cursorRepository: SourceCursorRepositoryLike
): Promise<SourceFetchResult> {
  const cursor = await cursorRepository.getCursor(agentId, source.value);
  const hash = hashContent(content);

  if (cursor?.lastContentHash === hash) {
    return { evidence: [] };
  }

  const evidence: EvidenceBlock = {
    sourceId: source.value,
    sourceType: source.type,
    sourceRef: source.value,
    content,
    fidelity: 'high',
    citations: [source.value]
  };

  const cursorUpdate: SourceCursorState = {
    agentId,
    sourceValue: source.value,
    strategy: 'content_hash',
    seenItemIds: cursor?.seenItemIds ?? [],
    lastItemPublishedAt: cursor?.lastItemPublishedAt ?? null,
    lastContentHash: hash
  };

  return { evidence: [evidence], cursorUpdate };
}

async function crawlListingPage(
  deps: SmartCrawlerDeps,
  agentId: string,
  source: SourceConfig,
  html: string,
  profile: SiteProfile
): Promise<{ evidence: EvidenceBlock[]; cursorUpdate?: SourceCursorState; extractedZeroLinks: boolean }> {
  const links = profile.itemLinkSelector ? extractLinks(html, profile.itemLinkSelector, source.value) : [];

  if (links.length === 0) {
    return { evidence: [], extractedZeroLinks: true };
  }

  const cursor = await deps.cursorRepository.getCursor(agentId, source.value);
  const seenIds = new Set(cursor?.seenItemIds ?? []);
  const itemIds = links.map((link) => deriveItemId(link, profile.itemIdHint));
  const unseen = links
    .map((link, index) => ({ link, itemId: itemIds[index] }))
    .filter(({ itemId }) => !seenIds.has(itemId))
    .slice(0, resolveMaxItems(source));

  if (unseen.length === 0) {
    return { evidence: [], extractedZeroLinks: false };
  }

  const evidence: EvidenceBlock[] = [];
  for (const { link, itemId } of unseen) {
    try {
      const page = await deps.httpGet(link);
      const content = extractText(page, profile.contentSelector);
      evidence.push({
        sourceId: source.value,
        sourceType: source.type,
        sourceRef: link,
        content,
        fidelity: content.length > 0 ? 'medium' : 'low',
        citations: [link],
        itemId
      });
    } catch {
      // skip unreachable item; it remains unseen and will be retried next run
    }
  }

  const cursorUpdate: SourceCursorState = {
    agentId,
    sourceValue: source.value,
    strategy: 'feed_items',
    seenItemIds: mergeSeenItemIds(
      cursor?.seenItemIds ?? [],
      evidence.map((block) => block.itemId!).filter(Boolean)
    ),
    lastItemPublishedAt: cursor?.lastItemPublishedAt ?? null,
    lastContentHash: cursor?.lastContentHash ?? null
  };

  return { evidence, cursorUpdate, extractedZeroLinks: false };
}

async function inspectAndBuildConfig(
  deps: SmartCrawlerDeps,
  agentId: string,
  source: SourceConfig,
  html: string
): Promise<SiteProfile | null> {
  const profile = await deps.siteInspector.inspect(source.value, html);
  const validated = validateSiteProfile(profile);
  if (!validated || validated.confidence < LOW_CONFIDENCE_THRESHOLD) return null;

  await deps.crawlConfigRepository.saveConfig({
    agentId,
    sourceValue: source.value,
    siteType: validated.siteType,
    config: validated,
    inspectedAt: (deps.now?.() ?? new Date()).toISOString(),
    inspectionModel: 'claude-sonnet-4-5',
    confidence: validated.confidence,
    lastReinspectionAt: null,
    reinspectionCount24h: 0
  });

  return validated;
}

async function crawlNonFeed(deps: SmartCrawlerDeps, agentId: string, source: SourceConfig, html: string): Promise<SourceFetchResult> {
  const now = deps.now?.() ?? new Date();

  let config = await deps.crawlConfigRepository.getConfig(agentId, source.value);

  if (!config) {
    const profile = await inspectAndBuildConfig(deps, agentId, source, html);
    config = profile
      ? {
          agentId,
          sourceValue: source.value,
          siteType: profile.siteType,
          config: profile,
          inspectedAt: now.toISOString(),
          inspectionModel: 'claude-sonnet-4-5',
          confidence: profile.confidence,
          lastReinspectionAt: null,
          reinspectionCount24h: 0
        }
      : null;
  }

  if (!config || config.siteType === 'single_page') {
    const profile = config?.config && 'contentSelector' in config.config ? (config.config as SiteProfile) : null;
    const content = extractText(html, profile?.contentSelector ?? null);
    return crawlSinglePageByHash(agentId, source, content, deps.cursorRepository);
  }

  const profile = config.config as SiteProfile;
  const result = await crawlListingPage(deps, agentId, source, html, profile);

  if (!result.extractedZeroLinks) {
    return { evidence: result.evidence, cursorUpdate: result.cursorUpdate };
  }

  // Self-healing: the stored config yielded zero item links, signalling the site's markup likely
  // changed. Attempt exactly one reinspection within the confirmed 24h/1-attempt budget.
  if (!canReinspect(config, now)) {
    return { evidence: [], warning: `Crawl config for ${source.value} appears stale but the reinspection budget is exhausted for the next 24h.` };
  }

  const reinspected = await inspectAndBuildConfig(deps, agentId, source, html);
  const budgetState = nextReinspectionState(config, now);

  if (!reinspected) {
    await deps.crawlConfigRepository.saveConfig({ ...config, ...budgetState });
    return { evidence: [], warning: `Reinspection of ${source.value} failed; skipping this source for now.` };
  }

  await deps.crawlConfigRepository.saveConfig({
    agentId,
    sourceValue: source.value,
    siteType: reinspected.siteType,
    config: reinspected,
    inspectedAt: now.toISOString(),
    inspectionModel: 'claude-sonnet-4-5',
    confidence: reinspected.confidence,
    ...budgetState
  });

  const retry = await crawlListingPage(deps, agentId, source, html, reinspected);
  if (retry.extractedZeroLinks) {
    return { evidence: [], warning: `Reinspection of ${source.value} did not resolve extraction; skipping this source for now.` };
  }

  return { evidence: retry.evidence, cursorUpdate: retry.cursorUpdate };
}

/**
 * Auto-detects whether a source is feed-like (RSS/Atom, regardless of the wizard's configured
 * `type`) and dispatches to the deterministic feed-cursor tier, or otherwise to the AI-assisted
 * tier for non-feed sources (listing pages / single pages), per the crawler design.
 */
export async function crawlSource(
  deps: SmartCrawlerDeps,
  agentId: string,
  source: SourceConfig,
  options?: SourceFetchOptions
): Promise<SourceFetchResult> {
  const initial = await deps.httpGet(source.value);

  if (isFeedDocument(initial)) {
    const metadata = parseFeedMetadata(initial);
    if (metadata.coverImageUrl) {
      if (source.type === 'podcast_feeds') {
        await deps.cursorRepository.refreshSourceCoverImageUrl?.(source.type, source.value, metadata.coverImageUrl);
      }
      await deps.onFeedMetadata?.(source, metadata);
    }
    return crawlFeed(deps, agentId, source, initial, options);
  }

  return crawlNonFeed(deps, agentId, source, initial);
}

export interface SourceProbePreviewItem {
  title: string;
  link: string | null;
  pubDate: string | null;
}

/** The sneak preview always shows the last N items regardless of the configured "per run" cap,
 * so the user can confirm the source/link resolves to real, recent content before saving. */
export const PREVIEW_ITEM_COUNT = 5;

export interface SourceProbeResult {
  reachable: boolean;
  kind: 'feed' | 'listing_page' | 'single_page' | 'unknown';
  title?: string;
  coverImageUrl?: string;
  itemCount?: number;
  confidence?: number;
  warning?: string;
  maxItemsPerRun?: number;
  /** Sneak preview of the most recent items available, always capped to `PREVIEW_ITEM_COUNT` (5)
   * regardless of `maxItemsPerRun`, so the user can visually confirm the source/link resolves to
   * the right content before saving. */
  previewItems?: SourceProbePreviewItem[];
}

/** Maps parsed feed items down to the wizard preview shape, capped to `PREVIEW_ITEM_COUNT`. */
export function toPreviewItems(items: FeedItem[], limit: number = PREVIEW_ITEM_COUNT): SourceProbePreviewItem[] {
  return items.slice(0, limit).map((item) => ({ title: item.title || '(untitled)', link: item.link, pubDate: item.pubDate }));
}

/**
 * Stateless, non-persisting probe used to give the wizard immediate ("fail fast") feedback about
 * how a source is likely to be crawled, without requiring an agent to already exist. For non-feed
 * sources this performs the same one-time AI site inspection used at first-crawl time, but does
 * NOT persist an AgentSourceCrawlConfig — the real crawl still performs (and persists) its own
 * inspection on the source's first actual run.
 */
export async function probeSource(
  deps: Pick<SmartCrawlerDeps, 'httpGet' | 'siteInspector'>,
  source: SourceConfig,
  previewLimit?: number
): Promise<SourceProbeResult> {
  let html: string;
  try {
    html = await deps.httpGet(source.value);
  } catch (error) {
    return {
      reachable: false,
      kind: 'unknown',
      warning: `Could not reach ${source.value}: ${error instanceof Error ? error.message : 'unknown error'}`
    };
  }

  if (isFeedDocument(html)) {
    const items = parseFeedItems(html);
    const metadata = parseFeedMetadata(html);
    const maxItemsPerRun = resolveMaxItems(source);
    return {
      reachable: true,
      kind: 'feed',
      title: metadata.title,
      coverImageUrl: metadata.coverImageUrl,
      itemCount: items.length,
      maxItemsPerRun,
      previewItems: toPreviewItems(items, previewLimit),
      warning: items.length === 0 ? 'Feed detected but no items could be parsed from it yet.' : undefined
    };
  }

  const profile = await deps.siteInspector.inspect(source.value, html);
  const validated = validateSiteProfile(profile);

  if (!validated) {
    return {
      reachable: true,
      kind: 'unknown',
      warning:
        'Could not automatically determine how to crawl this page. Reports will fall back to generic whole-page extraction, which may be lower quality.'
    };
  }

  if (validated.confidence < LOW_CONFIDENCE_THRESHOLD) {
    return {
      reachable: true,
      kind: validated.siteType,
      confidence: validated.confidence,
      maxItemsPerRun: validated.siteType === 'listing_page' ? resolveMaxItems(source) : undefined,
      warning: `Low confidence (${Math.round(validated.confidence * 100)}%) in the detected crawl strategy for this page — results may be unreliable.`
    };
  }

  return {
    reachable: true,
    kind: validated.siteType,
    confidence: validated.confidence,
    maxItemsPerRun: validated.siteType === 'listing_page' ? resolveMaxItems(source) : undefined
  };
}
