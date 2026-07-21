import type { PrismaClient } from '@prisma/client';
import type { MailerLike } from '../auth/mailer';
import { config } from '../../config';
import { logger } from '../../lib/logger';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export interface DigestSignal {
  symbol: string;
  side: string;
  confidence: number;
  rationale: string;
}

export interface DigestReport {
  id: string;
  agentId: string;
  summary: string;
  createdAt: Date;
  signals: DigestSignal[];
}

export interface DigestPlaybook {
  id: string;
  agentId: string;
  name: string;
  recipients: string[];
  language: string;
  digestFrequency: string;
  lastDigestSentAt: Date | null;
}

export interface DigestStoreLike {
  /** Enabled playbooks with notifications on, digestFrequency 'daily' or 'weekly', and at least one recipient. */
  listDigestPlaybooks(): Promise<DigestPlaybook[]>;
  /** Reports produced by this playbook's runs since `since` (oldest first). */
  listReportsForPlaybookSince(playbookId: string, since: Date): Promise<DigestReport[]>;
  markDigestSent(playbookId: string, at: Date): Promise<void>;
}

function parseRecipients(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e): e is string => typeof e === 'string').map((e) => e.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export class PrismaDigestStore implements DigestStoreLike {
  constructor(private readonly db: Pick<PrismaClient, 'playbook' | 'agentRunReport'>) {}

  async listDigestPlaybooks(): Promise<DigestPlaybook[]> {
    const rows = await this.db.playbook.findMany({
      where: {
        enabled: true,
        notificationsEnabled: true,
        digestFrequency: { in: ['daily', 'weekly'] }
      }
    });
    return rows
      .map((row: any) => ({
        id: row.id,
        agentId: row.agentId,
        name: row.name,
        recipients: parseRecipients(row.recipientsJson),
        language: row.language ?? 'en',
        digestFrequency: row.digestFrequency,
        lastDigestSentAt: row.lastDigestSentAt ?? null
      }))
      .filter((pb) => pb.recipients.length > 0);
  }

  async listReportsForPlaybookSince(playbookId: string, since: Date): Promise<DigestReport[]> {
    const rows = await this.db.agentRunReport.findMany({
      where: {
        agentRun: { playbookId },
        createdAt: { gt: since }
      },
      include: { signals: true },
      orderBy: { createdAt: 'asc' }
    });
    return rows.map((row: any) => ({
      id: row.id,
      agentId: row.agentId,
      summary: row.summary,
      createdAt: row.createdAt,
      signals: (row.signals ?? []).map((signal: any) => ({
        symbol: signal.symbol,
        side: signal.side,
        confidence: signal.confidence,
        rationale: signal.rationale
      }))
    }));
  }

  async markDigestSent(playbookId: string, at: Date): Promise<void> {
    await (this.db.playbook as any).update({
      where: { id: playbookId },
      data: { lastDigestSentAt: at }
    });
  }
}

function digestPeriodMs(frequency: string): number {
  return frequency === 'weekly' ? WEEK_MS : DAY_MS;
}

function signalArrow(side: string): string {
  return side === 'long' ? '\u25B2' : '\u25BC';
}

function signalColor(side: string): string {
  return side === 'long' ? '#389e0d' : '#cf1322';
}

function buildSymbolLink(agentId: string, symbol: string): string {
  return `${config.appBaseUrl}/?agentId=${encodeURIComponent(agentId)}&symbol=${encodeURIComponent(symbol)}`;
}

/** Latest signal per symbol across all digest reports (later reports win). */
export function aggregateDigestSignals(reports: DigestReport[]): Array<DigestSignal & { agentId: string }> {
  const bySymbol = new Map<string, DigestSignal & { agentId: string }>();
  for (const report of reports) {
    for (const signal of report.signals) {
      bySymbol.set(signal.symbol, { ...signal, agentId: report.agentId });
    }
  }
  return [...bySymbol.values()];
}

export function buildDigestEmail(
  playbook: Pick<DigestPlaybook, 'name' | 'language' | 'digestFrequency'>,
  reports: DigestReport[]
): { subject: string; text: string; html: string } {
  const de = playbook.language === 'de';
  const weekly = playbook.digestFrequency === 'weekly';
  const periodLabel = de ? (weekly ? 'Wöchentliche' : 'Tägliche') : weekly ? 'Weekly' : 'Daily';
  const subject = de
    ? `${periodLabel} Zusammenfassung für „${playbook.name}" (${reports.length} ${reports.length === 1 ? 'Bericht' : 'Berichte'})`
    : `${periodLabel} digest for "${playbook.name}" (${reports.length} ${reports.length === 1 ? 'report' : 'reports'})`;
  const footer = de
    ? 'Sie erhalten diese E-Mail, weil dieses Playbook auf periodische Sammelberichte eingestellt ist.'
    : "You're receiving this because this playbook is set to periodic digest emails.";

  const aggregated = aggregateDigestSignals(reports);
  const summaryPillsHtml = aggregated
    .map(
      (signal) => `
      <a href="${buildSymbolLink(signal.agentId, signal.symbol)}" style="display:inline-block;margin:2px 6px 2px 0;padding:4px 10px;border-radius:12px;background:${signalColor(
        signal.side
      )}1a;color:${signalColor(signal.side)};font-weight:600;font-size:13px;text-decoration:none;">
        ${signalArrow(signal.side)} ${signal.symbol} · ${signal.side.toUpperCase()}
      </a>`
    )
    .join('');
  const summaryLineText = aggregated
    .map((signal) => `${signalArrow(signal.side)} ${signal.symbol} (${signal.side.toUpperCase()})`)
    .join('  ');

  const reportSectionsText = reports
    .map((report) => {
      const signalLines =
        report.signals.length === 0
          ? `  ${de ? '(keine Signale in diesem Bericht)' : '(no signals in this report)'}`
          : report.signals
              .map(
                (signal) =>
                  `  - ${signalArrow(signal.side)} ${signal.symbol} · ${signal.side.toUpperCase()} (${de ? 'Konfidenz' : 'confidence'} ${signal.confidence}%): ${signal.rationale}`
              )
              .join('\n');
      return [`${report.createdAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`, report.summary, signalLines].join('\n');
    })
    .join('\n\n---\n\n');

  const reportSectionsHtml = reports
    .map(
      (report) => `
      <div style="margin:14px 0;padding:12px 14px;border:1px solid #eee;border-radius:8px;">
        <p style="margin:0 0 6px;color:#888;font-size:12px;">${report.createdAt.toISOString().slice(0, 16).replace('T', ' ')} UTC</p>
        <p style="margin:0 0 8px;">${report.summary}</p>
        ${
          report.signals.length === 0
            ? `<p style="color:#888;font-size:13px;margin:0;">${de ? '(keine Signale in diesem Bericht)' : '(no signals in this report)'}</p>`
            : `<ul style="margin:0;padding-left:18px;">${report.signals
                .map(
                  (signal) =>
                    `<li><span style="color:${signalColor(signal.side)};font-weight:700;">${signalArrow(signal.side)}</span> <a href="${buildSymbolLink(
                      report.agentId,
                      signal.symbol
                    )}" style="color:#1677ff;font-weight:600;text-decoration:none;">${signal.symbol}</a> · ${signal.side.toUpperCase()} (${de ? 'Konfidenz' : 'confidence'} ${signal.confidence}%): ${signal.rationale}</li>`
                )
                .join('')}</ul>`
        }
      </div>`
    )
    .join('');

  const intro = de
    ? `${periodLabel} Zusammenfassung für das Playbook „${playbook.name}": ${reports.length} ${reports.length === 1 ? 'neuer Bericht' : 'neue Berichte'}.`
    : `${periodLabel} digest for the playbook "${playbook.name}": ${reports.length} new ${reports.length === 1 ? 'report' : 'reports'}.`;

  const text = [
    intro,
    '',
    aggregated.length > 0 ? `${de ? 'Signalübersicht' : 'Signal overview'}: ${summaryLineText}` : '',
    '',
    reportSectionsText,
    '',
    footer
  ]
    .filter((line) => line !== '')
    .join('\n');

  const html = `
    <p>${intro}</p>
    ${aggregated.length > 0 ? `<p><strong>${de ? 'Signalübersicht' : 'Signal overview'}:</strong></p><div>${summaryPillsHtml}</div>` : ''}
    ${reportSectionsHtml}
    <p style="color:#666;font-size:12px;">${footer}</p>
  `;
  return { subject, text, html };
}

export interface DigestServiceDeps {
  store: DigestStoreLike;
  mailer?: MailerLike;
  now?: () => Date;
}

/**
 * Sends a single rollup email per due digest playbook, covering all reports produced since the
 * last digest. A playbook is due when it has never sent a digest or its period (24h/7d) has
 * elapsed. `lastDigestSentAt` advances even when there were no reports (skipping the email), so
 * the window never silently grows unbounded. Best-effort per playbook: one failing playbook or
 * SMTP hiccup never blocks the others or the caller.
 */
export async function processDueDigests(deps: DigestServiceDeps): Promise<number> {
  const now = deps.now ? deps.now() : new Date();
  let sent = 0;
  const playbooks = await deps.store.listDigestPlaybooks();
  for (const playbook of playbooks) {
    try {
      const periodMs = digestPeriodMs(playbook.digestFrequency);
      const last = playbook.lastDigestSentAt;
      if (last && now.getTime() - last.getTime() < periodMs) {
        continue;
      }
      // First digest after enabling covers at most one full period back, not all history.
      const since = last ?? new Date(now.getTime() - periodMs);
      const reports = await deps.store.listReportsForPlaybookSince(playbook.id, since);
      await deps.store.markDigestSent(playbook.id, now);
      if (reports.length === 0) {
        continue;
      }
      if (!deps.mailer || playbook.recipients.length === 0) {
        continue;
      }
      const { subject, text, html } = buildDigestEmail(playbook, reports);
      await Promise.all(
        playbook.recipients.map(async (to) => {
          try {
            await deps.mailer!.send({ to, subject, text, html });
          } catch (error) {
            logger.warn(`[digest] Failed to send digest email to ${to} for playbook ${playbook.id}`, error);
          }
        })
      );
      sent += 1;
    } catch (error) {
      logger.warn(`[digest] Failed to process digest for playbook ${playbook.id}`, error);
    }
  }
  return sent;
}

export function startDigestLoop(deps: DigestServiceDeps, intervalMs = 5 * 60_000): () => void {
  const timer = setInterval(async () => {
    try {
      await processDueDigests(deps);
    } catch (error) {
      logger.warn('[digest] Digest loop tick failed', error);
    }
  }, intervalMs);
  return () => clearInterval(timer);
}
