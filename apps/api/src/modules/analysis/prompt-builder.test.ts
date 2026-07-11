import { describe, expect, it } from 'vitest';
import { buildAnalysisRequest, renderEvidenceForPrompt } from './prompt-builder';
import type { EvidenceBlock } from './types';

describe('buildAnalysisRequest', () => {
  it('combines the prompt version and evidence into a Claude request', () => {
    const evidence: EvidenceBlock[] = [
      {
        sourceId: 'src-1',
        sourceType: 'web_urls',
        sourceRef: 'https://example.com',
        content: 'company guidance',
        fidelity: 'high',
        citations: ['https://example.com']
      }
    ];

    const request = buildAnalysisRequest({ model: 'claude-sonnet-4-5', systemPrompt: 'Analyze for signals' }, evidence);

    expect(request.model).toBe('claude-sonnet-4-5');
    expect(request.systemPrompt).toBe('Analyze for signals');
    expect(request.evidence).toBe(evidence);
  });

  it('renders evidence blocks into a readable prompt section', () => {
    const evidence: EvidenceBlock[] = [
      {
        sourceId: 'src-1',
        sourceType: 'podcast_feeds',
        sourceRef: 'ep-12',
        content: 'discussion of AAPL',
        fidelity: 'low',
        citations: ['ep-12']
      }
    ];

    const rendered = renderEvidenceForPrompt(evidence);
    expect(rendered).toContain('discussion of AAPL');
    expect(rendered).toContain('fidelity: low');
  });
});
