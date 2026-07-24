import type { PrismaClient, Prisma } from '@prisma/client';
import type { CharacterType } from '../agents/types';
import { mapPlaybook } from '../playbook/repository';
import type { Playbook } from '../playbook/types';
import type { SourceType } from '../source/types';
import { rankAgentMatches, type RankableAgentCandidate, type RankableSource } from './agent-matcher';
import type { AgentMatch, CatalogAgent, CatalogDemo, CatalogResponse, CatalogSource, CatalogSourceMetadata } from './types';

type CatalogDb = Pick<
  PrismaClient,
  'marketplacePublication' | 'catalogDemo' | 'source' | 'agentPromptVersion' | 'userLibraryAgent' | 'playbook' | 'realtimeEvent' | '$transaction'
>;

type CatalogPublicationRow = Prisma.MarketplacePublicationGetPayload<{
  include: {
    source?: { include: { libraryMemberships: true } };
    agent?: true;
    agentVersion?: { include: { libraryMemberships: true } };
  };
}>;

type CatalogDemoRow = Prisma.CatalogDemoGetPayload<{
  include: {
    sourcePublication: { include: { source: true } };
    agentPublication: { include: { agent: true; agentVersion: true } };
  };
}>;

// Narrowed helper types for runtime-validated rows
type PublicationWithSource = Prisma.MarketplacePublicationGetPayload<{
  include: { source: { include: { libraryMemberships: true } } };
}>;

type PublicationWithAgent = Prisma.MarketplacePublicationGetPayload<{
  include: { agent: true; agentVersion: { include: { libraryMemberships: true } } };
}>;

type CatalogSourceAccessRow = Prisma.SourceGetPayload<{
  include: { libraryMemberships: true };
}>;

type CatalogAgentVersionRow = Prisma.AgentPromptVersionGetPayload<{
  include: {
    agent: true;
    libraryMemberships: true;
    catalogPublications: true;
    basedOnAgentVersion: { include: { catalogPublications: true } };
  };
}>;

type CatalogAgentPublicationMetadataRow = Prisma.MarketplacePublicationGetPayload<Record<string, never>>;

type PlaybookRow = Prisma.PlaybookGetPayload<{
  include: {
    sources: { orderBy: { position: 'asc' } };
    agent: { select: { runs: { orderBy: { createdAt: 'desc' }; take: 1; select: { createdAt: true } } } };
  };
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, errorCode: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(errorCode);
  }
  return value;
}

function requireNumber(value: unknown, errorCode: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(errorCode);
  }
  return value;
}

function parseStringArray(json: string, errorCode: string): string[] {
  try {
    const value: unknown = JSON.parse(json);
    if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
      throw new Error();
    }
    return [...value];
  } catch {
    throw new Error(errorCode);
  }
}

function parseSourceMetadata(configJson: string): CatalogSourceMetadata {
  try {
    const value: unknown = JSON.parse(configJson);
    if (!isRecord(value)) {
      throw new Error();
    }
    const libraryCard = value.libraryCard;
    if (libraryCard === undefined) {
      return { coverImageUrl: null, previewItems: [] };
    }
    if (!isRecord(libraryCard)) {
      throw new Error();
    }
    const previewItems = libraryCard.previewItems;
    if (previewItems !== undefined && (!Array.isArray(previewItems) || !previewItems.every((entry) => isRecord(entry) && typeof entry.title === 'string'))) {
      throw new Error();
    }
    return {
      ...(typeof libraryCard.title === 'string' ? { title: libraryCard.title } : {}),
      coverImageUrl: typeof libraryCard.coverImageUrl === 'string' ? libraryCard.coverImageUrl : null,
      ...(typeof libraryCard.itemCount === 'number' && Number.isFinite(libraryCard.itemCount) ? { itemCount: Math.floor(libraryCard.itemCount) } : {}),
      ...(typeof libraryCard.audioCount === 'number' && Number.isFinite(libraryCard.audioCount) ? { audioCount: Math.floor(libraryCard.audioCount) } : {}),
      previewItems: Array.isArray(previewItems)
        ? previewItems.map((entry) => ({
            title: entry.title as string,
            ...(typeof entry.link === 'string' ? { link: entry.link } : {}),
            ...(typeof entry.pubDate === 'string' || entry.pubDate === null ? { pubDate: entry.pubDate as string | null } : {}),
            ...(typeof entry.hasAudio === 'boolean' ? { hasAudio: entry.hasAudio } : {})
          }))
        : []
    };
  } catch {
    throw new Error('invalid_catalog_source_metadata');
  }
}

