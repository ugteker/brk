import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

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
    readAt: null,
    dismissedAt: null,
    ...overrides
  };
}

function withCharacterReport(
  base: RunReportDto,
  payload: {
    common: { summary: string; key_takeaways: string[]; sources_used: string[]; citations: string[] };
    section:
      | { character_type: 'finance_expert'; market_summary: string; signals: RunReportDto['signals'] }
      | { character_type: 'teacher'; lesson_explanation: string }
      | { character_type: 'trainer'; qa_drill: Array<{ question: string; answer: string }> }
      | { character_type: 'philosopher'; argument_reflection: string }
      | { character_type: 'influencer'; content_angles: string[]; hooks: string[] }
      | { character_type: 'summarizer'; bullet_digest: string[] };
  }
): RunReportDto {
  return { ...base, report: payload } as RunReportDto;
}

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location-display">{`${location.pathname}|${JSON.stringify(location.state)}`}</div>;
}

it('renders each report with symbol badges, a date, a headline, and a confidence indicator', () => {
  render(<MemoryRouter><AgentReportsBrowser agentId="agent-1" reports={[createReport()]} /></MemoryRouter>);

  expect(screen.getByText(/AAPL · Long/i)).toBeInTheDocument();
  expect(screen.getByText(/AAPL guidance was strong this quarter/i)).toBeInTheDocument();
  expect(screen.getByText('82%')).toBeInTheDocument();
});

it('shows a per-report AI stats row with model, version, tokens, and estimated cost', () => {
  render(<MemoryRouter><AgentReportsBrowser agentId="agent-1" reports={[createReport()]} /></MemoryRouter>);

  expect(screen.getByTestId('ai-stats-report-1').textContent).toBe(
    'Claude claude-sonnet-4-5 · v1 · 1.000 in / 200 out · ~$0.0060 (est.)'
  );
});

it('keeps AI token separators in German style even if runtime locale would use commas', () => {
  const toLocaleSpy = vi.spyOn(Number.prototype, 'toLocaleString').mockImplementation(function () {
    return String(Number(this)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  });

  render(<MemoryRouter><AgentReportsBrowser agentId="agent-1" reports={[createReport()]} /></MemoryRouter>);

  expect(screen.getByTestId('ai-stats-report-1').textContent).toBe(
    'Claude claude-sonnet-4-5 · v1 · 1.000 in / 200 out · ~$0.0060 (est.)'
  );
  expect(screen.getByTestId('ai-totals').textContent).toBe(
    'Total AI usage across 1 report: 1.000 in / 200 out tokens · ~$0.0060 (est.)'
  );

  toLocaleSpy.mockRestore();
});

it('falls back to "n/a" in the AI stats row for reports saved before this feature shipped', () => {
  const legacyReport = createReport({
    model: null,
    promptVersionNumber: null,
    inputTokens: null,
    outputTokens: null,
    estimatedCostUsd: null
  });
  render(<MemoryRouter><AgentReportsBrowser agentId="agent-1" reports={[legacyReport]} /></MemoryRouter>);

  expect(screen.getByTestId('ai-stats-report-1').textContent).toBe('Claude n/a · v n/a · n/a in / n/a out · n/a');
});

it('shows an agent-level running total of AI usage/cost across all reports', () => {
  const reports = [
    createReport({ id: 'report-1', inputTokens: 1000, outputTokens: 200, estimatedCostUsd: 0.006 }),
    createReport({ id: 'report-2', inputTokens: 500, outputTokens: 100, estimatedCostUsd: 0.003 })
  ];
  render(<MemoryRouter><AgentReportsBrowser agentId="agent-1" reports={reports} /></MemoryRouter>);

  expect(screen.getByTestId('ai-totals').textContent).toBe(
    'Total AI usage across 2 reports: 1.500 in / 300 out tokens · ~$0.0090 (est.)'
  );
});

it('omits the agent-level AI totals line when no report has any usage data', () => {
  const reports = [
    createReport({ model: null, promptVersionNumber: null, inputTokens: null, outputTokens: null, estimatedCostUsd: null })
  ];
  render(<MemoryRouter><AgentReportsBrowser agentId="agent-1" reports={reports} /></MemoryRouter>);

  expect(screen.queryByTestId('ai-totals')).not.toBeInTheDocument();
});

it('truncates long summaries into a short headline', () => {
  const longSummary = 'A'.repeat(120);
  render(<MemoryRouter><AgentReportsBrowser agentId="agent-1" reports={[createReport({ summary: longSummary })]} /></MemoryRouter>);

  expect(screen.getByText(/A{60,}\.\.\./)).toBeInTheDocument();
});

it('shows a short badge with a red tag for short signals', () => {
  render(<MemoryRouter><AgentReportsBrowser
      agentId="agent-1"
      reports={[createReport({ signals: [{ symbol: 'TSLA', side: 'short', confidence: 55, rationale: 'weak demand', citations: [] }] })]}
    /></MemoryRouter>);

  expect(screen.getByText(/TSLA · Short/i)).toBeInTheDocument();
});

it('shows an empty state when there are no reports yet', () => {
  render(<MemoryRouter><AgentReportsBrowser agentId="agent-1" reports={[]} /></MemoryRouter>);
  expect(screen.getByText(/no reports yet/i)).toBeInTheDocument();
});

it('invokes onSelectReport when a report card is clicked', () => {
  const onSelectReport = vi.fn();
  render(<MemoryRouter><AgentReportsBrowser agentId="agent-1" reports={[createReport()]} onSelectReport={onSelectReport} /></MemoryRouter>);

  fireEvent.click(screen.getByText(/AAPL guidance was strong this quarter/i));
  expect(onSelectReport).toHaveBeenCalledWith(expect.objectContaining({ id: 'report-1' }));
});

it('scrolls the highlighted report into view when highlightedReportId is set', () => {
  const scrollIntoViewMock = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

  render(<MemoryRouter><AgentReportsBrowser
      agentId="agent-1"
      reports={[createReport({ id: 'report-1' }), createReport({ id: 'report-2', summary: 'Second report' })]}
      highlightedReportId="report-2"
    /></MemoryRouter>);

  expect(scrollIntoViewMock).toHaveBeenCalled();
});

it('renders a re-send email notification button for each report', () => {
  render(<MemoryRouter><AgentReportsBrowser agentId="agent-1" reports={[createReport()]} /></MemoryRouter>);
  expect(screen.getByRole('button', { name: /re-send email notification/i })).toBeInTheDocument();
});

it('calls resendReportNotification with the correct agent/report ids and shows a success message, without triggering onSelectReport', async () => {
  const onSelectReport = vi.fn();
  const resendSpy = vi
    .spyOn(agentsApi, 'resendReportNotification')
    .mockResolvedValue({ status: 'sent', recipientCount: 2 });

  render(<MemoryRouter><AgentReportsBrowser agentId="agent-1" reports={[createReport({ id: 'report-1' })]} onSelectReport={onSelectReport} /></MemoryRouter>);

  fireEvent.click(screen.getByRole('button', { name: /re-send email notification/i }));

  await waitFor(() => expect(resendSpy).toHaveBeenCalledWith('agent-1', 'report-1', []));
  expect(onSelectReport).not.toHaveBeenCalled();
});

it('shows an error message when resendReportNotification fails', async () => {
  vi.spyOn(agentsApi, 'resendReportNotification').mockRejectedValue(new Error('no recipients configured'));
  const { message } = await import('antd');

  render(<MemoryRouter><AgentReportsBrowser agentId="agent-1" reports={[createReport()]} /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: /re-send email notification/i }));

  await waitFor(() => expect(message.error).toHaveBeenCalledWith('no recipients configured'));
});

