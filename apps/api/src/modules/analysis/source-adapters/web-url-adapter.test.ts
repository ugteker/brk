import { describe, expect, it } from 'vitest';
import { WebUrlAdapter } from './web-url-adapter';
import { InMemorySourceCursorRepository } from '../../crawler/source-cursor-repository';
import { InMemorySourceCrawlConfigRepository } from '../../crawler/crawl-config-repository';
import type { SmartCrawlerDeps } from './smart-crawler';

function createDeps(httpGet: SmartCrawlerDeps['httpGet'], inspect: SmartCrawlerDeps['siteInspector']['inspect']): SmartCrawlerDeps {
  return {
    httpGet,
    cursorRepository: new InMemorySourceCursorRepository(),
    crawlConfigRepository: new InMemorySourceCrawlConfigRepository(),
    siteInspector: { inspect }
  };
}

describe('WebUrlAdapter', () => {
  it('extracts readable text from an article fixture, falling back to whole-page extraction when AI inspection is inconclusive', async () => {
    const httpGet = async (url: string) => {
      expect(url).toBe('https://example.com/article');
      return '<html><body><p>Q3 earnings call: strong company guidance ahead.</p></body></html>';
    };

    const adapter = new WebUrlAdapter(createDeps(httpGet, async () => null));
    const result = await adapter.fetch('agent-1', { type: 'web_urls', value: 'https://example.com/article' });

    expect(result.evidence[0]?.content).toContain('company guidance');
    expect(result.evidence[0]?.fidelity).toBe('high');
    expect(result.cursorUpdate?.strategy).toBe('content_hash');
  });

  it('returns no evidence and no cursor update on an unchanged single page across two runs', async () => {
    const html = '<html><body><p>Steady content.</p></body></html>';
    const httpGet = async () => html;
    const deps = createDeps(httpGet, async () => null);
    const adapter = new WebUrlAdapter(deps);
    const source = { type: 'web_urls' as const, value: 'https://example.com/steady' };

    const first = await adapter.fetch('agent-1', source);
    expect(first.evidence).toHaveLength(1);
    if (first.cursorUpdate) await deps.cursorRepository.saveCursor(first.cursorUpdate);

    const second = await adapter.fetch('agent-1', source);
    expect(second.evidence).toHaveLength(0);
  });

  it('honors an explicit canonical limit for listing-page refreshes instead of defaulting to one item', async () => {
    const httpGet = async (url: string) => {
      if (url === 'https://example.com/blog') {
        return `<html><body>
          <a class="entry" href="https://example.com/p-1">Entry 1</a>
          <a class="entry" href="https://example.com/p-2">Entry 2</a>
          <a class="entry" href="https://example.com/p-3">Entry 3</a>
        </body></html>`;
      }

      return `<html><body><article>Content for ${url}</article></body></html>`;
    };
    const adapter = new WebUrlAdapter(
      createDeps(httpGet, async () => ({
        siteType: 'listing_page',
        itemLinkSelector: 'a.entry',
        itemIdHint: null,
        contentSelector: 'article',
        paginationSelector: null,
        confidence: 0.9
      }))
    );

    const result = await adapter.fetch(
      { id: 'source-1', type: 'web_urls', value: 'https://example.com/blog' },
      {},
      { limit: 2 } as any
    );

    expect(result.items).toHaveLength(2);
    expect(result.items.map((item) => item.link)).toEqual(['https://example.com/p-1', 'https://example.com/p-2']);
  });
});
