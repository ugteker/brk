import { useCallback, useEffect, useState } from 'react';
import {
  dismissReport,
  listAgentReports,
  listAgentRuns,
  markReportRead,
  resendReportNotification,
  type AgentSummary,
  type RunDetailDto,
  type RunReportDto
} from '../../../api/agents';
import type { PlaybookRecord } from '../../../api/playbooks';
import { useRealtimeSubscription } from '../../../context/RealtimeContext';
import { getAgentDisplayLabel } from '../../../utils/agent-label';

type FeedReport = RunReportDto & { agentName: string; playbookName: string };

interface UseReportsFeedParams {
  agents: AgentSummary[];
  playbooks: PlaybookRecord[];
  selectedPlaybook: PlaybookRecord | null;
  executionAgentId: string | null;
  message: {
    warning: (content: string) => void;
    success: (content: string) => void;
    error: (content: string) => void;
  };
  t: (key: string, options?: Record<string, unknown>) => string;
}

export function useReportsFeed({
  agents,
  playbooks,
  selectedPlaybook,
  executionAgentId,
  message,
  t
}: UseReportsFeedParams) {
  const [feedReports, setFeedReports] = useState<FeedReport[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedSearch, setFeedSearch] = useState('');
  const [resendingReportId, setResendingReportId] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunDetailDto[]>([]);
  const [reports, setReports] = useState<RunReportDto[]>([]);

  // Load the reports feed — latest reports across all agents linked to my playbooks
  useEffect(() => {
    const agentIds = [...new Set(playbooks.map((p) => p.agentId).filter(Boolean))];
    if (agentIds.length === 0) { setFeedReports([]); return; }
    let alive = true;
    setFeedLoading(true);
    Promise.all(
      agentIds.map(async (agentId) => {
        const reps = await listAgentReports(agentId).catch(() => []);
        const agent = agents.find((a) => a.id === agentId);
        const agentName = agent ? getAgentDisplayLabel(agent) : agentId;
        return reps.map((report) => ({
          ...report,
          agentName,
          playbookName: report.playbookId ? playbooks.find((playbook) => playbook.id === report.playbookId)?.name ?? '' : ''
        }));
      })
    ).then((nested) => {
      if (!alive) return;
      const flat = nested.flat().filter((report) => !report.dismissedAt).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setFeedReports(flat);
      setFeedLoading(false);
    }).catch(() => { if (alive) setFeedLoading(false); });
    return () => { alive = false; };
  }, [playbooks, agents]);

  const reloadExecutionAgentData = useCallback(async () => {
    if (!executionAgentId) {
      setRuns([]);
      setReports([]);
      return;
    }
    try {
      const [nextRuns, nextReports] = await Promise.all([
        listAgentRuns(executionAgentId),
        listAgentReports(executionAgentId)
      ]);
      setRuns(nextRuns);
      setReports(nextReports);
    } catch {
      // Keep the last known snapshot on transient failure; the next matching realtime
      // event or an agent switch will retry the fetch.
    }
  }, [executionAgentId]);

  useEffect(() => {
    reloadExecutionAgentData();
  }, [reloadExecutionAgentData]);

  // Replaces the old per-agent stream: reload only when the changed run/report's agentId
  // (present on run.changed/report.changed events since the backend event payload was
  // extended to carry it) matches the execution agent currently being viewed, so other
  // agents' activity elsewhere in the account doesn't trigger extra fetches here. This
  // works uniformly for brand-new runs/reports too (entityId alone couldn't identify a
  // not-yet-loaded run/report, but agentId is stamped on the event regardless).
  useRealtimeSubscription(['run.changed', 'report.changed'], (event) => {
    if (event.topic === 'resync') {
      reloadExecutionAgentData();
      return;
    }
    if (!executionAgentId) return;
    if (event.agentId === executionAgentId) {
      reloadExecutionAgentData();
    }
  });

  /** Marks a report as read (optimistically in the feed, persisted via the API). */
  function markFeedReportRead(report: Pick<RunReportDto, 'id' | 'agentId' | 'readAt'>) {
    if (report.readAt) return;
    const readAt = new Date().toISOString();
    setFeedReports((prev) => prev.map((r) => (r.id === report.id ? { ...r, readAt } : r)));
    markReportRead(report.agentId, report.id).catch(() => undefined);
  }

  /** Hides a report from the feed (optimistically, persisted via the API). It stays in the Library's report lists. */
  function dismissFeedReport(report: Pick<RunReportDto, 'id' | 'agentId'>) {
    setFeedReports((prev) => prev.filter((r) => r.id !== report.id));
    dismissReport(report.agentId, report.id).catch(() => undefined);
  }

  /** Re-sends the email notification for an already-analysed report to its owning playbook's
   * recipients. Used by the Feed cards and the Episodes tab, which - unlike AgentReportsBrowser -
   * aren't scoped to a single playbook, so the recipients are looked up per-report here. */
  async function onResendReportEmail(report: Pick<RunReportDto, 'id' | 'agentId' | 'playbookId'>) {
    const recipients = report.playbookId ? (playbooks.find((p) => p.id === report.playbookId)?.recipients ?? []) : [];
    if (recipients.length === 0) {
      message.warning(t('library.resendNoRecipients'));
      return;
    }
    setResendingReportId(report.id);
    try {
      const result = await resendReportNotification(report.agentId, report.id, recipients);
      message.success(t('library.resendSuccess', { count: result.recipientCount }));
    } catch (err) {
      message.error(err instanceof Error ? err.message : t('library.resendFailed'));
    } finally {
      setResendingReportId(null);
    }
  }

  return {
    feedReports,
    feedLoading,
    feedSearch,
    setFeedSearch,
    runs,
    reports,
    selectedPlaybookReports: selectedPlaybook
      ? reports.filter((report) => report.playbookId === selectedPlaybook.id)
      : reports,
    reloadExecutionAgentData,
    markFeedReportRead,
    dismissFeedReport,
    onResendReportEmail,
    resendingReportId
  };
}
