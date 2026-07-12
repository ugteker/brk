import type { SignalRecord } from '../reports/types';

export type EvidenceFidelity = 'high' | 'medium' | 'low';

export interface EvidenceBlock {
  sourceId: string;
  sourceType: 'web_urls' | 'podcast_feeds' | 'youtube_videos';
  sourceRef: string;
  content: string;
  fidelity: EvidenceFidelity;
  citations: string[];
  itemId?: string;
  publishedAt?: string;
  // Human-readable title for this piece of evidence (episode/video/article title), when the
  // source adapter has one available - shown in the report notification email so recipients can
  // see at a glance which specific episode(s)/item(s) the report was generated from.
  title?: string;
}

export interface SourceConfig {
  type: 'web_urls' | 'podcast_feeds' | 'youtube_videos';
  value: string;
  maxItems?: number;
}

/** Optional per-fetch override used by the manual-run episode picker: force crawling one specific
 * feed item (matched by `link`) regardless of seen-status/max-items cap, instead of the normal
 * "N most recent unseen items" selection. Ignored by non-feed (web listing/single page) sources. */
export interface SourceFetchOptions {
  forcedItemLink?: string;
}

export interface SourceFetchResult {
  evidence: EvidenceBlock[];
  cursorUpdate?: SourceCursorState;
  warning?: string;
}

export interface SourceAdapter {
  fetch(agentId: string, source: SourceConfig, options?: SourceFetchOptions): Promise<SourceFetchResult>;
}

export interface ClaudeAnalysisRequest {
  model: string;
  systemPrompt: string;
  evidence: EvidenceBlock[];
}

export interface ClaudeAnalysisResult {
  summary: string;
  signals: SignalRecord[];
  sourceWarnings: string[];
  needsHumanReview: boolean;
  // Token usage reported by the Claude API for this call, when available - used to show AI
  // cost/usage stats on the report and is never required for the run to succeed.
  usage?: { inputTokens: number; outputTokens: number };
}

export type CrawlStrategy = 'feed_items' | 'content_hash';

export interface SourceCursorState {
  agentId: string;
  sourceValue: string;
  strategy: CrawlStrategy;
  seenItemIds: string[];
  lastItemPublishedAt: string | null;
  lastContentHash: string | null;
  /** ISO timestamp of the last time this source was actually fetched over the network (success or
   * failure). Used to enforce each source's `frequencyMinutes` crawl cadence independently of the
   * agent's overall run schedule. Distinct from `lastItemPublishedAt`, which only advances when new
   * content is found. */
  lastCrawledAt?: string | null;
}

export type SiteType = 'feed' | 'listing_page' | 'single_page';

export interface SiteProfile {
  siteType: Exclude<SiteType, 'feed'>;
  itemLinkSelector: string | null;
  itemIdHint: string | null;
  contentSelector: string;
  paginationSelector: string | null;
  confidence: number;
}

export interface SourceCrawlConfigState {
  agentId: string;
  sourceValue: string;
  siteType: SiteType;
  config: SiteProfile | Record<string, never>;
  inspectedAt: string;
  inspectionModel: string | null;
  confidence: number | null;
  lastReinspectionAt: string | null;
  reinspectionCount24h: number;
}

