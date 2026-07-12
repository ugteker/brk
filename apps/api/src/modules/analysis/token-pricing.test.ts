import { describe, expect, it } from 'vitest';
import { estimateCostUsd } from './token-pricing';

describe('estimateCostUsd', () => {
  it('computes cost from input/output token counts for a known model', () => {
    // claude-sonnet-4-5: $3/million input, $15/million output
    const cost = estimateCostUsd('claude-sonnet-4-5', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(18);
  });

  it('scales linearly with token counts', () => {
    const cost = estimateCostUsd('claude-sonnet-4-5', 1200, 340);
    expect(cost).toBeCloseTo((1200 * 3 + 340 * 15) / 1_000_000);
  });

  it('returns null for an unrecognized model rather than a wrong estimate', () => {
    expect(estimateCostUsd('some-future-model', 1000, 1000)).toBeNull();
  });

  it('returns 0 for zero token usage on a known model', () => {
    expect(estimateCostUsd('claude-haiku-4-5', 0, 0)).toBe(0);
  });
});