function parseDemoReport(reportJson: string): unknown {
  try {
    return JSON.parse(reportJson);
  } catch {
    throw new Error('invalid_catalog_demo_report');
  }
}

function normalizeLocale(locale: string): string {
  const trimmed = locale.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : 'en';
}

function localeCandidates(locale: string): string[] {
  return Array.from(new Set([normalizeLocale(locale), 'en']));
}

function validatePublicationSlug(row: { slug: unknown }): string {
  return requireString(row.slug, 'invalid_catalog_publication');
}

function validateCatalogVersion(row: { catalogVersion: unknown }): number {
  const catalogVersion = requireNumber(row.catalogVersion, 'invalid_catalog_publication');
  if (!Number.isInteger(catalogVersion) || catalogVersion < 1) {
    throw new Error('invalid_catalog_publication');
  }
  return catalogVersion;
}

function selectLocalizedPublications(rows: CatalogPublicationRow[], locale: string): CatalogPublicationRow[] {
  const requestedLocale = normalizeLocale(locale);
  const grouped = new Map<string, CatalogPublicationRow[]>();
  for (const row of rows) {
    const slug = validatePublicationSlug(row);
    if (!grouped.has(slug)) {
      grouped.set(slug, []);
    }
    grouped.get(slug)!.push(row);
  }

  return [...grouped.entries()]
    .map(([, group]) => {
      const versions = new Map<number, CatalogPublicationRow[]>();
      for (const row of group) {
        const catalogVersion = validateCatalogVersion(row);
        if (!versions.has(catalogVersion)) {
          versions.set(catalogVersion, []);
        }
        versions.get(catalogVersion)!.push(row);
      }
      const bestVersion = [...versions.keys()].sort((left, right) => right - left)[0];
      const versionRows = versions.get(bestVersion)!;
      return versionRows.find((row) => row.locale === requestedLocale) ?? versionRows.find((row) => row.locale === 'en') ?? versionRows[0];
    })
    .sort((left, right) => {
      const rankDiff = validatePublicationRank(left) - validatePublicationRank(right);
      if (rankDiff !== 0) return rankDiff;
      return validatePublicationSlug(left).localeCompare(validatePublicationSlug(right));
    });
}

function selectLocalizedDemos(rows: CatalogDemoRow[], locale: string): CatalogDemoRow[] {
  const requestedLocale = normalizeLocale(locale);
  const grouped = new Map<string, CatalogDemoRow[]>();
  for (const row of rows) {
    const slug = requireString(row.slug, 'invalid_catalog_demo');
    if (!grouped.has(slug)) {
      grouped.set(slug, []);
    }
    grouped.get(slug)!.push(row);
  }
  return [...grouped.values()].map((group) => group.find((row) => row.locale === requestedLocale) ?? group.find((row) => row.locale === 'en') ?? group[0]);
}

function validatePublicationRank(row: { editorialRank: unknown }): number {
  const editorialRank = requireNumber(row.editorialRank, 'invalid_catalog_publication');
  if (!Number.isInteger(editorialRank)) {
    throw new Error('invalid_catalog_publication');
  }
  return editorialRank;
}

function validateSourceRow(row: CatalogPublicationRow): asserts row is CatalogPublicationRow & { source: { id: string; type: string; value: string; configJson: string; libraryMemberships?: unknown[] } } {
  if (!row.source || typeof row.source.id !== 'string' || typeof row.source.type !== 'string' || typeof row.source.value !== 'string') {
    throw new Error('invalid_catalog_publication');
  }
}

function validateAgentRow(row: CatalogPublicationRow): asserts row is CatalogPublicationRow & { agent: { id: string; name: string; description: string; characterType: string }; agentVersion: { id: string; name: string; description: string; characterType: string; iconAssetKey?: string | null; libraryMemberships?: unknown[] } } {
  if (
    !row.agent ||
    !row.agentVersion ||
    typeof row.agent.id !== 'string' ||
    typeof row.agentVersion.id !== 'string' ||
    typeof row.agentVersion.name !== 'string' ||
    typeof row.agentVersion.description !== 'string' ||
    typeof row.agentVersion.characterType !== 'string'
  ) {
    throw new Error('invalid_catalog_publication');
  }
}

