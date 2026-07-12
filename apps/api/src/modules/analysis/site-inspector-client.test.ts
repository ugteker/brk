import { describe, expect, it, vi } from 'vitest';
import { SITE_INSPECTION_MODEL, SiteInspectorClient, validateSiteProfile } from './site-inspector-client';

function textResponse(text: string) {
  return { content: [{ type: 'text', text }] };
}

describe('SiteInspectorClient', () => {
  it('always uses the fixed dedicated model regardless of caller intent', async () => {
    const create = vi.fn().mockResolvedValue(
      textResponse(
        JSON.stringify({
          siteType: 'listing_page',
          itemLinkSelector: 'a.entry-title',
          itemIdHint: 'url_path',
          contentSelector: 'article',
          paginationSelector: null,
          confidence: 0.9
        })
      )
    );
    const client = new SiteInspectorClient({ client: { messages: { create } } });

    await client.inspect('https://example.com', '<html></html>');

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ model: SITE_INSPECTION_MODEL }));
  });

  it('parses a valid listing_page response', async () => {
    const create = vi.fn().mockResolvedValue(
      textResponse(
        JSON.stringify({
          siteType: 'listing_page',
          itemLinkSelector: 'a.entry-title',
          itemIdHint: 'url_path',
          contentSelector: 'article',
          paginationSelector: '.older-posts',
          confidence: 0.85
        })
      )
    );
    const client = new SiteInspectorClient({ client: { messages: { create } } });

    const profile = await client.inspect('https://example.com', '<html></html>');

    expect(profile).toEqual({
      siteType: 'listing_page',
      itemLinkSelector: 'a.entry-title',
      itemIdHint: 'url_path',
      contentSelector: 'article',
      paginationSelector: '.older-posts',
      confidence: 0.85
    });
  });

  it('returns null for a malformed JSON response', async () => {
    const create = vi.fn().mockResolvedValue(textResponse('not json'));
    const client = new SiteInspectorClient({ client: { messages: { create } } });

    expect(await client.inspect('https://example.com', '<html></html>')).toBeNull();
  });

  it('returns null when the response has no text block', async () => {
    const create = vi.fn().mockResolvedValue({ content: [] });
    const client = new SiteInspectorClient({ client: { messages: { create } } });

    expect(await client.inspect('https://example.com', '<html></html>')).toBeNull();
  });

  it('truncates very large HTML before sending it to Claude', async () => {
    const create = vi.fn().mockResolvedValue(
      textResponse(
        JSON.stringify({
          siteType: 'single_page',
          itemLinkSelector: null,
          itemIdHint: null,
          contentSelector: 'body',
          paginationSelector: null,
          confidence: 0.6
        })
      )
    );
    const client = new SiteInspectorClient({ client: { messages: { create } } });

    await client.inspect('https://example.com', 'x'.repeat(50_000));

    const sentMessage = create.mock.calls[0][0].messages[0].content as string;
    expect(sentMessage.length).toBeLessThan(50_000);
  });
});

describe('validateSiteProfile', () => {
  it('rejects a listing_page with no itemLinkSelector', () => {
    expect(
      validateSiteProfile({
        siteType: 'listing_page',
        itemLinkSelector: null,
        itemIdHint: null,
        contentSelector: 'article',
        paginationSelector: null,
        confidence: 0.9
      })
    ).toBeNull();
  });

  it('accepts a single_page profile without an itemLinkSelector', () => {
    expect(
      validateSiteProfile({
        siteType: 'single_page',
        itemLinkSelector: null,
        itemIdHint: null,
        contentSelector: 'article',
        paginationSelector: null,
        confidence: 0.7
      })
    ).not.toBeNull();
  });

  it('rejects an out-of-range confidence value', () => {
    expect(
      validateSiteProfile({
        siteType: 'single_page',
        itemLinkSelector: null,
        itemIdHint: null,
        contentSelector: 'article',
        paginationSelector: null,
        confidence: 1.5
      })
    ).toBeNull();
  });

  it('rejects a missing contentSelector', () => {
    expect(
      validateSiteProfile({
        siteType: 'single_page',
        itemLinkSelector: null,
        itemIdHint: null,
        contentSelector: '',
        paginationSelector: null,
        confidence: 0.5
      })
    ).toBeNull();
  });

  it('rejects non-object input', () => {
    expect(validateSiteProfile(null)).toBeNull();
    expect(validateSiteProfile('a string')).toBeNull();
  });
});
