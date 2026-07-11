import { describe, expect, it } from 'vitest';
import { computeNextRun, isScheduleDue } from './compute-next-run';

describe('computeNextRun', () => {
  it('computes interval-based next run', () => {
    const now = new Date('2026-07-10T08:00:00.000Z');
    const next = computeNextRun({ mode: 'interval', intervalMinutes: 120 }, now);
    expect(next.toISOString()).toBe('2026-07-10T10:00:00.000Z');
  });

  it('computes next daily run when time today passed', () => {
    const now = new Date('2026-07-10T23:00:00.000Z');
    const next = computeNextRun({ mode: 'daily', dailyTime: '21:30', timezone: 'UTC' }, now);
    expect(next.toISOString()).toBe('2026-07-11T21:30:00.000Z');
  });
});

describe('isScheduleDue', () => {
  it('returns true when nextRunAt is now or earlier', () => {
    const now = new Date('2026-07-10T12:00:00.000Z');
    expect(isScheduleDue(new Date('2026-07-10T12:00:00.000Z'), now)).toBe(true);
    expect(isScheduleDue(new Date('2026-07-10T11:59:59.000Z'), now)).toBe(true);
  });
});
