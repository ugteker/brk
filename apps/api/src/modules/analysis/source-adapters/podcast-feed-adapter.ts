import type { SourceAdapter, SourceConfig, SourceFetchResult } from '../types';
import { crawlSource, type SmartCrawlerDeps } from './smart-crawler';

/**
 * Thin wrapper delegating to the shared smart-crawler orchestration. Podcast feed sources are
 * expected to sniff as valid RSS/Atom and use the deterministic feed-item cursor tier, but the
 * detection happens generically in `crawlSource` regardless of the configured source type.
 */
export class PodcastFeedAdapter implements SourceAdapter {
  constructor(private readonly deps: SmartCrawlerDeps) {}

  async fetch(agentId: string, source: SourceConfig): Promise<SourceFetchResult> {
    return crawlSource(this.deps, agentId, source);
  }
}
