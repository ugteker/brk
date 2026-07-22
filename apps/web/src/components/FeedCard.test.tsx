import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';

import { FeedCard, groupReportsByDay } from './FeedCard';
import type { CardPresentationDto, RunReportDto, UnifiedReportCommonFieldsDto } from '../api/agents';

afterEach(() => {
  cleanup();
});

function makeReport(
  common: Partial<UnifiedReportCommonFieldsDto>,
  presentation: Partial<CardPresentationDto> = {},
  overrides: Partial<RunReportDto> = {}
): RunReportDto {
  const fullCommon: UnifiedReportCommonFieldsDto = {
    summary: 'A plain summary of the episode.',
    key_takeaways: [],
    sources_used: [],
    citations: [],
    headline: 'Episode headline',
    card_presentation: {
      emphasis: 'standard',
      primary_field: 'headline',
      supporting_fields: [],
      hide_when_empty: true,
      rationale: '',
      ...presentation
    },
    ...common
  };
  return {
    id: 'report-1',
    agentId: 'agent-1',
    agentRunId: 'run-1',
    playbookId: 'pb-1',
    promptVersionId: 'prompt-1',
    summary: fullCommon.summary,
    sourceWarnings: [],
    needsHumanReview: false,
    signals: [],
    createdAt: '2026-07-19T09:00:00.000Z',
    model: null,
    promptVersionNumber: null,
    inputTokens: null,
    outputTokens: null,
    estimatedCostUsd: null,
    readAt: '2026-07-19T10:00:00.000Z',
    dismissedAt: null,
    report: { common: fullCommon, section: { character_type: 'summarizer', bullet_digest: [] } },
    ...overrides
  };
}

function renderCard(props: Partial<ComponentProps<typeof FeedCard>> = {}) {
  const onDiscuss = vi.fn();
  const onOpenFullReport = vi.fn();
  const onOpenSource = vi.fn();
  render(
    <FeedCard
      report={makeReport({ result_type: 'summary' })}
      characterType="summarizer"
      characterLabel="Summarizer"
      sourceTitle="Daily Podcast"
      sourceCoverImageUrl={null}
      isSyntheticSource={false}
      onOpenFullReport={onOpenFullReport}
      onOpenSource={onOpenSource}
      onDiscuss={onDiscuss}
      {...props}
    />
  );
  return { onDiscuss, onOpenFullReport, onOpenSource };
}

