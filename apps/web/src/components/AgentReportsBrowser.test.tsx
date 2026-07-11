import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AgentReportsBrowser } from './AgentReportsBrowser';
import type { RunReportDto } from '../api/agents';

afterEach(() => {
  cleanup();
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
  render(<AgentReportsBrowser reports={[createReport()]} />);

  expect(screen.getByText(/AAPL · Long/i)).toBeInTheDocument();
  expect(screen.getByText(/AAPL guidance was strong this quarter/i)).toBeInTheDocument();
  expect(screen.getByText('82%')).toBeInTheDocument();
});

it('truncates long summaries into a short headline', () => {
  const longSummary = 'A'.repeat(120);
  render(<AgentReportsBrowser reports={[createReport({ summary: longSummary })]} />);

  expect(screen.getByText(/A{60,}\.\.\./)).toBeInTheDocument();
});

it('shows a short badge with a red tag for short signals', () => {
  render(
    <AgentReportsBrowser
      reports={[createReport({ signals: [{ symbol: 'TSLA', side: 'short', confidence: 55, rationale: 'weak demand', citations: [] }] })]}
    />
  );

  expect(screen.getByText(/TSLA · Short/i)).toBeInTheDocument();
});

it('shows an empty state when there are no reports yet', () => {
  render(<AgentReportsBrowser reports={[]} />);
  expect(screen.getByText(/no reports yet/i)).toBeInTheDocument();
});

it('invokes onSelectReport when a report card is clicked', () => {
  const onSelectReport = vi.fn();
  render(<AgentReportsBrowser reports={[createReport()]} onSelectReport={onSelectReport} />);

  fireEvent.click(screen.getByText(/AAPL guidance was strong this quarter/i));
  expect(onSelectReport).toHaveBeenCalledWith(expect.objectContaining({ id: 'report-1' }));
});
