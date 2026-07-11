import type { EvidenceBlock, SourceAdapter, SourceConfig } from '../types';
import type { HttpGet } from './web-url-adapter';

function extractTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? match[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : null;
}

function extractTranscriptUrl(xml: string): string | null {
  const match = xml.match(/<podcast:transcript[^>]*url="([^"]+)"[^>]*\/?>/i);
  return match ? match[1] : null;
}

export class PodcastFeedAdapter implements SourceAdapter {
  constructor(private readonly httpGet: HttpGet) {}

  async fetch(source: SourceConfig): Promise<EvidenceBlock[]> {
    const feedXml = await this.httpGet(source.value);
    const title = extractTag(feedXml, 'title') ?? source.value;
    const description = extractTag(feedXml, 'description') ?? '';
    const transcriptUrl = extractTranscriptUrl(feedXml);

    if (transcriptUrl) {
      try {
        const transcript = await this.httpGet(transcriptUrl);
        if (transcript.trim().length > 0) {
          return [
            {
              sourceId: source.value,
              sourceType: 'podcast_feeds',
              sourceRef: transcriptUrl,
              content: transcript.trim(),
              fidelity: 'high',
              citations: [transcriptUrl]
            }
          ];
        }
      } catch {
        // fall through to show notes below
      }
    }

    return [
      {
        sourceId: source.value,
        sourceType: 'podcast_feeds',
        sourceRef: source.value,
        content: `${title}. ${description}`.trim(),
        fidelity: 'low',
        citations: [source.value]
      }
    ];
  }
}
