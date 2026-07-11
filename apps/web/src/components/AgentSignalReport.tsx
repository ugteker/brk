import { Progress, Tag, Typography } from 'antd';
import type { SignalDto } from '../api/agents';

const { Paragraph } = Typography;

interface AgentSignalReportProps {
  signals: SignalDto[];
}

function confidenceColor(confidence: number): string {
  if (confidence >= 70) return '#389e0d';
  if (confidence >= 40) return '#d48806';
  return '#cf1322';
}

export function AgentSignalReport({ signals }: AgentSignalReportProps) {
  if (signals.length === 0) {
    return <Paragraph type="secondary">No signals were extracted from this report.</Paragraph>;
  }

  return (
    <div className="space-y-3">
      {signals.map((signal) => (
        <div key={`${signal.symbol}-${signal.side}`} className="flex items-start gap-3 rounded-md border border-gray-200 p-3">
          <Tag color={signal.side === 'long' ? 'green' : 'red'} style={{ fontWeight: 600 }}>
            {signal.symbol}
          </Tag>
          <Tag color={signal.side === 'long' ? 'success' : 'error'}>{signal.side === 'long' ? 'Long' : 'Short'}</Tag>
          <Progress
            type="circle"
            percent={signal.confidence}
            size={40}
            strokeColor={confidenceColor(signal.confidence)}
            format={(percent) => `${percent}%`}
          />
          <div className="flex-1">
            <p className="text-sm">{signal.rationale}</p>
            {signal.citations.length > 0 ? (
              <p className="text-xs text-gray-500">Sources: {signal.citations.join(', ')}</p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
