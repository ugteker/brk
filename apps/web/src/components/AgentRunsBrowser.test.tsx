import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentRunsBrowser } from './AgentRunsBrowser';
import type { RunDetailDto } from '../api/agents';

afterEach(() => {
  cleanup();
});

function createRun(overrides: Partial<RunDetailDto> = {}): RunDetailDto {
  return {
    id: 'run-1',
    agentId: 'agent-1',
    status: 'succeeded',
    phase: null,
    scheduledFor: '2026-07-10T09:00:00.000Z',
    startedAt: '2026-07-10T09:00:00.000Z',
    finishedAt: '2026-07-10T09:00:05.000Z',
    durationMs: 5000,
    errorCode: null,
    errorMessage: null,
    retryCount: 0,
    report: null,
    artifacts: [],
    ...overrides
  };
}

it('shows an empty state when there are no runs yet', () => {
  render(<AgentRunsBrowser agentId="agent-1" runs={[]} />);
  expect(screen.getByText(/no history yet/i)).toBeInTheDocument();
});

it('renders run status, duration, and scheduled time', () => {
  render(<AgentRunsBrowser agentId="agent-1" runs={[createRun()]} />);

  expect(screen.getByText('succeeded')).toBeInTheDocument();
  expect(screen.getByText(/Duration 5.0s/)).toBeInTheDocument();
});

it('shows an error tag for failed runs', () => {
  render(<AgentRunsBrowser agentId="agent-1" runs={[createRun({ status: 'failed', errorCode: 'fetch_timeout' })]} />);
  expect(screen.getByText(/Error: fetch_timeout/i)).toBeInTheDocument();
});

it('shows the error reason (errorMessage) for failed runs, not just the opaque error code', () => {
  render(
    <AgentRunsBrowser
      agentId="agent-1"
      runs={[
        createRun({
          status: 'failed',
          errorCode: 'agent_run_failed',
          errorMessage: 'Claude API request timed out after 30000ms'
        })
      ]}
    />
  );
  expect(screen.getByText(/Error: agent_run_failed/i)).toBeInTheDocument();
  expect(screen.getByText(/Claude API request timed out after 30000ms/i)).toBeInTheDocument();
});

it('shows a warning with the episode URL as a clickable link when a no-new-content run collected a warning', () => {
  render(
    <AgentRunsBrowser
      agentId="agent-1"
      runs={[
        createRun({
          status: 'succeeded_no_new_content',
          errorMessage: 'No transcript/captions available for YouTube video https://www.youtube.com/watch?v=Sx5Gy5YqImY'
        })
      ]}
    />
  );
  expect(screen.getByText(/No content found/i)).toBeInTheDocument();
  const link = screen.getByRole('link', { name: 'https://www.youtube.com/watch?v=Sx5Gy5YqImY' });
  expect(link).toHaveAttribute('href', 'https://www.youtube.com/watch?v=Sx5Gy5YqImY');
  expect(link).toHaveAttribute('target', '_blank');
});

it('does not show a warning alert for a plain no-new-content run with no collected warning', () => {
  render(<AgentRunsBrowser agentId="agent-1" runs={[createRun({ status: 'succeeded_no_new_content', errorMessage: null })]} />);
  expect(screen.queryByText(/No content found/i)).not.toBeInTheDocument();
});

it('shows an artifact preview with a download button', () => {
  render(
    <AgentRunsBrowser
      agentId="agent-1"
      runs={[
        createRun({
          artifacts: [
            {
              id: 'artifact-1',
              sourceRef: 'https://example.com/blog',
              fidelity: 'high',
              contentPreview: 'This is a preview of the crawled content.',
              contentLength: 4000,
              title: null
            }
          ]
        })
      ]}
    />
  );

  expect(screen.getByText('https://example.com/blog')).toBeInTheDocument();
  expect(screen.getByText(/This is a preview of the crawled content/i)).toBeInTheDocument();
  const sourceLink = screen.getByRole('link', { name: 'https://example.com/blog' });
  expect(sourceLink).toHaveAttribute('href', 'https://example.com/blog');
  expect(sourceLink).toHaveAttribute('target', '_blank');
  const downloadLink = screen.getByRole('link', { name: /download full content \(4000 chars\)/i });
  expect(downloadLink).toHaveAttribute('href', '/api/agents/agent-1/runs/run-1/artifacts/artifact-1/download');
});

it('shows the episode/item title (not the raw URL) when the artifact has one, still linking to the source', () => {
  render(
    <AgentRunsBrowser
      agentId="agent-1"
      runs={[
        createRun({
          artifacts: [
            {
              id: 'artifact-1',
              sourceRef: 'https://example.com/podcast/ep-42',
              fidelity: 'high',
              contentPreview: 'Transcript preview.',
              contentLength: 1200,
              title: 'Episode 42: Fed Rate Decision'
            }
          ]
        })
      ]}
    />
  );

  const link = screen.getByRole('link', { name: 'Episode 42: Fed Rate Decision' });
  expect(link).toHaveAttribute('href', 'https://example.com/podcast/ep-42');
  expect(screen.queryByText('https://example.com/podcast/ep-42')).not.toBeInTheDocument();
});

it('calls onViewReport when the View report button is clicked', () => {
  const onViewReport = vi.fn();
  render(
    <AgentRunsBrowser
      agentId="agent-1"
      runs={[createRun({ report: { id: 'report-1', summary: 'Bullish', needsHumanReview: false, signalCount: 1 } })]}
      onViewReport={onViewReport}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: /view report/i }));
  expect(onViewReport).toHaveBeenCalledWith('report-1');
});

it('does not show a View report button when the run has no report', () => {
  render(<AgentRunsBrowser agentId="agent-1" runs={[createRun({ report: null })]} />);
  expect(screen.queryByRole('button', { name: /view report/i })).not.toBeInTheDocument();
});

describe('live duration timer for running runs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T09:00:10.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a live elapsed duration that increases over time for a running run', () => {
    render(
      <AgentRunsBrowser
        agentId="agent-1"
        runs={[
          createRun({
            status: 'running',
            startedAt: '2026-07-10T09:00:00.000Z',
            finishedAt: null,
            durationMs: null
          })
        ]}
      />
    );

    expect(screen.getByText(/Running for 10\.0s/)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText(/Running for 13\.0s/)).toBeInTheDocument();
  });

  it('does not show a live timer for queued or completed runs', () => {
    render(
      <AgentRunsBrowser
        agentId="agent-1"
        runs={[createRun({ status: 'queued', startedAt: null, finishedAt: null, durationMs: null })]}
      />
    );

    expect(screen.queryByText(/Running for/)).not.toBeInTheDocument();
    expect(screen.getByText(/Duration —/)).toBeInTheDocument();
  });

  it('shows the current phase label next to the running-duration timer', () => {
    render(
      <AgentRunsBrowser
        agentId="agent-1"
        runs={[
          createRun({
            status: 'running',
            phase: 'analyzing',
            startedAt: '2026-07-10T09:00:00.000Z',
            finishedAt: null,
            durationMs: null
          })
        ]}
      />
    );

    expect(screen.getByText('Analyzing with AI…')).toBeInTheDocument();
  });

  it('shows no phase label when the run has no phase set', () => {
    render(
      <AgentRunsBrowser
        agentId="agent-1"
        runs={[
          createRun({
            status: 'running',
            phase: null,
            startedAt: '2026-07-10T09:00:00.000Z',
            finishedAt: null,
            durationMs: null
          })
        ]}
      />
    );

    expect(screen.queryByText(/Crawling sources|Analyzing with AI|Sending notifications/)).not.toBeInTheDocument();
  });
});
