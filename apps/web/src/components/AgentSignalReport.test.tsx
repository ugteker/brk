import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { AgentSignalReport } from './AgentSignalReport';

afterEach(() => {
  cleanup();
});

it('renders a signal report with long/short tags', () => {
  render(
    <AgentSignalReport
      signals={[{ symbol: 'AAPL', side: 'long', confidence: 81, rationale: 'Strong guidance', citations: ['ep1@10:12'] }]}
    />
  );

  expect(screen.getByText('AAPL')).toBeInTheDocument();
  expect(screen.getByText(/long/i)).toBeInTheDocument();
});

it('renders a short signal with a red tag treatment', () => {
  render(
    <AgentSignalReport signals={[{ symbol: 'TSLA', side: 'short', confidence: 55, rationale: 'Weak demand', citations: [] }]} />
  );

  expect(screen.getByText('TSLA')).toBeInTheDocument();
  expect(screen.getByText(/short/i)).toBeInTheDocument();
});

it('renders an empty state when there are no signals', () => {
  render(<AgentSignalReport signals={[]} />);
  expect(screen.getByText(/no signals were extracted/i)).toBeInTheDocument();
});
