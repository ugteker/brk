import { useEffect, useState } from 'react';
import { Button, Empty, Spin, Tag, Typography, message } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { listSymbolSignalHistory, type RunReportDto } from '../api/agents';
import { TradingViewSymbolChart } from '../components/TradingViewSymbolChart';
import { isHttpUrl } from '../utils/links';

const { Title, Paragraph, Text } = Typography;

interface SymbolPerformancePageProps {
  agentId: string;
  symbol: string;
  onBack: () => void;
}

interface SymbolHistoryEntry {
  reportId: string;
  createdAt: string;
  side: 'long' | 'short';
  confidence: number;
  rationale: string;
  citations: string[];
}

function toHistoryEntries(reports: RunReportDto[], symbol: string): SymbolHistoryEntry[] {
  return reports.flatMap((report) =>
    report.signals
      .filter((signal) => signal.symbol === symbol)
      .map((signal) => ({
        reportId: report.id,
        createdAt: report.createdAt,
        side: signal.side,
        confidence: signal.confidence,
        rationale: signal.rationale,
        citations: signal.citations
      }))
  );
}

export function SymbolPerformancePage({ agentId, symbol, onBack }: SymbolPerformancePageProps) {
  const [history, setHistory] = useState<SymbolHistoryEntry[]>([]);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'error'>('idle');

  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    listSymbolSignalHistory(agentId, symbol)
      .then((reports) => {
        if (cancelled) return;
        setHistory(toHistoryEntries(reports, symbol));
        setLoadState('idle');
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadState('error');
        message.error(err instanceof Error ? err.message : 'Failed to load signal history');
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, symbol]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center gap-3">
        <Button icon={<ArrowLeftOutlined />} onClick={onBack} aria-label="Back">
          Back
        </Button>
        <Title level={3} style={{ margin: 0 }}>
          {symbol} performance
        </Title>
      </div>
      <Paragraph type="secondary">
        Real market price chart (via TradingView) alongside this agent&apos;s own historical signal calls for {symbol}.
      </Paragraph>

      <TradingViewSymbolChart symbol={symbol} interval="D" style="1" />

      <div>
        <Title level={4}>Signal history</Title>
        {loadState === 'loading' ? (
          <Spin />
        ) : history.length === 0 ? (
          <Empty description={`No past signals for ${symbol} from this agent yet.`} />
        ) : (
          <div className="space-y-2">
            {history.map((entry) => (
              <div key={`${entry.reportId}-${entry.createdAt}`} className="rounded border border-gray-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <Text type="secondary" className="text-xs">
                    {new Date(entry.createdAt).toLocaleString()}
                  </Text>
                  <div className="flex items-center gap-2">
                    <Tag color={entry.side === 'long' ? 'green' : 'red'}>{entry.side === 'long' ? 'Long' : 'Short'}</Tag>
                    <Tag>{entry.confidence}% confidence</Tag>
                  </div>
                </div>
                <p className="mt-1 text-sm">{entry.rationale}</p>
                {entry.citations.length > 0 ? (
                  <p className="mt-1 text-xs text-gray-500">
                    Sources:{' '}
                    {entry.citations.map((citation, index) => (
                      <span key={citation}>
                        {index > 0 ? ', ' : ''}
                        {isHttpUrl(citation) ? (
                          <a href={citation} target="_blank" rel="noreferrer">
                            {citation}
                          </a>
                        ) : (
                          citation
                        )}
                      </span>
                    ))}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