function mapCatalogSource(row: CatalogPublicationRow): CatalogSource {
  validateSourceRow(row);
  const publication = row;
  return {
    publicationId: requireString(publication.id, 'invalid_catalog_publication'),
    sourceId: requireString(publication.source.id, 'invalid_catalog_publication'),
    slug: validatePublicationSlug(publication),
    catalogVersion: validateCatalogVersion(publication),
    locale: requireString(publication.locale, 'invalid_catalog_publication'),
    title: requireString(publication.title, 'invalid_catalog_publication'),
    summary: typeof publication.summary === 'string' ? publication.summary : '',
    type: publication.source.type as SourceType,
    value: publication.source.value,
    saved: Array.isArray(publication.source.libraryMemberships) && publication.source.libraryMemberships.length > 0,
    sourceTypes: parseStringArray(requireString(publication.sourceTypesJson, 'invalid_catalog_publication'), 'invalid_catalog_publication'),
    topics: parseStringArray(requireString(publication.topicsJson, 'invalid_catalog_publication'), 'invalid_catalog_publication'),
    editorialRank: validatePublicationRank(publication),
    metadata: parseSourceMetadata(requireString(publication.source.configJson, 'invalid_catalog_source_metadata'))
  };
}

function mapCatalogAgent(row: CatalogPublicationRow): CatalogAgent {
  validateAgentRow(row);
  const publication = row;
  return {
    publicationId: requireString(publication.id, 'invalid_catalog_publication'),
    agentId: requireString(publication.agent.id, 'invalid_catalog_publication'),
    agentVersionId: requireString(publication.agentVersion.id, 'invalid_catalog_publication'),
    slug: validatePublicationSlug(publication),
    catalogVersion: validateCatalogVersion(publication),
    locale: requireString(publication.locale, 'invalid_catalog_publication'),
    title: requireString(publication.title, 'invalid_catalog_publication'),
    summary: typeof publication.summary === 'string' ? publication.summary : '',
    name: publication.agentVersion.name,
    description: publication.agentVersion.description,
    characterType: publication.agentVersion.characterType as CharacterType,
    saved: Array.isArray(publication.agentVersion.libraryMemberships) && publication.agentVersion.libraryMemberships.length > 0,
    sourceTypes: parseStringArray(requireString(publication.sourceTypesJson, 'invalid_catalog_publication'), 'invalid_catalog_publication'),
    topics: parseStringArray(requireString(publication.topicsJson, 'invalid_catalog_publication'), 'invalid_catalog_publication'),
    iconAssetKey:
      typeof publication.iconAssetKey === 'string'
        ? publication.iconAssetKey
        : typeof publication.agentVersion.iconAssetKey === 'string'
          ? publication.agentVersion.iconAssetKey
          : null,
    editorialRank: validatePublicationRank(publication)
  };
}

function sourceSlugFromDemo(row: CatalogDemoRow): string {
  return requireString(row.sourcePublication?.slug, 'invalid_catalog_demo');
}

function agentSlugFromDemo(row: CatalogDemoRow): string {
  return requireString(row.agentPublication?.slug, 'invalid_catalog_demo');
}

function mapCatalogDemo(
  row: CatalogDemoRow,
  selectedSourcePublications: Map<string, CatalogPublicationRow>,
  selectedAgentPublications: Map<string, CatalogPublicationRow>
): CatalogDemo {
  const sourceSlug = sourceSlugFromDemo(row);
  const agentSlug = agentSlugFromDemo(row);
  const sourcePublication = selectedSourcePublications.get(sourceSlug);
  const agentPublication = selectedAgentPublications.get(agentSlug);
  if (!sourcePublication || !agentPublication) {
    throw new Error('invalid_catalog_demo');
  }

  return {
    slug: requireString(row.slug, 'invalid_catalog_demo'),
    locale: requireString(row.locale, 'invalid_catalog_demo'),
    title: requireString(row.title, 'invalid_catalog_demo'),
    disclosure: requireString(row.disclosure, 'invalid_catalog_demo'),
    sourcePublicationId: requireString(sourcePublication.id, 'invalid_catalog_demo'),
    agentPublicationId: requireString(agentPublication.id, 'invalid_catalog_demo'),
    sourceSlug,
    agentSlug,
    report: parseDemoReport(requireString(row.reportJson, 'invalid_catalog_demo_report'))
  };
}

