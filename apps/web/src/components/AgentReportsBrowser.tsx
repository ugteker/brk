import { Card, Empty, Progress, Tag } from 'antd';
import type { RunReportDto, SignalDto } from '../api/agents';

interface AgentReportsBrowserProps {
  reports: RunReportDto[];
  onSelectReport?: (report: RunReportDto) => void;
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

export function AgentReportsBrowser({ reports, onSelectReport }: AgentReportsBrowserProps) {
  if (reports.length === 0) {
    return <Empty description="No reports yet. Reports appear here after the agent's first successful run." />;
  }

  return (
    <div className="space-y-3">
      {reports.map((report) => {
        const confidence = averageSignalConfidence(report.signals);
        return (
          <Card
            key={report.id}
            size="small"
            style={{ width: '100%', cursor: onSelectReport ? 'pointer' : 'default' }}
            hoverable={Boolean(onSelectReport)}
            onClick={() => onSelectReport?.(report)}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <p className="text-xs text-gray-500">{new Date(report.createdAt).toLocaleString()}</p>
                <h4 className="text-base font-semibold">{deriveReportHeadline(report.summary)}</h4>
                <div className="mt-1 flex flex-wrap gap-1">
                  {report.signals.map((signal) => (
                    <Tag key={`${report.id}-${signal.symbol}`} color={signal.side === 'long' ? 'green' : 'red'}>
                      {signal.symbol} · {signal.side === 'long' ? 'Long' : 'Short'}
                    </Tag>
                  ))}
                  {report.needsHumanReview ? <Tag color="gold">Needs review</Tag> : null}
                </div>
              </div>
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
          </Card>
        );
      })}
    </div>
  );
}