it('navigates to /studio/new with a preselected agent+report when "Discuss this report" is clicked', () => {
  render(
    <MemoryRouter initialEntries={['/agents']}>
      <Routes>
        <Route
          path="/agents"
          element={<AgentReportsBrowser agentId="agent-1" reports={[createReport({ id: 'report-1', summary: 'AAPL guidance was strong this quarter.' })]} />}
        />
        <Route path="/studio/new" element={<LocationDisplay />} />
      </Routes>
    </MemoryRouter>
  );

  fireEvent.click(screen.getByRole('button', { name: /discuss this report/i }));

  const display = screen.getByTestId('location-display');
  const [pathname, stateJson] = display.textContent!.split('|');
  expect(pathname).toBe('/studio/new');
  const state = JSON.parse(stateJson);
  expect(state.preselect.entries).toEqual([{ agentId: 'agent-1', reportIds: ['report-1'] }]);
  expect(state.preselect.contextLabel).toContain('AAPL guidance was strong this quarter');
});

it('toggles an inline weekly line chart when a symbol tag is clicked, without triggering onSelectReport', () => {
  const onSelectReport = vi.fn();
  render(<MemoryRouter><AgentReportsBrowser agentId="agent-1" reports={[createReport()]} onSelectReport={onSelectReport} /></MemoryRouter>);

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
  render(<MemoryRouter><AgentReportsBrowser agentId="agent-1" reports={reports} /></MemoryRouter>);

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
  render(<MemoryRouter><AgentReportsBrowser agentId="agent-1" reports={[createReport()]} onSelectSymbol={onSelectSymbol} /></MemoryRouter>);

  fireEvent.click(screen.getByText(/AAPL · Long/i));
  fireEvent.click(screen.getByRole('button', { name: /view full performance/i }));

  expect(onSelectSymbol).toHaveBeenCalledWith('AAPL');
});

it('does not show a "View full performance" link when onSelectSymbol is not provided', () => {
  render(<MemoryRouter><AgentReportsBrowser agentId="agent-1" reports={[createReport()]} /></MemoryRouter>);

  fireEvent.click(screen.getByText(/AAPL · Long/i));

  expect(screen.queryByRole('button', { name: /view full performance/i })).not.toBeInTheDocument();
});

