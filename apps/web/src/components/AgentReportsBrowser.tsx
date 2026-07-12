import { useEffect, useRef, useState } from 'react';
import { Button, Card, Empty, Progress, Tag, message } from 'antd';
import { MailOutlined } from '@ant-design/icons';
import { resendReportNotification, type RunReportDto, type SignalDto } from '../api/agents';
import { TouchSafeTooltip } from './TouchSafeTooltip';

interface AgentReportsBrowserProps {
  agentId: string;
  reports: RunReportDto[];
  onSelectReport?: (report: RunReportDto) => void;
  onSelectSymbol?: (symbol: string) => void;
  highlightedReportId?: string | null;
}

const HEADLINE_MAX_LENGTH = 80;

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

export function AgentReportsBrowser({ agentId, reports, onSelectReport, onSelectSymbol, highlightedReportId }: AgentReportsBrowserProps) {
  const highlightedRef = useRef<HTMLDivElement | null>(null);
  const [sendingReportId, setSendingReportId] = useState<string | null>(null);

  // Scroll the highlighted report into view whenever it changes (e.g. navigated here from the
  // Runs tab's "View report" button) so the user doesn't have to hunt for it in a long list.
  useEffect(() => {
    if (highlightedReportId && highlightedRef.current) {
      highlightedRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedReportId]);

  async function onResendNotification(reportId: string, event: React.MouseEvent) {
    event.stopPropagation();
    setSendingReportId(reportId);
    try {
      const result = await resendReportNotification(agentId, reportId);
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
                <div className="mt-1 flex flex-wrap gap-1">
                  {report.signals.map((signal) => (
                    <Tag
                      key={`${report.id}-${signal.symbol}`}
                      color={signal.side === 'long' ? 'green' : 'red'}
                      style={onSelectSymbol ? { cursor: 'pointer' } : undefined}
                      onClick={
                        onSelectSymbol
                          ? (event) => {
                              event.stopPropagation();
                              onSelectSymbol(signal.symbol);
                            }
                          : undefined
                      }
                    >
                      {signal.symbol} · {signal.side === 'long' ? 'Long' : 'Short'}
                    </Tag>
                  ))}
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
          </Card>
        );
      })}
    </div>
  );
}
