import type { PrismaClient } from '@prisma/client';
import type {
  CloneSourceResult,
  CreateSourceInput,
  MarketplaceSourceListItem,
  PublishSourceInput,
  ShareSourceInput,
  SourceLibraryMetadata,
  SourceRecord,
  SourceType,
  UpdateSourceInput
} from './types';

type SourceDb = Pick<PrismaClient, 'source' | 'accessGrant' | 'marketplacePublication'>;

type SourceRow = {
  id: string;
  ownerUserId: string;
  type: string;
  value: string;
  status: string;
  configJson: string;
  createdAt: Date;
  updatedAt: Date;
};

function parseJsonObject(json: string | null | undefined): Record<string, unknown> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore broken json
  }
  return {};
}

function normalizeMetadata(input?: SourceLibraryMetadata): SourceRecord['metadata'] {
  return {
    title: typeof input?.title === 'string' ? input.title : undefined,
    coverImageUrl: typeof input?.coverImageUrl === 'string' ? input.coverImageUrl : null,
    itemCount: typeof input?.itemCount === 'number' && Number.isFinite(input.itemCount) && input.itemCount >= 0
      ? Math.floor(input.itemCount)
      : undefined,
    previewItems: Array.isArray(input?.previewItems)
      ? input!.previewItems
          .filter((item) => item && typeof item.title === 'string')
          .map((item) => ({
            title: item.title,
            link: typeof item.link === 'string' ? item.link : undefined,
            pubDate: typeof item.pubDate === 'string' ? item.pubDate : null
          }))
      : []
  };
}

function splitConfigAndMetadata(configJson: string): { config: Record<string, unknown>; metadata: SourceRecord['metadata'] } {
  const parsed = parseJsonObject(configJson);
  const rawLibraryCard = parsed.libraryCard;
  const metadata =
    rawLibraryCard && typeof rawLibraryCard === 'object' && !Array.isArray(rawLibraryCard)
      ? normalizeMetadata(rawLibraryCard as SourceLibraryMetadata)
      : normalizeMetadata(undefined);
  return { config: parsed, metadata };
}

function withMetadata(config: Record<string, unknown>, metadata?: SourceLibraryMetadata): Record<string, unknown> {
  const normalized = normalizeMetadata(metadata);
  return { ...config, libraryCard: normalized };
}

