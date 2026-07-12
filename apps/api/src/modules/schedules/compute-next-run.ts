import type { ScheduleInput } from '../agents/types';

export function computeNextRun(schedule: ScheduleInput, now: Date): Date {
  if (schedule.mode === 'interval') {
    return new Date(now.getTime() + schedule.intervalMinutes * 60_000);
  }

  const [hours, minutes] = schedule.dailyTime.split(':').map(Number);

  if (schedule.mode === 'weekly') {
    if (schedule.daysOfWeek.length === 0) {
      throw new Error('weekly schedule requires at least one day of week');
    }
    const days = [...new Set(schedule.daysOfWeek)].sort((a, b) => a - b);
    const candidate = new Date(now);
    candidate.setUTCHours(hours, minutes, 0, 0);

    // Scan forward at most 8 days (today + a full week) to find the next day-of-week match that
    // is still in the future once the time-of-day is applied.
    for (let offset = 0; offset <= 7; offset += 1) {
      const check = new Date(candidate);
      check.setUTCDate(check.getUTCDate() + offset);
      if (days.includes(check.getUTCDay()) && check > now) {
        return check;
      }
    }
    // Unreachable in practice (guaranteed to find a match within 7 days), but keeps the function
    // total rather than possibly returning undefined.
    return candidate;
  }

  const next = new Date(now);
  next.setUTCHours(hours, minutes, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

export function isScheduleDue(nextRunAt: Date, now: Date): boolean {
  return nextRunAt.getTime() <= now.getTime();
}
