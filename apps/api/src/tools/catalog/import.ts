import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import {
  DEFAULT_CATALOG_BUNDLE_PATH,
  PLATFORM_CATALOG_OWNER_USER_ID,
  loadCatalogBundle,
  stableStringify,
  validateCatalog,
  type CatalogAgentBundleEntry,
  type CatalogBundle,
  type CatalogDemoBundleEntry,
  type CatalogSourceBundleEntry
} from './validate';

export interface CatalogImportChange {
  entityType: string;
  stableKey: string;
  action?: 'create' | 'update' | 'version' | 'retire';
  details?: unknown;
}

export interface CatalogImportPlan {
  creates: CatalogImportChange[];
  updates: CatalogImportChange[];
  versions: CatalogImportChange[];
  retirements: CatalogImportChange[];
}

type CatalogDb = {
  source: {
    findMany(args?: unknown): Promise<Array<Record<string, unknown>>>;
    create(args: { data: object }): Promise<Record<string, unknown>>;
    update(args: { where: { id: string }; data: object }): Promise<Record<string, unknown>>;
  };
  agent: {
    findMany(args?: unknown): Promise<Array<Record<string, unknown>>>;
    create(args: { data: object }): Promise<Record<string, unknown>>;
    update(args: { where: { id: string }; data: object }): Promise<Record<string, unknown>>;
  };
  agentPromptVersion: {
    findMany(args?: unknown): Promise<Array<Record<string, unknown>>>;
    create(args: { data: object }): Promise<Record<string, unknown>>;
  };
  marketplacePublication: {
    findMany(args?: unknown): Promise<Array<Record<string, unknown>>>;
    create(args: { data: object }): Promise<Record<string, unknown>>;
    update(args: { where: { id: string }; data: object }): Promise<Record<string, unknown>>;
  };
  catalogDemo: {
    findMany(args?: unknown): Promise<Array<Record<string, unknown>>>;
    create(args: { data: object }): Promise<Record<string, unknown>>;
    update(args: { where: { id: string }; data: object }): Promise<Record<string, unknown>>;
  };
  $transaction<T>(callback: (tx: CatalogDb) => Promise<T>): Promise<T>;
};

interface PublicationKeyParts {
  resourceType: 'source' | 'agent';
  slug: string;
  locale: string;
  catalogVersion: number;
}

interface ExistingCatalogState {
  sources: Array<Record<string, unknown>>;
  agents: Array<Record<string, unknown>>;
  agentVersions: Array<Record<string, unknown>>;
  publications: Array<Record<string, unknown>>;
  demos: Array<Record<string, unknown>>;
}

interface DesiredSourcePublication {
  publisherUserId: string;
  resourceType: 'source';
  resourceId: string;
  title: string;
  summary: string;
  visibility: string;
  status: string;
  slug: string;
  catalogVersion: number;
  origin: string;
  locale: string;
  sourceTypesJson: string;
  topicsJson: string;
  editorialRank: number;
  sourceId: string;
}

interface DesiredAgentPublication {
  publisherUserId: string;
  resourceType: 'agent';
  resourceId: string;
  title: string;
  summary: string;
  visibility: string;
  status: string;
  slug: string;
  catalogVersion: number;
  origin: string;
  locale: string;
  sourceTypesJson: string;
  topicsJson: string;
  editorialRank: number;
  agentId: string;
  agentVersionId: string;
  iconAssetKey: string;
}

interface DesiredDemoData {
  slug: string;
  locale: string;
  title: string;
  disclosure: string;
  sourcePublicationId: string;
  agentPublicationId: string;
  reportJson: string;
  status: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sourcePublicationStableKey(slug: string, locale: string, catalogVersion: number): string {
  return `source-publication:${slug}:${locale}:v${catalogVersion}`;
}

function agentPublicationStableKey(slug: string, locale: string, catalogVersion: number): string {
  return `agent-publication:${slug}:${locale}:v${catalogVersion}`;
}

function agentVersionStableKey(slug: string): string {
  return `agent-version:${slug}`;
}

function catalogDemoStableKey(slug: string, locale: string): string {
  return `catalog-demo:${slug}:${locale}`;
}

function publicationStableKey(parts: PublicationKeyParts): string {
  return parts.resourceType === 'source'
    ? sourcePublicationStableKey(parts.slug, parts.locale, parts.catalogVersion)
    : agentPublicationStableKey(parts.slug, parts.locale, parts.catalogVersion);
}

function publicationMapKey(parts: PublicationKeyParts): string {
  return `${parts.resourceType}|${parts.slug}|${parts.locale}|${parts.catalogVersion}`;
}

function demoMapKey(slug: string, locale: string): string {
  return `${slug}|${locale}`;
}

function localeEntryKey(slug: string, locale: string): string {
  return `${slug}|${locale}`;
}

function parseJson(value: unknown, fallback: unknown): unknown {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
  const parsed = parseJson(value, {});
  return isRecord(parsed) ? parsed : {};
}

function normalizeJsonText(value: unknown, fallback: unknown): string {
  return stableStringify(parseJson(value, fallback));
}

function normalizeStringArray(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))).sort((left, right) =>
    left.localeCompare(right)
  );
}

