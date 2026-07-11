import Anthropic from '@anthropic-ai/sdk';
import { renderEvidenceForPrompt } from './prompt-builder';
import { parseClaudeResponse } from './response-parser';
import type { ClaudeAnalysisRequest, ClaudeAnalysisResult } from './types';

export interface ClaudeMessagesClient {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      system: string;
      messages: Array<{ role: 'user'; content: string }>;
    }): Promise<{ content: Array<{ type: string; text?: string }> }>;
  };
}

const RESPONSE_FORMAT_INSTRUCTIONS = `Respond with ONLY a JSON object matching this shape, no prose outside the JSON:
{
  "summary": string,
  "signals": [{ "symbol": string, "side": "long" | "short", "confidence": number (0-100), "rationale": string, "citations": string[] }],
  "sourceWarnings": string[],
  "needsHumanReview": boolean
}`;

export class ClaudeClient {
  private readonly client: ClaudeMessagesClient;

  constructor(options: { apiKey?: string; client?: ClaudeMessagesClient } = {}) {
    this.client = options.client ?? (new Anthropic({ apiKey: options.apiKey }) as unknown as ClaudeMessagesClient);
  }

  async analyze(request: ClaudeAnalysisRequest): Promise<ClaudeAnalysisResult> {
    const userMessage = `${RESPONSE_FORMAT_INSTRUCTIONS}\n\nEvidence:\n${renderEvidenceForPrompt(request.evidence)}`;

    const response = await this.client.messages.create({
      model: request.model,
      max_tokens: 2048,
      system: request.systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock?.text) {
      throw new Error('Claude response did not contain a text block');
    }

    const parsed = JSON.parse(textBlock.text) as Parameters<typeof parseClaudeResponse>[0];
    return parseClaudeResponse(parsed);
  }
}
