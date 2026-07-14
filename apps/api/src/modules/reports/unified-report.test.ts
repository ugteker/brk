import { describe, expect, it } from 'vitest';
import { normalizeUnifiedCharacterReport, ReportShapeValidationError } from './unified-report';

describe('normalizeUnifiedCharacterReport', () => {
  it('normalizes legacy finance reports into v2 shape', () => {
    const normalized = normalizeUnifiedCharacterReport({
      characterType: 'finance_expert',
      legacySummary: 'Bullish setup',
      legacySignals: [{ symbol: 'AAPL', side: 'long', confidence: 81, rationale: 'momentum', citations: ['ep1@10:12'] }]
    });

    expect(normalized.common.summary).toBe('Bullish setup');
    expect(normalized.common.key_takeaways).toEqual([]);
    expect(normalized.common.sources_used).toEqual([]);
    expect(normalized.section.character_type).toBe('finance_expert');
    if (normalized.section.character_type !== 'finance_expert') throw new Error('expected finance section');
    expect(normalized.section.signals).toHaveLength(1);
  });

  it('rejects finance signals for non-finance characters', () => {
    expect(() =>
      normalizeUnifiedCharacterReport({
        characterType: 'teacher',
        candidate: {
          common: { summary: 's', key_takeaways: [], sources_used: [], citations: [] },
          section: { character_type: 'teacher', lesson_explanation: 'lesson', signals: [{ symbol: 'AAPL' }] }
        }
      })
    ).toThrow(ReportShapeValidationError);
  });
});
