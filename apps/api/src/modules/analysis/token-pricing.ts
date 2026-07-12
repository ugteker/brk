/**
 * Static USD-per-million-token pricing for known Claude models, used to give users a rough,
 * best-effort sense of what a run cost - NOT an exact bill (Anthropic's actual invoiced pricing
 * may differ, e.g. due to prompt caching discounts, and this table can go stale if pricing
 * changes). The UI must always present this as an estimate, never as an exact cost.
 */
const PRICING_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-sonnet-4-5-20250929': { input: 3, output: 15 },
  'claude-opus-4-1': { input: 15, output: 75 },
  'claude-opus-4-5': { input: 15, output: 75 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-3-5-sonnet-20241022': { input: 3, output: 15 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4 },
  'claude-3-opus-20240229': { input: 15, output: 75 }
};

/**
 * Estimates the USD cost of a Claude API call from its reported token usage. Returns `null` for
 * models not in the static pricing table above, rather than silently returning a wrong estimate.
 */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const rates = PRICING_PER_MILLION_TOKENS[model];
  if (!rates) return null;
  return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
}
