import { describe, expect, it } from 'vitest';
import { ClaudeClient, type ClaudeMessagesClient } from './claude-client';
import type { EvidenceBlock } from './types';

describe('ClaudeClient', () => {
  it('sends evidence to Claude and parses the structured response', async () => {
    const fakeClient: ClaudeMessagesClient = {
      messages: {
        create: async (params) => {
          expect(params.model).toBe('claude-sonnet-4-5');
          expect(params.system).toBe('Analyze for signals');
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  summary: 'Mixed outlook',
                  signals: [{ symbol: 'AAPL', side: 'long', confidence: 81, rationale: 'strong guidance', citations: ['ep1@10:12'] }],
                  sourceWarnings: [],
                  needsHumanReview: false
                })
              }
            ]
          };
        }
      }
    };

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

    const client = new ClaudeClient({ client: fakeClient });
    const result = await client.analyze({ model: 'claude-sonnet-4-5', systemPrompt: 'Analyze for signals', evidence });

    expect(result.signals[0]?.symbol).toBe('AAPL');
    expect(result.summary).toBe('Mixed outlook');
  });

  it('throws when Claude returns no text block', async () => {
    const fakeClient: ClaudeMessagesClient = {
      messages: {
        create: async () => ({ content: [{ type: 'image' }] })
      }
    };

    const client = new ClaudeClient({ client: fakeClient });
    await expect(
      client.analyze({ model: 'claude-sonnet-4-5', systemPrompt: 'sp', evidence: [] })
    ).rejects.toThrow('Claude response did not contain a text block');
  });
});
