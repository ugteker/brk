import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SymbolPerformancePage } from './SymbolPerformancePage';
import { listSymbolSignalHistory } from '../api/agents';
import type { RunReportDto } from '../api/agents';

vi.mock('../api/agents', () => ({
  listSymbolSignalHistory: vi.fn()
}));

vi.mock('../components/TradingViewSymbolChart', () => ({
  TradingViewSymbolChart: ({ symbol }: { symbol: string }) => <div data-testid="mock-tradingview-chart">{symbol}</div>
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function createReport(overrides: Partial<RunReportDto> = {}): RunReportDto {
  return {
    id: 'report-1',
    agentId: 'agent-1',
    agentRunId: 'run-1',
    promptVersionId: 'prompt-1',
    summary: 'AAPL guidance was strong',
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

it('renders the symbol heading and the TradingView chart for the given symbol', async () => {
  vi.mocked(listSymbolSignalHistory).mockResolvedValue([]);

  render(<SymbolPerformancePage agentId="agent-1" symbol="AAPL" onBack={vi.fn()} />);

  expect(screen.getByRole('heading', { name: /AAPL performance/i })).toBeInTheDocument();
  expect(screen.getByTestId('mock-tradingview-chart')).toHaveTextContent('AAPL');
  await waitFor(() => expect(listSymbolSignalHistory).toHaveBeenCalledWith('agent-1', 'AAPL'));
});

it('renders the signal history returned by the API', async () => {
  vi.mocked(listSymbolSignalHistory).mockResolvedValue([createReport()]);

  render(<SymbolPerformancePage agentId="agent-1" symbol="AAPL" onBack={vi.fn()} />);

  expect(await screen.findByText('strong guidance')).toBeInTheDocument();
  expect(screen.getByText('82% confidence')).toBeInTheDocument();
  expect(screen.getByText('Long')).toBeInTheDocument();
});

it('shows an empty state when there is no signal history', async () => {
  vi.mocked(listSymbolSignalHistory).mockResolvedValue([]);

  render(<SymbolPerformancePage agentId="agent-1" symbol="AAPL" onBack={vi.fn()} />);

  expect(await screen.findByText(/no past signals for AAPL/i)).toBeInTheDocument();
});

it('renders a URL citation as a clickable link but leaves a non-URL citation as plain text', async () => {
  vi.mocked(listSymbolSignalHistory).mockResolvedValue([
    createReport({
      signals: [
        {
          symbol: 'AAPL',
          side: 'long',
          confidence: 82,
          rationale: 'strong guidance',
          citations: ['https://example.com/article', 'ep1@10:12']
        }
      ]
    })
  ]);

  render(<SymbolPerformancePage agentId="agent-1" symbol="AAPL" onBack={vi.fn()} />);

  const link = await screen.findByRole('link', { name: 'https://example.com/article' });
  expect(link).toHaveAttribute('href', 'https://example.com/article');
  expect(link).toHaveAttribute('target', '_blank');
  expect(screen.getByText(/ep1@10:12/)).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /ep1@10:12/ })).not.toBeInTheDocument();
});

it('calls onBack when the back button is clicked', async () => {
  vi.mocked(listSymbolSignalHistory).mockResolvedValue([]);
  const onBack = vi.fn();

  render(<SymbolPerformancePage agentId="agent-1" symbol="AAPL" onBack={onBack} />);

  fireEvent.click(screen.getByRole('button', { name: /back/i }));
  expect(onBack).toHaveBeenCalled();
});
