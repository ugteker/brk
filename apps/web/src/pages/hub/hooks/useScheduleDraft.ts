import { useCallback, useState } from 'react';
import type { PlaybookRecord } from '../../../api/playbooks';
import type { ScheduleDraft, ScheduleMode } from '../components/ScheduleEditModal';

export interface ScheduleDraftState extends ScheduleDraft {
  apply: (schedule: PlaybookRecord['schedule']) => void;
  reset: (recipients?: string[]) => void;
}

export function useScheduleDraft(): ScheduleDraftState {
  const [mode, setMode] = useState<ScheduleMode>('daily');
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [dailyTime, setDailyTime] = useState('07:30');
  const [timezone, setTimezone] = useState('UTC');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1]);
  const [recipients, setRecipients] = useState<string[]>([]);

  const reset = useCallback((nextRecipients: string[] = []) => {
    setMode('daily');
    setIntervalMinutes(60);
    setDailyTime('07:30');
    setTimezone('UTC');
    setDaysOfWeek([1]);
    setRecipients(nextRecipients);
  }, []);

  const apply = useCallback((schedule: PlaybookRecord['schedule']) => {
    setMode(schedule.mode);
    if (schedule.mode === 'interval') {
      setIntervalMinutes(schedule.intervalMinutes);
    } else if (schedule.mode === 'daily' || schedule.mode === 'weekly') {
      setDailyTime(schedule.dailyTime);
      setTimezone(schedule.timezone);
      setDaysOfWeek(
        schedule.mode === 'weekly' && Array.isArray(schedule.daysOfWeek) && schedule.daysOfWeek.length > 0
          ? schedule.daysOfWeek
          : [1]
      );
    }
  }, []);

  return {
    mode,
    setMode,
    intervalMinutes,
    setIntervalMinutes,
    dailyTime,
    setDailyTime,
    timezone,
    setTimezone,
    daysOfWeek,
    setDaysOfWeek,
    recipients,
    setRecipients,
    apply,
    reset
  };
}