function normalizeLanguage(value: string | null | undefined): string {
  const trimmed = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (trimmed.length === 0) return 'en';
  return trimmed.split('-')[0] ?? trimmed;
}

function selectPublicationForLanguage<T extends { locale: string; catalogVersion: number; id: string }>(rows: T[], locale: string): T | null {
  const requested = normalizeLanguage(locale);
  return [...rows].sort((left, right) => {
    const leftLanguage = normalizeLanguage(left.locale);
    const rightLanguage = normalizeLanguage(right.locale);
    const leftRequested = leftLanguage === requested ? 1 : leftLanguage === 'en' ? 0 : -1;
    const rightRequested = rightLanguage === requested ? 1 : rightLanguage === 'en' ? 0 : -1;
    return rightRequested - leftRequested || right.catalogVersion - left.catalogVersion || left.id.localeCompare(right.id);
  })[0] ?? null;
}

function mapSourceToMatchInput(source: CatalogSourceAccessRow, publication: CatalogPublicationRow | null): RankableSource {
  const topics = publication ? parseStringArray(requireString(publication.topicsJson, 'invalid_catalog_publication'), 'invalid_catalog_publication') : [];
  return {
    type: source.type as SourceType,
    topics,
    language: publication?.locale ?? 'en'
  };
}

function publicationMetadataToCandidate(
  publication: CatalogAgentPublicationMetadataRow | null
): Pick<RankableAgentCandidate, 'publicationId' | 'sourceTypes' | 'topics' | 'language' | 'editorialRank'> & {
  purpose: string | null;
  iconAssetKey: string | null;
} {
  if (!publication) {
    return {
      publicationId: null,
      purpose: null,
      iconAssetKey: null,
      sourceTypes: [],
      topics: [],
      language: 'en',
      editorialRank: 0
    };
  }

  return {
    publicationId: requireString(publication.id, 'invalid_catalog_publication'),
    purpose: typeof publication.summary === 'string' && publication.summary.trim().length > 0 ? publication.summary : null,
    iconAssetKey: typeof publication.iconAssetKey === 'string' ? publication.iconAssetKey : null,
    sourceTypes: parseStringArray(requireString(publication.sourceTypesJson, 'invalid_catalog_publication'), 'invalid_catalog_publication'),
    topics: parseStringArray(requireString(publication.topicsJson, 'invalid_catalog_publication'), 'invalid_catalog_publication'),
    language: requireString(publication.locale, 'invalid_catalog_publication'),
    editorialRank: validatePublicationRank(publication)
  };
}

function mergeStringArrays(left: string[], right: string[]): string[] {
  return Array.from(new Set([...left, ...right]));
}

function mergeRankableAgentCandidates(existing: RankableAgentCandidate, incoming: RankableAgentCandidate): RankableAgentCandidate {
  return {
    publicationId: existing.publicationId ?? incoming.publicationId,
    agentVersionId: existing.agentVersionId,
    ownership: existing.ownership === 'owned' || incoming.ownership === 'owned' ? 'owned' : 'curated',
    name: existing.name,
    purpose: existing.purpose || incoming.purpose,
    characterType: existing.characterType ?? incoming.characterType,
    iconAssetKey: existing.iconAssetKey ?? incoming.iconAssetKey,
    sourceTypes: mergeStringArrays(existing.sourceTypes, incoming.sourceTypes),
    topics: mergeStringArrays(existing.topics, incoming.topics),
    language: normalizeLanguage(existing.language ?? incoming.language),
    editorialRank: Math.min(existing.editorialRank, incoming.editorialRank)
  };
}

function mapCuratedPublicationToMatchCandidate(row: CatalogPublicationRow): RankableAgentCandidate {
  validateAgentRow(row);
  const metadata = publicationMetadataToCandidate(row);
  return {
    publicationId: metadata.publicationId,
    agentVersionId: requireString(row.agentVersion.id, 'invalid_catalog_publication'),
    ownership: 'curated',
    name: row.agentVersion.name,
    purpose: metadata.purpose ?? row.agentVersion.description,
    characterType: row.agentVersion.characterType as CharacterType,
    iconAssetKey: metadata.iconAssetKey ?? (typeof row.agentVersion.iconAssetKey === 'string' ? row.agentVersion.iconAssetKey : null),
    sourceTypes: metadata.sourceTypes,
    topics: metadata.topics,
    language: metadata.language,
    editorialRank: metadata.editorialRank
  };
}

