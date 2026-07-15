import Anthropic from '@anthropic-ai/sdk';
import { renderEvidenceForPrompt } from './prompt-builder';
import { parseClaudeResponse } from './response-parser';
import type { ClaudeAnalysisRequest, ClaudeAnalysisResult } from './types';
import type { CharacterType } from '../agents/types';

export interface ClaudeMessagesClient {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      system: string;
      messages: Array<{ role: 'user'; content: string }>;
    }): Promise<{
      content: Array<{ type: string; text?: string }>;
      stop_reason?: string | null;
      usage?: { input_tokens: number; output_tokens: number };
    }>;
  };
}

function buildSectionShapeInstructions(characterType: CharacterType): string {
  switch (characterType) {
    case 'finance_expert':
      return `"section": { "character_type": "finance_expert", "market_summary": string, "signals": [{ "symbol": string, "side": "long" | "short", "confidence": number (0-100), "rationale": string, "citations": string[] }] }`;
    case 'teacher':
      return `"section": { "character_type": "teacher", "lesson_explanation": string }`;
    case 'trainer':
      return `"section": { "character_type": "trainer", "qa_drill": [{ "question": string, "answer": string }] }`;
    case 'philosopher':
      return `"section": { "character_type": "philosopher", "argument_reflection": string }`;
    case 'influencer':
      return `"section": { "character_type": "influencer", "content_angles": string[], "hooks": string[] }`;
    case 'summarizer':
    default:
      return `"section": { "character_type": "summarizer", "bullet_digest": string[] }`;
  }
}

function buildResponseFormatInstructions(characterType: CharacterType): string {
  return `Respond with ONLY a JSON object matching this shape, no prose outside the JSON:
{
  "common": { "summary": string, "key_takeaways": string[], "sources_used": string[], "citations": string[] },
  ${buildSectionShapeInstructions(characterType)},
  "sourceWarnings": string[],
  "needsHumanReview": boolean
}

Do not include "signals" anywhere unless character_type is finance_expert.
Write "summary" and long text fields tersely: drop filler words, use fragments over full sentences, no pleasantries/hedging. Keep every fact, number, and citation - only cut wordiness.`;
}

const FENCED_CODE_BLOCK_PATTERN = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;

/**
 * Extracts a JSON payload from Claude's raw text response. Despite `RESPONSE_FORMAT_INSTRUCTIONS`
 * asking for "ONLY a JSON object, no prose outside the JSON", Claude sometimes wraps its answer in
 * a markdown code fence (` ```json ... ``` ` or plain ` ``` ... ``` `) anyway - this appears to
 * happen more often with larger/richer evidence (e.g. a full video transcript) than with the small
 * evidence blocks used in tests. Handles, in order: a fenced block (with or without a `json`
 * language tag), and otherwise falls back to the trimmed text as-is (the original behavior) so
 * already-bare JSON keeps working unchanged.
 */
export function extractJsonFromResponseText(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(FENCED_CODE_BLOCK_PATTERN);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  // Defensive fallback: Claude added prose outside the JSON despite instructions not to - extract
  // the first balanced-looking `{...}` block rather than failing outright.
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

export class ClaudeClient {
  private readonly client: ClaudeMessagesClient;

  constructor(options: { apiKey?: string; client?: ClaudeMessagesClient } = {}) {
    this.client = options.client ?? (new Anthropic({ apiKey: options.apiKey }) as unknown as ClaudeMessagesClient);
  }

  async analyze(request: ClaudeAnalysisRequest): Promise<ClaudeAnalysisResult> {
    const userMessage = `${buildResponseFormatInstructions(request.characterType)}\n\nEvidence:\n${renderEvidenceForPrompt(request.evidence)}`;

    const response = await this.client.messages.create({
      model: request.model,
      // 2048 was too low for richer evidence (e.g. a full video transcript) with many signals/
      // citations - Claude would get cut off mid-JSON, producing a syntax error on parse rather
      // than a clear "truncated" error. Raised well above what a typical structured report needs.
      max_tokens: 8192,
      system: request.systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock?.text) {
      throw new Error('Claude response did not contain a text block');
    }

    if (response.stop_reason === 'max_tokens') {
      throw new Error(
        'Claude response was truncated because it hit the max_tokens limit before finishing the JSON payload. Try reducing the amount of evidence for this run (e.g. fewer/shorter sources) or splitting it across multiple agents.'
      );
    }

    let parsed: Parameters<typeof parseClaudeResponse>[0];
    try {
      parsed = JSON.parse(extractJsonFromResponseText(textBlock.text)) as Parameters<typeof parseClaudeResponse>[0];
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Claude response was not valid JSON: ${reason}`);
    }
    const result = parseClaudeResponse(parsed, request.characterType);
    if (response.usage) {
      result.usage = { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
    }
    return result;
  }
}
