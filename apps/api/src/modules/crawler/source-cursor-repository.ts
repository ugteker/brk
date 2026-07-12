import type { PrismaClient } from '@prisma/client';
import type { CrawlStrategy, SourceCursorState } from '../analysis/types';

type CursorDb = Pick<PrismaClient, 'agentSourceCursor'>;

interface CursorRow {
  agentId: string;
  sourceValue: string;
  strategy: string;
  seenItemIdsJson: string | null;
  lastItemPublishedAt: Date | null;
  lastContentHash: string | null;
  lastCrawledAt?: Date | null;
}

function toState(row: CursorRow): SourceCursorState {
  let seenItemIds: string[] = [];
  try {
    seenItemIds = row.seenItemIdsJson ? (JSON.parse(row.seenItemIdsJson) as string[]) : [];
  } catch {
    seenItemIds = [];
  }

  return {
    agentId: row.agentId,
    sourceValue: row.sourceValue,
    strategy: row.strategy as CrawlStrategy,
    seenItemIds,
    lastItemPublishedAt: row.lastItemPublishedAt ? row.lastItemPublishedAt.toISOString() : null,
    lastContentHash: row.lastContentHash,
    lastCrawledAt: row.lastCrawledAt ? row.lastCrawledAt.toISOString() : null
  };
}

export interface SourceCursorRepositoryLike {
  getCursor(agentId: string, sourceValue: string): Promise<SourceCursorState | null>;
  saveCursor(state: SourceCursorState): Promise<void>;
  /** Records that a source was fetched (attempted) right now, without disturbing its seen-items/
   * content-hash cursor. Written immediately (unlike saveCursor, which callers may defer until a
   * run fully succeeds) so a source's `frequencyMinutes` crawl cadence is enforced even when the
   * fetch fails or returns no new content. */
  touchCrawlAttempt(agentId: string, sourceValue: string, timestampIso: string): Promise<void>;
}

export class SourceCursorRepository implements SourceCursorRepositoryLike {
  constructor(private readonly db: CursorDb) {}

  async getCursor(agentId: string, sourceValue: string): Promise<SourceCursorState | null> {
    const row = await this.db.agentSourceCursor.findUnique({
      where: { agentId_sourceValue: { agentId, sourceValue } }
    });
    return row ? toState(row) : null;
  }

  async saveCursor(state: SourceCursorState): Promise<void> {
    const data = {
      strategy: state.strategy,
      seenItemIdsJson: JSON.stringify(state.seenItemIds),
      lastItemPublishedAt: state.lastItemPublishedAt ? new Date(state.lastItemPublishedAt) : null,
      lastContentHash: state.lastContentHash,
      lastCrawledAt: state.lastCrawledAt ? new Date(state.lastCrawledAt) : undefined
    };

    await this.db.agentSourceCursor.upsert({
      where: { agentId_sourceValue: { agentId: state.agentId, sourceValue: state.sourceValue } },
      create: { agentId: state.agentId, sourceValue: state.sourceValue, ...data },
      update: data
    });
  }

  async touchCrawlAttempt(agentId: string, sourceValue: string, timestampIso: string): Promise<void> {
    const lastCrawledAt = new Date(timestampIso);
    await this.db.agentSourceCursor.upsert({
      where: { agentId_sourceValue: { agentId, sourceValue } },
      create: { agentId, sourceValue, strategy: 'feed_items', lastCrawledAt },
      update: { lastCrawledAt }
    });
  }
}

export class InMemorySourceCursorRepository implements SourceCursorRepositoryLike {
  private readonly cursors = new Map<string, SourceCursorState>();

  private key(agentId: string, sourceValue: string): string {
    return `${agentId}::${sourceValue}`;
  }

  async getCursor(agentId: string, sourceValue: string): Promise<SourceCursorState | null> {
    return this.cursors.get(this.key(agentId, sourceValue)) ?? null;
  }

  async saveCursor(state: SourceCursorState): Promise<void> {
    this.cursors.set(this.key(state.agentId, state.sourceValue), state);
  }

  async touchCrawlAttempt(agentId: string, sourceValue: string, timestampIso: string): Promise<void> {
    const key = this.key(agentId, sourceValue);
    const existing = this.cursors.get(key);
    this.cursors.set(key, {
      ...(existing ?? {
        agentId,
        sourceValue,
        strategy: 'feed_items',
        seenItemIds: [],
        lastItemPublishedAt: null,
        lastContentHash: null
      }),
      lastCrawledAt: timestampIso
    });
  }
}