function buildSourceConfigJson(existingConfigJson: unknown, entry: CatalogSourceBundleEntry): string {
  const nextConfig = {
    ...parseJsonRecord(existingConfigJson),
    libraryCard: entry.metadata
  };
  return JSON.stringify(nextConfig);
}

function buildAgentPreferencesJson(existingPreferencesJson: unknown, slug: string): string {
  const existingPreferences = parseJsonRecord(existingPreferencesJson);
  const existingCatalog = parseJsonRecord(existingPreferences.catalog);
  return JSON.stringify({
    ...existingPreferences,
    catalog: {
      ...existingCatalog,
      slug
    }
  });
}

function buildPromptSnapshotSignature(entry: CatalogAgentBundleEntry): string {
  return stableStringify({
    name: entry.promptSnapshot.name,
    description: entry.promptSnapshot.description,
    characterType: entry.promptSnapshot.characterType,
    promptConfig: entry.promptSnapshot.promptConfig,
    model: entry.promptSnapshot.model,
    systemPrompt: entry.promptSnapshot.systemPrompt,
    iconAssetKey: entry.iconAssetKey
  });
}

function buildPromptVersionSignature(row: Record<string, unknown>): string {
  return stableStringify({
    name: String(row.name ?? ''),
    description: String(row.description ?? ''),
    characterType: String(row.characterType ?? ''),
    promptConfig: parseJson(row.promptConfigJson, {}),
    model: String(row.model ?? ''),
    systemPrompt: String(row.systemPrompt ?? ''),
    iconAssetKey: row.iconAssetKey === null || row.iconAssetKey === undefined ? null : String(row.iconAssetKey)
  });
}

function toPublicationMap(
  publications: readonly Record<string, unknown>[]
): Map<string, Record<string, unknown>> {
  return new Map(
    publications
      .filter(
        (publication) =>
          publication.origin === 'platform_curated' &&
          (publication.resourceType === 'source' || publication.resourceType === 'agent')
      )
      .map((publication) => {
        const resourceType = publication.resourceType === 'source' ? 'source' : 'agent';
        const slug = String(publication.slug ?? '');
        const locale = String(publication.locale ?? '');
        const catalogVersion = Number(publication.catalogVersion ?? 0);
        return [publicationMapKey({ resourceType, slug, locale, catalogVersion }), publication] as const;
      })
  );
}

function buildAgentLookup(
  agents: readonly Record<string, unknown>[],
  publications: readonly Record<string, unknown>[]
): Map<string, Record<string, unknown>> {
  const agentById = new Map(agents.map((agent) => [String(agent.id), agent] as const));
  const agentLookup = new Map<string, Record<string, unknown>>();

  for (const publication of publications) {
    if (publication.origin !== 'platform_curated' || publication.resourceType !== 'agent') {
      continue;
    }

    const slug = typeof publication.slug === 'string' ? publication.slug : null;
    const agentId = typeof publication.agentId === 'string' ? publication.agentId : typeof publication.resourceId === 'string' ? publication.resourceId : null;
    if (!slug || !agentId) {
      continue;
    }

    const agent = agentById.get(agentId);
    if (agent) {
      agentLookup.set(slug, agent);
    }
  }

  for (const agent of agents) {
    const slug = parseJsonRecord(agent.preferencesJson).catalog;
    if (!isRecord(slug) || typeof slug.slug !== 'string') {
      continue;
    }
    agentLookup.set(slug.slug, agent);
  }

  return agentLookup;
}

function selectCanonicalAgentEntry(entries: readonly CatalogAgentBundleEntry[]): CatalogAgentBundleEntry {
  return (
    entries.find((entry) => entry.locale === 'en') ??
    [...entries].sort((left, right) => left.locale.localeCompare(right.locale))[0]
  );
}