function mapSource(row: SourceRow): SourceRecord {
  const parsed = splitConfigAndMetadata(row.configJson);
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    type: row.type as SourceType,
    value: row.value,
    status: row.status as SourceRecord['status'],
    config: parsed.config,
    metadata: parsed.metadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export interface SourceRepositoryLike {
  createSource(ownerUserId: string, input: CreateSourceInput): Promise<SourceRecord>;
  listSources(ownerUserId?: string): Promise<SourceRecord[]>;
  getSource(sourceId: string): Promise<SourceRecord | null>;
  updateSource(sourceId: string, patch: UpdateSourceInput): Promise<SourceRecord>;
  deleteSource(sourceId: string): Promise<void>;
  shareSource(sourceId: string, grantedByUserId: string, input: ShareSourceInput): Promise<void>;
  publishSource(sourceId: string, publisherUserId: string, input: PublishSourceInput): Promise<MarketplaceSourceListItem>;
  unpublishSource(sourceId: string): Promise<void>;
  listMarketplaceSources(): Promise<MarketplaceSourceListItem[]>;
  cloneFromMarketplace(publicationId: string, targetOwnerUserId: string): Promise<CloneSourceResult>;
}

export class SourceRepository implements SourceRepositoryLike {
  constructor(private readonly db: SourceDb) {}

  async createSource(ownerUserId: string, input: CreateSourceInput): Promise<SourceRecord> {
    const config = withMetadata(input.config ?? {}, input.metadata);
    const created = await this.db.source.create({
      data: {
        ownerUserId,
        type: input.type,
        value: input.value,
        status: input.status ?? 'active',
        configJson: JSON.stringify(config)
      }
    });
    return mapSource(created as SourceRow);
  }

  async listSources(ownerUserId?: string): Promise<SourceRecord[]> {
    const rows = await this.db.source.findMany({
      where: ownerUserId ? { ownerUserId } : {},
      orderBy: { createdAt: 'desc' }
    });
    return rows.map((row) => mapSource(row as SourceRow));
  }

  async getSource(sourceId: string): Promise<SourceRecord | null> {
    const row = await this.db.source.findUnique({ where: { id: sourceId } });
    return row ? mapSource(row as SourceRow) : null;
  }

  async updateSource(sourceId: string, patch: UpdateSourceInput): Promise<SourceRecord> {
    const existing = await this.db.source.findUnique({ where: { id: sourceId } });
    if (!existing) {
      throw new Error('not_found');
    }
    const existingParsed = splitConfigAndMetadata((existing as SourceRow).configJson);
    const configBase = patch.config ?? existingParsed.config;
    const nextConfig = patch.metadata ? withMetadata(configBase, patch.metadata) : withMetadata(configBase, existingParsed.metadata);

    const updated = await this.db.source.update({
      where: { id: sourceId },
      data: {
        ...(patch.value !== undefined ? { value: patch.value } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        configJson: JSON.stringify(nextConfig)
      }
    });
    return mapSource(updated as SourceRow);
  }

  async deleteSource(sourceId: string): Promise<void> {
    await this.db.source.delete({ where: { id: sourceId } });
  }

  async shareSource(sourceId: string, grantedByUserId: string, input: ShareSourceInput): Promise<void> {
    await this.db.accessGrant.create({
      data: {
        grantedByUserId,
        granteeUserId: input.granteeUserId,
        resourceType: 'source',
        resourceId: sourceId,
        permission: input.permission,
        sourceId,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null
      }
    });
  }

  async publishSource(sourceId: string, publisherUserId: string, input: PublishSourceInput): Promise<MarketplaceSourceListItem> {
    const source = await this.db.source.findUnique({ where: { id: sourceId } });
    if (!source) {
      throw new Error('not_found');
    }

    const existing = await this.db.marketplacePublication.findFirst({
      where: { resourceType: 'source', resourceId: sourceId, retiredAt: null }
    });

    const saved = existing
      ? await this.db.marketplacePublication.update({
          where: { id: existing.id },
          data: {
            publisherUserId,
            title: input.title,
            summary: input.summary ?? '',
            visibility: input.visibility ?? 'public',
            status: 'published',
            publishedAt: new Date(),
            retiredAt: null
          }
        })
      : await this.db.marketplacePublication.create({
          data: {
            publisherUserId,
            resourceType: 'source',
            resourceId: sourceId,
            sourceId,
            title: input.title,
            summary: input.summary ?? '',
            visibility: input.visibility ?? 'public',
            status: 'published',
            publishedAt: new Date()
          }
        });

    const mappedSource = mapSource(source as SourceRow);
    return {
      publicationId: saved.id,
      sourceId,
      publisherUserId: saved.publisherUserId,
      type: mappedSource.type,
      value: mappedSource.value,
      title: saved.title,
      summary: saved.summary,
      visibility: saved.visibility as MarketplaceSourceListItem['visibility'],
      publishedAt: saved.publishedAt ?? new Date(),
      metadata: mappedSource.metadata
    };
  }

  async unpublishSource(sourceId: string): Promise<void> {
    const publication = await this.db.marketplacePublication.findFirst({
      where: {
        resourceType: 'source',
        resourceId: sourceId,
        status: 'published',
        retiredAt: null
      }
    });
    if (!publication) {
      throw new Error('not_found');
    }
    await this.db.marketplacePublication.update({
      where: { id: publication.id },
      data: {
        status: 'draft',
        retiredAt: new Date()
      }
    });
  }

  async listMarketplaceSources(): Promise<MarketplaceSourceListItem[]> {
    const rows = await this.db.marketplacePublication.findMany({
      where: {
        resourceType: 'source',
        status: 'published',
        visibility: 'public',
        retiredAt: null
      },
      include: { source: true },
      orderBy: { publishedAt: 'desc' }
    });

    return rows
      .filter((row) => row.source && row.publishedAt)
      .map((row) => {
        const source = mapSource(row.source as unknown as SourceRow);
        return {
          publicationId: row.id,
          sourceId: row.resourceId,
          publisherUserId: row.publisherUserId,
          type: source.type,
          value: source.value,
          title: row.title,
          summary: row.summary,
          visibility: row.visibility as MarketplaceSourceListItem['visibility'],
          publishedAt: row.publishedAt as Date,
          metadata: source.metadata
        };
      });
  }

  async cloneFromMarketplace(publicationId: string, targetOwnerUserId: string): Promise<CloneSourceResult> {
    const publication = await this.db.marketplacePublication.findFirst({
      where: {
        id: publicationId,
        resourceType: 'source',
        status: 'published',
        visibility: 'public',
        retiredAt: null
      },
      include: { source: true }
    });
    if (!publication?.source) {
      throw new Error('not_found');
    }

    const existing = await this.db.source.findFirst({
      where: {
        ownerUserId: targetOwnerUserId,
        type: publication.source.type,
        value: publication.source.value
      }
    });
    if (existing) {
      return { source: mapSource(existing as SourceRow), cloned: false };
    }

    const created = await this.db.source.create({
      data: {
        ownerUserId: targetOwnerUserId,
        type: publication.source.type,
        value: publication.source.value,
        status: publication.source.status,
        configJson: publication.source.configJson
      }
    });
    return { source: mapSource(created as SourceRow), cloned: true };
  }
}
