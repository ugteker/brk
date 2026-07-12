import type { SourceAdapter, SourceConfig, SourceFetchResult } from '../types';
import { crawlSource, type SmartCrawlerDeps } from './smart-crawler';

export type HttpGet = (url: string) => Promise<string>;

export const defaultHttpGet: HttpGet = async (url) => {
  const response = await fetch(url);
  return response.text();
};

/**
 * Thin wrapper delegating to the shared smart-crawler orchestration, which auto-detects whether
 * a source is feed-like (regardless of the wizard's configured type) and applies the appropriate
 * deterministic or AI-assisted crawling strategy.
 */
export class WebUrlAdapter implements SourceAdapter {
  constructor(private readonly deps: SmartCrawlerDeps) {}

  async fetch(agentId: string, source: SourceConfig): Promise<SourceFetchResult> {
    return crawlSource(this.deps, agentId, source);
  }
}