function mapVersionRowToMatchCandidate(row: CatalogAgentVersionRow, userId: string, sourceLanguage: string): RankableAgentCandidate {
  const activePublications = row.catalogPublications.filter((publication) => publication.status === 'published' && publication.retiredAt === null);
  const inheritedPublications = row.basedOnAgentVersion?.catalogPublications.filter((publication) => publication.status === 'published' && publication.retiredAt === null) ?? [];
  const selectedOwnPublication = selectPublicationForLanguage(activePublications, sourceLanguage);
  const selectedInheritedPublication = selectPublicationForLanguage(inheritedPublications, sourceLanguage);
  const metadata = publicationMetadataToCandidate(selectedOwnPublication ?? selectedInheritedPublication);
  const ownership = row.agent.ownerUserId === userId ? 'owned' : 'curated';
  const versionName = row.name.trim().length > 0 ? row.name : row.agent.name;
  const versionDescription = row.description.trim().length > 0 ? row.description : row.agent.description;

  return {
    publicationId: selectedOwnPublication ? metadata.publicationId : null,
    agentVersionId: requireString(row.id, 'invalid_catalog_publication'),
    ownership,
    name: requireString(versionName, 'invalid_catalog_publication'),
    purpose: metadata.purpose ?? versionDescription,
    characterType: typeof row.characterType === 'string' ? row.characterType as CharacterType : null,
    iconAssetKey: metadata.iconAssetKey ?? (typeof row.iconAssetKey === 'string' ? row.iconAssetKey : null),
    sourceTypes: metadata.sourceTypes,
    topics: metadata.topics,
    language: metadata.language,
    editorialRank: metadata.editorialRank
  };
}

export interface CatalogRepositoryLike {
  getCatalog(input: { userId: string; locale: string }): Promise<CatalogResponse>;
  getAgentMatches(input: { userId: string; sourceId: string }): Promise<AgentMatch[]>;
  useAgentForSource(input: { userId: string; sourceId: string; agentVersionId: string }): Promise<{ agentVersion: { id: string; agentId: string }; playbook: Playbook; created: boolean }>;
  updateSavedAgentVersion(input: {
    userId: string;
    fromAgentVersionId: string;
    toAgentVersionId: string;
    updateManualPlaybooks: boolean;
  }): Promise<{ fromAgentVersionId: string; toAgentVersionId: string; playbooksUpdated: number }>;
}

export class CatalogRepository implements CatalogRepositoryLike {
  constructor(private readonly db: CatalogDb) {}

