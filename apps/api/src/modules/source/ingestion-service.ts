import type { CanonicalSourceAdapter } from '../analysis/types';
import type { SourceFetchOptions } from '../analysis/types';
import type { SourceType } from './types';
import type { SourceIngestionRepositoryLike } from './ingestion-repository';

const DEFAULT_FRESHNESS_MS = 60_000;
const DEFAULT_LEASE_MS = 60_000;
const DEFAULT_CANONICAL_ITEM_LIMIT = 1;

export interface SourceIngestionServiceDeps {
  repository: SourceIngestionRepositoryLike;
  adapters: Partial<Record<SourceType, CanonicalSourceAdapter>>;
  freshnessMs?: number;
  leaseMs?: number;
}

export class SourceIngestionService {
  constructor(private readonly deps: SourceIngestionServiceDeps) {}

  async ensureFresh(sourceId: string, now: Date, options?: SourceFetchOptions): Promise<{ warning?: string }> {
    const source = await this.deps.repository.getSource(sourceId);
    if (!source) {
      throw new Error(`source_not_found:${sourceId}`);
    }

    const adapter = this.deps.adapters[source.type];
    if (!adapter) {
      throw new Error(`unsupported_source_type:${source.type}`);
    }

    const state = await this.deps.repository.getRefreshState(sourceId);
    const leaseMs = this.deps.leaseMs ?? DEFAULT_LEASE_MS;
    const fetchOptions = options?.forcedItemLink
      ? options
      : { ...options, limit: options?.limit ?? DEFAULT_CANONICAL_ITEM_LIMIT };
    const freshnessMs = options?.forcedItemLink ? 0 : this.deps.freshnessMs ?? DEFAULT_FRESHNESS_MS;
    const claimed = await this.deps.repository.claimRefresh(sourceId, now, leaseMs, freshnessMs);
    if (!claimed) {
      return {};
    }

    try {
      const result = await adapter.fetch(source, state?.cursor ?? {}, fetchOptions);
      await this.deps.repository.completeRefresh(sourceId, result.items, result.cursor, now);
      return result.warning ? { warning: result.warning } : {};
    } catch (error) {
      await this.deps.repository.releaseRefresh(sourceId);
      throw error;
    }
  }
}
