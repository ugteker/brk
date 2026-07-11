import type { ScheduleInput } from '../agents/types';

export function computeNextRun(schedule: ScheduleInput, now: Date): Date {
  if (schedule.mode === 'interval') {
    return new Date(now.getTime() + schedule.intervalMinutes * 60_000);
  }

  const [hours, minutes] = schedule.dailyTime.split(':').map(Number);
  const next = new Date(now);
  next.setUTCHours(hours, minutes, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

export function isScheduleDue(nextRunAt: Date, now: Date): boolean {
  return nextRunAt.getTime() <= now.getTime();
}
