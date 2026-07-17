import { describe, expect, it } from 'vitest';
import { sanitizeDiscussionTurnText } from './sanitize-turn-text';

describe('sanitizeDiscussionTurnText', () => {
  it('passes plain conversational text through unchanged', () => {
    const text = "I think NVDA's guidance was strong this quarter, and I'm bullish here.";
    expect(sanitizeDiscussionTurnText(text)).toBe(text);
  });

  it('trims surrounding whitespace from plain text', () => {
    expect(sanitizeDiscussionTurnText('  Hello there.  \n')).toBe('Hello there.');
  });

  it('extracts a plausible spoken-text field from a bare JSON object', () => {
    const raw = JSON.stringify({ content: "Well, I'd push back on that." });
    expect(sanitizeDiscussionTurnText(raw)).toBe("Well, I'd push back on that.");
  });

  it('extracts from a fenced ```json code block', () => {
    const raw = '```json\n' + JSON.stringify({ message: 'Fair point, but consider the downside risk.' }) + '\n```';
    expect(sanitizeDiscussionTurnText(raw)).toBe('Fair point, but consider the downside risk.');
  });

  it('extracts from a nested common.summary field (mirrors the report-pipeline JSON shape)', () => {
    const raw = JSON.stringify({
      common: { summary: 'NVDA remains a buy given strong data center demand.', key_takeaways: [], sources_used: [], citations: [] },
      section: { character_type: 'finance_expert', market_summary: 'Strong.', signals: [] }
    });
    expect(sanitizeDiscussionTurnText(raw)).toBe('NVDA remains a buy given strong data center demand.');
  });

  it('extracts from a nested section field (e.g. market_summary/lesson_explanation) when common.summary is absent', () => {
    const raw = JSON.stringify({ section: { character_type: 'finance_expert', market_summary: 'Semis are rallying hard.', signals: [] } });
    expect(sanitizeDiscussionTurnText(raw)).toBe('Semis are rallying hard.');
  });

  it('falls back to the original raw text when JSON has no plausible spoken-text field', () => {
    const raw = JSON.stringify({ signals: [{ symbol: 'AAPL' }] });
    expect(sanitizeDiscussionTurnText(raw)).toBe(raw);
  });

  it('falls back to the original raw text when the text is not valid JSON at all', () => {
    const raw = 'Not JSON at all, just a normal sentence with a { brace } in it.';
    expect(sanitizeDiscussionTurnText(raw)).toBe(raw);
  });

  it('handles an unlabeled fenced code block (no "json" language tag)', () => {
    const raw = '```\n' + JSON.stringify({ text: 'Spoken text here.' }) + '\n```';
    expect(sanitizeDiscussionTurnText(raw)).toBe('Spoken text here.');
  });
});
