import { describe, expect, it } from 'vitest';
import {
  aggregateDigestSignals,
  buildDigestEmail,
  processDueDigests,
  type DigestPlaybook,
  type DigestReport,
  type DigestStoreLike
} from './digest';

function makeReport(overrides: Partial<DigestReport> = {}): DigestReport {
  return {
    id: 'report-1',
    agentId: 'agent-1',
    summary: 'Markets rallied on earnings.',
    createdAt: new Date('2026-07-15T08:00:00Z'),
    signals: [{ symbol: 'AAPL', side: 'long', confidence: 80, rationale: 'Strong guidance' }],
    ...overrides
  };
}

function makePlaybook(overrides: Partial<DigestPlaybook> = {}): DigestPlaybook {
  return {
    id: 'pb-1',
    agentId: 'agent-1',
    name: 'Morning Watch',
    recipients: ['user@example.com'],
    language: 'en',
    digestFrequency: 'daily',
    lastDigestSentAt: null,
    ...overrides
  };
}

class FakeDigestStore implements DigestStoreLike {
  playbooks: DigestPlaybook[] = [];
  reportsByPlaybook = new Map<string, DigestReport[]>();
  sinceCalls: Array<{ playbookId: string; since: Date }> = [];
  marked: Array<{ playbookId: string; at: Date }> = [];

  async listDigestPlaybooks() {
    return this.playbooks;
  }

  async listReportsForPlaybookSince(playbookId: string, since: Date) {
    this.sinceCalls.push({ playbookId, since });
    return this.reportsByPlaybook.get(playbookId) ?? [];
  }

  async markDigestSent(playbookId: string, at: Date) {
    this.marked.push({ playbookId, at });
  }
}

class FakeMailer {
  sent: Array<{ to: string; subject: string; text: string; html: string }> = [];
  async send(message: { to: string; subject: string; text: string; html: string }) {
    this.sent.push(message);
  }
}

describe('aggregateDigestSignals', () => {
  it('keeps the latest signal per symbol across reports', () => {
    const reports = [
      makeReport({
        id: 'r1',
        signals: [
          { symbol: 'AAPL', side: 'long', confidence: 60, rationale: 'old' },
          { symbol: 'TSLA', side: 'short', confidence: 70, rationale: 'still valid' }
        ]
      }),
      makeReport({ id: 'r2', signals: [{ symbol: 'AAPL', side: 'short', confidence: 90, rationale: 'newer view' }] })
    ];
    const aggregated = aggregateDigestSignals(reports);
    expect(aggregated).toHaveLength(2);
    const aapl = aggregated.find((s) => s.symbol === 'AAPL');
    expect(aapl?.side).toBe('short');
    expect(aapl?.confidence).toBe(90);
  });
});

describe('buildDigestEmail', () => {
  it('builds an English daily digest with report count, signal overview, and per-report sections', () => {
    const { subject, text, html } = buildDigestEmail(makePlaybook(), [
      makeReport(),
      makeReport({ id: 'r2', summary: 'Second report.', signals: [{ symbol: 'TSLA', side: 'short', confidence: 55, rationale: 'Weak deliveries' }] })
    ]);
    expect(subject).toBe('Daily digest for "Morning Watch" (2 reports)');
    expect(text).toContain('Signal overview');
    expect(text).toContain('\u25B2 AAPL (LONG)');
    expect(text).toContain('\u25BC TSLA (SHORT)');
    expect(text).toContain('Markets rallied on earnings.');
    expect(text).toContain('Second report.');
    expect(html).toContain('AAPL');
    expect(html).toContain('agentId=agent-1&symbol=AAPL');
  });

  it('builds a German weekly digest', () => {
    const { subject, text } = buildDigestEmail(makePlaybook({ language: 'de', digestFrequency: 'weekly' }), [makeReport()]);
    expect(subject).toBe('Wöchentliche Zusammenfassung für „Morning Watch" (1 Bericht)');
    expect(text).toContain('Signalübersicht');
    expect(text).toContain('Konfidenz 80%');
  });
});