  async useAgentForSource(input: {
    userId: string;
    sourceId: string;
    agentVersionId: string;
  }): Promise<{ agentVersion: { id: string; agentId: string }; playbook: Playbook; created: boolean }> {
    return this.db.$transaction(async (tx: any) => {
      const source = await tx.source.findFirst({
        where: {
          id: input.sourceId,
          status: 'active',
          OR: [{ ownerUserId: input.userId }, { libraryMemberships: { some: { userId: input.userId } } }]
        }
      });

      if (!source) {
        throw new Error('source_not_in_library');
      }

      const agentVersion = await tx.agentPromptVersion.findUnique({
        where: { id: input.agentVersionId },
        include: { agent: true }
      });
      if (!agentVersion || !agentVersion.agent) {
        throw new Error('not_found');
      }

      const isOwner = agentVersion.agent.ownerUserId === input.userId;
      if (!isOwner) {
        const publication = await tx.marketplacePublication.findFirst({
          where: {
            resourceType: 'agent',
            resourceId: agentVersion.agentId,
            status: 'published',
            visibility: 'public',
            retiredAt: null
          }
        });
        if (!publication) {
          throw new Error('not_found');
        }
      }

      await tx.userLibraryAgent.upsert({
        where: {
          userId_agentVersionId: {
            userId: input.userId,
            agentVersionId: input.agentVersionId
          }
        },
        create: {
          userId: input.userId,
          agentVersionId: input.agentVersionId,
          savedAt: new Date()
        },
        update: {
          savedAt: new Date()
        }
      });

      const existing = (await tx.playbook.findFirst({
        where: {
          agentId: agentVersion.agentId,
          agentVersionId: input.agentVersionId,
          mode: 'manual',
          nextRunAt: null,
          sources: {
            some: { sourceId: input.sourceId },
            every: { sourceId: input.sourceId }
          }
        },
        include: {
          sources: { orderBy: { position: 'asc' } },
          agent: { select: { runs: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } } } }
        }
      })) as PlaybookRow | null;

      const playbook =
        existing ??
        ((await tx.playbook.create({
          data: {
            agentId: agentVersion.agentId,
            agentVersionId: input.agentVersionId,
            name: agentVersion.name.trim().length > 0 ? agentVersion.name : agentVersion.agent.name,
            description: agentVersion.description.trim().length > 0 ? agentVersion.description : agentVersion.agent.description,
            enabled: true,
            recipientsJson: '[]',
            executionMode: 'latest_only',
            maxSourcesPerRun: 3,
            maxItemsPerSource: 1,
            language: 'en',
            mode: 'manual',
            intervalMinutes: null,
            dailyTime: null,
            timezone: null,
            daysOfWeekJson: null,
            nextRunAt: null,
            sources: {
              create: [
                {
                  sourceId: input.sourceId,
                  enabled: true,
                  position: 0
                }
              ]
            }
          },
          include: {
            sources: { orderBy: { position: 'asc' } },
            agent: { select: { runs: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } } } }
          }
        })) as PlaybookRow);

      await tx.realtimeEvent.create({
        data: {
          userId: input.userId,
          topic: 'playbook.changed',
          entityId: playbook.id,
          agentId: null
        }
      });

      return {
        agentVersion: { id: agentVersion.id, agentId: agentVersion.agentId },
        playbook: mapPlaybook(playbook),
        created: existing === null
      };
    });
  }

  async getAgentMatches(input: { userId: string; sourceId: string }): Promise<AgentMatch[]> {
    const source = await this.db.source.findFirst({
      where: {
        id: input.sourceId,
        status: 'active',
        OR: [{ ownerUserId: input.userId }, { libraryMemberships: { some: { userId: input.userId } } }]
      },
      include: {
        libraryMemberships: { where: { userId: input.userId } }
      }
    });

    if (!source) {
      throw new Error('source_not_in_library');
    }

    const canonicalSourceRows = (await this.db.marketplacePublication.findMany({
      where: {
        resourceType: 'source',
        status: 'published',
        visibility: 'public',
        origin: 'platform_curated',
        retiredAt: null,
        source: { is: { status: 'active', type: source.type, value: source.value } }
      },
      include: {
        source: {
          include: {
            libraryMemberships: { where: { userId: input.userId } }
          }
        }
      }
    })) as CatalogPublicationRow[];

    const canonicalSourcePublication = selectLocalizedPublications(canonicalSourceRows, 'en')[0] ?? null;
    const sourceMatchInput = mapSourceToMatchInput(source as CatalogSourceAccessRow, canonicalSourcePublication);
    const sourceLanguage = normalizeLanguage(sourceMatchInput.language);

    const [curatedAgentRows, accessibleVersionRows] = await Promise.all([
      this.db.marketplacePublication.findMany({
        where: {
          resourceType: 'agent',
          status: 'published',
          visibility: 'public',
          origin: 'platform_curated',
          retiredAt: null,
          agent: { is: { status: 'active' } },
          agentVersion: { is: { enabled: true } }
        },
        include: {
          agent: true,
          agentVersion: {
            include: {
              libraryMemberships: { where: { userId: input.userId } }
            }
          }
        }
      }),
      this.db.agentPromptVersion.findMany({
        where: {
          enabled: true,
          OR: [
            { agent: { is: { ownerUserId: input.userId, status: 'active' } } },
            { libraryMemberships: { some: { userId: input.userId } }, agent: { is: { status: 'active' } } }
          ]
        },
        include: {
          agent: true,
          libraryMemberships: { where: { userId: input.userId } },
          catalogPublications: true,
          basedOnAgentVersion: {
            include: {
              catalogPublications: true
            }
          }
        }
      })
    ]);

    const candidateMap = new Map<string, RankableAgentCandidate>();
    for (const row of accessibleVersionRows as CatalogAgentVersionRow[]) {
      const candidate = mapVersionRowToMatchCandidate(row, input.userId, sourceLanguage);
      candidateMap.set(candidate.agentVersionId, candidateMap.has(candidate.agentVersionId) ? mergeRankableAgentCandidates(candidateMap.get(candidate.agentVersionId)!, candidate) : candidate);
    }

    for (const row of selectLocalizedPublications(curatedAgentRows as CatalogPublicationRow[], sourceLanguage)) {
      const candidate = mapCuratedPublicationToMatchCandidate(row);
      candidateMap.set(candidate.agentVersionId, candidateMap.has(candidate.agentVersionId) ? mergeRankableAgentCandidates(candidateMap.get(candidate.agentVersionId)!, candidate) : candidate);
    }

    const ranked = rankAgentMatches({
      source: sourceMatchInput,
      agents: [...candidateMap.values()]
    });
    if (ranked.length === 0) {
      return ranked;
    }

    const versions = await this.db.agentPromptVersion.findMany({
      where: { id: { in: ranked.map((match) => match.agentVersionId) } },
      select: { id: true, agentId: true, version: true }
    });
    const versionById = new Map(versions.map((version) => [version.id, version] as const));
    const agentIds = [...new Set(versions.map((version) => version.agentId))];
    const publicationVersions = await this.db.marketplacePublication.findMany({
      where: {
        resourceType: 'agent',
        status: 'published',
        visibility: 'public',
        retiredAt: null,
        agentId: { in: agentIds },
        agentVersion: { is: { enabled: true } }
      },
      include: { agentVersion: true }
    });
    const latestByAgentId = new Map<string, { id: string; version: number }>();
    for (const publication of publicationVersions) {
      const version = publication.agentVersion;
      if (!version) continue;
      const current = latestByAgentId.get(version.agentId);
      if (!current || version.version > current.version) {
        latestByAgentId.set(version.agentId, { id: version.id, version: version.version });
      }
    }

    return ranked.map((match) => {
      const current = versionById.get(match.agentVersionId);
      const latest = current ? latestByAgentId.get(current.agentId) : undefined;
      const latestAgentVersionId = latest?.id ?? null;
      return {
        ...match,
        latestAgentVersionId,
        updateAvailable: latestAgentVersionId !== null && latestAgentVersionId !== match.agentVersionId
      };
    });
  }

  async updateSavedAgentVersion(input: {
    userId: string;
    fromAgentVersionId: string;
    toAgentVersionId: string;
    updateManualPlaybooks: boolean;
  }): Promise<{ fromAgentVersionId: string; toAgentVersionId: string; playbooksUpdated: number }> {
    return this.db.$transaction(async (tx: any) => {
      const [fromVersion, toVersion] = await Promise.all([
        tx.agentPromptVersion.findUnique({ where: { id: input.fromAgentVersionId } }),
        tx.agentPromptVersion.findUnique({ where: { id: input.toAgentVersionId } })
      ]);
      if (!fromVersion || !toVersion || fromVersion.agentId !== toVersion.agentId) {
        throw new Error('invalid_update_target');
      }

      const latestPublication = await tx.marketplacePublication.findFirst({
        where: {
          resourceType: 'agent',
          status: 'published',
          visibility: 'public',
          retiredAt: null,
          agentId: toVersion.agentId,
          agentVersion: { is: { enabled: true } }
        },
        include: { agentVersion: true },
        orderBy: [{ version: 'desc' }, { publishedAt: 'desc' }]
      });
      if (!latestPublication?.agentVersion || latestPublication.agentVersion.id !== toVersion.id) {
        throw new Error('invalid_update_target');
      }

      await tx.userLibraryAgent.upsert({
        where: {
          userId_agentVersionId: {
            userId: input.userId,
            agentVersionId: input.toAgentVersionId
          }
        },
        create: {
          userId: input.userId,
          agentVersionId: input.toAgentVersionId,
          savedAt: new Date()
        },
        update: {
          savedAt: new Date()
        }
      });
      await tx.userLibraryAgent.deleteMany({
        where: { userId: input.userId, agentVersionId: input.fromAgentVersionId }
      });

      let playbooksUpdated = 0;
      if (input.updateManualPlaybooks) {
        const updated = await tx.playbook.updateMany({
          where: { agentVersionId: input.fromAgentVersionId, mode: 'manual', nextRunAt: null },
          data: { agentVersionId: input.toAgentVersionId, agentId: toVersion.agentId, name: toVersion.name }
        });
        playbooksUpdated = updated.count;
      }

      return {
        fromAgentVersionId: input.fromAgentVersionId,
        toAgentVersionId: input.toAgentVersionId,
        playbooksUpdated
      };
    });
  }

  async getCatalog(input: { userId: string; locale: string }): Promise<CatalogResponse> {
    const locale = normalizeLocale(input.locale);
    const locales = localeCandidates(locale);

    const [sourceRows, agentRows] = await Promise.all([
      this.db.marketplacePublication.findMany({
        where: {
          resourceType: 'source',
          status: 'published',
          visibility: 'public',
          origin: 'platform_curated',
          retiredAt: null,
          locale: { in: locales },
          source: { is: { status: 'active' } }
        },
        include: {
          source: {
            include: {
              libraryMemberships: { where: { userId: input.userId } }
            }
          }
        }
      }),
      this.db.marketplacePublication.findMany({
        where: {
          resourceType: 'agent',
          status: 'published',
          visibility: 'public',
          origin: 'platform_curated',
          retiredAt: null,
          locale: { in: locales },
          agent: { is: { status: 'active' } },
          agentVersion: { is: { enabled: true } }
        },
        include: {
          agent: true,
          agentVersion: {
            include: {
              libraryMemberships: { where: { userId: input.userId } }
            }
          }
        }
      })
    ]);

    const selectedSourceRows = selectLocalizedPublications(sourceRows as CatalogPublicationRow[], locale);
    const selectedAgentRows = selectLocalizedPublications(agentRows as CatalogPublicationRow[], locale);
    const selectedSourcePublications = new Map(selectedSourceRows.map((row) => [validatePublicationSlug(row), row] as const));
    const selectedAgentPublications = new Map(selectedAgentRows.map((row) => [validatePublicationSlug(row), row] as const));

    const demoRows = await this.db.catalogDemo.findMany({
      where: {
        status: 'active',
        locale: { in: locales },
        sourcePublication: {
          is: {
            status: 'published',
            visibility: 'public',
            origin: 'platform_curated',
            retiredAt: null,
            source: { is: { status: 'active' } }
          }
        },
        agentPublication: {
          is: {
            status: 'published',
            visibility: 'public',
            origin: 'platform_curated',
            retiredAt: null,
            agent: { is: { status: 'active' } },
            agentVersion: { is: { enabled: true } }
          }
        }
      },
      include: {
        sourcePublication: {
          include: {
            source: true
          }
        },
        agentPublication: {
          include: {
            agent: true,
            agentVersion: true
          }
        }
      }
    });

    const demos = selectLocalizedDemos(demoRows as CatalogDemoRow[], locale)
      .filter((row) => selectedSourcePublications.has(sourceSlugFromDemo(row)) && selectedAgentPublications.has(agentSlugFromDemo(row)))
      .sort((left, right) => {
        const leftSource = selectedSourcePublications.get(sourceSlugFromDemo(left))!;
        const rightSource = selectedSourcePublications.get(sourceSlugFromDemo(right))!;
        const sourceRankDiff = validatePublicationRank(leftSource) - validatePublicationRank(rightSource);
        if (sourceRankDiff !== 0) return sourceRankDiff;
        const leftAgent = selectedAgentPublications.get(agentSlugFromDemo(left))!;
        const rightAgent = selectedAgentPublications.get(agentSlugFromDemo(right))!;
        const agentRankDiff = validatePublicationRank(leftAgent) - validatePublicationRank(rightAgent);
        if (agentRankDiff !== 0) return agentRankDiff;
        return requireString(left.slug, 'invalid_catalog_demo').localeCompare(requireString(right.slug, 'invalid_catalog_demo'));
      })
      .map((row) => mapCatalogDemo(row, selectedSourcePublications, selectedAgentPublications));

    return {
      sources: selectedSourceRows.map(mapCatalogSource),
      agents: selectedAgentRows.map(mapCatalogAgent),
      demos
    };
  }
}
