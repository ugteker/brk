import { describe, expect, it } from 'vitest';
import { parseClaudeResponse, ClaudeResponseParseError } from './response-parser';

describe('parseClaudeResponse', () => {
  it('parses Claude JSON into structured signals', () => {
    const parsed = parseClaudeResponse({
      summary: 'Mixed outlook',
      signals: [{ symbol: 'AAPL', side: 'long', confidence: 81, rationale: '...', citations: ['ep1@10:12'] }]
    });

    expect(parsed.signals[0]?.side).toBe('long');
    expect(parsed.summary).toBe('Mixed outlook');
    expect(parsed.needsHumanReview).toBe(false);
  });

  it('defaults sourceWarnings and needsHumanReview when absent', () => {
    const parsed = parseClaudeResponse({ summary: 'No warnings', signals: [] });
    expect(parsed.sourceWarnings).toEqual([]);
    expect(parsed.needsHumanReview).toBe(false);
  });

  it('throws when a signal has an invalid side', () => {
    expect(() =>
      parseClaudeResponse({
        summary: 'bad',
        signals: [{ symbol: 'AAPL', side: 'sideways', confidence: 50, rationale: '', citations: [] }]
      })
    ).toThrow(ClaudeResponseParseError);
  });

  it('throws when the summary is missing', () => {
    expect(() => parseClaudeResponse({ signals: [] })).toThrow(ClaudeResponseParseError);
  });
});