function sourcePublicationFieldsMatch(existing: Record<string, unknown>, desired: DesiredSourcePublication): boolean {
  return (
    existing.publisherUserId === desired.publisherUserId &&
    existing.resourceId === desired.resourceId &&
    existing.title === desired.title &&
    existing.summary === desired.summary &&
    existing.visibility === desired.visibility &&
    existing.status === desired.status &&
    existing.slug === desired.slug &&
    Number(existing.catalogVersion) === desired.catalogVersion &&
    existing.origin === desired.origin &&
    existing.locale === desired.locale &&
    normalizeJsonText(existing.sourceTypesJson, []) === desired.sourceTypesJson &&
    normalizeJsonText(existing.topicsJson, []) === desired.topicsJson &&
    Number(existing.editorialRank ?? 0) === desired.editorialRank &&
    existing.sourceId === desired.sourceId &&
    existing.retiredAt === null
  );
}

function agentPublicationFieldsMatch(existing: Record<string, unknown>, desired: DesiredAgentPublication): boolean {
  return (
    existing.publisherUserId === desired.publisherUserId &&
    existing.resourceId === desired.resourceId &&
    existing.title === desired.title &&
    existing.summary === desired.summary &&
    existing.visibility === desired.visibility &&
    existing.status === desired.status &&
    existing.slug === desired.slug &&
    Number(existing.catalogVersion) === desired.catalogVersion &&
    existing.origin === desired.origin &&
    existing.locale === desired.locale &&
    normalizeJsonText(existing.sourceTypesJson, []) === desired.sourceTypesJson &&
    normalizeJsonText(existing.topicsJson, []) === desired.topicsJson &&
    Number(existing.editorialRank ?? 0) === desired.editorialRank &&
    existing.agentId === desired.agentId &&
    existing.resourceId === desired.resourceId &&
    existing.agentVersionId === desired.agentVersionId &&
    existing.iconAssetKey === desired.iconAssetKey &&
    existing.retiredAt === null
  );
}

function demoFieldsMatch(existing: Record<string, unknown>, desired: DesiredDemoData): boolean {
  return (
    existing.slug === desired.slug &&
    existing.locale === desired.locale &&
    existing.title === desired.title &&
    existing.disclosure === desired.disclosure &&
    existing.sourcePublicationId === desired.sourcePublicationId &&
    existing.agentPublicationId === desired.agentPublicationId &&
    normalizeJsonText(existing.reportJson, null) === stableStringify(parseJson(desired.reportJson, null)) &&
    existing.status === desired.status
  );
}

function sortChanges(changes: CatalogImportChange[]): CatalogImportChange[] {
  return [...changes].sort((left, right) => {
    const entityTypeDiff = left.entityType.localeCompare(right.entityType);
    if (entityTypeDiff !== 0) {
      return entityTypeDiff;
    }
    return left.stableKey.localeCompare(right.stableKey);
  });
}

function normalizePlan(plan: CatalogImportPlan): CatalogImportPlan {
  return {
    creates: sortChanges(plan.creates),
    updates: sortChanges(plan.updates),
    versions: sortChanges(plan.versions),
    retirements: sortChanges(plan.retirements)
  };
}

async function readExistingCatalogState(db: CatalogDb): Promise<ExistingCatalogState> {
  const [sources, agents, agentVersions, publications, demos] = await Promise.all([
    db.source.findMany(),
    db.agent.findMany(),
    db.agentPromptVersion.findMany(),
    db.marketplacePublication.findMany(),
    db.catalogDemo.findMany()
  ]);

  return { sources, agents, agentVersions, publications, demos };
}

function buildSourcePublicationData(sourceId: string, entry: CatalogSourceBundleEntry): DesiredSourcePublication {
  return {
    publisherUserId: PLATFORM_CATALOG_OWNER_USER_ID,
    resourceType: 'source',
    resourceId: sourceId,
    sourceId,
    title: entry.title,
    summary: entry.summary,
    visibility: 'public',
    status: 'published',
    slug: entry.slug,
    catalogVersion: entry.catalogVersion,
    origin: 'platform_curated',
    locale: entry.locale,
    sourceTypesJson: JSON.stringify(normalizeStringArray(entry.sourceTypes)),
    topicsJson: JSON.stringify(normalizeStringArray(entry.topics)),
    editorialRank: entry.editorialRank
  };
}

function buildAgentPublicationData(
  agentId: string,
  agentVersionId: string,
  entry: CatalogAgentBundleEntry
): DesiredAgentPublication {
  return {
    publisherUserId: PLATFORM_CATALOG_OWNER_USER_ID,
    resourceType: 'agent',
    resourceId: agentId,
    agentId,
    agentVersionId,
    title: entry.title,
    summary: entry.summary,
    visibility: 'public',
    status: 'published',
    slug: entry.slug,
    catalogVersion: entry.catalogVersion,
    origin: 'platform_curated',
    locale: entry.locale,
    sourceTypesJson: JSON.stringify(normalizeStringArray(entry.sourceTypes)),
    topicsJson: JSON.stringify(normalizeStringArray(entry.topics)),
    editorialRank: entry.editorialRank,
    iconAssetKey: entry.iconAssetKey
  };
}

