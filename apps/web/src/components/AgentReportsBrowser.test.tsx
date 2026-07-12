import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AgentReportsBrowser } from './AgentReportsBrowser';
import * as agentsApi from '../api/agents';
import type { RunReportDto } from '../api/agents';

vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('antd')>();
  return { ...actual, message: { success: vi.fn(), error: vi.fn(), info: vi.fn() } };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function createReport(overrides: Partial<RunReportDto> = {}): RunReportDto {
  return {
    id: 'report-1',
    agentId: 'agent-1',
    agentRunId: 'run-1',
    promptVersionId: 'prompt-1',
    summary: 'AAPL guidance was strong this quarter, pointing to a bullish long position.',
    sourceWarnings: [],
    needsHumanReview: false,
    signals: [{ symbol: 'AAPL', side: 'long', confidence: 82, rationale: 'strong guidance', citations: ['ep1@10:12'] }],
    createdAt: '2026-07-10T00:00:00.000Z',
    model: 'claude-sonnet-4-5',
    promptVersionNumber: 1,
    inputTokens: 1000,
    outputTokens: 200,
    estimatedCostUsd: 0.006,
    ...overrides
  };
}

it('renders each report with symbol badges, a date, a headline, and a confidence indicator', () => {
  render(<AgentReportsBrowser agentId="agent-1" reports={[createReport()]} />);

  expect(screen.getByText(/AAPL · Long/i)).toBeInTheDocument();
  expect(screen.getByText(/AAPL guidance was strong this quarter/i)).toBeInTheDocument();
  expect(screen.getByText('82%')).toBeInTheDocument();
});

it('shows a per-report AI stats row with model, version, tokens, and estimated cost', () => {
  render(<AgentReportsBrowser agentId="agent-1" reports={[createReport()]} />);

  expect(screen.getByTestId('ai-stats-report-1').textContent).toBe(
    'Claude claude-sonnet-4-5 · v1 · 1.000 in / 200 out · ~$0.0060 (est.)'
  );
});

it('falls back to "n/a" in the AI stats row for reports saved before this feature shipped', () => {
  const legacyReport = createReport({
    model: null,
    promptVersionNumber: null,
    inputTokens: null,
    outputTokens: null,
    estimatedCostUsd: null
  });
  render(<AgentReportsBrowser agentId="agent-1" reports={[legacyReport]} />);

  expect(screen.getByTestId('ai-stats-report-1').textContent).toBe('Claude n/a · v n/a · n/a in / n/a out · n/a');
});

it('shows an agent-level running total of AI usage/cost across all reports', () => {
  const reports = [
    createReport({ id: 'report-1', inputTokens: 1000, outputTokens: 200, estimatedCostUsd: 0.006 }),
    createReport({ id: 'report-2', inputTokens: 500, outputTokens: 100, estimatedCostUsd: 0.003 })
  ];
  render(<AgentReportsBrowser agentId="agent-1" reports={reports} />);

  expect(screen.getByTestId('ai-totals').textContent).toBe(
    'Total AI usage across 2 reports: 1.500 in / 300 out tokens · ~$0.0090 (est.)'
  );
});

it('omits the agent-level AI totals line when no report has any usage data', () => {
  const reports = [
    createReport({ model: null, promptVersionNumber: null, inputTokens: null, outputTokens: null, estimatedCostUsd: null })
  ];
  render(<AgentReportsBrowser agentId="agent-1" reports={reports} />);

  expect(screen.queryByTestId('ai-totals')).not.toBeInTheDocument();
});

it('truncates long summaries into a short headline', () => {
  const longSummary = 'A'.repeat(120);
  render(<AgentReportsBrowser agentId="agent-1" reports={[createReport({ summary: longSummary })]} />);

  expect(screen.getByText(/A{60,}\.\.\./)).toBeInTheDocument();
});

it('shows a short badge with a red tag for short signals', () => {
  render(
    <AgentReportsBrowser
      agentId="agent-1"
      reports={[createReport({ signals: [{ symbol: 'TSLA', side: 'short', confidence: 55, rationale: 'weak demand', citations: [] }] })]}
    />
  );

  expect(screen.getByText(/TSLA · Short/i)).toBeInTheDocument();
});

it('shows an empty state when there are no reports yet', () => {
  render(<AgentReportsBrowser agentId="agent-1" reports={[]} />);
  expect(screen.getByText(/no reports yet/i)).toBeInTheDocument();
});

it('invokes onSelectReport when a report card is clicked', () => {
  const onSelectReport = vi.fn();
  render(<AgentReportsBrowser agentId="agent-1" reports={[createReport()]} onSelectReport={onSelectReport} />);

  fireEvent.click(screen.getByText(/AAPL guidance was strong this quarter/i));
  expect(onSelectReport).toHaveBeenCalledWith(expect.objectContaining({ id: 'report-1' }));
});

