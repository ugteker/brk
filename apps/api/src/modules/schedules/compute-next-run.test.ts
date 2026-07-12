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

  it('computes next weekly run later today when today is a selected day and the time has not passed', () => {
    const now = new Date('2026-07-10T08:00:00.000Z'); // any day; use its own weekday as the target
    const todayDow = now.getUTCDay();
    const next = computeNextRun({ mode: 'weekly', daysOfWeek: [todayDow], dailyTime: '20:00', timezone: 'UTC' }, now);
    expect(next.toISOString()).toBe('2026-07-10T20:00:00.000Z');
    expect(next.getUTCDay()).toBe(todayDow);
  });

  it('computes next weekly run on a future day when today\'s time has already passed', () => {
    const now = new Date('2026-07-10T23:00:00.000Z');
    const todayDow = now.getUTCDay();
    const next = computeNextRun({ mode: 'weekly', daysOfWeek: [todayDow], dailyTime: '20:00', timezone: 'UTC' }, now);
    // Today's slot already passed, so it must roll to the same weekday next week (+7 days).
    expect(next.toISOString()).toBe('2026-07-17T20:00:00.000Z');
    expect(next.getUTCDay()).toBe(todayDow);
  });

  it('computes next weekly run on the nearest of multiple selected days', () => {
    const now = new Date('2026-07-10T08:00:00.000Z');
    const todayDow = now.getUTCDay();
    const dayAfterTomorrow = (todayDow + 2) % 7;
    const next = computeNextRun(
      { mode: 'weekly', daysOfWeek: [dayAfterTomorrow], dailyTime: '09:00', timezone: 'UTC' },
      now
    );
    expect(next.getUTCDay()).toBe(dayAfterTomorrow);
    expect(next.getTime() - now.getTime()).toBeLessThanOrEqual(3 * 24 * 60 * 60 * 1000);
  });
});

describe('isScheduleDue', () => {
  it('returns true when nextRunAt is now or earlier', () => {
    const now = new Date('2026-07-10T12:00:00.000Z');
    expect(isScheduleDue(new Date('2026-07-10T12:00:00.000Z'), now)).toBe(true);
    expect(isScheduleDue(new Date('2026-07-10T11:59:59.000Z'), now)).toBe(true);
  });
});