function buildDemoData(
  sourcePublicationId: string,
  agentPublicationId: string,
  entry: CatalogDemoBundleEntry
): DesiredDemoData {
  return {
    slug: entry.slug,
    locale: entry.locale,
    title: entry.title,
    disclosure: entry.disclosure,
    sourcePublicationId,
    agentPublicationId,
    reportJson: JSON.stringify(entry.report),
    status: 'active'
  };
}

export async function planCatalogImport(db: CatalogDb, bundle: CatalogBundle): Promise<CatalogImportPlan> {
  const errors = validateCatalog(bundle);
  if (errors.length > 0) {
    throw new Error(`invalid_catalog_bundle: ${errors.map((entry) => `${entry.code}@${entry.path}`).join(',')}`);
  }

  const plan: CatalogImportPlan = { creates: [], updates: [], versions: [], retirements: [] };
  const existing = await readExistingCatalogState(db);
  const publicationLookup = toPublicationMap(existing.publications);
  const agentLookup = buildAgentLookup(existing.agents, existing.publications);
  const bundleSourceLookup = new Map(bundle.sources.map((entry) => [localeEntryKey(entry.slug, entry.locale), entry] as const));
  const bundleAgentLookup = new Map(bundle.agents.map((entry) => [localeEntryKey(entry.slug, entry.locale), entry] as const));
  const desiredPublicationKeys = new Set<string>();
  const desiredDemoKeys = new Set<string>();

  const sourceLookup = new Map<string, Record<string, unknown>>(
    existing.sources
      .filter((row) => row.ownerUserId === PLATFORM_CATALOG_OWNER_USER_ID)
      .map((row) => [`${row.ownerUserId}|${row.type}|${row.value}`, row] as const)
  );

  for (const entry of bundle.sources) {
    const sourceKey = `${PLATFORM_CATALOG_OWNER_USER_ID}|${entry.type}|${entry.value}`;
    const existingSource = sourceLookup.get(sourceKey);
    const publicationKeyParts: PublicationKeyParts = {
      resourceType: 'source',
      slug: entry.slug,
      locale: entry.locale,
      catalogVersion: entry.catalogVersion
    };
    const key = publicationMapKey(publicationKeyParts);
    desiredPublicationKeys.add(key);

    const existingPublication = publicationLookup.get(key);
    if (!existingPublication) {
      plan.creates.push({
        entityType: 'sourcePublication',
        stableKey: publicationStableKey(publicationKeyParts),
        action: 'create',
        details: entry
      });
      continue;
    }

    if (!existingSource) {
      plan.updates.push({
        entityType: 'sourcePublication',
        stableKey: publicationStableKey(publicationKeyParts),
        action: 'update',
        details: { reason: 'missing_source_resource' }
      });
      continue;
    }

    const desired = buildSourcePublicationData(String(existingSource.id), entry);
    if (!sourcePublicationFieldsMatch(existingPublication, desired)) {
      plan.updates.push({
        entityType: 'sourcePublication',
        stableKey: publicationStableKey(publicationKeyParts),
        action: 'update',
        details: entry
      });
    }
  }

  const agentGroups = new Map<string, CatalogAgentBundleEntry[]>();
  for (const entry of bundle.agents) {
    if (!agentGroups.has(entry.slug)) {
      agentGroups.set(entry.slug, []);
    }
    agentGroups.get(entry.slug)!.push(entry);
  }

  for (const [slug, entries] of agentGroups.entries()) {
    const canonicalEntry = selectCanonicalAgentEntry(entries);
    const existingAgent = agentLookup.get(slug);
    const existingAgentVersions = existingAgent
      ? existing.agentVersions
          .filter((row) => row.agentId === existingAgent.id)
          .sort((left, right) => Number(right.version ?? 0) - Number(left.version ?? 0))
      : [];
    const desiredSignature = buildPromptSnapshotSignature(canonicalEntry);
    const matchingVersion = existingAgentVersions.find((row) => buildPromptVersionSignature(row) === desiredSignature);

    if (!matchingVersion) {
      plan.versions.push({
        entityType: 'agentVersion',
        stableKey: agentVersionStableKey(slug),
        action: 'version',
        details: { slug }
      });
    }

    for (const entry of entries) {
      const publicationKeyParts: PublicationKeyParts = {
        resourceType: 'agent',
        slug: entry.slug,
        locale: entry.locale,
        catalogVersion: entry.catalogVersion
      };
      const key = publicationMapKey(publicationKeyParts);
      desiredPublicationKeys.add(key);

      const existingPublication = publicationLookup.get(key);
      if (!existingPublication) {
        plan.creates.push({
          entityType: 'agentPublication',
          stableKey: publicationStableKey(publicationKeyParts),
          action: 'create',
          details: entry
        });
        continue;
      }

      if (!existingAgent || !matchingVersion) {
        plan.updates.push({
          entityType: 'agentPublication',
          stableKey: publicationStableKey(publicationKeyParts),
          action: 'update',
          details: { reason: existingAgent ? 'missing_agent_version' : 'missing_agent_resource' }
        });
        continue;
      }

      const desired = buildAgentPublicationData(String(existingAgent.id), String(matchingVersion.id), entry);
      if (!agentPublicationFieldsMatch(existingPublication, desired)) {
        plan.updates.push({
          entityType: 'agentPublication',
          stableKey: publicationStableKey(publicationKeyParts),
          action: 'update',
          details: entry
        });
      }
    }
  }

  const publicationLookupAfterApply = new Map<string, string>();
  for (const entry of bundle.sources) {
    const publication = publicationLookup.get(
      publicationMapKey({
        resourceType: 'source',
        slug: entry.slug,
        locale: entry.locale,
        catalogVersion: entry.catalogVersion
      })
    );
    if (publication?.id) {
      publicationLookupAfterApply.set(localeEntryKey(entry.slug, entry.locale), String(publication.id));
    }
  }
  for (const entry of bundle.agents) {
    const publication = publicationLookup.get(
      publicationMapKey({
        resourceType: 'agent',
        slug: entry.slug,
        locale: entry.locale,
        catalogVersion: entry.catalogVersion
      })
    );
    if (publication?.id) {
      publicationLookupAfterApply.set(localeEntryKey(entry.slug, entry.locale), String(publication.id));
    }
  }

  for (const entry of bundle.demos) {
    const sourceEntry = bundleSourceLookup.get(localeEntryKey(entry.sourceSlug, entry.locale));
    const agentEntry = bundleAgentLookup.get(localeEntryKey(entry.agentSlug, entry.locale));
    if (!sourceEntry || !agentEntry) {
      continue;
    }

    const sourcePublicationId = publicationLookupAfterApply.get(localeEntryKey(entry.sourceSlug, entry.locale));
    const agentPublicationId = publicationLookupAfterApply.get(localeEntryKey(entry.agentSlug, entry.locale));
    const demoKey = demoMapKey(entry.slug, entry.locale);
    desiredDemoKeys.add(demoKey);

    const existingDemo = existing.demos.find((row) => row.slug === entry.slug && row.locale === entry.locale);
    if (!existingDemo) {
      plan.creates.push({
        entityType: 'catalogDemo',
        stableKey: catalogDemoStableKey(entry.slug, entry.locale),
        action: 'create',
        details: entry
      });
      continue;
    }

    if (!sourcePublicationId || !agentPublicationId) {
      plan.updates.push({
        entityType: 'catalogDemo',
        stableKey: catalogDemoStableKey(entry.slug, entry.locale),
        action: 'update',
        details: { reason: 'missing_publication_dependency' }
      });
      continue;
    }

    const desired = buildDemoData(sourcePublicationId, agentPublicationId, entry);
    if (!demoFieldsMatch(existingDemo, desired)) {
      plan.updates.push({
        entityType: 'catalogDemo',
        stableKey: catalogDemoStableKey(entry.slug, entry.locale),
        action: 'update',
        details: entry
      });
    }
  }

  for (const publication of existing.publications) {
    if (publication.origin !== 'platform_curated' || publication.retiredAt !== null) {
      continue;
    }

    const resourceType = publication.resourceType === 'source' ? 'source' : publication.resourceType === 'agent' ? 'agent' : null;
    if (!resourceType || typeof publication.slug !== 'string' || typeof publication.locale !== 'string') {
      continue;
    }

    const catalogVersion = Number(publication.catalogVersion ?? 0);
    const key = publicationMapKey({
      resourceType,
      slug: publication.slug,
      locale: publication.locale,
      catalogVersion
    });

    if (!desiredPublicationKeys.has(key)) {
      plan.retirements.push({
        entityType: resourceType === 'source' ? 'sourcePublication' : 'agentPublication',
        stableKey: publicationStableKey({
          resourceType,
          slug: publication.slug,
          locale: publication.locale,
          catalogVersion
        }),
        action: 'retire',
        details: { id: publication.id }
      });
    }
  }

  for (const demo of existing.demos) {
    if (demo.status !== 'active' || typeof demo.slug !== 'string' || typeof demo.locale !== 'string') {
      continue;
    }

    if (!desiredDemoKeys.has(demoMapKey(demo.slug, demo.locale))) {
      plan.retirements.push({
        entityType: 'catalogDemo',
        stableKey: catalogDemoStableKey(demo.slug, demo.locale),
        action: 'retire',
        details: { id: demo.id }
      });
    }
  }

  return normalizePlan(plan);
}

