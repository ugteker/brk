import { Drawer, Empty } from 'antd';
import { useTranslation } from 'react-i18next';
import type { RunReportDto } from '../../../api/agents';
import { CharacterReportRenderer } from '../../../components/CharacterReportRenderer';
import { ReportChatPanel } from '../../../components/ReportChatPanel';

export type FullReportView = RunReportDto & { agentName: string; playbookName: string };

/** The shared full-report drawer (report + stats + chat), openable from any tab. */
export function ReportDrawer({ report, onClose }: { report: FullReportView | null; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Drawer
      open={Boolean(report)}
      onClose={onClose}
      destroyOnHidden
      width={620}
      placement="right"
      title={report
        ? (report.report?.common?.headline?.trim() || report.summary)
        : undefined}
      styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' } }}
    >
      {/* Scrollable report content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {(() => {
          const drawerCommon = report?.report?.common;
          const toPercent = (value?: number) => {
            if (!value || value <= 0) return null;
            return Math.round(value <= 1 ? value * 100 : Math.min(100, value));
          };
          const stats = [
            { key: 'relevance', label: t('report.relevanceLabel'), value: toPercent(drawerCommon?.relevance), fill: 'bg-violet-500' },
            { key: 'confidence', label: t('report.confidenceLabel'), value: toPercent(drawerCommon?.confidence), fill: 'bg-emerald-500' }
          ].filter((stat) => stat.value !== null);
          if (stats.length === 0) return null;
          return (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-b border-border px-6 py-4">
              {stats.map((stat) => (
                <div key={stat.key}>
                  <div className="flex items-baseline justify-between text-[11px]">
                    <span className="font-medium text-muted-foreground">{stat.label}</span>
                    <span className="font-semibold tabular-nums text-foreground">{stat.value} %</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full ${stat.fill}`} style={{ width: `${stat.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
        <div className="p-6">
          {report?.report
            ? <CharacterReportRenderer report={report.report} />
            : <Empty description={t('feedCard.noFullReport')} />}
        </div>
      </div>
      {/* Fixed chat panel at bottom */}
      {report ? (
        <div className="shrink-0 border-t border-border p-4">
          <ReportChatPanel
            agentId={report.agentId}
            reportId={report.id}
            collapsible
          />
        </div>
      ) : null}
    </Drawer>
  );
}
