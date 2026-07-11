import { describe, expect, it } from 'vitest';
import { WebUrlAdapter } from './web-url-adapter';

describe('WebUrlAdapter', () => {
  it('extracts readable text from an article fixture', async () => {
    const httpGet = async (url: string) => {
      expect(url).toBe('https://example.com/article');
      return '<html><body><p>Q3 earnings call: strong company guidance ahead.</p></body></html>';
    };

    const adapter = new WebUrlAdapter(httpGet);
    const evidence = await adapter.fetch({ type: 'web_urls', value: 'https://example.com/article' });

    expect(evidence[0]?.content).toContain('company guidance');
    expect(evidence[0]?.fidelity).toBe('high');
  });
});
