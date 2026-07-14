import { describe, expect, it } from 'vitest';
import { parseClaudeResponse, ClaudeResponseParseError } from './response-parser';

describe('parseClaudeResponse', () => {
  it('parses v2 JSON into a normalized finance report', () => {
    const parsed = parseClaudeResponse({
      common: { summary: 'Mixed outlook', key_takeaways: ['Watch margins'], sources_used: ['podcast://ep1'], citations: ['ep1@10:12'] },
      section: {
        character_type: 'finance_expert',
        market_summary: 'Risk-on bias with fragile breadth',
        signals: [{ symbol: 'AAPL', side: 'long', confidence: 81, rationale: '...', citations: ['ep1@10:12'] }]
      }
    }, 'finance_expert');

    expect(parsed.signals[0]?.side).toBe('long');
    expect(parsed.summary).toBe('Mixed outlook');
    expect(parsed.report.common.key_takeaways).toEqual(['Watch margins']);
    expect(parsed.needsHumanReview).toBe(false);
  });

  it('defaults sourceWarnings and needsHumanReview when absent', () => {
    const parsed = parseClaudeResponse({ summary: 'No warnings', signals: [] }, 'finance_expert');
    expect(parsed.sourceWarnings).toEqual([]);
    expect(parsed.needsHumanReview).toBe(false);
  });

  it('throws when finance signals are returned for a non-finance character', () => {
    expect(() =>
      parseClaudeResponse({
        common: { summary: 'bad', key_takeaways: [], sources_used: [], citations: [] },
        section: {
          character_type: 'teacher',
          lesson_explanation: 'x',
          signals: [{ symbol: 'AAPL', side: 'long', confidence: 50, rationale: '', citations: [] }]
        }
      }, 'teacher')
    ).toThrow(ClaudeResponseParseError);
  });

  it('throws when the summary is missing', () => {
    expect(() => parseClaudeResponse({ signals: [] }, 'finance_expert')).toThrow(ClaudeResponseParseError);
  });
});
