import { Button, Card, Empty, Input, Skeleton, Typography } from 'antd';
import { FileTextOutlined, SearchOutlined } from '@ant-design/icons';
import type { AgentSummary, RunReportDto } from '../../api/agents';
import type { PlaybookRecord } from '../../api/playbooks';
import type { SourceRecord } from '../../api/sources';
import { FeedCard, groupReportsByDay } from '../../components/FeedCard';
import { getAgentDisplayLabel } from '../../utils/agent-label';
import { getAgentCharacterLabel, getReportEpisodeThumbnailUrl, getSourceCoverImageUrl, getSourceDisplayTitle } from './helpers';

const { Title } = Typography;

type FeedReport = RunReportDto & { agentName: string; playbookName: string };

export function FeedTab({
  t,
  language,
  feedLoading,
  feedReports,
  feedSearch,
  onFeedSearchChange,
  agents,
  sources,
  playbooks,
  onGoToLibrary,
  onOpenFullReport,
  onOpenSource,
  onDiscuss,
  onDismiss
}: {
  t: (key: string, opts?: Record<string, unknown>) => string;
  language: string;
  feedLoading: boolean;
  feedReports: FeedReport[];
  feedSearch: string;
  onFeedSearchChange: (value: string) => void;
  agents: AgentSummary[];
  sources: SourceRecord[];
  playbooks: PlaybookRecord[];
  onGoToLibrary: () => void;
  onOpenFullReport: (report: FeedReport) => void;
  onOpenSource: (source: SourceRecord) => void;
  onDiscuss: (report: FeedReport) => void;
  onDismiss: (report: FeedReport) => void;
}) {
  return (
    <Card className="min-w-0" title={<Title level={4} style={{ margin: 0 }}><FileTextOutlined /> {t('nav.feed')}</Title>}>
      {feedLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} active paragraph={{ rows: 2 }} />)}
        </div>
      ) : feedReports.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <span className="text-5xl">📰</span>
          <div>
            <p className="text-base font-semibold text-gray-800 dark:text-gray-100">{t('nav.feedEmpty')}</p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-xs mx-auto">{t('nav.feedEmptyDesc')}</p>
          </div>
          <Button type="primary" onClick={onGoToLibrary}>{t('nav.library')}</Button>
        </div>
      ) : (() => {
        const normalizedFeedSearch = feedSearch.trim().toLowerCase();
        const searchFilteredReports = !normalizedFeedSearch ? feedReports : feedReports.filter((report) => {
          const playbook = report.playbookId ? playbooks.find((candidate) => candidate.id === report.playbookId) : undefined;
          const source = playbook?.sourceIds.length ? sources.find((candidate) => candidate.id === playbook.sourceIds[0]) : undefined;
          const reportAgent = agents.find((agent) => agent.id === report.agentId);
          const sourceTitle = source ? getSourceDisplayTitle(source) : report.playbookName;
          const characterLabel = reportAgent ? getAgentCharacterLabel(reportAgent) : report.agentName;
          const headline = report.report?.common?.headline ?? '';
          return `${headline} ${report.summary} ${report.agentName} ${sourceTitle} ${characterLabel}`.toLowerCase().includes(normalizedFeedSearch);
        });
        return (
          <>
            <div className="mb-4">
              <Input
                aria-label={t('feed.searchAriaLabel')}
                value={feedSearch}
                onChange={(event) => onFeedSearchChange(event.currentTarget.value)}
                placeholder={t('feed.searchPlaceholder')}
                prefix={<SearchOutlined />}
                allowClear
                style={{ maxWidth: 420 }}
              />
            </div>
            {searchFilteredReports.length === 0 ? (
              <Empty description={t('feed.searchNoResults')} />
            ) : (
              <div className="space-y-6">
                {groupReportsByDay(searchFilteredReports.slice(0, 30)).map((group) => (
                  <div key={group.key} className="space-y-3">
                    <div className="mb-1 flex items-center gap-3">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {group.kind === 'today'
                          ? t('feed.groupToday')
                          : group.kind === 'yesterday'
                            ? t('feed.groupYesterday')
                            : new Date(group.dateISO).toLocaleDateString(language, { year: 'numeric', month: 'short', day: 'numeric' })}
                      </span>
                      <span className="h-px flex-1 bg-border" />
                    </div>
                    {group.reports.map((report) => {
                      const playbook = report.playbookId ? playbooks.find((candidate) => candidate.id === report.playbookId) : undefined;
                      const source = playbook?.sourceIds.length ? sources.find((candidate) => candidate.id === playbook.sourceIds[0]) : undefined;
                      const reportAgent = agents.find((agent) => agent.id === report.agentId);
                      return (
                        <FeedCard
                          key={report.id}
                          report={report}
                          characterType={reportAgent?.characterType}
                          agentName={reportAgent ? getAgentDisplayLabel(reportAgent) : report.agentName}
                          sourceTitle={source ? getSourceDisplayTitle(source) : report.playbookName}
                          sourceCoverImageUrl={(source ? getSourceCoverImageUrl(source) : null) ?? getReportEpisodeThumbnailUrl(report)}
                          isSyntheticSource={source?.type === 'synthetic_discussion'}
                          onOpenFullReport={() => onOpenFullReport(report)}
                          onOpenSource={source ? () => onOpenSource(source) : undefined}
                          onDiscuss={() => onDiscuss(report)}
                          onDismiss={() => onDismiss(report)}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </>
        );
      })()}
    </Card>
  );
}
