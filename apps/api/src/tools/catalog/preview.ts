import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_AGENT_ICON_DIRECTORY,
  DEFAULT_CATALOG_BUNDLE_PATH,
  REPO_ROOT,
  formatCatalogValidationErrors,
  loadCatalogBundle,
  stableStringify,
  type CatalogAgentBundleEntry,
  type CatalogBundle,
  type CatalogDemoBundleEntry,
  type CatalogSourceBundleEntry,
  validateCatalog
} from './validate';

export const DEFAULT_CATALOG_PREVIEW_PATH = path.join(REPO_ROOT, '.superpowers', 'catalog-preview', 'index.html');

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sortSources(entries: readonly CatalogSourceBundleEntry[]): CatalogSourceBundleEntry[] {
  return [...entries].sort((left, right) => {
    const rankDiff = left.editorialRank - right.editorialRank;
    if (rankDiff !== 0) return rankDiff;
    const slugDiff = left.slug.localeCompare(right.slug);
    if (slugDiff !== 0) return slugDiff;
    return left.locale.localeCompare(right.locale);
  });
}

function sortAgents(entries: readonly CatalogAgentBundleEntry[]): CatalogAgentBundleEntry[] {
  return [...entries].sort((left, right) => {
    const rankDiff = left.editorialRank - right.editorialRank;
    if (rankDiff !== 0) return rankDiff;
    const slugDiff = left.slug.localeCompare(right.slug);
    if (slugDiff !== 0) return slugDiff;
    return left.locale.localeCompare(right.locale);
  });
}

function sortDemos(entries: readonly CatalogDemoBundleEntry[]): CatalogDemoBundleEntry[] {
  return [...entries].sort((left, right) => {
    const localeDiff = left.locale.localeCompare(right.locale);
    if (localeDiff !== 0) return localeDiff;
    const sourceDiff = left.sourceSlug.localeCompare(right.sourceSlug);
    if (sourceDiff !== 0) return sourceDiff;
    const agentDiff = left.agentSlug.localeCompare(right.agentSlug);
    if (agentDiff !== 0) return agentDiff;
    return left.slug.localeCompare(right.slug);
  });
}

function renderTags(tags: readonly string[]): string {
  if (tags.length === 0) {
    return '<span class="tag muted">none</span>';
  }

  return tags
    .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
    .join('');
}

function readVendoredIconSvg(iconAssetKey: string, iconDirectory = DEFAULT_AGENT_ICON_DIRECTORY): string {
  const iconPath = path.join(iconDirectory, `${iconAssetKey}.svg`);
  return readFileSync(iconPath, 'utf8');
}

function collectDuplicateIconWarnings(agents: readonly CatalogAgentBundleEntry[]): string[] {
  const usage = new Map<string, Set<string>>();
  for (const agent of agents) {
    if (!usage.has(agent.iconAssetKey)) {
      usage.set(agent.iconAssetKey, new Set());
    }
    usage.get(agent.iconAssetKey)!.add(agent.slug);
  }

  return [...usage.entries()]
    .filter(([, slugs]) => slugs.size > 1)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([iconAssetKey, slugs]) => `${iconAssetKey} → ${[...slugs].sort((left, right) => left.localeCompare(right)).join(', ')}`);
}

function renderSourceCard(entry: CatalogSourceBundleEntry): string {
  const metadata = entry.metadata;
  return `<article class="card">
    <div class="card-header">
      <div>
        <h3>${escapeHtml(entry.title)}</h3>
        <p class="muted">${escapeHtml(entry.slug)} · ${escapeHtml(entry.locale)} · rank ${entry.editorialRank}</p>
      </div>
      <span class="pill">${escapeHtml(entry.type)}</span>
    </div>
    <p>${escapeHtml(entry.summary)}</p>
    <p class="muted">${escapeHtml(entry.value)}</p>
    <div class="tag-row">${renderTags(entry.topics)}${renderTags(entry.sourceTypes)}</div>
    <dl class="meta-grid">
      <div><dt>Metadata title</dt><dd>${escapeHtml(metadata.title ?? '—')}</dd></div>
      <div><dt>Cover</dt><dd>${escapeHtml(metadata.coverImageUrl ?? 'none')}</dd></div>
      <div><dt>Items</dt><dd>${escapeHtml(String(metadata.itemCount ?? 0))}</dd></div>
      <div><dt>Audio</dt><dd>${escapeHtml(String(metadata.audioCount ?? 0))}</dd></div>
    </dl>
    <ul class="preview-list">
      ${metadata.previewItems
        .map(
          (item) =>
            `<li><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.pubDate ?? 'no date')}</span>${
              item.hasAudio ? '<span class="tag">audio</span>' : ''
            }</li>`
        )
        .join('')}
    </ul>
  </article>`;
}

function renderAgentCard(entry: CatalogAgentBundleEntry): string {
  return `<article class="card compact-agent">
    <div class="card-header">
      <div class="icon-shell" aria-hidden="true">${readVendoredIconSvg(entry.iconAssetKey)}</div>
      <div>
        <h3>${escapeHtml(entry.title)}</h3>
        <p class="muted">${escapeHtml(entry.slug)} · ${escapeHtml(entry.locale)} · rank ${entry.editorialRank}</p>
      </div>
    </div>
    <p>${escapeHtml(entry.summary)}</p>
    <div class="tag-row">${renderTags(entry.topics)}${renderTags(entry.sourceTypes)}<span class="tag">${escapeHtml(entry.language)}</span></div>
    <dl class="meta-grid">
      <div><dt>Prompt name</dt><dd>${escapeHtml(entry.promptSnapshot.name)}</dd></div>
      <div><dt>Character</dt><dd>${escapeHtml(entry.promptSnapshot.characterType)}</dd></div>
      <div><dt>Model</dt><dd>${escapeHtml(entry.promptSnapshot.model)}</dd></div>
      <div><dt>Icon</dt><dd>${escapeHtml(`${entry.iconAssetKey} (${entry.iconLicense})`)}</dd></div>
    </dl>
    <pre>${escapeHtml(stableStringify(entry.promptSnapshot.promptConfig))}</pre>
  </article>`;
}

