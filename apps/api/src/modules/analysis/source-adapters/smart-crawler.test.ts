import { describe, expect, it, vi } from 'vitest';
import { crawlSource, probeSource, type SmartCrawlerDeps } from './smart-crawler';
import { InMemorySourceCursorRepository } from '../../crawler/source-cursor-repository';
import { InMemorySourceCrawlConfigRepository } from '../../crawler/crawl-config-repository';
import type { SiteProfile } from '../types';

const LISTING_PROFILE: SiteProfile = {
  siteType: 'listing_page',
  itemLinkSelector: 'a.entry',
  itemIdHint: null,
  contentSelector: 'article',
  paginationSelector: null,
  confidence: 0.9
};

function buildDeps(overrides: Partial<SmartCrawlerDeps> = {}): SmartCrawlerDeps {
  return {
    httpGet: vi.fn(async () => ''),
    cursorRepository: new InMemorySourceCursorRepository(),
    crawlConfigRepository: new InMemorySourceCrawlConfigRepository(),
    siteInspector: { inspect: vi.fn(async () => null) },
    ...overrides
  };
}

describe('crawlSource - feed tier', () => {
  it('caps new items to the configured maxItems per run and advances the cursor with the processed item ids', async () => {
    const feedXml = `<rss><channel>
      ${[1, 2, 3, 4, 5].map((n) => `<item><guid>ep-${n}</guid><title>Episode ${n}</title><description>Notes ${n}</description></item>`).join('\n')}
    </channel></rss>`;

    const deps = buildDeps({ httpGet: vi.fn(async () => feedXml) });
    const result = await crawlSource(deps, 'agent-1', {
      type: 'podcast_feeds',
      value: 'https://example.com/feed.xml',
      maxItems: 3
    });

    expect(result.evidence).toHaveLength(3);
    expect(result.cursorUpdate?.seenItemIds).toEqual(['ep-1', 'ep-2', 'ep-3']);
  });

  it('defaults to 1 new item per run when maxItems is not configured', async () => {
    const feedXml = `<rss><channel>
      ${[1, 2, 3].map((n) => `<item><guid>ep-${n}</guid><title>Episode ${n}</title><description>Notes ${n}</description></item>`).join('\n')}
    </channel></rss>`;

    const deps = buildDeps({ httpGet: vi.fn(async () => feedXml) });
    const result = await crawlSource(deps, 'agent-1', { type: 'podcast_feeds', value: 'https://example.com/feed.xml' });

    expect(result.evidence).toHaveLength(1);
    expect(result.cursorUpdate?.seenItemIds).toEqual(['ep-1']);
  });

  it('returns no evidence once all items are already seen', async () => {
    const feedXml = '<rss><channel><item><guid>ep-1</guid><title>Episode 1</title></item></channel></rss>';
    const deps = buildDeps({ httpGet: vi.fn(async () => feedXml) });
    const source = { type: 'podcast_feeds' as const, value: 'https://example.com/feed.xml' };

    const first = await crawlSource(deps, 'agent-1', source);
    if (first.cursorUpdate) await deps.cursorRepository.saveCursor(first.cursorUpdate);

    const second = await crawlSource(deps, 'agent-1', source);
    expect(second.evidence).toHaveLength(0);
    expect(second.cursorUpdate).toBeUndefined();
  });

  it('forces crawling one specific already-seen item by link, ignoring maxItems and seen-status (episode picker)', async () => {
    const feedXml = `<rss><channel>
      <item><guid>ep-1</guid><link>https://example.com/ep-1</link><title>Episode 1</title><description>Notes 1</description></item>
      <item><guid>ep-2</guid><link>https://example.com/ep-2</link><title>Episode 2</title><description>Notes 2</description></item>
    </channel></rss>`;
    const deps = buildDeps({ httpGet: vi.fn(async () => feedXml) });
    const source = { type: 'podcast_feeds' as const, value: 'https://example.com/feed.xml', maxItems: 1 };

    // Advance the cursor past both items first, as if a normal run had already processed them.
    const first = await crawlSource(deps, 'agent-1', source);
    if (first.cursorUpdate) await deps.cursorRepository.saveCursor(first.cursorUpdate);

    // ep-1 was already marked seen by the first (normal) run above - force-select it anyway.
    const forced = await crawlSource(deps, 'agent-1', source, { forcedItemLink: 'https://example.com/ep-1' });
    expect(forced.evidence).toHaveLength(1);
    expect(forced.evidence[0].sourceRef).toBe('https://example.com/ep-1');
  });
});

