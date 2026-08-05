import { Button, Input, Modal, Select } from 'antd';
import type { SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { AgentSummary } from '../../api/agents';
import type { PlaybookRecord } from '../../api/playbooks';
import { getAgentDisplayLabel } from '../../utils/agent-label';
import { TIMEZONE_OPTIONS } from './types';

export type ScheduleMode = 'manual' | 'interval' | 'daily' | 'weekly';

/** The shared schedule-form draft (also used by the follow wizard's schedule step). */
export interface ScheduleDraft {
  mode: ScheduleMode;
  setMode: (mode: ScheduleMode) => void;
  intervalMinutes: number;
  setIntervalMinutes: (minutes: number) => void;
  dailyTime: string;
  setDailyTime: (time: string) => void;
  timezone: string;
  setTimezone: (tz: string) => void;
  daysOfWeek: number[];
  setDaysOfWeek: (days: number[]) => void;
  recipients: string[];
  setRecipients: (update: SetStateAction<string[]>) => void;
}

/** Schedule-only edit modal — opened via ✎ on individual playbook cards in the detail panel */
export function ScheduleEditModal({
  open,
  playbook,
  agents,
  draft,
  saving,
  onSave,
  onClose
}: {
  open: boolean;
  playbook: PlaybookRecord | null;
  agents: AgentSummary[];
  draft: ScheduleDraft;
  saving: boolean;
  onSave: () => void | Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      title={playbook ? `${(() => {
        const scheduledAgent = agents.find((agent) => agent.id === playbook.agentId);
        return scheduledAgent ? getAgentDisplayLabel(scheduledAgent) : t('common.edit');
      })()} — ${t('playbook.schedule')}` : t('common.edit')}
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      width="min(480px, 95vw)"
    >
      <div className="space-y-4 pt-2">
        <Select
          aria-label={t('schedule.mode')}
          value={draft.mode}
          onChange={(value) => draft.setMode(value as ScheduleMode)}
          options={[
            { value: 'interval', label: t('schedule.interval') },
            { value: 'daily', label: t('schedule.daily') },
            { value: 'weekly', label: t('schedule.weekly') }
          ]}
          className="w-full"
        />
        {draft.mode === 'interval' ? (
          <Input
            aria-label={t('schedule.intervalAriaLabel')}
            value={String(draft.intervalMinutes)}
            onChange={(event) => draft.setIntervalMinutes(Math.max(15, Number(event.currentTarget.value) || 60))}
            placeholder={t('schedule.intervalPlaceholder')}
          />
        ) : (
          <>
            <div className="grid gap-3 grid-cols-2">
              <Input
                aria-label={t('schedule.dailyTimeAriaLabel')}
                value={draft.dailyTime}
                onChange={(event) => draft.setDailyTime(event.currentTarget.value)}
                placeholder="HH:mm"
              />
              <Select
                aria-label={t('schedule.timezoneAriaLabel')}
                value={draft.timezone}
                onChange={(value) => draft.setTimezone(value)}
                options={TIMEZONE_OPTIONS}
                placeholder={t('schedule.timezonePlaceholder')}
                showSearch
                className="w-full"
              />
            </div>
            {draft.mode === 'weekly' && (
              <Select
                aria-label={t('schedule.daysOfWeekAriaLabel')}
                mode="multiple"
                value={draft.daysOfWeek}
                onChange={(values) => draft.setDaysOfWeek(values as number[])}
                options={[
                  { value: 1, label: t('schedule.days.mon') },
                  { value: 2, label: t('schedule.days.tue') },
                  { value: 3, label: t('schedule.days.wed') },
                  { value: 4, label: t('schedule.days.thu') },
                  { value: 5, label: t('schedule.days.fri') },
                  { value: 6, label: t('schedule.days.sat') },
                  { value: 0, label: t('schedule.days.sun') }
                ]}
                className="w-full"
              />
            )}
          </>
        )}
        <div className="space-y-2">
          <p className="text-sm font-medium">{t('playbook.recipients')}</p>
          {draft.recipients.map((recipient, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={recipient}
                onChange={(e) => {
                  draft.setRecipients((prev) => {
                    const updated = [...prev];
                    updated[index] = e.target.value;
                    return updated;
                  });
                }}
                placeholder="email@example.com"
              />
              <Button
                size="small"
                danger
                onClick={() => draft.setRecipients((prev) => prev.filter((_, i) => i !== index))}
              >
                ✕
              </Button>
            </div>
          ))}
          <Button size="small" onClick={() => draft.setRecipients((prev) => [...prev, ''])}>
            + {t('playbook.addRecipient')}
          </Button>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <Button onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="primary" loading={saving} onClick={() => void onSave()}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