function renderDemoCard(
  entry: CatalogDemoBundleEntry,
  sourceLookup: ReadonlyMap<string, CatalogSourceBundleEntry>,
  agentLookup: ReadonlyMap<string, CatalogAgentBundleEntry>
): string {
  const source = sourceLookup.get(`${entry.sourceSlug}|${entry.locale}`);
  const agent = agentLookup.get(`${entry.agentSlug}|${entry.locale}`);
  return `<article class="card pairing">
    <h3>${escapeHtml(entry.title)}</h3>
    <p class="muted">${escapeHtml(entry.slug)} · ${escapeHtml(entry.locale)}</p>
    <p>${escapeHtml(entry.disclosure)}</p>
    <p><strong>Source:</strong> ${escapeHtml(source?.title ?? entry.sourceSlug)}</p>
    <p><strong>Agent:</strong> ${escapeHtml(agent?.title ?? entry.agentSlug)}</p>
    <pre>${escapeHtml(stableStringify(entry.report))}</pre>
  </article>`;
}

export function renderCatalogPreviewHtml(bundle: CatalogBundle): string {
  const sortedSources = sortSources(bundle.sources);
  const sortedAgents = sortAgents(bundle.agents);
  const sortedDemos = sortDemos(bundle.demos);
  const sourceLookup = new Map(sortedSources.map((entry) => [`${entry.slug}|${entry.locale}`, entry] as const));
  const agentLookup = new Map(sortedAgents.map((entry) => [`${entry.slug}|${entry.locale}`, entry] as const));
  const duplicateIconWarnings = collectDuplicateIconWarnings(sortedAgents);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Catalog preview</title>
    <style>
      :root { color-scheme: light; font-family: Arial, sans-serif; }
      body { margin: 0; padding: 32px; background: #f5f7fb; color: #182031; }
      h1, h2, h3, p { margin-top: 0; }
      .section { margin-bottom: 32px; }
      .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
      .card { background: #fff; border: 1px solid #d9e0ef; border-radius: 16px; padding: 16px; box-shadow: 0 8px 24px rgba(24, 32, 49, 0.06); }
      .card-header { display: flex; gap: 12px; justify-content: space-between; align-items: start; margin-bottom: 12px; }
      .compact-agent .card-header { justify-content: flex-start; }
      .muted { color: #56637c; font-size: 14px; }
      .tag-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
      .tag { display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 999px; background: #e9eef8; color: #31456a; font-size: 12px; }
      .tag.muted { background: #eff2f7; }
      .pill { padding: 4px 8px; border-radius: 999px; background: #182031; color: #fff; font-size: 12px; }
      .meta-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; margin: 12px 0; }
      .meta-grid dt { font-size: 12px; color: #56637c; }
      .meta-grid dd { margin: 4px 0 0; }
      .preview-list { padding-left: 18px; display: grid; gap: 8px; }
      .preview-list li { display: grid; gap: 4px; }
      .icon-shell { width: 48px; height: 48px; border-radius: 14px; background: #182031; color: #fff; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; }
      .icon-shell svg { width: 28px; height: 28px; }
      .warning-list { margin: 0; padding-left: 18px; }
      pre { white-space: pre-wrap; word-break: break-word; background: #f5f7fb; border-radius: 12px; padding: 12px; margin: 12px 0 0; font-size: 12px; }
    </style>
  </head>
  <body>
    <section class="section">
      <h1>Catalog preview</h1>
      <p class="muted">Validated offline bundle preview for curated starter sources, compact agents, and source-agent sample pairings.</p>
    </section>
    <section class="section">
      <h2>Duplicate icon assignments</h2>
      ${
        duplicateIconWarnings.length === 0
          ? '<p class="card">No duplicate icon assignments detected.</p>'
          : `<div class="card"><ul class="warning-list">${duplicateIconWarnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul></div>`
      }
    </section>
    <section class="section">
      <h2>Starter source cards</h2>
      <div class="grid">${sortedSources.map(renderSourceCard).join('')}</div>
    </section>
    <section class="section">
      <h2>Compact agent cards</h2>
      <div class="grid">${sortedAgents.map(renderAgentCard).join('')}</div>
    </section>
    <section class="section">
      <h2>Source-agent sample pairings</h2>
      <div class="grid">${sortedDemos.map((entry) => renderDemoCard(entry, sourceLookup, agentLookup)).join('')}</div>
    </section>
  </body>
</html>`;
}

export function writeCatalogPreview(bundle: CatalogBundle, outputPath = DEFAULT_CATALOG_PREVIEW_PATH): string {
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, renderCatalogPreviewHtml(bundle), 'utf8');
  return outputPath;
}

function isMainModule(): boolean {
  return process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(__filename);
}

const __filename = path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

if (isMainModule()) {
  try {
    const bundle = loadCatalogBundle(DEFAULT_CATALOG_BUNDLE_PATH);
    const errors = validateCatalog(bundle);
    if (errors.length > 0) {
      console.error(formatCatalogValidationErrors(errors));
      process.exitCode = 1;
    } else {
      const previewPath = writeCatalogPreview(bundle);
      console.log(previewPath);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
