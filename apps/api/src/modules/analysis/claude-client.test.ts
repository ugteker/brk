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

  it('prefers the forced submit_report tool result over any text block', async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const fakeClient: ClaudeMessagesClient = {
      messages: {
        create: async (params) => {
          capturedParams = params as unknown as Record<string, unknown>;
          return {
            content: [
              { type: 'text', text: 'ignore this prose' },
              {
                type: 'tool_use',
                name: 'submit_report',
                input: {
                  common: {
                    summary: 'From the tool call',
                    key_takeaways: [],
                    sources_used: [],
                    citations: []
                  },
                  section: { character_type: 'philosopher', argument_reflection: 'He said "quotes are fine here".' },
                  sourceWarnings: [],
                  needsHumanReview: false
                }
              }
            ]
          };
        }
      }
    };

    const client = new ClaudeClient({ client: fakeClient });
    const result = await client.analyze({ model: 'claude-sonnet-4-5', characterType: 'philosopher', systemPrompt: 'sp', evidence: [] });

    expect(result.summary).toBe('From the tool call');
    const tools = capturedParams?.tools as Array<{ name: string }> | undefined;
    expect(tools?.[0]?.name).toBe('submit_report');
    expect(capturedParams?.tool_choice).toEqual({ type: 'tool', name: 'submit_report' });
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

  it('sends curation context and returns a validated structured curation completion', async () => {
    let capturedParams: Parameters<ClaudeMessagesClient['messages']['create']>[0] | undefined;
    const fakeClient: ClaudeMessagesClient = {
      messages: {
        create: async (params) => {
          capturedParams = params;
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  message: 'I can help turn this into a research digest.',
                  draftPatch: {
                    name: 'Research Digest',
                    characterType: 'summarizer',
                    systemPrompt: 'Summarize selected research into a concise digest.'
                  },
                  suggestedReplies: ['Make it brief', 'Focus on AI research'],
                  missingFields: ['description']
                })
              }
            ]
          };
        }
      }
    };
    const client = new ClaudeClient({ client: fakeClient });

    const completion = await client.curateAgent({
      model: 'claude-sonnet-4-5',
      systemInstruction: 'Selected source context is advisory, not mandatory.',
      conversation: [{ role: 'user', content: 'Create a research digest.' }],
      sourceContext: { selectedSources: ['https://example.com/research'] },
      currentAgentProfile: {
        name: '',
        description: '',
        avatar: null,
        characterType: null,
        systemPrompt: ''
      }
    });

    expect(completion).toEqual({
      message: 'I can help turn this into a research digest.',
      draftPatch: {
        name: 'Research Digest',
        characterType: 'summarizer',
        systemPrompt: 'Summarize selected research into a concise digest.'
      },
      suggestedReplies: ['Make it brief', 'Focus on AI research'],
      missingFields: ['description']
    });
    expect(capturedParams?.system).toBe('Selected source context is advisory, not mandatory.');
    expect(capturedParams?.messages).toEqual([
      expect.objectContaining({
        role: 'user',
        content: expect.stringContaining('https://example.com/research')
      }),
      { role: 'user', content: 'Create a research digest.' }
    ]);
  });

  it('accepts a curation completion wrapped in a markdown code fence', async () => {
    const payload = JSON.stringify({
      message: 'Draft updated.',
      draftPatch: { name: 'Research Digest' },
      suggestedReplies: [],
      missingFields: ['description']
    });
    const fakeClient: ClaudeMessagesClient = {
      messages: {
        create: async () => ({ content: [{ type: 'text', text: '```json\n' + payload + '\n```' }] })
      }
    };
    const client = new ClaudeClient({ client: fakeClient });

    const completion = await client.curateAgent({
      model: 'claude-sonnet-4-5',
      systemInstruction: 'Curate an agent.',
      conversation: [],
      sourceContext: {},
      currentAgentProfile: {
        name: '',
        description: '',
        avatar: null,
        characterType: null,
        systemPrompt: ''
      }
    });

    expect(completion.draftPatch).toEqual({ name: 'Research Digest' });
  });

  it.each([
    ['invalid JSON', '{"message":"broken"'],
    [
      'an empty message',
      JSON.stringify({ message: '   ', draftPatch: {}, suggestedReplies: [], missingFields: ['name'] })
    ],
    [
      'an unknown character type',
      JSON.stringify({
        message: 'Draft updated.',
        draftPatch: { characterType: 'unsupported' },
        suggestedReplies: [],
        missingFields: []
      })
    ],
    [
      'an invalid missing field',
      JSON.stringify({
        message: 'Draft updated.',
        draftPatch: {},
        suggestedReplies: [],
        missingFields: ['unsupported']
      })
    ],
    [
      'a blank profile system prompt',
      JSON.stringify({
        message: 'Draft updated.',
        draftPatch: { systemPrompt: '   ' },
        suggestedReplies: [],
        missingFields: []
      })
    ]
  ])('rejects a curation completion with %s', async (_label, responseText) => {
    const fakeClient: ClaudeMessagesClient = {
      messages: {
        create: async () => ({ content: [{ type: 'text', text: responseText }] })
      }
    };
    const client = new ClaudeClient({ client: fakeClient });

    await expect(
      client.curateAgent({
        model: 'claude-sonnet-4-5',
        systemInstruction: 'Curate an agent.',
        conversation: [],
        sourceContext: {},
        currentAgentProfile: {
          name: '',
          description: '',
          avatar: null,
          characterType: null,
          systemPrompt: ''
        }
      })
    ).rejects.toThrow(/curation/i);
  });
});