it('scrolls the highlighted report into view when highlightedReportId is set', () => {
  const scrollIntoViewMock = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

  render(
    <AgentReportsBrowser
      agentId="agent-1"
      reports={[createReport({ id: 'report-1' }), createReport({ id: 'report-2', summary: 'Second report' })]}
      highlightedReportId="report-2"
    />
  );

  expect(scrollIntoViewMock).toHaveBeenCalled();
});

it('renders a re-send email notification button for each report', () => {
  render(<AgentReportsBrowser agentId="agent-1" reports={[createReport()]} />);
  expect(screen.getByRole('button', { name: /re-send email notification/i })).toBeInTheDocument();
});

it('calls resendReportNotification with the correct agent/report ids and shows a success message, without triggering onSelectReport', async () => {
  const onSelectReport = vi.fn();
  const resendSpy = vi
    .spyOn(agentsApi, 'resendReportNotification')
    .mockResolvedValue({ status: 'sent', recipientCount: 2 });

  render(<AgentReportsBrowser agentId="agent-1" reports={[createReport({ id: 'report-1' })]} onSelectReport={onSelectReport} />);

  fireEvent.click(screen.getByRole('button', { name: /re-send email notification/i }));

  await waitFor(() => expect(resendSpy).toHaveBeenCalledWith('agent-1', 'report-1'));
  expect(onSelectReport).not.toHaveBeenCalled();
});

it('shows an error message when resendReportNotification fails', async () => {
  vi.spyOn(agentsApi, 'resendReportNotification').mockRejectedValue(new Error('no recipients configured'));
  const { message } = await import('antd');

  render(<AgentReportsBrowser agentId="agent-1" reports={[createReport()]} />);
  fireEvent.click(screen.getByRole('button', { name: /re-send email notification/i }));

  await waitFor(() => expect(message.error).toHaveBeenCalledWith('no recipients configured'));
});

it('toggles an inline weekly line chart when a symbol tag is clicked, without triggering onSelectReport', () => {
  const onSelectReport = vi.fn();
  render(<AgentReportsBrowser agentId="agent-1" reports={[createReport()]} onSelectReport={onSelectReport} />);

  expect(screen.queryByTestId('tradingview-symbol-chart')).not.toBeInTheDocument();

  fireEvent.click(screen.getByText(/AAPL · Long/i));

  const chart = screen.getByTestId('tradingview-symbol-chart');
  expect(chart).toHaveAttribute('data-symbol', 'AAPL');
  expect(chart).toHaveAttribute('data-interval', 'W');
  expect(chart).toHaveAttribute('data-style', '2');
  expect(onSelectReport).not.toHaveBeenCalled();

  // Clicking the same tag again collapses it.
  fireEvent.click(screen.getByText(/AAPL · Long/i));
  expect(screen.queryByTestId('tradingview-symbol-chart')).not.toBeInTheDocument();
});

it('only shows one inline chart at a time, closing the previous one when a different symbol is clicked', () => {
  const reports = [
    createReport({ id: 'report-1', signals: [{ symbol: 'AAPL', side: 'long', confidence: 82, rationale: 'r1', citations: [] }] }),
    createReport({
      id: 'report-2',
      summary: 'TSLA bearish call',
      signals: [{ symbol: 'TSLA', side: 'short', confidence: 55, rationale: 'r2', citations: [] }]
    })
  ];
  render(<AgentReportsBrowser agentId="agent-1" reports={reports} />);

  fireEvent.click(screen.getByText(/AAPL · Long/i));
  expect(screen.getAllByTestId('tradingview-symbol-chart')).toHaveLength(1);
  expect(screen.getByTestId('tradingview-symbol-chart')).toHaveAttribute('data-symbol', 'AAPL');

  fireEvent.click(screen.getByText(/TSLA · Short/i));
  const charts = screen.getAllByTestId('tradingview-symbol-chart');
  expect(charts).toHaveLength(1);
  expect(charts[0]).toHaveAttribute('data-symbol', 'TSLA');
});

it('shows a "View full performance" link that calls onSelectSymbol when the inline chart is open', () => {
  const onSelectSymbol = vi.fn();
  render(<AgentReportsBrowser agentId="agent-1" reports={[createReport()]} onSelectSymbol={onSelectSymbol} />);

  fireEvent.click(screen.getByText(/AAPL · Long/i));
  fireEvent.click(screen.getByRole('button', { name: /view full performance/i }));

  expect(onSelectSymbol).toHaveBeenCalledWith('AAPL');
});

it('does not show a "View full performance" link when onSelectSymbol is not provided', () => {
  render(<AgentReportsBrowser agentId="agent-1" reports={[createReport()]} />);

  fireEvent.click(screen.getByText(/AAPL · Long/i));

  expect(screen.queryByRole('button', { name: /view full performance/i })).not.toBeInTheDocument();
});
