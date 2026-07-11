import type { EvidenceBlock, SourceAdapter, SourceConfig } from '../types';

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type HttpGet = (url: string) => Promise<string>;

const defaultHttpGet: HttpGet = async (url) => {
  const response = await fetch(url);
  return response.text();
};

export class WebUrlAdapter implements SourceAdapter {
  constructor(private readonly httpGet: HttpGet = defaultHttpGet) {}

  async fetch(source: SourceConfig): Promise<EvidenceBlock[]> {
    const html = await this.httpGet(source.value);
    const content = stripHtml(html);

    const evidence: EvidenceBlock = {
      sourceId: source.value,
      sourceType: 'web_urls',
      sourceRef: source.value,
      content,
      fidelity: 'high',
      citations: [source.value]
    };

    return [evidence];
  }
}