it('renders common report fields for every character template', () => {
  const base = createReport();
  const common = {
    summary: 'Common summary text',
    key_takeaways: ['Takeaway one', 'Takeaway two'],
    sources_used: ['https://example.com/source-1'],
    citations: ['https://example.com/citation-1']
  };
  const reports = [
    withCharacterReport(base, { common, section: { character_type: 'finance_expert', market_summary: 'Market uptrend', signals: base.signals } }),
    withCharacterReport(createReport({ id: 'r2' }), { common, section: { character_type: 'teacher', lesson_explanation: 'Teacher lesson' } }),
    withCharacterReport(createReport({ id: 'r3' }), {
      common,
      section: { character_type: 'trainer', qa_drill: [{ question: 'What is EPS?', answer: 'Earnings per share' }] }
    }),
    withCharacterReport(createReport({ id: 'r4' }), { common, section: { character_type: 'philosopher', argument_reflection: 'Meaning of risk' } }),
    withCharacterReport(createReport({ id: 'r5' }), {
      common,
      section: { character_type: 'influencer', content_angles: ['Angle A'], hooks: ['Hook A'] }
    }),
    withCharacterReport(createReport({ id: 'r6' }), { common, section: { character_type: 'summarizer', bullet_digest: ['Digest line'] } })
  ];

  render(<MemoryRouter><AgentReportsBrowser agentId="agent-1" reports={reports} /></MemoryRouter>);

  expect(screen.getAllByText('Summary')).toHaveLength(6);
  expect(screen.getAllByText('Key takeaways')).toHaveLength(6);
  expect(screen.getAllByText('Sources used')).toHaveLength(6);
  expect(screen.getAllByText('Citations')).toHaveLength(6);
  expect(screen.getAllByText('Common summary text')).toHaveLength(6);
});

it('switches character template sections based on report.report.section.character_type', () => {
  const base = createReport();
  const common = {
    summary: 'Summary',
    key_takeaways: ['Takeaway'],
    sources_used: ['https://example.com/source'],
    citations: ['https://example.com/citation']
  };
  const { rerender } = render(<MemoryRouter><AgentReportsBrowser
      agentId="agent-1"
      reports={[withCharacterReport(base, { common, section: { character_type: 'finance_expert', market_summary: 'Bullish week', signals: base.signals } })]}
    /></MemoryRouter>);
  expect(screen.getByText('Market summary')).toBeInTheDocument();
  expect(screen.getByText('Bullish week')).toBeInTheDocument();
  expect(screen.getByText('Signals')).toBeInTheDocument();

  rerender(<MemoryRouter><AgentReportsBrowser
      agentId="agent-1"
      reports={[withCharacterReport(base, { common, section: { character_type: 'teacher', lesson_explanation: 'Supply vs demand explained' } })]}
    /></MemoryRouter>);
  expect(screen.getByText('Lesson explanation')).toBeInTheDocument();
  expect(screen.getByText('Supply vs demand explained')).toBeInTheDocument();

  rerender(<MemoryRouter><AgentReportsBrowser
      agentId="agent-1"
      reports={[
        withCharacterReport(base, {
          common,
          section: { character_type: 'trainer', qa_drill: [{ question: 'Q1', answer: 'A1' }] }
        })
      ]}
    /></MemoryRouter>);
  expect(screen.getByText('Q&A drill')).toBeInTheDocument();
  expect(screen.getByText('Q1')).toBeInTheDocument();
  expect(screen.getByText('A1')).toBeInTheDocument();

  rerender(<MemoryRouter><AgentReportsBrowser
      agentId="agent-1"
      reports={[withCharacterReport(base, { common, section: { character_type: 'philosopher', argument_reflection: 'Conviction under uncertainty' } })]}
    /></MemoryRouter>);
  expect(screen.getByText('Argument & reflection')).toBeInTheDocument();
  expect(screen.getByText('Conviction under uncertainty')).toBeInTheDocument();

  rerender(<MemoryRouter><AgentReportsBrowser
      agentId="agent-1"
      reports={[
        withCharacterReport(base, {
          common,
          section: { character_type: 'influencer', content_angles: ['Thread angle'], hooks: ['Hook text'] }
        })
      ]}
    /></MemoryRouter>);
  expect(screen.getByText('Content angles')).toBeInTheDocument();
  expect(screen.getByText('Hooks')).toBeInTheDocument();
  expect(screen.getByText('Thread angle')).toBeInTheDocument();
  expect(screen.getByText('Hook text')).toBeInTheDocument();

  rerender(<MemoryRouter><AgentReportsBrowser
      agentId="agent-1"
      reports={[withCharacterReport(base, { common, section: { character_type: 'summarizer', bullet_digest: ['Digest bullet'] } })]}
    /></MemoryRouter>);
  expect(screen.getByText('Bullet digest')).toBeInTheDocument();
  expect(screen.getByText('Digest bullet')).toBeInTheDocument();
});
