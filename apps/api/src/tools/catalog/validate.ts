import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CharacterType, PromptConfig } from '../../modules/agents/types';
import type { SourcePreviewItem, SourceType } from '../../modules/source/types';

const VALID_SOURCE_TYPES: ReadonlySet<SourceType> = new Set(['web_urls', 'podcast_feeds', 'youtube_videos']);
const VALID_CHARACTER_TYPES: ReadonlySet<CharacterType> = new Set([
  'finance_expert',
  'teacher',
  'trainer',
  'philosopher',
  'influencer',
  'summarizer'
]);
const LOCALE_PATTERN = /^[a-z]{2}(?:-[a-z0-9]+)*$/;
const ICON_ASSET_KEY_PATTERN = /^[a-z0-9-]+$/;
const TOOL_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));

export const CATALOG_SCHEMA_VERSION = 1;
export const PLATFORM_CATALOG_OWNER_USER_ID = 'platform';
export const REPO_ROOT = path.resolve(TOOL_DIRECTORY, '..', '..', '..', '..', '..');
export const DEFAULT_CATALOG_BUNDLE_PATH = path.join(REPO_ROOT, 'apps', 'api', 'catalog', 'catalog.json');
export const DEFAULT_CATALOG_SCHEMA_PATH = path.join(REPO_ROOT, 'apps', 'api', 'catalog', 'catalog.schema.json');
export const DEFAULT_AGENT_ICON_DIRECTORY = path.join(REPO_ROOT, 'apps', 'web', 'public', 'agent-icons');

export interface CatalogSourceMetadata {
  title?: string;
  coverImageUrl: string | null;
  itemCount?: number;
  audioCount?: number;
  previewItems: SourcePreviewItem[];
}

export interface CatalogSourceBundleEntry {
  slug: string;
  catalogVersion: number;
  locale: string;
  title: string;
  summary: string;
  type: SourceType;
  value: string;
  sourceTypes: SourceType[];
  topics: string[];
  editorialRank: number;
  metadata: CatalogSourceMetadata;
}

export interface CatalogAgentPromptSnapshot {
  name: string;
  description: string;
  characterType: CharacterType;
  promptConfig: PromptConfig;
  model: string;
  systemPrompt: string;
}

export interface CatalogAgentBundleEntry {
  slug: string;
  catalogVersion: number;
  locale: string;
  title: string;
  summary: string;
  sourceTypes: SourceType[];
  topics: string[];
  language: string;
  editorialRank: number;
  iconAssetKey: string;
  iconLicense: 'MIT';
  promptSnapshot: CatalogAgentPromptSnapshot;
}

export interface CatalogDemoBundleEntry {
  slug: string;
  locale: string;
  title: string;
  disclosure: string;
  sourceSlug: string;
  agentSlug: string;
  report: unknown;
}

export interface CatalogBundle {
  schemaVersion: number;
  sources: CatalogSourceBundleEntry[];
  agents: CatalogAgentBundleEntry[];
  demos: CatalogDemoBundleEntry[];
}

export interface CatalogValidationError {
  code: string;
  path: string;
  message: string;
}

export interface CatalogValidationOptions {
  iconAllowlist?: ReadonlySet<string>;
  iconDirectory?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isLocale(value: unknown): value is string {
  return isNonEmptyString(value) && LOCALE_PATTERN.test(value.trim().toLowerCase());
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function normalizeLocale(locale: string): string {
  return locale.trim().toLowerCase();
}

function normalizeStringArray(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))).sort((left, right) =>
    left.localeCompare(right)
  );
}