describe('processDueDigests', () => {
  it('sends a digest to every recipient and marks the playbook as sent', async () => {
    const store = new FakeDigestStore();
    const mailer = new FakeMailer();
    store.playbooks = [makePlaybook({ recipients: ['a@example.com', 'b@example.com'] })];
    store.reportsByPlaybook.set('pb-1', [makeReport()]);

    const sent = await processDueDigests({ store, mailer, now: () => new Date('2026-07-16T09:00:00Z') });

    expect(sent).toBe(1);
    expect(mailer.sent).toHaveLength(2);
    expect(mailer.sent.map((m) => m.to).sort()).toEqual(['a@example.com', 'b@example.com']);
    expect(store.marked).toEqual([{ playbookId: 'pb-1', at: new Date('2026-07-16T09:00:00Z') }]);
  });

  it('skips playbooks whose period has not yet elapsed', async () => {
    const store = new FakeDigestStore();
    const mailer = new FakeMailer();
    store.playbooks = [makePlaybook({ lastDigestSentAt: new Date('2026-07-16T00:00:00Z') })];
    store.reportsByPlaybook.set('pb-1', [makeReport()]);

    const sent = await processDueDigests({ store, mailer, now: () => new Date('2026-07-16T09:00:00Z') });

    expect(sent).toBe(0);
    expect(mailer.sent).toHaveLength(0);
    expect(store.marked).toHaveLength(0);
  });

  it('sends a weekly digest only after 7 days', async () => {
    const store = new FakeDigestStore();
    const mailer = new FakeMailer();
    store.playbooks = [
      makePlaybook({ digestFrequency: 'weekly', lastDigestSentAt: new Date('2026-07-10T00:00:00Z') })
    ];
    store.reportsByPlaybook.set('pb-1', [makeReport()]);

    expect(await processDueDigests({ store, mailer, now: () => new Date('2026-07-16T09:00:00Z') })).toBe(0);
    expect(await processDueDigests({ store, mailer, now: () => new Date('2026-07-17T01:00:00Z') })).toBe(1);
  });

  it('advances lastDigestSentAt without emailing when there are no new reports', async () => {
    const store = new FakeDigestStore();
    const mailer = new FakeMailer();
    store.playbooks = [makePlaybook({ lastDigestSentAt: new Date('2026-07-15T00:00:00Z') })];

    const sent = await processDueDigests({ store, mailer, now: () => new Date('2026-07-16T09:00:00Z') });

    expect(sent).toBe(0);
    expect(mailer.sent).toHaveLength(0);
    expect(store.marked).toEqual([{ playbookId: 'pb-1', at: new Date('2026-07-16T09:00:00Z') }]);
  });

  it('uses lastDigestSentAt as the window start, or one period back for a first digest', async () => {
    const store = new FakeDigestStore();
    const last = new Date('2026-07-15T03:00:00Z');
    store.playbooks = [
      makePlaybook({ id: 'pb-1', lastDigestSentAt: last }),
      makePlaybook({ id: 'pb-2', lastDigestSentAt: null })
    ];

    await processDueDigests({ store, mailer: new FakeMailer(), now: () => new Date('2026-07-16T09:00:00Z') });

    expect(store.sinceCalls.find((c) => c.playbookId === 'pb-1')?.since).toEqual(last);
    expect(store.sinceCalls.find((c) => c.playbookId === 'pb-2')?.since).toEqual(new Date('2026-07-15T09:00:00Z'));
  });

  it('continues with remaining playbooks when one fails', async () => {
    const store = new FakeDigestStore();
    const mailer = new FakeMailer();
    store.playbooks = [makePlaybook({ id: 'pb-bad' }), makePlaybook({ id: 'pb-good' })];
    store.reportsByPlaybook.set('pb-good', [makeReport()]);
    const originalList = store.listReportsForPlaybookSince.bind(store);
    store.listReportsForPlaybookSince = async (playbookId, since) => {
      if (playbookId === 'pb-bad') throw new Error('boom');
      return originalList(playbookId, since);
    };

    const sent = await processDueDigests({ store, mailer, now: () => new Date('2026-07-16T09:00:00Z') });

    expect(sent).toBe(1);
    expect(mailer.sent).toHaveLength(1);
  });
});