export async function applyCatalogImport(db: CatalogDb, bundle: CatalogBundle): Promise<CatalogImportPlan> {
  const errors = validateCatalog(bundle);
  if (errors.length > 0) {
    throw new Error(`invalid_catalog_bundle: ${errors.map((entry) => `${entry.code}@${entry.path}`).join(',')}`);
  }

  const plan = await planCatalogImport(db, bundle);
  if (plan.creates.length === 0 && plan.updates.length === 0 && plan.versions.length === 0 && plan.retirements.length === 0) {
    return plan;
  }

  await db.$transaction(async (tx) => {
    const existing = await readExistingCatalogState(tx);
    const publicationLookup = toPublicationMap(existing.publications);
    const sourceLookup = new Map<string, Record<string, unknown>>(
      existing.sources
        .filter((row) => row.ownerUserId === PLATFORM_CATALOG_OWNER_USER_ID)
        .map((row) => [`${row.ownerUserId}|${row.type}|${row.value}`, row] as const)
    );
    const agentLookup = buildAgentLookup(existing.agents, existing.publications);
    const agentVersionsByAgentId = new Map<string, Array<Record<string, unknown>>>();
    for (const version of existing.agentVersions) {
      const agentId = String(version.agentId ?? '');
      if (!agentVersionsByAgentId.has(agentId)) {
        agentVersionsByAgentId.set(agentId, []);
      }
      agentVersionsByAgentId.get(agentId)!.push(version);
    }
    for (const versions of agentVersionsByAgentId.values()) {
      versions.sort((left, right) => Number(right.version ?? 0) - Number(left.version ?? 0));
    }

    const appliedSourcePublications = new Map<string, Record<string, unknown>>();
    for (const entry of bundle.sources) {
      const sourceKey = `${PLATFORM_CATALOG_OWNER_USER_ID}|${entry.type}|${entry.value}`;
      const existingSource = sourceLookup.get(sourceKey);
      const sourceRow =
        existingSource ??
        (await tx.source.create({
          data: {
            ownerUserId: PLATFORM_CATALOG_OWNER_USER_ID,
            type: entry.type,
            value: entry.value,
            status: 'active',
            configJson: buildSourceConfigJson(undefined, entry)
          }
        }));

      if (existingSource) {
        const nextConfigJson = buildSourceConfigJson(existingSource.configJson, entry);
        if (
          existingSource.status !== 'active' ||
          normalizeJsonText(existingSource.configJson, {}) !== stableStringify(parseJson(nextConfigJson, {}))
        ) {
          const updatedSource = await tx.source.update({
            where: { id: String(existingSource.id) },
            data: {
              status: 'active',
              configJson: nextConfigJson
            }
          });
          sourceLookup.set(sourceKey, updatedSource);
        }
      } else {
        sourceLookup.set(sourceKey, sourceRow);
      }

      const publicationKeyParts: PublicationKeyParts = {
        resourceType: 'source',
        slug: entry.slug,
        locale: entry.locale,
        catalogVersion: entry.catalogVersion
      };
      const desiredPublication = buildSourcePublicationData(String(sourceRow.id), entry);
      const existingPublication = publicationLookup.get(publicationMapKey(publicationKeyParts));
      const publication = existingPublication
        ? sourcePublicationFieldsMatch(existingPublication, desiredPublication)
          ? existingPublication
          : await tx.marketplacePublication.update({
              where: { id: String(existingPublication.id) },
              data: {
                ...desiredPublication,
                publishedAt: existingPublication.publishedAt ?? new Date(),
                retiredAt: null
              }
            })
        : await tx.marketplacePublication.create({
            data: {
              ...desiredPublication,
              publishedAt: new Date()
            }
          });

      publicationLookup.set(publicationMapKey(publicationKeyParts), publication);
      appliedSourcePublications.set(localeEntryKey(entry.slug, entry.locale), publication);
    }

    const agentGroups = new Map<string, CatalogAgentBundleEntry[]>();
    for (const entry of bundle.agents) {
      if (!agentGroups.has(entry.slug)) {
        agentGroups.set(entry.slug, []);
      }
      agentGroups.get(entry.slug)!.push(entry);
    }

    const appliedAgentPublications = new Map<string, Record<string, unknown>>();
    for (const [slug, entries] of agentGroups.entries()) {
      const canonicalEntry = selectCanonicalAgentEntry(entries);
      const existingAgent = agentLookup.get(slug);
      const agentRow =
        existingAgent ??
        (await tx.agent.create({
          data: {
            ownerUserId: PLATFORM_CATALOG_OWNER_USER_ID,
            name: canonicalEntry.promptSnapshot.name,
            description: canonicalEntry.promptSnapshot.description,
            characterType: canonicalEntry.promptSnapshot.characterType,
            promptConfigJson: JSON.stringify(canonicalEntry.promptSnapshot.promptConfig),
            status: 'active',
            preferencesJson: buildAgentPreferencesJson(undefined, slug)
          }
        }));

      if (existingAgent) {
        const nextPreferencesJson = buildAgentPreferencesJson(existingAgent.preferencesJson, slug);
        if (
          existingAgent.name !== canonicalEntry.promptSnapshot.name ||
          existingAgent.description !== canonicalEntry.promptSnapshot.description ||
          existingAgent.characterType !== canonicalEntry.promptSnapshot.characterType ||
          normalizeJsonText(existingAgent.promptConfigJson, {}) !== stableStringify(canonicalEntry.promptSnapshot.promptConfig) ||
          existingAgent.status !== 'active' ||
          normalizeJsonText(existingAgent.preferencesJson, {}) !== stableStringify(parseJson(nextPreferencesJson, {}))
        ) {
          const updatedAgent = await tx.agent.update({
            where: { id: String(existingAgent.id) },
            data: {
              name: canonicalEntry.promptSnapshot.name,
              description: canonicalEntry.promptSnapshot.description,
              characterType: canonicalEntry.promptSnapshot.characterType,
              promptConfigJson: JSON.stringify(canonicalEntry.promptSnapshot.promptConfig),
              status: 'active',
              preferencesJson: nextPreferencesJson
            }
          });
          agentLookup.set(slug, updatedAgent);
        }
      } else {
        agentLookup.set(slug, agentRow);
      }

      const versions = agentVersionsByAgentId.get(String(agentRow.id)) ?? [];
      const desiredSignature = buildPromptSnapshotSignature(canonicalEntry);
      let matchingVersion = versions.find((row) => buildPromptVersionSignature(row) === desiredSignature);
      if (!matchingVersion) {
        const nextVersion = (versions[0] ? Number(versions[0].version ?? 0) : 0) + 1;
        matchingVersion = await tx.agentPromptVersion.create({
          data: {
            agentId: String(agentRow.id),
            version: nextVersion,
            model: canonicalEntry.promptSnapshot.model,
            systemPrompt: canonicalEntry.promptSnapshot.systemPrompt,
            name: canonicalEntry.promptSnapshot.name,
            description: canonicalEntry.promptSnapshot.description,
            characterType: canonicalEntry.promptSnapshot.characterType,
            promptConfigJson: JSON.stringify(canonicalEntry.promptSnapshot.promptConfig),
            iconAssetKey: canonicalEntry.iconAssetKey,
            enabled: true,
            publishedAt: new Date()
          }
        });
        versions.unshift(matchingVersion);
        agentVersionsByAgentId.set(String(agentRow.id), versions);
      }

      for (const entry of entries) {
        const publicationKeyParts: PublicationKeyParts = {
          resourceType: 'agent',
          slug: entry.slug,
          locale: entry.locale,
          catalogVersion: entry.catalogVersion
        };
        const desiredPublication = buildAgentPublicationData(String(agentRow.id), String(matchingVersion.id), entry);
        const existingPublication = publicationLookup.get(publicationMapKey(publicationKeyParts));
        const publication = existingPublication
          ? agentPublicationFieldsMatch(existingPublication, desiredPublication)
            ? existingPublication
            : await tx.marketplacePublication.update({
                where: { id: String(existingPublication.id) },
                data: {
                  ...desiredPublication,
                  publishedAt: existingPublication.publishedAt ?? new Date(),
                  retiredAt: null
                }
              })
          : await tx.marketplacePublication.create({
              data: {
                ...desiredPublication,
                publishedAt: new Date()
              }
            });

        publicationLookup.set(publicationMapKey(publicationKeyParts), publication);
        appliedAgentPublications.set(localeEntryKey(entry.slug, entry.locale), publication);
      }
    }

    const existingDemosByKey = new Map(existing.demos.map((demo) => [demoMapKey(String(demo.slug), String(demo.locale)), demo] as const));
    const desiredPublicationKeys = new Set<string>();
    for (const entry of bundle.sources) {
      desiredPublicationKeys.add(
        publicationMapKey({
          resourceType: 'source',
          slug: entry.slug,
          locale: entry.locale,
          catalogVersion: entry.catalogVersion
        })
      );
    }
    for (const entry of bundle.agents) {
      desiredPublicationKeys.add(
        publicationMapKey({
          resourceType: 'agent',
          slug: entry.slug,
          locale: entry.locale,
          catalogVersion: entry.catalogVersion
        })
      );
    }

    const desiredDemoKeys = new Set<string>();
    for (const entry of bundle.demos) {
      const sourcePublication = appliedSourcePublications.get(localeEntryKey(entry.sourceSlug, entry.locale));
      const agentPublication = appliedAgentPublications.get(localeEntryKey(entry.agentSlug, entry.locale));
      if (!sourcePublication || !agentPublication) {
        throw new Error(`missing_demo_publication_dependency:${entry.slug}:${entry.locale}`);
      }

      const desiredDemo = buildDemoData(String(sourcePublication.id), String(agentPublication.id), entry);
      const existingDemo = existingDemosByKey.get(demoMapKey(entry.slug, entry.locale));
      desiredDemoKeys.add(demoMapKey(entry.slug, entry.locale));

      if (!existingDemo) {
        await tx.catalogDemo.create({ data: desiredDemo });
        continue;
      }

      if (!demoFieldsMatch(existingDemo, desiredDemo)) {
        await tx.catalogDemo.update({
          where: { id: String(existingDemo.id) },
          data: desiredDemo
        });
      }
    }

    for (const publication of existing.publications) {
      if (publication.origin !== 'platform_curated' || publication.retiredAt !== null) {
        continue;
      }

      const resourceType = publication.resourceType === 'source' ? 'source' : publication.resourceType === 'agent' ? 'agent' : null;
      if (!resourceType || typeof publication.slug !== 'string' || typeof publication.locale !== 'string') {
        continue;
      }

      const key = publicationMapKey({
        resourceType,
        slug: publication.slug,
        locale: publication.locale,
        catalogVersion: Number(publication.catalogVersion ?? 0)
      });

      if (!desiredPublicationKeys.has(key)) {
        await tx.marketplacePublication.update({
          where: { id: String(publication.id) },
          data: {
            status: 'retired',
            retiredAt: new Date()
          }
        });
      }
    }

    for (const demo of existing.demos) {
      if (demo.status !== 'active' || typeof demo.slug !== 'string' || typeof demo.locale !== 'string') {
        continue;
      }

      if (!desiredDemoKeys.has(demoMapKey(demo.slug, demo.locale))) {
        await tx.catalogDemo.update({
          where: { id: String(demo.id) },
          data: {
            status: 'retired'
          }
        });
      }
    }
  });

  return plan;
}

