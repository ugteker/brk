import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Empty, Progress, Tag, message } from 'antd';
import { MailOutlined } from '@ant-design/icons';
import { resendReportNotification, type RunReportDto, type SignalDto } from '../api/agents';
import { TouchSafeTooltip } from './TouchSafeTooltip';
import { TradingViewSymbolChart } from './TradingViewSymbolChart';
import { CharacterReportRenderer } from './CharacterReportRenderer';

interface AgentReportsBrowserProps {
  agentId: string;
  reports: RunReportDto[];
  onSelectReport?: (report: RunReportDto) => void;
  onSelectSymbol?: (symbol: string) => void;
  highlightedReportId?: string | null;
}

const HEADLINE_MAX_LENGTH = 80;
const TOKEN_FORMATTER = new Intl.NumberFormat('de-DE');

function formatTokenCount(value: number): string {
  return TOKEN_FORMATTER.format(value);
}

export function deriveReportHeadline(summary: string): string {
  const trimmed = summary.trim();
  if (trimmed.length <= HEADLINE_MAX_LENGTH) return trimmed;
  return `${trimmed.slice(0, HEADLINE_MAX_LENGTH - 3)}...`;
}

export function averageSignalConfidence(signals: SignalDto[]): number {
  if (signals.length === 0) return 0;
  return Math.round(signals.reduce((sum, signal) => sum + signal.confidence, 0) / signals.length);
}

function confidenceColor(confidence: number): string {
  if (confidence >= 70) return '#389e0d';
  if (confidence >= 40) return '#d48806';
  return '#cf1322';
}

/** Formats an "(est.)"-labeled AI stats line for a single report, falling back to "n/a" for any
 * field missing (e.g. reports saved before this feature shipped had no usage/model data). */
export function formatReportAiStats(report: RunReportDto): string {
  const modelPart = report.model ? `Claude ${report.model}` : 'Claude n/a';
  const versionPart = report.promptVersionNumber != null ? `v${report.promptVersionNumber}` : 'v n/a';
  const inPart = report.inputTokens != null ? formatTokenCount(report.inputTokens) : 'n/a';
  const outPart = report.outputTokens != null ? formatTokenCount(report.outputTokens) : 'n/a';
  const costPart = report.estimatedCostUsd != null ? `~$${report.estimatedCostUsd.toFixed(4)} (est.)` : 'n/a';
  return `${modelPart} · ${versionPart} · ${inPart} in / ${outPart} out · ${costPart}`;
}

interface AiTotals {
  reportCountWithUsage: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalEstimatedCostUsd: number;
  hasAnyCost: boolean;
}

export function computeAiTotals(reports: RunReportDto[]): AiTotals {
  let reportCountWithUsage = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalEstimatedCostUsd = 0;
  let hasAnyCost = false;

  for (const report of reports) {
    if (report.inputTokens != null || report.outputTokens != null) {
      reportCountWithUsage += 1;
      totalInputTokens += report.inputTokens ?? 0;
      totalOutputTokens += report.outputTokens ?? 0;
    }
    if (report.estimatedCostUsd != null) {
      hasAnyCost = true;
      totalEstimatedCostUsd += report.estimatedCostUsd;
    }
  }

  return { reportCountWithUsage, totalInputTokens, totalOutputTokens, totalEstimatedCostUsd, hasAnyCost };
}

