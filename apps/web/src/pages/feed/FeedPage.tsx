import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { App } from 'antd';
import { useSafeNavigate } from '../../utils/useSafeNavigate';
import { useAppData } from '../../context/AppDataContext';
import { useSymbolView } from '../../hooks/useSymbolView';
import { SymbolPerformancePage } from '../SymbolPerformancePage';
import type { RunReportDto } from '../../api/agents';
import type { SourceRecord } from '../../api/sources';
import type { DiscussionPreselect } from '../../api/discussions';
import { getAgentDisplayLabel } from '../../utils/agent-label';
import { FeedTab } from './FeedTab';
import { ReportDrawer } from '../shared/ReportDrawer';
import { useReportsFeed } from '../shared/useReportsFeed';

/** The Feed hub ("/"): latest reports across all playbooks, with the full-report drawer. */
export function FeedPage() {
  const { t, i18n } = useTranslation();
  const { message } = App.useApp();
  const navigate = useSafeNavigate();
  const { agents, sources, playbooks } = useAppData();
  const { symbolView, setSymbolView } = useSymbolView(agents);
  const [viewingFullReport, setViewingFullReport] = useState<RunReportDto & { agentName: string; playbookName: string } | null>(null);

  const {
    feedReports,
    feedLoading,
    feedSearch,
    setFeedSearch,
    markFeedReportRead,
    dismissFeedReport,
    onResendReportEmail,
    resendingReportId
  } = useReportsFeed({ agents, playbooks, selectedPlaybook: null, executionAgentId: null, message, t });

  /** Opens the shared full-report drawer (report + stats + chat). */
  function openReportDrawer(report: RunReportDto & Partial<{ agentName: string; playbookName: string }>) {
    markFeedReportRead(report);
    const reportAgent = agents.find((a) => a.id === report.agentId);
    const playbook = report.playbookId ? playbooks.find((p) => p.id === report.playbookId) : undefined;
    setViewingFullReport({
      ...report,
      agentName: report.agentName ?? (reportAgent ? getAgentDisplayLabel(reportAgent) : ''),
      playbookName: report.playbookName ?? playbook?.name ?? ''
    });
  }

  // Start a Studio discussion seeded with this report + its agent. The wizard still needs a
  // second participant (discussions require >= 2), so this lands the user in /studio/new with
  // the agent pre-checked rather than creating a discussion outright.
  function openDiscussionFromReport(report: RunReportDto) {
    const contextLabel = (report.report?.common?.headline?.trim() || report.summary || '').slice(0, 80);
    const preselect: DiscussionPreselect = {
      entries: [{ agentId: report.agentId, reportIds: [report.id] }],
      contextLabel
    };
    navigate('/studio/new', { state: { preselect } });
  }

  // Jump from a feed card straight to its source's detail view in the Library page.
  function openSourceInLibrary(source: SourceRecord) {
    navigate(`/library?source=${encodeURIComponent(source.id)}`);
  }

  if (symbolView) {
    return (
      <SymbolPerformancePage
        agentId={symbolView.agentId}
        symbol={symbolView.symbol}
        onBack={() => setSymbolView(null)}
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <FeedTab
        t={t}
        language={i18n.language}
        feedLoading={feedLoading}
        feedReports={feedReports}
        feedSearch={feedSearch}
        onFeedSearchChange={setFeedSearch}
        agents={agents}
        sources={sources}
        playbooks={playbooks}
        onGoToLibrary={() => navigate('/library')}
        onOpenFullReport={openReportDrawer}
        onOpenSource={openSourceInLibrary}
        onDiscuss={openDiscussionFromReport}
        onDismiss={dismissFeedReport}
        onResendEmail={(report) => void onResendReportEmail(report)}
        resendingReportId={resendingReportId}
      />
      <ReportDrawer report={viewingFullReport} onClose={() => setViewingFullReport(null)} />
    </div>
  );
}