describe('FeedCard', () => {
  it('renders the result badge, character and AI-generated headline', () => {
    renderCard();
    expect(screen.getByText('Summary')).toBeInTheDocument();
    expect(screen.getByText('Summarizer')).toBeInTheDocument();
    expect(screen.getByText('Episode headline')).toBeInTheDocument();
  });

  it('shows the personality label as a badge when provided', () => {
    renderCard({ personalityLabel: 'Balanced Analyst' });
    expect(screen.getByText(/Balanced Analyst/)).toBeInTheDocument();
  });

  it('uses the brand violet accent for a standard summary', () => {
    renderCard({ report: makeReport({ result_type: 'summary' }) });
    expect(screen.getByText('Summary').className).toContain('bg-violet-50');
  });

  it('uses a rose accent for a risk report', () => {
    renderCard({ report: makeReport({ result_type: 'risk' }) });
    expect(screen.getByText('Risk').className).toContain('bg-rose-50');
  });

  it('uses a rose accent and shows the emphasis bar when emphasis is critical', () => {
    const { container } = render(
      <FeedCard
        report={makeReport({ result_type: 'insight' }, { emphasis: 'critical' })}
        characterType="summarizer"
        characterLabel="Summarizer"
        sourceTitle="Daily Podcast"
        sourceCoverImageUrl={null}
        isSyntheticSource={false}
        onOpenFullReport={vi.fn()}
        onDiscuss={vi.fn()}
      />
    );
    expect(screen.getByText('Insight').className).toContain('bg-rose-50');
    expect(container.querySelector('.bg-rose-500')).toBeTruthy();
  });

  it('shows finance signal tags only for the finance_expert character', () => {
    const financeReport = makeReport(
      { result_type: 'recommendation' },
      {},
      { signals: [{ symbol: 'AAPL', side: 'long', confidence: 80, rationale: 'x', citations: [] }] }
    );
    const { rerender } = render(
      <FeedCard
        report={financeReport}
        characterType="finance_expert"
        characterLabel="Balanced Analyst"
        sourceTitle="Markets Daily"
        sourceCoverImageUrl={null}
        isSyntheticSource={false}
        onOpenFullReport={vi.fn()}
        onDiscuss={vi.fn()}
      />
    );
    expect(screen.getByText('▲ AAPL')).toBeInTheDocument();

    rerender(
      <FeedCard
        report={financeReport}
        characterType="teacher"
        characterLabel="Teacher"
        sourceTitle="Markets Daily"
        sourceCoverImageUrl={null}
        isSyntheticSource={false}
        onOpenFullReport={vi.fn()}
        onDiscuss={vi.fn()}
      />
    );
    expect(screen.queryByText('▲ AAPL')).not.toBeInTheDocument();
  });

  it('renders the synthetic-discussion thumbnail for synthetic sources', () => {
    renderCard({ isSyntheticSource: true, sourceTitle: 'NVDA Roundtable' });
    expect(screen.getByTestId('feed-card-synthetic-thumb')).toBeInTheDocument();
    expect(screen.queryByTestId('feed-card-cover')).not.toBeInTheDocument();
    expect(screen.queryByTestId('feed-card-placeholder')).not.toBeInTheDocument();
  });

  it('renders a cover image in the square thumbnail when cover art is present', () => {
    renderCard({ sourceCoverImageUrl: 'https://example.com/cover.jpg' });
    const cover = screen.getByTestId('feed-card-cover');
    expect(cover).toBeInTheDocument();
    expect(cover.className).toContain('object-cover');
    expect(screen.queryByTestId('feed-card-placeholder')).not.toBeInTheDocument();
  });

  it('renders up to three hashtag keywords under the headline', () => {
    renderCard({ report: makeReport({ keywords: ['Alpha', 'Beta', 'Gamma', 'Delta'] }) });
    const keywords = screen.getByTestId('feed-card-keywords');
    expect(keywords).toHaveTextContent('#Alpha');
    expect(keywords).toHaveTextContent('#Gamma');
    expect(keywords).not.toHaveTextContent('#Delta');
  });

  it('omits the keyword row when the report has no keywords', () => {
    renderCard({ report: makeReport({ keywords: [] }) });
    expect(screen.queryByTestId('feed-card-keywords')).not.toBeInTheDocument();
  });

  it('shows a character-emoji placeholder in the left strip when there is no cover art', () => {
    renderCard({ sourceCoverImageUrl: null, isSyntheticSource: false });
    expect(screen.getByTestId('feed-card-placeholder')).toBeInTheDocument();
    expect(screen.queryByTestId('feed-card-cover')).not.toBeInTheDocument();
  });

  it('fires onOpenFullReport (not any footer action) when the card body is clicked', () => {
    const { onOpenFullReport, onDiscuss } = renderCard();
    fireEvent.click(screen.getByText('Episode headline'));
    expect(onOpenFullReport).toHaveBeenCalledTimes(1);
    expect(onDiscuss).not.toHaveBeenCalled();
  });

  it('fires onDiscuss (not onOpenFullReport) when the Discuss button is clicked', () => {
    const { onDiscuss, onOpenFullReport } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: /discuss/i }));
    expect(onDiscuss).toHaveBeenCalledTimes(1);
    expect(onOpenFullReport).not.toHaveBeenCalled();
  });

  it('fires onOpenSource (not onOpenFullReport) when the source chip is clicked', () => {
    const { onOpenSource, onOpenFullReport } = renderCard({ sourceTitle: 'Daily Podcast' });
    fireEvent.click(screen.getByRole('button', { name: /Daily Podcast/i }));
    expect(onOpenSource).toHaveBeenCalledTimes(1);
    expect(onOpenFullReport).not.toHaveBeenCalled();
  });

  it('shows an external episode link only when a resolvable http(s) source_reference exists', () => {
    renderCard({
      report: makeReport({ source_references: [{ label: 'Episode 12', reference: 'https://example.com/ep12' }] })
    });
    expect(screen.getByRole('button', { name: /Episode 12/i })).toBeInTheDocument();
  });

  it('omits the external episode link when there is no http(s) source_reference', () => {
    renderCard({ report: makeReport({}) });
    expect(screen.queryByTitle(/Episode/i)).not.toBeInTheDocument();
  });

  it('omits the "View run" link (removed from card footer)', () => {
    renderCard();
    expect(screen.queryByText('View run')).not.toBeInTheDocument();
  });

  it('shows the "New" unread pill when the report has not been read yet', () => {
    renderCard({ report: makeReport({}, {}, { readAt: null }) });
    const pill = screen.getByTestId('feed-card-unread');
    expect(pill).toHaveTextContent('New');
    expect(pill.className).toContain('opacity-100');
  });

  it('omits the unread pill for reports that were already read', () => {
    renderCard({ report: makeReport({}, {}, { readAt: '2026-07-19T10:00:00.000Z' }) });
    expect(screen.queryByTestId('feed-card-unread')).not.toBeInTheDocument();
  });

  it('shows the episode title as a subtitle when a source reference exists', () => {
    renderCard({
      report: makeReport({ source_references: [{ label: 'Episode 12', reference: 'https://example.com/ep12' }] })
    });
    expect(screen.getByTestId('feed-card-episode-title')).toHaveTextContent('Episode 12');
  });

  it('omits the episode subtitle when there are no source references', () => {
    renderCard({ report: makeReport({ source_references: [] }) });
    expect(screen.queryByTestId('feed-card-episode-title')).not.toBeInTheDocument();
  });

  it('fires onDismiss (not onOpenFullReport) when the hide button is clicked', () => {
    const onDismiss = vi.fn();
    const { onOpenFullReport } = renderCard({ onDismiss });
    fireEvent.click(screen.getByRole('button', { name: /hide from feed/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onOpenFullReport).not.toHaveBeenCalled();
  });

  it('omits the hide button when onDismiss is not provided', () => {
    renderCard();
    expect(screen.queryByRole('button', { name: /hide from feed/i })).not.toBeInTheDocument();
  });
});

describe('groupReportsByDay', () => {
  // Build timestamps from LOCAL date components so the test matches the grouping logic
  // (which buckets by local calendar day) regardless of the runner's timezone.
  const now = new Date(2026, 6, 19, 12, 0, 0);
  const at = (y: number, m: number, d: number, h: number) => new Date(y, m, d, h, 0, 0).toISOString();
  const item = (id: string, createdAt: string) => ({ id, createdAt });

  it('buckets reports into today / yesterday / older, preserving order', () => {
    const groups = groupReportsByDay(
      [
        item('a', at(2026, 6, 19, 9)),
        item('b', at(2026, 6, 19, 8)),
        item('c', at(2026, 6, 18, 22)),
        item('d', at(2026, 6, 10, 10))
      ],
      now
    );
    expect(groups.map((g) => g.kind)).toEqual(['today', 'yesterday', 'date']);
    expect(groups[0].reports.map((r) => r.id)).toEqual(['a', 'b']);
    expect(groups[1].reports.map((r) => r.id)).toEqual(['c']);
    expect(groups[2].reports.map((r) => r.id)).toEqual(['d']);
  });
});