export function AgentReportsBrowser({ agentId, reports, onSelectReport, onSelectSymbol, highlightedReportId }: AgentReportsBrowserProps) {
  const highlightedRef = useRef<HTMLDivElement | null>(null);
  const [sendingReportId, setSendingReportId] = useState<string | null>(null);
  // Only one inline chart is shown at a time across the whole list; keyed by `${reportId}:${symbol}`
  // so re-clicking the same tag collapses it, and clicking a different tag (even on another
  // report) closes whichever chart was previously open.
  const [expandedChartKey, setExpandedChartKey] = useState<string | null>(null);

  const aiTotals = useMemo(() => computeAiTotals(reports), [reports]);

  // Scroll the highlighted report into view whenever it changes (e.g. navigated here from the
  // Runs tab's "View report" button) so the user doesn't have to hunt for it in a long list.
  useEffect(() => {
    if (highlightedReportId && highlightedRef.current) {
      highlightedRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedReportId]);

  function onToggleChart(key: string, event: React.MouseEvent) {
    event.stopPropagation();
    setExpandedChartKey((prev) => (prev === key ? null : key));
  }

  async function onResendNotification(reportId: string, event: React.MouseEvent) {
    event.stopPropagation();
    setSendingReportId(reportId);
    try {
      const result = await resendReportNotification(agentId, reportId, []);
      message.success(`Notification sent to ${result.recipientCount} recipient${result.recipientCount === 1 ? '' : 's'}`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to send notification');
    } finally {
      setSendingReportId(null);
    }
  }

  if (reports.length === 0) {
    return <Empty description="No reports yet. Reports appear here after the agent's first successful run." />;
  }

  return (
    <div className="space-y-3">
      {aiTotals.reportCountWithUsage > 0 || aiTotals.hasAnyCost ? (
        <p className="text-xs text-gray-500" data-testid="ai-totals">
          Total AI usage across {reports.length} report{reports.length === 1 ? '' : 's'}:{' '}
          {formatTokenCount(aiTotals.totalInputTokens)} in / {formatTokenCount(aiTotals.totalOutputTokens)} out tokens
          {aiTotals.hasAnyCost ? ` · ~$${aiTotals.totalEstimatedCostUsd.toFixed(4)} (est.)` : ''}
        </p>
      ) : null}
      {reports.map((report) => {
        const confidence = averageSignalConfidence(report.signals);
        const isHighlighted = report.id === highlightedReportId;
        return (
          <Card
            key={report.id}
            ref={isHighlighted ? highlightedRef : undefined}
            size="small"
            style={{
              width: '100%',
              cursor: onSelectReport ? 'pointer' : 'default',
              boxShadow: isHighlighted ? '0 0 0 2px #1677ff' : undefined,
              transition: 'box-shadow 0.3s ease'
            }}
            hoverable={Boolean(onSelectReport)}
            onClick={() => onSelectReport?.(report)}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <p className="text-xs text-gray-500">{new Date(report.createdAt).toLocaleString()}</p>
                <h4 className="text-base font-semibold">{deriveReportHeadline(report.summary)}</h4>
                <p className="text-xs text-gray-400" data-testid={`ai-stats-${report.id}`}>
                  {formatReportAiStats(report)}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {report.signals.map((signal) => {
                    const chartKey = `${report.id}:${signal.symbol}`;
                    return (
                      <Tag
                        key={chartKey}
                        color={signal.side === 'long' ? 'green' : 'red'}
                        style={{ cursor: 'pointer' }}
                        onClick={(event) => onToggleChart(chartKey, event)}
                      >
                        {signal.symbol} · {signal.side === 'long' ? 'Long' : 'Short'}
                      </Tag>
                    );
                  })}
                  {report.needsHumanReview ? <Tag color="gold">Needs review</Tag> : null}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <TouchSafeTooltip title="Re-send email notification">
                  <Button
                    aria-label="Re-send email notification"
                    shape="circle"
                    icon={<MailOutlined />}
                    loading={sendingReportId === report.id}
                    onClick={(event) => onResendNotification(report.id, event)}
                  />
                </TouchSafeTooltip>
                <div className="flex flex-col items-center">
                  <Progress
                    type="circle"
                    percent={confidence}
                    size={48}
                    strokeColor={confidenceColor(confidence)}
                    format={(percent) => `${percent}%`}
                  />
                  <span className="mt-1 text-xs text-gray-500">Confidence</span>
                </div>
              </div>
            </div>
            {report.report ? <CharacterReportRenderer report={report.report} /> : null}
            {report.signals.map((signal) => {
              const chartKey = `${report.id}:${signal.symbol}`;
              if (expandedChartKey !== chartKey) return null;
              return (
                <div key={chartKey} className="mt-3" onClick={(event) => event.stopPropagation()}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm font-medium">{signal.symbol} · Weekly line chart</span>
                    <div className="flex items-center gap-2">
                      {onSelectSymbol ? (
                        <Button size="small" type="link" onClick={() => onSelectSymbol(signal.symbol)}>
                          View full performance
                        </Button>
                      ) : null}
                      <Button size="small" onClick={(event) => onToggleChart(chartKey, event)}>
                        Close
                      </Button>
                    </div>
                  </div>
                  <TradingViewSymbolChart symbol={signal.symbol} interval="W" style="2" height={640} />
                </div>
              );
            })}
          </Card>
        );
      })}
    </div>
  );
}