describe('crawlSource - non-feed listing page tier', () => {
  it('inspects an unknown source once, persists the config, and extracts unseen items on the next call using the stored config (no re-inspection)', async () => {
    const html = '<html><body><a class="entry" href="/post-1">Post 1</a><article>Content of post 1</article></body></html>';
    const inspect = vi.fn(async () => LISTING_PROFILE);
    const httpGet = vi.fn(async (url: string) => {
      if (url === 'https://example.com/blog') return html;
      return '<html><body><article>Permalink content</article></body></html>';
    });
    const deps = buildDeps({ httpGet, siteInspector: { inspect } });
    const source = { type: 'web_urls' as const, value: 'https://example.com/blog' };

    const first = await crawlSource(deps, 'agent-1', source);
    expect(inspect).toHaveBeenCalledTimes(1);
    expect(first.evidence).toHaveLength(1);
    const savedConfig = await deps.crawlConfigRepository.getConfig('agent-1', source.value);
    expect(savedConfig?.siteType).toBe('listing_page');

    if (first.cursorUpdate) await deps.cursorRepository.saveCursor(first.cursorUpdate);
    const second = await crawlSource(deps, 'agent-1', source);
    expect(inspect).toHaveBeenCalledTimes(1); // config already persisted, no re-inspection
    expect(second.evidence).toHaveLength(0); // the only link was already seen
  });

  it('self-heals via one reinspection when the stored config yields zero links, and succeeds if the new profile works', async () => {
    const staleHtml = '<html><body><a class="old-selector" href="/post-1">Post 1</a></body></html>';
    const newHtml = '<html><body><a class="new-entry" href="/post-1">Post 1</a><article>Post content</article></body></html>';
    const newProfile: SiteProfile = { ...LISTING_PROFILE, itemLinkSelector: 'a.new-entry' };

    const deps = buildDeps({ httpGet: vi.fn(async () => newHtml) });
    const source = { type: 'web_urls' as const, value: 'https://example.com/blog' };

    // Pre-seed a stale config whose selector no longer matches anything on the current page.
    await deps.crawlConfigRepository.saveConfig({
      agentId: 'agent-1',
      sourceValue: source.value,
      siteType: 'listing_page',
      config: LISTING_PROFILE,
      inspectedAt: new Date('2026-01-01').toISOString(),
      inspectionModel: 'claude-sonnet-4-5',
      confidence: 0.9,
      lastReinspectionAt: null,
      reinspectionCount24h: 0
    });

    deps.siteInspector = { inspect: vi.fn(async () => newProfile) };

    const result = await crawlSource(deps, 'agent-1', source);

    expect(deps.siteInspector.inspect).toHaveBeenCalledTimes(1);
    expect(result.evidence).toHaveLength(1);
    const savedConfig = await deps.crawlConfigRepository.getConfig('agent-1', source.value);
    expect(savedConfig?.config).toMatchObject({ itemLinkSelector: 'a.new-entry' });
    expect(savedConfig?.reinspectionCount24h).toBe(1);
    void staleHtml;
  });

  it('skips reinspection and returns a warning when the 24h/1-attempt budget is already exhausted', async () => {
    const html = '<html><body><a class="stale" href="/post-1">Post 1</a></body></html>';
    const deps = buildDeps({ httpGet: vi.fn(async () => html) });
    const source = { type: 'web_urls' as const, value: 'https://example.com/blog' };

    await deps.crawlConfigRepository.saveConfig({
      agentId: 'agent-1',
      sourceValue: source.value,
      siteType: 'listing_page',
      config: LISTING_PROFILE,
      inspectedAt: new Date().toISOString(),
      inspectionModel: 'claude-sonnet-4-5',
      confidence: 0.9,
      lastReinspectionAt: new Date().toISOString(),
      reinspectionCount24h: 1
    });

    const result = await crawlSource(deps, 'agent-1', source);

    expect(result.evidence).toHaveLength(0);
    expect(result.warning).toContain('reinspection budget');
    expect(deps.siteInspector.inspect).not.toHaveBeenCalled();
  });
});