function createEmptyCatalogDb(): CatalogDb {
  return {
    source: { findMany: async () => [], create: async () => { throw new Error('not_supported'); }, update: async () => { throw new Error('not_supported'); } },
    agent: { findMany: async () => [], create: async () => { throw new Error('not_supported'); }, update: async () => { throw new Error('not_supported'); } },
    agentPromptVersion: { findMany: async () => [], create: async () => { throw new Error('not_supported'); } },
    marketplacePublication: { findMany: async () => [], create: async () => { throw new Error('not_supported'); }, update: async () => { throw new Error('not_supported'); } },
    catalogDemo: { findMany: async () => [], create: async () => { throw new Error('not_supported'); }, update: async () => { throw new Error('not_supported'); } },
    $transaction: async () => {
      throw new Error('not_supported');
    }
  };
}

const CURRENT_FILE = fileURLToPath(import.meta.url);

function isMainModule(): boolean {
  return process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(CURRENT_FILE);
}

if (isMainModule()) {
  const argv = process.argv.slice(2);

  (async () => {
    try {
      const bundle = loadCatalogBundle(DEFAULT_CATALOG_BUNDLE_PATH);
      if (argv.includes('--dry-run')) {
        const plan = await planCatalogImport(createEmptyCatalogDb(), bundle);
        console.log(JSON.stringify(plan, null, 2));
        process.exitCode = 0;
        return;
      }

      if (argv.includes('--apply')) {
        const db = new PrismaClient();
        try {
          const appliedPlan = await applyCatalogImport(db as unknown as CatalogDb, bundle);
          console.log(JSON.stringify(appliedPlan, null, 2));
        } finally {
          await db.$disconnect();
        }
        process.exitCode = 0;
        return;
      }

      console.error('Usage: import.ts --dry-run|--apply');
      process.exitCode = 1;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  })();
}
