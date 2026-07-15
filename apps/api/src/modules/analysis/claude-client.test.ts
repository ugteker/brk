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
    const result = await client.analyze({
      model: 'claude-sonnet-4-5',
      characterType: 'finance_expert',
      systemPrompt: 'Analyze for signals',
      evidence
    });

    expect(result.signals[0]?.symbol).toBe('AAPL');
    expect(result.summary).toBe('Mixed outlook');
  });

  it('attaches token usage to the result when Claude reports it', async () => {
    const fakeClient: ClaudeMessagesClient = {
      messages: {
        create: async () => ({
          content: [
            {
              type: 'text',
              text: JSON.stringify({ summary: 's', signals: [], sourceWarnings: [], needsHumanReview: false })
            }
          ],
          usage: { input_tokens: 1500, output_tokens: 420 }
        })
      }
    };

    const client = new ClaudeClient({ client: fakeClient });
    const result = await client.analyze({ model: 'claude-sonnet-4-5', characterType: 'finance_expert', systemPrompt: 'sp', evidence: [] });

    expect(result.usage).toEqual({ inputTokens: 1500, outputTokens: 420 });
  });

  it('omits usage from the result when Claude does not report it', async () => {
    const fakeClient: ClaudeMessagesClient = {
      messages: {
        create: async () => ({
          content: [
            {
              type: 'text',
              text: JSON.stringify({ summary: 's', signals: [], sourceWarnings: [], needsHumanReview: false })
            }
          ]
        })
      }
    };

    const client = new ClaudeClient({ client: fakeClient });
    const result = await client.analyze({ model: 'claude-sonnet-4-5', characterType: 'finance_expert', systemPrompt: 'sp', evidence: [] });

    expect(result.usage).toBeUndefined();
  });

  it('throws when Claude returns no text block', async () => {
    const fakeClient: ClaudeMessagesClient = {
      messages: {
        create: async () => ({ content: [{ type: 'image' }] })
      }
    };

    const client = new ClaudeClient({ client: fakeClient });
    await expect(
      client.analyze({ model: 'claude-sonnet-4-5', characterType: 'finance_expert', systemPrompt: 'sp', evidence: [] })
    ).rejects.toThrow('Claude response did not contain a text block');
  });

  it('parses a response wrapped in a ```json fenced code block', async () => {
    const jsonPayload = JSON.stringify({
      summary: 'Wrapped in a json fence',
      signals: [{ symbol: 'TSLA', side: 'short', confidence: 55, rationale: 'overbought', citations: [] }],
      sourceWarnings: [],
      needsHumanReview: false
    });
    const fakeClient: ClaudeMessagesClient = {
      messages: {
        create: async () => ({
          content: [{ type: 'text', text: '```json\n' + jsonPayload + '\n```' }]
        })
      }
    };

    const client = new ClaudeClient({ client: fakeClient });
    const result = await client.analyze({ model: 'claude-sonnet-4-5', characterType: 'finance_expert', systemPrompt: 'sp', evidence: [] });

    expect(result.summary).toBe('Wrapped in a json fence');
    expect(result.signals[0]?.symbol).toBe('TSLA');
  });

  it('parses a response wrapped in a plain ``` fenced code block with no language tag', async () => {
    const jsonPayload = JSON.stringify({
      summary: 'Wrapped in a plain fence',
      signals: [],
      sourceWarnings: [],
      needsHumanReview: true
    });
    const fakeClient: ClaudeMessagesClient = {
      messages: {
        create: async () => ({
          content: [{ type: 'text', text: '```\n' + jsonPayload + '\n```' }]
        })
      }
    };

    const client = new ClaudeClient({ client: fakeClient });
    const result = await client.analyze({ model: 'claude-sonnet-4-5', characterType: 'finance_expert', systemPrompt: 'sp', evidence: [] });

    expect(result.summary).toBe('Wrapped in a plain fence');
    expect(result.needsHumanReview).toBe(true);
  });

  it('parses a response with stray prose surrounding the JSON object', async () => {
    const jsonPayload = JSON.stringify({
      summary: 'Prose around the JSON',
      signals: [],
      sourceWarnings: [],
      needsHumanReview: false
    });
    const fakeClient: ClaudeMessagesClient = {
      messages: {
        create: async () => ({
          content: [{ type: 'text', text: `Here is the analysis:\n${jsonPayload}\nLet me know if you need anything else.` }]
        })
      }
    };

    const client = new ClaudeClient({ client: fakeClient });
    const result = await client.analyze({ model: 'claude-sonnet-4-5', characterType: 'finance_expert', systemPrompt: 'sp', evidence: [] });

    expect(result.summary).toBe('Prose around the JSON');
  });

  it('throws a clear error when Claude hits the max_tokens limit before finishing the JSON', async () => {
    const fakeClient: ClaudeMessagesClient = {
      messages: {
        create: async () => ({
          content: [{ type: 'text', text: '{"summary": "cut off half way' }],
          stop_reason: 'max_tokens'
        })
      }
    };

    const client = new ClaudeClient({ client: fakeClient });
    await expect(client.analyze({ model: 'claude-sonnet-4-5', characterType: 'finance_expert', systemPrompt: 'sp', evidence: [] })).rejects.toThrow(
      /truncated because it hit the max_tokens limit/
    );
  });

  it('throws a descriptive error (not a raw parser error) when the response text is not valid JSON', async () => {
    const fakeClient: ClaudeMessagesClient = {
      messages: {
        create: async () => ({
          content: [{ type: 'text', text: '{"summary": "broken", "signals": [1, 2' }]
        })
      }
    };

    const client = new ClaudeClient({ client: fakeClient });
    await expect(client.analyze({ model: 'claude-sonnet-4-5', characterType: 'finance_expert', systemPrompt: 'sp', evidence: [] })).rejects.toThrow(
      /Claude response was not valid JSON/
    );
  });
});