function previewItemsSignature(items: readonly SourcePreviewItem[]): string {
  return stableStringify(
    items.map((item) => ({
      title: item.title,
      ...(item.link === undefined ? {} : { link: item.link }),
      ...(item.pubDate === undefined ? {} : { pubDate: item.pubDate }),
      ...(item.hasAudio === undefined ? {} : { hasAudio: item.hasAudio })
    }))
  );
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  if (isRecord(value)) {
    const keys = Object.keys(value).sort((left, right) => left.localeCompare(right));
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function loadCatalogBundle(bundlePath = DEFAULT_CATALOG_BUNDLE_PATH): CatalogBundle {
  return JSON.parse(readFileSync(bundlePath, 'utf8')) as CatalogBundle;
}

export function loadCatalogSchema(schemaPath = DEFAULT_CATALOG_SCHEMA_PATH): unknown {
  return JSON.parse(readFileSync(schemaPath, 'utf8'));
}

export function loadAgentIconAllowlist(iconDirectory = DEFAULT_AGENT_ICON_DIRECTORY): ReadonlySet<string> {
  if (!existsSync(iconDirectory)) {
    return new Set<string>();
  }

  return new Set(
    readdirSync(iconDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.svg'))
      .map((entry) => entry.name.replace(/\.svg$/i, ''))
      .sort((left, right) => left.localeCompare(right))
  );
}

function pushError(errors: CatalogValidationError[], code: string, path: string, message: string) {
  errors.push({ code, path, message });
}

function validatePreviewItems(value: unknown, pathName: string, errors: CatalogValidationError[]): value is SourcePreviewItem[] {
  if (!Array.isArray(value)) {
    pushError(errors, 'invalid_schema', pathName, `${pathName} must be an array.`);
    return false;
  }

  let valid = true;
  value.forEach((item, index) => {
    const itemPath = `${pathName}[${index}]`;
    if (!isRecord(item)) {
      pushError(errors, 'invalid_schema', itemPath, `${itemPath} must be an object.`);
      valid = false;
      return;
    }
    if (!isNonEmptyString(item.title)) {
      pushError(errors, 'invalid_schema', `${itemPath}.title`, `${itemPath}.title must be a non-empty string.`);
      valid = false;
    }
    if (item.link !== undefined && !isNonEmptyString(item.link)) {
      pushError(errors, 'invalid_schema', `${itemPath}.link`, `${itemPath}.link must be a non-empty string when present.`);
      valid = false;
    }
    if (item.pubDate !== undefined && item.pubDate !== null && typeof item.pubDate !== 'string') {
      pushError(errors, 'invalid_schema', `${itemPath}.pubDate`, `${itemPath}.pubDate must be a string or null when present.`);
      valid = false;
    }
    if (item.hasAudio !== undefined && typeof item.hasAudio !== 'boolean') {
      pushError(errors, 'invalid_schema', `${itemPath}.hasAudio`, `${itemPath}.hasAudio must be a boolean when present.`);
      valid = false;
    }
  });

  return valid;
}

function validateSourceEntry(entry: unknown, index: number, errors: CatalogValidationError[]): entry is CatalogSourceBundleEntry {
  const basePath = `sources[${index}]`;
  if (!isRecord(entry)) {
    pushError(errors, 'invalid_schema', basePath, `${basePath} must be an object.`);
    return false;
  }

  let valid = true;
  if (!isNonEmptyString(entry.slug)) {
    pushError(errors, 'invalid_schema', `${basePath}.slug`, `${basePath}.slug must be a non-empty string.`);
    valid = false;
  }
  if (!isInteger(entry.catalogVersion) || entry.catalogVersion < 1) {
    pushError(errors, 'invalid_schema', `${basePath}.catalogVersion`, `${basePath}.catalogVersion must be an integer >= 1.`);
    valid = false;
  }
  if (!isLocale(entry.locale)) {
    pushError(errors, 'invalid_schema', `${basePath}.locale`, `${basePath}.locale must be a lowercase locale such as "en" or "de".`);
    valid = false;
  }
  if (!isNonEmptyString(entry.title)) {
    pushError(errors, 'invalid_schema', `${basePath}.title`, `${basePath}.title must be a non-empty string.`);
    valid = false;
  }
  if (typeof entry.summary !== 'string') {
    pushError(errors, 'invalid_schema', `${basePath}.summary`, `${basePath}.summary must be a string.`);
    valid = false;
  }
  if (!isNonEmptyString(entry.type) || !VALID_SOURCE_TYPES.has(entry.type as SourceType)) {
    pushError(errors, 'invalid_schema', `${basePath}.type`, `${basePath}.type must be a supported source type.`);
    valid = false;
  }
  if (!isNonEmptyString(entry.value)) {
    pushError(errors, 'invalid_schema', `${basePath}.value`, `${basePath}.value must be a non-empty string.`);
    valid = false;
  }
  if (!Array.isArray(entry.sourceTypes) || entry.sourceTypes.length === 0 || !entry.sourceTypes.every((value) => isNonEmptyString(value) && VALID_SOURCE_TYPES.has(value as SourceType))) {
    pushError(errors, 'invalid_schema', `${basePath}.sourceTypes`, `${basePath}.sourceTypes must contain supported source types.`);
    valid = false;
  }
  if (!Array.isArray(entry.topics) || !entry.topics.every((value) => isNonEmptyString(value))) {
    pushError(errors, 'invalid_schema', `${basePath}.topics`, `${basePath}.topics must be an array of non-empty strings.`);
    valid = false;
  }
  if (!isInteger(entry.editorialRank) || entry.editorialRank < 0) {
    pushError(errors, 'invalid_schema', `${basePath}.editorialRank`, `${basePath}.editorialRank must be an integer >= 0.`);
    valid = false;
  }

  if (!isRecord(entry.metadata)) {
    pushError(errors, 'invalid_schema', `${basePath}.metadata`, `${basePath}.metadata must be an object.`);
    return false;
  }
  if (entry.metadata.title !== undefined && !isNonEmptyString(entry.metadata.title)) {
    pushError(errors, 'invalid_schema', `${basePath}.metadata.title`, `${basePath}.metadata.title must be a non-empty string when present.`);
    valid = false;
  }
  if (entry.metadata.coverImageUrl !== null && entry.metadata.coverImageUrl !== undefined && !isNonEmptyString(entry.metadata.coverImageUrl)) {
    pushError(errors, 'invalid_schema', `${basePath}.metadata.coverImageUrl`, `${basePath}.metadata.coverImageUrl must be a non-empty string or null.`);
    valid = false;
  }
  if (entry.metadata.itemCount !== undefined && (!isInteger(entry.metadata.itemCount) || entry.metadata.itemCount < 0)) {
    pushError(errors, 'invalid_schema', `${basePath}.metadata.itemCount`, `${basePath}.metadata.itemCount must be an integer >= 0 when present.`);
    valid = false;
  }
  if (entry.metadata.audioCount !== undefined && (!isInteger(entry.metadata.audioCount) || entry.metadata.audioCount < 0)) {
    pushError(errors, 'invalid_schema', `${basePath}.metadata.audioCount`, `${basePath}.metadata.audioCount must be an integer >= 0 when present.`);
    valid = false;
  }
  if (!validatePreviewItems(entry.metadata.previewItems, `${basePath}.metadata.previewItems`, errors)) {
    valid = false;
  }

  return valid;
}

function validateAgentEntry(
  entry: unknown,
  index: number,
  iconAllowlist: ReadonlySet<string>,
  errors: CatalogValidationError[]
): entry is CatalogAgentBundleEntry {
  const basePath = `agents[${index}]`;
  if (!isRecord(entry)) {
    pushError(errors, 'invalid_schema', basePath, `${basePath} must be an object.`);
    return false;
  }

  let valid = true;
  if (!isNonEmptyString(entry.slug)) {
    pushError(errors, 'invalid_schema', `${basePath}.slug`, `${basePath}.slug must be a non-empty string.`);
    valid = false;
  }
  if (!isInteger(entry.catalogVersion) || entry.catalogVersion < 1) {
    pushError(errors, 'invalid_schema', `${basePath}.catalogVersion`, `${basePath}.catalogVersion must be an integer >= 1.`);
    valid = false;
  }
  if (!isLocale(entry.locale)) {
    pushError(errors, 'invalid_schema', `${basePath}.locale`, `${basePath}.locale must be a lowercase locale such as "en" or "de".`);
    valid = false;
  }
  if (!isNonEmptyString(entry.title)) {
    pushError(errors, 'invalid_schema', `${basePath}.title`, `${basePath}.title must be a non-empty string.`);
    valid = false;
  }
  if (typeof entry.summary !== 'string') {
    pushError(errors, 'invalid_schema', `${basePath}.summary`, `${basePath}.summary must be a string.`);
    valid = false;
  }
  if (!Array.isArray(entry.sourceTypes) || entry.sourceTypes.length === 0 || !entry.sourceTypes.every((value) => isNonEmptyString(value) && VALID_SOURCE_TYPES.has(value as SourceType))) {
    pushError(errors, 'invalid_schema', `${basePath}.sourceTypes`, `${basePath}.sourceTypes must contain supported source types.`);
    valid = false;
  }
  if (!Array.isArray(entry.topics) || !entry.topics.every((value) => isNonEmptyString(value))) {
    pushError(errors, 'invalid_schema', `${basePath}.topics`, `${basePath}.topics must be an array of non-empty strings.`);
    valid = false;
  }
  if (!isLocale(entry.language)) {
    pushError(errors, 'invalid_schema', `${basePath}.language`, `${basePath}.language must be a lowercase locale.`);
    valid = false;
  }
  if (!isInteger(entry.editorialRank) || entry.editorialRank < 0) {
    pushError(errors, 'invalid_schema', `${basePath}.editorialRank`, `${basePath}.editorialRank must be an integer >= 0.`);
    valid = false;
  }
  if (!isNonEmptyString(entry.iconAssetKey) || !ICON_ASSET_KEY_PATTERN.test(entry.iconAssetKey)) {
    pushError(errors, 'invalid_schema', `${basePath}.iconAssetKey`, `${basePath}.iconAssetKey must match ${ICON_ASSET_KEY_PATTERN}.`);
    valid = false;
  } else if (!iconAllowlist.has(entry.iconAssetKey)) {
    pushError(errors, 'missing_icon', `${basePath}.iconAssetKey`, `Missing vendored icon asset "${entry.iconAssetKey}".`);
    valid = false;
  }
  if (entry.iconLicense !== 'MIT') {
    pushError(errors, 'invalid_schema', `${basePath}.iconLicense`, `${basePath}.iconLicense must be "MIT".`);
    valid = false;
  }

  if (!isRecord(entry.promptSnapshot)) {
    pushError(errors, 'invalid_schema', `${basePath}.promptSnapshot`, `${basePath}.promptSnapshot must be an object.`);
    return false;
  }
  if (!isNonEmptyString(entry.promptSnapshot.name)) {
    pushError(errors, 'invalid_schema', `${basePath}.promptSnapshot.name`, `${basePath}.promptSnapshot.name must be a non-empty string.`);
    valid = false;
  }
  if (typeof entry.promptSnapshot.description !== 'string') {
    pushError(errors, 'invalid_schema', `${basePath}.promptSnapshot.description`, `${basePath}.promptSnapshot.description must be a string.`);
    valid = false;
  }
  if (!isNonEmptyString(entry.promptSnapshot.characterType) || !VALID_CHARACTER_TYPES.has(entry.promptSnapshot.characterType as CharacterType)) {
    pushError(errors, 'invalid_schema', `${basePath}.promptSnapshot.characterType`, `${basePath}.promptSnapshot.characterType must be a supported character type.`);
    valid = false;
  }
  if (!isRecord(entry.promptSnapshot.promptConfig)) {
    pushError(errors, 'invalid_schema', `${basePath}.promptSnapshot.promptConfig`, `${basePath}.promptSnapshot.promptConfig must be an object.`);
    valid = false;
  }
  if (!isNonEmptyString(entry.promptSnapshot.model)) {
    pushError(errors, 'invalid_schema', `${basePath}.promptSnapshot.model`, `${basePath}.promptSnapshot.model must be a non-empty string.`);
    valid = false;
  }
  if (!isNonEmptyString(entry.promptSnapshot.systemPrompt)) {
    pushError(errors, 'invalid_schema', `${basePath}.promptSnapshot.systemPrompt`, `${basePath}.promptSnapshot.systemPrompt must be a non-empty string.`);
    valid = false;
  }

  return valid;
}

function validateDemoEntry(entry: unknown, index: number, errors: CatalogValidationError[]): entry is CatalogDemoBundleEntry {
  const basePath = `demos[${index}]`;
  if (!isRecord(entry)) {
    pushError(errors, 'invalid_schema', basePath, `${basePath} must be an object.`);
    return false;
  }

  let valid = true;
  if (!isNonEmptyString(entry.slug)) {
    pushError(errors, 'invalid_schema', `${basePath}.slug`, `${basePath}.slug must be a non-empty string.`);
    valid = false;
  }
  if (!isLocale(entry.locale)) {
    pushError(errors, 'invalid_schema', `${basePath}.locale`, `${basePath}.locale must be a lowercase locale such as "en" or "de".`);
    valid = false;
  }
  if (!isNonEmptyString(entry.title)) {
    pushError(errors, 'invalid_schema', `${basePath}.title`, `${basePath}.title must be a non-empty string.`);
    valid = false;
  }
  if (!isNonEmptyString(entry.disclosure)) {
    pushError(errors, 'invalid_schema', `${basePath}.disclosure`, `${basePath}.disclosure must be a non-empty string.`);
    valid = false;
  }
  if (!isNonEmptyString(entry.sourceSlug)) {
    pushError(errors, 'invalid_schema', `${basePath}.sourceSlug`, `${basePath}.sourceSlug must be a non-empty string.`);
    valid = false;
  }
  if (!isNonEmptyString(entry.agentSlug)) {
    pushError(errors, 'invalid_schema', `${basePath}.agentSlug`, `${basePath}.agentSlug must be a non-empty string.`);
    valid = false;
  }
  if (entry.report === undefined) {
    pushError(errors, 'invalid_schema', `${basePath}.report`, `${basePath}.report must be present.`);
    valid = false;
  }

  return valid;
}

function validateLocalizedUniqueness<T extends { slug: string; locale: string }>(
  entries: readonly T[],
  groupName: 'sources' | 'agents' | 'demos',
  errors: CatalogValidationError[]
) {
  const seen = new Map<string, number>();
  entries.forEach((entry, index) => {
    const key = `${entry.slug}|${normalizeLocale(entry.locale)}`;
    if (seen.has(key)) {
      pushError(errors, 'duplicate_slug', `${groupName}[${index}].slug`, `Duplicate localized slug "${entry.slug}" for locale "${entry.locale}".`);
      return;
    }
    seen.set(key, index);
  });
}

function validateSourceLocaleIntegrity(entries: readonly CatalogSourceBundleEntry[], errors: CatalogValidationError[]) {
  const grouped = new Map<string, CatalogSourceBundleEntry[]>();
  entries.forEach((entry) => {
    if (!grouped.has(entry.slug)) {
      grouped.set(entry.slug, []);
    }
    grouped.get(entry.slug)!.push(entry);
  });

  for (const [slug, group] of grouped) {
    const baseline = group[0];
    const baselineSignature = stableStringify({
      catalogVersion: baseline.catalogVersion,
      type: baseline.type,
      value: baseline.value,
      sourceTypes: normalizeStringArray(baseline.sourceTypes),
      topics: normalizeStringArray(baseline.topics),
      editorialRank: baseline.editorialRank,
      metadata: {
        title: baseline.metadata.title ?? null,
        coverImageUrl: baseline.metadata.coverImageUrl,
        itemCount: baseline.metadata.itemCount ?? null,
        audioCount: baseline.metadata.audioCount ?? null,
        previewItems: previewItemsSignature(baseline.metadata.previewItems)
      }
    });

    for (const entry of group.slice(1)) {
      const entrySignature = stableStringify({
        catalogVersion: entry.catalogVersion,
        type: entry.type,
        value: entry.value,
        sourceTypes: normalizeStringArray(entry.sourceTypes),
        topics: normalizeStringArray(entry.topics),
        editorialRank: entry.editorialRank,
        metadata: {
          title: entry.metadata.title ?? null,
          coverImageUrl: entry.metadata.coverImageUrl,
          itemCount: entry.metadata.itemCount ?? null,
          audioCount: entry.metadata.audioCount ?? null,
          previewItems: previewItemsSignature(entry.metadata.previewItems)
        }
      });
      if (entrySignature !== baselineSignature) {
        pushError(
          errors,
          'locale_reference_integrity',
          `sources[slug=${slug}]`,
          `Localized source entries for "${slug}" must share canonical type/value, metadata, tags, and catalogVersion.`
        );
      }
    }
  }
}

function validateAgentLocaleIntegrity(entries: readonly CatalogAgentBundleEntry[], errors: CatalogValidationError[]) {
  const grouped = new Map<string, CatalogAgentBundleEntry[]>();
  entries.forEach((entry) => {
    if (!grouped.has(entry.slug)) {
      grouped.set(entry.slug, []);
    }
    grouped.get(entry.slug)!.push(entry);
  });

  for (const [slug, group] of grouped) {
    const baseline = group[0];
    const baselineSignature = stableStringify({
      catalogVersion: baseline.catalogVersion,
      sourceTypes: normalizeStringArray(baseline.sourceTypes),
      topics: normalizeStringArray(baseline.topics),
      editorialRank: baseline.editorialRank,
      iconAssetKey: baseline.iconAssetKey,
      iconLicense: baseline.iconLicense,
      promptSnapshot: baseline.promptSnapshot
    });

    for (const entry of group.slice(1)) {
      const entrySignature = stableStringify({
        catalogVersion: entry.catalogVersion,
        sourceTypes: normalizeStringArray(entry.sourceTypes),
        topics: normalizeStringArray(entry.topics),
        editorialRank: entry.editorialRank,
        iconAssetKey: entry.iconAssetKey,
        iconLicense: entry.iconLicense,
        promptSnapshot: entry.promptSnapshot
      });
      if (entrySignature !== baselineSignature) {
        pushError(
          errors,
          'locale_reference_integrity',
          `agents[slug=${slug}]`,
          `Localized agent entries for "${slug}" must share the same execution snapshot, icon, tags, and catalogVersion.`
        );
      }
    }
  }
}

function validateDemoLocaleIntegrity(entries: readonly CatalogDemoBundleEntry[], errors: CatalogValidationError[]) {
  const grouped = new Map<string, CatalogDemoBundleEntry[]>();
  entries.forEach((entry) => {
    if (!grouped.has(entry.slug)) {
      grouped.set(entry.slug, []);
    }
    grouped.get(entry.slug)!.push(entry);
  });

  for (const [slug, group] of grouped) {
    const baseline = group[0];
    const baselineSignature = stableStringify({
      sourceSlug: baseline.sourceSlug,
      agentSlug: baseline.agentSlug
    });
    for (const entry of group.slice(1)) {
      const entrySignature = stableStringify({
        sourceSlug: entry.sourceSlug,
        agentSlug: entry.agentSlug
      });
      if (entrySignature !== baselineSignature) {
        pushError(
          errors,
          'locale_reference_integrity',
          `demos[slug=${slug}]`,
          `Localized demo entries for "${slug}" must reference the same source and agent slugs.`
        );
      }
    }
  }
}

function validateDemoReferences(
  sources: readonly CatalogSourceBundleEntry[],
  agents: readonly CatalogAgentBundleEntry[],
  demos: readonly CatalogDemoBundleEntry[],
  errors: CatalogValidationError[]
) {
  const sourceSlugs = new Set(sources.map((entry) => entry.slug));
  const agentSlugs = new Set(agents.map((entry) => entry.slug));
  const sourceLocaleKeys = new Set(sources.map((entry) => `${entry.slug}|${normalizeLocale(entry.locale)}`));
  const agentLocaleKeys = new Set(agents.map((entry) => `${entry.slug}|${normalizeLocale(entry.locale)}`));

  demos.forEach((entry, index) => {
    if (!sourceSlugs.has(entry.sourceSlug) || !agentSlugs.has(entry.agentSlug)) {
      pushError(
        errors,
        'unknown_demo_reference',
        `demos[${index}]`,
        `Demo "${entry.slug}" references an unknown source or agent slug.`
      );
      return;
    }

    const sourceKey = `${entry.sourceSlug}|${normalizeLocale(entry.locale)}`;
    const agentKey = `${entry.agentSlug}|${normalizeLocale(entry.locale)}`;
    if (!sourceLocaleKeys.has(sourceKey) || !agentLocaleKeys.has(agentKey)) {
      pushError(
        errors,
        'locale_reference_integrity',
        `demos[${index}]`,
        `Demo "${entry.slug}" must reference source and agent entries available in locale "${entry.locale}".`
      );
    }
  });
}

export function validateCatalog(bundle: unknown, options: CatalogValidationOptions = {}): CatalogValidationError[] {
  const errors: CatalogValidationError[] = [];
  const iconAllowlist = options.iconAllowlist ?? loadAgentIconAllowlist(options.iconDirectory ?? DEFAULT_AGENT_ICON_DIRECTORY);

  if (!isRecord(bundle)) {
    pushError(errors, 'invalid_schema', '$', 'Catalog bundle must be an object.');
    return errors;
  }

  if (bundle.schemaVersion !== CATALOG_SCHEMA_VERSION) {
    pushError(
      errors,
      'schema_version',
      'schemaVersion',
      `Catalog bundle schemaVersion must be ${CATALOG_SCHEMA_VERSION}.`
    );
  }
  if (!Array.isArray(bundle.sources)) {
    pushError(errors, 'invalid_schema', 'sources', 'sources must be an array.');
  }
  if (!Array.isArray(bundle.agents)) {
    pushError(errors, 'invalid_schema', 'agents', 'agents must be an array.');
  }
  if (!Array.isArray(bundle.demos)) {
    pushError(errors, 'invalid_schema', 'demos', 'demos must be an array.');
  }

  if (!Array.isArray(bundle.sources) || !Array.isArray(bundle.agents) || !Array.isArray(bundle.demos)) {
    return errors;
  }

  const sources = bundle.sources.filter((entry, index): entry is CatalogSourceBundleEntry => validateSourceEntry(entry, index, errors));
  const agents = bundle.agents.filter((entry, index): entry is CatalogAgentBundleEntry => validateAgentEntry(entry, index, iconAllowlist, errors));
  const demos = bundle.demos.filter((entry, index): entry is CatalogDemoBundleEntry => validateDemoEntry(entry, index, errors));

  validateLocalizedUniqueness(sources, 'sources', errors);
  validateLocalizedUniqueness(agents, 'agents', errors);
  validateLocalizedUniqueness(demos, 'demos', errors);
  validateSourceLocaleIntegrity(sources, errors);
  validateAgentLocaleIntegrity(agents, errors);
  validateDemoLocaleIntegrity(demos, errors);
  validateDemoReferences(sources, agents, demos, errors);

  return errors.sort((left, right) => {
    const codeDiff = left.code.localeCompare(right.code);
    if (codeDiff !== 0) {
      return codeDiff;
    }
    return left.path.localeCompare(right.path);
  });
}

export function formatCatalogValidationErrors(errors: readonly CatalogValidationError[]): string {
  return errors.map((error) => `${error.code} @ ${error.path}: ${error.message}`).join('\n');
}

function isMainModule(metaUrl: string): boolean {
  const entryPoint = process.argv[1];
  return entryPoint !== undefined && path.resolve(fileURLToPath(metaUrl)) === path.resolve(entryPoint);
}

if (isMainModule(import.meta.url)) {
  try {
    loadCatalogSchema();
    const bundle = loadCatalogBundle();
    const errors = validateCatalog(bundle);
    if (errors.length > 0) {
      console.error(formatCatalogValidationErrors(errors));
      process.exitCode = 1;
    } else {
      console.log(`Catalog bundle is valid (${errors.length} errors).`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
