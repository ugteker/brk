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
    ...overrides
  };
}

it('renders each report with symbol badges, a date, a headline, and a confidence indicator', () => {
  render(<AgentReportsBrowser agentId="agent-1" reports={[createReport()]} />);

  expect(screen.getByText(/AAPL · Long/i)).toBeInTheDocument();
  expect(screen.getByText(/AAPL guidance was strong this quarter/i)).toBeInTheDocument();
  expect(screen.getByText('82%')).toBeInTheDocument();
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

it('calls onSelectSymbol with the clicked symbol without triggering onSelectReport', () => {
  const onSelectReport = vi.fn();
  const onSelectSymbol = vi.fn();
  render(
    <AgentReportsBrowser
      agentId="agent-1"
      reports={[createReport()]}
      onSelectReport={onSelectReport}
      onSelectSymbol={onSelectSymbol}
    />
  );

  fireEvent.click(screen.getByText(/AAPL · Long/i));

  expect(onSelectSymbol).toHaveBeenCalledWith('AAPL');
  expect(onSelectReport).not.toHaveBeenCalled();
});

it('does not attach a symbol click handler when onSelectSymbol is not provided', () => {
  const onSelectReport = vi.fn();
  render(<AgentReportsBrowser agentId="agent-1" reports={[createReport()]} onSelectReport={onSelectReport} />);

  fireEvent.click(screen.getByText(/AAPL · Long/i));

  expect(onSelectReport).toHaveBeenCalled();
});
