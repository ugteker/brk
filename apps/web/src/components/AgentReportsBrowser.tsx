import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Empty, Input, Progress, Tag, message } from 'antd';
import { AudioOutlined, DownOutlined, MailOutlined, MessageOutlined, StarFilled, StarOutlined, UpOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { resendReportNotification, type RunReportDto, type SignalDto } from '../api/agents';
import { getCharacterTypeColor } from '../data/character-types';
import { TouchSafeTooltip } from './TouchSafeTooltip';
import { TradingViewSymbolChart } from './TradingViewSymbolChart';
import { CharacterReportRenderer } from './CharacterReportRenderer';
import { ReportChatPanel } from './ReportChatPanel';
import { addToWatchlist, listWatchlist, removeFromWatchlist } from '../api/watchlist';

interface AgentReportsBrowserProps {
  agentId: string;
  agentName?: string;
  reports: RunReportDto[];
  collapsible?: boolean;
  onSelectReport?: (report: RunReportDto) => void;
  onSelectSymbol?: (symbol: string) => void;
  highlightedReportId?: string | null;
}

// Emoji/label only - pill color now comes from the shared getCharacterTypeColor() so it
// stays in sync with the Agents hub instead of drifting into its own local map.
const CHARACTER_LABELS: Record<string, { emoji: string; label: string }> = {
  finance_expert: { emoji: '📈', label: 'Finance Expert' },
  teacher:        { emoji: '🎓', label: 'Teacher' },
  influencer:     { emoji: '📣', label: 'Influencer' },
  trainer:        { emoji: '💪', label: 'Trainer' },
  philosopher:    { emoji: '🦉', label: 'Philosopher' },
  summarizer:     { emoji: '📋', label: 'Summarizer' },
};

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

export function AgentReportsBrowser({ agentId, agentName, reports, collapsible, onSelectReport, onSelectSymbol, highlightedReportId }: AgentReportsBrowserProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const highlightedRef = useRef<HTMLDivElement | null>(null);
  const [sendingReportId, setSendingReportId] = useState<string | null>(null);
  const [expandedReportIds, setExpandedReportIds] = useState<Set<string>>(() =>
    collapsible && reports.length === 1 ? new Set([reports[0].id]) : new Set()
  );
  // Only one inline chart is shown at a time across the whole list; keyed by `${reportId}:${symbol}`
  // so re-clicking the same tag collapses it, and clicking a different tag (even on another
  // report) closes whichever chart was previously open.
  const [expandedChartKey, setExpandedChartKey] = useState<string | null>(null);
  // Only one report's "Ask the analyst" chat is open at a time.
  const [openChatReportId, setOpenChatReportId] = useState<string | null>(null);
  // The user's watched symbols (uppercase). Star toggles on signal tags follow/unfollow a symbol;
  // followed symbols trigger an email alert whenever they appear in any new report.
  const [watchedSymbols, setWatchedSymbols] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    listWatchlist()
      .then((entries) => {
        if (!cancelled) setWatchedSymbols(new Set(entries.map((entry) => entry.symbol)));
      })
      .catch(() => {
        // Watchlist stars are a progressive enhancement - reports stay fully usable without them.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onToggleWatch(symbol: string, event: React.MouseEvent) {
    event.stopPropagation();
    const normalized = symbol.trim().toUpperCase();
    const isWatched = watchedSymbols.has(normalized);
    // Optimistic toggle; reverted on failure.
    setWatchedSymbols((prev) => {
      const next = new Set(prev);
      if (isWatched) { next.delete(normalized); } else { next.add(normalized); }
      return next;
    });
    try {
      if (isWatched) {
        await removeFromWatchlist(normalized);
        message.success(t('watchlist.removed', { symbol: normalized }));
      } else {
        await addToWatchlist(normalized);
        message.success(t('watchlist.added', { symbol: normalized }));
      }
    } catch {
      setWatchedSymbols((prev) => {
        const next = new Set(prev);
        if (isWatched) { next.add(normalized); } else { next.delete(normalized); }
        return next;
      });
      message.error(t('watchlist.toggleFailed'));
    }
  }
  // Tracks user-overridden symbols (e.g. "AAPL" → "NASDAQ:AAPL") per chart key so the user can
  // fix "This symbol doesn't exist" errors by adding the exchange prefix themselves.
  const [symbolOverrides, setSymbolOverrides] = useState<Record<string, string>>({});
  const [symbolInputDraft, setSymbolInputDraft] = useState<Record<string, string>>({});

  const aiTotals = useMemo(() => computeAiTotals(reports), [reports]);

  // Scroll the highlighted report into view whenever it changes (e.g. navigated here from the
  // Runs tab's "View report" button) so the user doesn't have to hunt for it in a long list.
  useEffect(() => {
    if (highlightedReportId && highlightedRef.current) {
      highlightedRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedReportId]);

  function onToggleChart(key: string, symbol: string, event: React.MouseEvent) {
    event.stopPropagation();
    setExpandedChartKey((prev) => {
      if (prev === key) return null;
      // Initialise the input draft with whatever symbol we have (override or original)
      setSymbolInputDraft((d) => ({ ...d, [key]: symbolOverrides[key] ?? symbol }));
      return key;
    });
  }

  function onApplySymbolOverride(key: string) {
    const draft = (symbolInputDraft[key] ?? '').trim();
    if (!draft) return;
    setSymbolOverrides((prev) => ({ ...prev, [key]: draft }));
  }

  function onToggleExpand(reportId: string, event: React.MouseEvent) {
    event.stopPropagation();
    setExpandedReportIds((prev) => {
      const next = new Set(prev);
      if (next.has(reportId)) { next.delete(reportId); } else { next.add(reportId); }
      return next;
    });
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

  function onDiscussReport(report: RunReportDto, event: React.MouseEvent) {
    event.stopPropagation();
    navigate('/studio/new', {
      state: {
        preselect: {
          entries: [{ agentId, reportIds: [report.id] }],
          contextLabel: deriveReportHeadline(report.summary)
        }
      }
    });
  }

  if (reports.length === 0) {
    return <Empty description="No reports yet. Reports appear here after the agent's first successful run." />;
  }

  return (
    <div className="space-y-3">
      {aiTotals.reportCountWithUsage > 0 || aiTotals.hasAnyCost ? (
        <p className="text-xs text-muted-foreground" data-testid="ai-totals">
          Total AI usage across {reports.length} report{reports.length === 1 ? '' : 's'}:{' '}
          {formatTokenCount(aiTotals.totalInputTokens)} in / {formatTokenCount(aiTotals.totalOutputTokens)} out tokens
          {aiTotals.hasAnyCost ? ` · ~$${aiTotals.totalEstimatedCostUsd.toFixed(4)} (est.)` : ''}
        </p>
      ) : null}
      {reports.map((report) => {
        const confidence = averageSignalConfidence(report.signals);
        const isHighlighted = report.id === highlightedReportId;
        const isExpanded = !collapsible || expandedReportIds.has(report.id);
        const characterType = report.report?.section?.character_type;
        const personaEmoji = characterType ? (CHARACTER_LABELS[characterType]?.emoji ?? '🤖') : null;
        const personaLabel = characterType ? t(`personas.${characterType}.name`, { defaultValue: CHARACTER_LABELS[characterType]?.label ?? characterType }) : null;
        return (
          <Card
            key={report.id}
            ref={isHighlighted ? highlightedRef : undefined}
            size="small"
            style={{
              width: '100%',
              cursor: onSelectReport ? 'pointer' : 'default',
              boxShadow: isHighlighted ? '0 0 0 2px #722ed1' : undefined,
              transition: 'box-shadow 0.3s ease'
            }}
            hoverable={Boolean(onSelectReport)}
            onClick={() => onSelectReport?.(report)}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  {personaLabel ? (
                    <Tag color={getCharacterTypeColor(characterType)} className="m-0">{personaEmoji} {personaLabel}</Tag>
                  ) : null}
                  {agentName ? (
                    <span className="text-xs font-medium text-muted-foreground">{agentName}</span>
                  ) : null}
                  <span className="text-xs text-muted-foreground/80">{new Date(report.createdAt).toLocaleString()}</span>
                </div>
                <h4 className="text-base font-semibold">{deriveReportHeadline(report.summary)}</h4>
                <p className="text-xs text-muted-foreground/80" data-testid={`ai-stats-${report.id}`}>
                  {formatReportAiStats(report)}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {report.signals.map((signal) => {
                    const chartKey = `${report.id}:${signal.symbol}`;
                    const isWatched = watchedSymbols.has(signal.symbol.trim().toUpperCase());
                    return (
                      <Tag
                        key={chartKey}
                        color={signal.side === 'long' ? 'green' : 'red'}
                        style={{ cursor: 'pointer' }}
                        onClick={(event) => onToggleChart(chartKey, signal.symbol, event)}
                      >
                        {signal.symbol} · {signal.side === 'long' ? 'Long' : 'Short'}
                        <TouchSafeTooltip title={isWatched ? t('watchlist.unfollow') : t('watchlist.follow')}>
                          <span
                            role="button"
                            aria-label={isWatched ? t('watchlist.unfollow') : t('watchlist.follow')}
                            style={{ marginLeft: 6, cursor: 'pointer' }}
                            onClick={(event) => void onToggleWatch(signal.symbol, event)}
                          >
                            {isWatched ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
                          </span>
                        </TouchSafeTooltip>
                      </Tag>
                    );
                  })}
                  {report.needsHumanReview ? <Tag color="gold">Needs review</Tag> : null}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {collapsible ? (
                  <TouchSafeTooltip title={isExpanded ? 'Collapse' : 'Expand'}>
                    <Button
                      aria-label={isExpanded ? 'Collapse report' : 'Expand report'}
                      shape="circle"
                      size="small"
                      icon={isExpanded ? <UpOutlined /> : <DownOutlined />}
                      onClick={(event) => onToggleExpand(report.id, event)}
                    />
                  </TouchSafeTooltip>
                ) : null}
                <TouchSafeTooltip title={t('reportChat.title')}>
                  <Button
                    aria-label={t('reportChat.title')}
                    shape="circle"
                    icon={<MessageOutlined />}
                    type={openChatReportId === report.id ? 'primary' : 'default'}
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenChatReportId((prev) => (prev === report.id ? null : report.id));
                    }}
                  />
                </TouchSafeTooltip>
                <TouchSafeTooltip title={t('studio.discussThisReport')}>
                  <Button
                    aria-label={t('studio.discussThisReport')}
                    shape="circle"
                    icon={<AudioOutlined />}
                    onClick={(event) => onDiscussReport(report, event)}
                  />
                </TouchSafeTooltip>
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
                  <span className="mt-1 text-xs text-muted-foreground">Confidence</span>
                </div>
              </div>
            </div>
            {report.signals.map((signal) => {
              const chartKey = `${report.id}:${signal.symbol}`;
              if (expandedChartKey !== chartKey) return null;
              const displaySymbol = symbolOverrides[chartKey] ?? signal.symbol;
              return (
                <div key={chartKey} className="mt-3" onClick={(event) => event.stopPropagation()}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium">{signal.symbol} · Weekly line chart</span>
                    <div className="flex items-center gap-2">
                      {onSelectSymbol ? (
                        <Button size="small" type="link" onClick={() => onSelectSymbol(signal.symbol)}>
                          View full performance
                        </Button>
                      ) : null}
                      <Button size="small" onClick={(event) => onToggleChart(chartKey, signal.symbol, event)}>
                        Close
                      </Button>
                    </div>
                  </div>
                  {/* Symbol search input — lets users fix "symbol not found" by adding exchange prefix */}
                  <div className="mb-2 flex items-center gap-2">
                    <Input
                      size="small"
                      style={{ maxWidth: 220 }}
                      placeholder="e.g. NASDAQ:AAPL, XETR:BMW"
                      value={symbolInputDraft[chartKey] ?? displaySymbol}
                      onChange={(e) => setSymbolInputDraft((d) => ({ ...d, [chartKey]: e.target.value }))}
                      onPressEnter={() => onApplySymbolOverride(chartKey)}
                      addonAfter={
                        <span
                          style={{ cursor: 'pointer' }}
                          onClick={() => onApplySymbolOverride(chartKey)}
                        >
                          ↵
                        </span>
                      }
                    />
                    <span className="text-xs text-muted-foreground/80">If the chart shows "symbol not found", add the exchange prefix and press Enter</span>
                  </div>
                  <TradingViewSymbolChart symbol={displaySymbol} interval="W" style="2" height={640} />
                </div>
              );
            })}
            {openChatReportId === report.id ? <ReportChatPanel agentId={agentId} reportId={report.id} /> : null}
            {isExpanded && report.report ? (
              <div className="mt-3 rounded-md border border-border bg-muted/40 p-4">
                <CharacterReportRenderer report={report.report} />
              </div>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
