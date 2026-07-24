import type { PrismaClient } from '@prisma/client';
import type { CanonicalSourceItemInput } from '../analysis/types';
import type { SourceType } from './types';

type IngestionDb = Pick<
  PrismaClient,
  'source' | 'sourceIngestionState' | 'sourceItem' | 'playbookSource' | 'playbookSourceItem' | '$transaction'
>;

export interface CanonicalSourceRecord {
  id: string;
  type: SourceType;
  value: string;
}

export interface SourceItemRecord {
  id: string;
  sourceId: string;
  sourceType: SourceType;
  sourceValue: string;
  title: string;
  content: string;
  link: string;
  publishedAt: Date;
  contentHash: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface PlaybookSourceRecord {
  playbookId: string;
  sourceId: string;
  source: CanonicalSourceRecord;
}

export interface SourceIngestionStateRecord {
  cursor: Record<string, unknown>;
  refreshedAt: Date | null;
}

export interface SourceIngestionRepositoryLike {
  getSource(sourceId: string): Promise<CanonicalSourceRecord | null>;
  getRefreshState(sourceId: string): Promise<SourceIngestionStateRecord | null>;
  claimRefresh(sourceId: string, now: Date, leaseMs: number, freshnessMs: number): Promise<boolean>;
  completeRefresh(sourceId: string, items: CanonicalSourceItemInput[], cursor: Record<string, unknown>, now: Date): Promise<void>;
  releaseRefresh(sourceId: string): Promise<void>;
  listPlaybookSources(playbookId: string): Promise<PlaybookSourceRecord[]>;
  listUnconsumed(playbookId: string, sourceId: string, limit: number): Promise<SourceItemRecord[]>;
  markConsumed(playbookId: string, sourceItemIds: string[], consumedAt: Date): Promise<void>;
  getSourceItemByLink(sourceId: string, link: string): Promise<SourceItemRecord | null>;
}

function parseJsonObject(json: string, context: string): Record<string, unknown> {
  const parsed = JSON.parse(json) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${context} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function mapSource(row: { id: string; type: string; value: string }): CanonicalSourceRecord {
  return {
    id: row.id,
    type: row.type as SourceType,
    value: row.value
  };
}

function mapSourceItem(row: {
  id: string;
  sourceId: string;
  title: string;
  content: string;
  link: string;
  publishedAt: Date;
  contentHash: string;
  metadataJson: string;
  createdAt: Date;
  source: { type: string; value: string };
}): SourceItemRecord {
  return {
    id: row.id,
    sourceId: row.sourceId,
    sourceType: row.source.type as SourceType,
    sourceValue: row.source.value,
    title: row.title,
    content: row.content,
    link: row.link,
    publishedAt: row.publishedAt,
    contentHash: row.contentHash,
    metadata: parseJsonObject(row.metadataJson, `SourceItem ${row.id} metadataJson`),
    createdAt: row.createdAt
  };
}

export class SourceIngestionRepository implements SourceIngestionRepositoryLike {
  constructor(private readonly db: IngestionDb) {}

  async getSource(sourceId: string): Promise<CanonicalSourceRecord | null> {
    const row = await this.db.source.findUnique({
      where: { id: sourceId },
      select: { id: true, type: true, value: true }
    });
    return row ? mapSource(row) : null;
  }

  async getRefreshState(sourceId: string): Promise<SourceIngestionStateRecord | null> {
    const row = await this.db.sourceIngestionState.findUnique({
      where: { sourceId },
      select: { cursorJson: true, refreshedAt: true }
    });
    return row
      ? {
          cursor: parseJsonObject(row.cursorJson, `SourceIngestionState ${sourceId} cursorJson`),
          refreshedAt: row.refreshedAt
        }
      : null;
  }

  async claimRefresh(sourceId: string, now: Date, leaseMs: number, freshnessMs: number): Promise<boolean> {
    return this.db.$transaction(async (tx) => {
      const existing = await tx.sourceIngestionState.findUnique({
        where: { sourceId },
        select: { sourceId: true, refreshedAt: true, leaseUntil: true }
      });

      if (existing?.leaseUntil && existing.leaseUntil.getTime() > now.getTime()) {
        return false;
      }
      if (
        existing?.refreshedAt &&
        freshnessMs > 0 &&
        now.getTime() - existing.refreshedAt.getTime() < freshnessMs
      ) {
        return false;
      }

      const leaseUntil = new Date(now.getTime() + leaseMs);
      if (existing) {
        await tx.sourceIngestionState.update({
          where: { sourceId },
          data: { lastAttemptAt: now, leaseUntil }
        });
        return true;
      }

      await tx.sourceIngestionState.create({
        data: {
          sourceId,
          cursorJson: '{}',
          lastAttemptAt: now,
          leaseUntil
        }
      });
      return true;
    });
  }

  async completeRefresh(
    sourceId: string,
    items: CanonicalSourceItemInput[],
    cursor: Record<string, unknown>,
    now: Date
  ): Promise<void> {
    await this.db.$transaction(async (tx) => {
      for (const item of items) {
        await tx.sourceItem.upsert({
          where: { sourceId_link: { sourceId, link: item.link } },
          create: {
            sourceId,
            title: item.title,
            content: item.content,
            link: item.link,
            publishedAt: item.publishedAt,
            contentHash: item.contentHash,
            metadataJson: JSON.stringify(item.metadata)
          },
          update: {
            title: item.title,
            content: item.content,
            publishedAt: item.publishedAt,
            contentHash: item.contentHash,
            metadataJson: JSON.stringify(item.metadata)
          }
        });
      }

      await tx.sourceIngestionState.upsert({
        where: { sourceId },
        create: {
          sourceId,
          cursorJson: JSON.stringify(cursor),
          lastAttemptAt: now,
          refreshedAt: now,
          leaseUntil: null
        },
        update: {
          cursorJson: JSON.stringify(cursor),
          lastAttemptAt: now,
          refreshedAt: now,
          leaseUntil: null
        }
      });
    });
  }

  async releaseRefresh(sourceId: string): Promise<void> {
    await this.db.sourceIngestionState.update({
      where: { sourceId },
      data: { leaseUntil: null }
    });
  }

  async listPlaybookSources(playbookId: string): Promise<PlaybookSourceRecord[]> {
    const rows = await this.db.playbookSource.findMany({
      where: { playbookId, enabled: true },
      orderBy: { position: 'asc' },
      select: {
        playbookId: true,
        sourceId: true,
        source: { select: { id: true, type: true, value: true } }
      }
    });

    return rows.map((row) => ({
      playbookId: row.playbookId,
      sourceId: row.sourceId,
      source: mapSource(row.source)
    }));
  }

  async listUnconsumed(playbookId: string, sourceId: string, limit: number): Promise<SourceItemRecord[]> {
    const rows = await this.db.sourceItem.findMany({
      where: {
        sourceId,
        playbookSourceItems: {
          none: { playbookId }
        }
      },
      include: {
        source: {
          select: { type: true, value: true }
        }
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit
    });

    return rows.map((row) => mapSourceItem(row as never));
  }

  async markConsumed(playbookId: string, sourceItemIds: string[], consumedAt: Date): Promise<void> {
    if (sourceItemIds.length === 0) {
      return;
    }

    await this.db.$transaction(async (tx) => {
      for (const sourceItemId of sourceItemIds) {
        await tx.playbookSourceItem.upsert({
          where: { playbookId_sourceItemId: { playbookId, sourceItemId } },
          update: { consumedAt },
          create: { playbookId, sourceItemId, consumedAt }
        });
      }
    });
  }

  async getSourceItemByLink(sourceId: string, link: string): Promise<SourceItemRecord | null> {
    const row = await this.db.sourceItem.findUnique({
      where: { sourceId_link: { sourceId, link } },
      include: {
        source: {
          select: { type: true, value: true }
        }
      }
    });

    return row ? mapSourceItem(row as never) : null;
  }
}