describe('crawlSource - non-feed single page tier', () => {
  it('emits evidence only when the content hash changes across runs', async () => {
    const source = { type: 'web_urls' as const, value: 'https://example.com/page' };
    let html = '<html><body><article>Version 1</article></body></html>';
    const deps = buildDeps({ httpGet: vi.fn(async () => html) });

    const first = await crawlSource(deps, 'agent-1', source);
    expect(first.evidence).toHaveLength(1);
    if (first.cursorUpdate) await deps.cursorRepository.saveCursor(first.cursorUpdate);

    const second = await crawlSource(deps, 'agent-1', source);
    expect(second.evidence).toHaveLength(0);

    html = '<html><body><article>Version 2 - materially different</article></body></html>';
    const third = await crawlSource(deps, 'agent-1', source);
    expect(third.evidence).toHaveLength(1);
  });
});

describe('probeSource', () => {
  it('reports unreachable sources without throwing', async () => {
    const deps = { httpGet: vi.fn(async () => { throw new Error('DNS failure'); }), siteInspector: { inspect: vi.fn(async () => null) } };
    const result = await probeSource(deps, { type: 'web_urls', value: 'https://broken.example.com' });
    expect(result.reachable).toBe(false);
    expect(result.warning).toContain('DNS failure');
  });

  it('identifies a feed source and its item count without persisting anything', async () => {
    const feedXml = '<rss><channel><item><guid>ep-1</guid><title>Episode 1</title></item></channel></rss>';
    const deps = { httpGet: vi.fn(async () => feedXml), siteInspector: { inspect: vi.fn(async () => null) } };
    const result = await probeSource(deps, { type: 'podcast_feeds', value: 'https://example.com/feed.xml', maxItems: 5 });
    expect(result).toMatchObject({ reachable: true, kind: 'feed', itemCount: 1, maxItemsPerRun: 5 });
    expect(deps.siteInspector.inspect).not.toHaveBeenCalled();
  });

  it('includes a sneak preview of the last 5 items, independent of the configured maxItems', async () => {
    const feedXml = `<rss><channel>
      <item><guid>ep-1</guid><title>Episode 1</title><link>https://example.com/1</link><pubDate>2026-01-01</pubDate></item>
      <item><guid>ep-2</guid><title>Episode 2</title><link>https://example.com/2</link><pubDate>2026-01-02</pubDate></item>
      <item><guid>ep-3</guid><title>Episode 3</title><link>https://example.com/3</link><pubDate>2026-01-03</pubDate></item>
      <item><guid>ep-4</guid><title>Episode 4</title><link>https://example.com/4</link><pubDate>2026-01-04</pubDate></item>
      <item><guid>ep-5</guid><title>Episode 5</title><link>https://example.com/5</link><pubDate>2026-01-05</pubDate></item>
      <item><guid>ep-6</guid><title>Episode 6</title><link>https://example.com/6</link><pubDate>2026-01-06</pubDate></item>
    </channel></rss>`;
    const deps = { httpGet: vi.fn(async () => feedXml), siteInspector: { inspect: vi.fn(async () => null) } };
    const result = await probeSource(deps, { type: 'podcast_feeds', value: 'https://example.com/feed.xml', maxItems: 2 });
    expect(result.itemCount).toBe(6);
    expect(result.maxItemsPerRun).toBe(2);
    expect(result.previewItems).toHaveLength(5);
    expect(result.previewItems?.[0]).toMatchObject({ title: 'Episode 1', link: 'https://example.com/1' });
    expect(result.previewItems?.[4]).toMatchObject({ title: 'Episode 5', link: 'https://example.com/5' });
  });

  it('flags low-confidence AI inspection results with a warning', async () => {
    const html = '<html><body><p>Some page</p></body></html>';
    const lowConfidenceProfile: SiteProfile = { ...LISTING_PROFILE, confidence: 0.2 };
    const deps = { httpGet: vi.fn(async () => html), siteInspector: { inspect: vi.fn(async () => lowConfidenceProfile) } };
    const result = await probeSource(deps, { type: 'web_urls', value: 'https://example.com/unclear' });
    expect(result.reachable).toBe(true);
    expect(result.warning).toContain('Low confidence');
  });

  it('reports a confident listing page classification with no warning', async () => {
    const html = '<html><body><a class="entry" href="/post-1">Post 1</a></body></html>';
    const deps = { httpGet: vi.fn(async () => html), siteInspector: { inspect: vi.fn(async () => LISTING_PROFILE) } };
    const result = await probeSource(deps, { type: 'web_urls', value: 'https://example.com/blog', maxItems: 3 });
    expect(result).toMatchObject({ reachable: true, kind: 'listing_page', confidence: 0.9, maxItemsPerRun: 3 });
    expect(result.warning).toBeUndefined();
  });
});
