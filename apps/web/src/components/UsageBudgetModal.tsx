import { useEffect, useState } from 'react';
import { Button, InputNumber, Modal, Progress, Spin, Statistic, message } from 'antd';
import { useTranslation } from 'react-i18next';
import { getUsageSummary, setMonthlyBudget, type UsageSummaryDto } from '../api/usage';

interface UsageBudgetModalProps {
  open: boolean;
  onClose: () => void;
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}

/**
 * Month-to-date AI usage (estimated cost + tokens across all of the user's agents) with an
 * editable monthly budget. When spend reaches the budget, new agent runs fail fast with
 * budget_exceeded instead of calling Claude.
 */
export function UsageBudgetModal({ open, onClose }: UsageBudgetModalProps) {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<UsageSummaryDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    getUsageSummary()
      .then((data) => {
        if (cancelled) return;
        setSummary(data);
        setBudgetDraft(data.budgetUsd);
      })
      .catch(() => {
        if (!cancelled) message.error(t('usage.loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, t]);

  async function onSaveBudget() {
    setSaving(true);
    try {
      const updated = await setMonthlyBudget(budgetDraft);
      setSummary(updated);
      setBudgetDraft(updated.budgetUsd);
      message.success(t('usage.budgetSaved'));
    } catch {
      message.error(t('usage.budgetSaveFailed'));
    } finally {
      setSaving(false);
    }
  }

  const spent = summary?.spentUsd ?? 0;
  const budget = summary?.budgetUsd ?? null;
  const percent = budget && budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : null;

  return (
    <Modal open={open} onCancel={onClose} footer={null} title={t('usage.title')}>
      {loading || !summary ? (
        <div className="py-6 text-center">
          <Spin />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-6">
            <Statistic title={t('usage.spentThisMonth')} value={spent} precision={4} prefix="~$" />
            <Statistic title={t('usage.reports')} value={summary.reportCount} />
            <Statistic
              title={t('usage.tokens')}
              value={`${formatTokens(summary.inputTokens)} / ${formatTokens(summary.outputTokens)}`}
            />
          </div>
          {percent !== null ? (
            <div>
              <Progress
                percent={percent}
                status={percent >= 100 ? 'exception' : percent >= 80 ? 'active' : 'normal'}
                strokeColor={percent >= 100 ? '#cf1322' : percent >= 80 ? '#faad14' : '#389e0d'}
              />
              <p className="text-xs text-gray-500">
                {t('usage.budgetProgress', { spent: spent.toFixed(2), budget: (budget ?? 0).toFixed(2) })}
              </p>
              {percent >= 100 ? <p className="text-xs font-medium text-red-500">{t('usage.budgetReached')}</p> : null}
            </div>
          ) : (
            <p className="text-xs text-gray-500">{t('usage.noBudget')}</p>
          )}
          <div>
            <p className="mb-1 text-sm font-medium">{t('usage.budgetLabel')}</p>
            <div className="flex items-center gap-2">
              <InputNumber
                min={1}
                max={1_000_000}
                prefix="$"
                style={{ width: 160 }}
                placeholder={t('usage.budgetPlaceholder')}
                value={budgetDraft}
                onChange={(value) => setBudgetDraft(value ?? null)}
              />
              <Button type="primary" loading={saving} onClick={() => void onSaveBudget()}>
                {t('common.save')}
              </Button>
              {budget !== null ? (
                <Button
                  loading={saving}
                  onClick={() => {
                    setBudgetDraft(null);
                    void setMonthlyBudget(null)
                      .then((updated) => {
                        setSummary(updated);
                        message.success(t('usage.budgetSaved'));
                      })
                      .catch(() => message.error(t('usage.budgetSaveFailed')));
                  }}
                >
                  {t('usage.removeBudget')}
                </Button>
              ) : null}
            </div>
            <p className="mt-1 text-[11px] text-gray-400">{t('usage.budgetHint')}</p>
          </div>
        </div>
      )}
    </Modal>
  );
}
