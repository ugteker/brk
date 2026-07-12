import { describe, expect, it, vi } from 'vitest';
import { sendAgentChangeConfirmation, sendReportNotification } from './notifications';
import type { Agent } from './types';
import type { RunReportRecord } from '../reports/types';
import type { MailerLike } from '../auth/mailer';

function createAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-1',
    ownerUserId: 'user-1',
    name: 'Test Agent',
    description: '',
    status: 'active',
    createdAt: new Date('2026-07-10T00:00:00.000Z'),
    updatedAt: new Date('2026-07-10T00:00:00.000Z'),
    sources: [],
    preferences: {},
    recipients: ['alerts@example.com'],
    schedule: null,
    ...overrides
  };
}

function createReport(overrides: Partial<RunReportRecord> = {}): RunReportRecord {
  return {
    id: 'report-1',
    agentId: 'agent-1',
    agentRunId: 'run-1',
    promptVersionId: 'prompt-1',
    summary: 'Bullish on AAPL',
    sourceWarnings: [],
    needsHumanReview: false,
    signals: [{ symbol: 'AAPL', side: 'long', confidence: 82, rationale: 'Strong product cycle', citations: [] }],
    createdAt: new Date('2026-07-10T00:00:00.000Z'),
    ...overrides
  };
}

describe('sendReportNotification', () => {
  it('does nothing when no mailer is configured', async () => {
    await expect(sendReportNotification(undefined, createAgent(), createReport())).resolves.toBeUndefined();
  });

  it('does nothing when the agent has no recipients', async () => {
    const send = vi.fn();
    const mailer: MailerLike = { send };
    await sendReportNotification(mailer, createAgent({ recipients: [] }), createReport());
    expect(send).not.toHaveBeenCalled();
  });

  it('emails every configured recipient with the report summary and signals', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const mailer: MailerLike = { send };
    const agent = createAgent({ recipients: ['a@example.com', 'b@example.com'] });
    const report = createReport();

    await sendReportNotification(mailer, agent, report);

    expect(send).toHaveBeenCalledTimes(2);
    const [firstCall] = send.mock.calls;
    expect(firstCall[0].to).toBe('a@example.com');
    expect(firstCall[0].subject).toContain('Test Agent');
    expect(firstCall[0].text).toContain('Bullish on AAPL');
    expect(firstCall[0].text).toContain('AAPL');
    expect(firstCall[0].html).toContain('AAPL');
  });

  it('includes a long/short arrow icon and a top-of-email signal summary for each signal', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const mailer: MailerLike = { send };
    const agent = createAgent();
    const report = createReport({
      signals: [
        { symbol: 'AAPL', side: 'long', confidence: 82, rationale: 'Strong product cycle', citations: [] },
        { symbol: 'TSLA', side: 'short', confidence: 60, rationale: 'Weak demand', citations: [] }
      ]
    });

    await sendReportNotification(mailer, agent, report);

    const { html, text } = send.mock.calls[0][0];
    expect(html).toContain('Signal summary');
    expect(html).toContain('\u25B2'); // long arrow
    expect(html).toContain('\u25BC'); // short arrow
    expect(html).toContain('#389e0d'); // long color
    expect(html).toContain('#cf1322'); // short color
    expect(text).toContain('Signal summary:');
    expect(text).toContain('\u25B2 AAPL (LONG)');
    expect(text).toContain('\u25BC TSLA (SHORT)');
  });

  it('omits the signal summary section when the report has no signals', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const mailer: MailerLike = { send };
    const agent = createAgent();
    const report = createReport({ signals: [] });

    await sendReportNotification(mailer, agent, report);

    const { html } = send.mock.calls[0][0];
    expect(html).not.toContain('Signal summary');
  });

  it('makes each symbol a clickable deep link back into the app for that agent/symbol', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const mailer: MailerLike = { send };
    const agent = createAgent({ id: 'agent-42' });
    const report = createReport({
      signals: [{ symbol: 'AAPL', side: 'long', confidence: 82, rationale: 'Strong product cycle', citations: [] }]
    });

    await sendReportNotification(mailer, agent, report);

    const { html, text } = send.mock.calls[0][0];
    expect(html).toContain('href="http://localhost:4173/?agentId=agent-42&symbol=AAPL"');
    expect(text).toContain('http://localhost:4173/?agentId=agent-42&symbol=AAPL');
  });

  it('swallows a per-recipient send failure without throwing', async () => {
    const send = vi.fn().mockRejectedValue(new Error('smtp down'));
    const mailer: MailerLike = { send };

    await expect(sendReportNotification(mailer, createAgent(), createReport())).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('sendAgentChangeConfirmation (regression)', () => {
  it('still sends a created-confirmation email as before', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const mailer: MailerLike = { send };

    await sendAgentChangeConfirmation(mailer, createAgent(), 'created');

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].subject).toContain('created');
  });
});
