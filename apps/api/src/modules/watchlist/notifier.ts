import { config } from '../../config';
import { logger } from '../../lib/logger';
import type { MailerLike } from '../auth/mailer';
import type { RunReportRecord, SignalRecord } from '../reports/types';
import { normalizeWatchlistSymbol, type WatchlistRepositoryLike } from './repository';

export interface WatchlistNotifierDeps {
  watchlistRepository: Pick<WatchlistRepositoryLike, 'listWatchersForSymbols'>;
  userRepository: { findById(id: string): Promise<{ id: string; email: string } | null> };
  mailer?: MailerLike;
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

export function buildWatchlistAlertEmail(input: {
  agentId: string;
  agentName: string;
  report: RunReportRecord;
  matchedSignals: SignalRecord[];
  language?: string;
}): { subject: string; text: string; html: string } {
  const de = input.language === 'de';
  const symbols = input.matchedSignals.map((s) => s.symbol).join(', ');
  const subject = de ? `Watchlist-Alarm: ${symbols}` : `Watchlist alert: ${symbols}`;
  const footer = de
    ? 'Sie erhalten diese E-Mail, weil diese Symbole auf Ihrer Watchlist stehen. Entfernen Sie sie in der App, um keine Alarme mehr zu erhalten.'
    : "You're receiving this because these symbols are on your watchlist. Remove them in the app to stop these alerts.";
  const intro = de
    ? `Der Agent „${input.agentName}" hat einen neuen Bericht mit Signalen für Symbole auf Ihrer Watchlist veröffentlicht.`
    : `The agent "${input.agentName}" published a new report with signals for symbols on your watchlist.`;

  const text = [
    intro,
    '',
    `${de ? 'Signale' : 'Signals'}:`,
    ...input.matchedSignals.map(
      (signal) =>
        `  - ${signalArrow(signal.side)} ${signal.symbol} · ${signal.side.toUpperCase()} (${de ? 'Konfidenz' : 'confidence'} ${signal.confidence}%): ${signal.rationale} (${buildSymbolLink(input.agentId, signal.symbol)})`
    ),
    '',
    `${de ? 'Zusammenfassung' : 'Summary'}: ${input.report.summary}`,
    '',
    footer
  ].join('\n');

  const html = `
    <p>${de ? `Der Agent <strong>${input.agentName}</strong> hat einen neuen Bericht mit Signalen für Symbole auf Ihrer Watchlist veröffentlicht.` : `The agent <strong>${input.agentName}</strong> published a new report with signals for symbols on your watchlist.`}</p>
    <div>${input.matchedSignals
      .map(
        (signal) =>
          `<a href="${buildSymbolLink(input.agentId, signal.symbol)}" style="display:inline-block;margin:2px 6px 2px 0;padding:4px 10px;border-radius:12px;background:${signalColor(signal.side)}1a;color:${signalColor(signal.side)};font-weight:600;font-size:13px;text-decoration:none;">${signalArrow(signal.side)} ${signal.symbol} · ${signal.side.toUpperCase()}</a>`
      )
      .join('')}</div>
    <ul>${input.matchedSignals
      .map(
        (signal) =>
          `<li><span style="color:${signalColor(signal.side)};font-weight:700;">${signalArrow(signal.side)}</span> <a href="${buildSymbolLink(input.agentId, signal.symbol)}" style="color:#1677ff;font-weight:600;text-decoration:none;">${signal.symbol}</a> · ${signal.side.toUpperCase()} (${de ? 'Konfidenz' : 'confidence'} ${signal.confidence}%): ${signal.rationale}</li>`
      )
      .join('')}</ul>
    <p><strong>${de ? 'Zusammenfassung' : 'Summary'}:</strong> ${input.report.summary}</p>
    <p style="color:#666;font-size:12px;">${footer}</p>
  `;
  return { subject, text, html };
}

/**
 * Emails every user whose watchlist contains a symbol that appears in a freshly-created report.
 * Fires for every new report regardless of the playbook's notification/digest settings - a
 * watchlist follow is the user's own explicit subscription, independent of playbook recipients.
 * Entirely best-effort: any failure is logged and never thrown, so it can't fail a run.
 */
export class WatchlistNotifier {
  constructor(private readonly deps: WatchlistNotifierDeps) {}

  async notifyForReport(input: {
    agentId: string;
    agentName: string;
    report: RunReportRecord;
    language?: string;
  }): Promise<void> {
    if (!this.deps.mailer) return;
    try {
      const symbols = [...new Set(input.report.signals.map((s) => normalizeWatchlistSymbol(s.symbol)))];
      if (symbols.length === 0) return;
      const watchers = await this.deps.watchlistRepository.listWatchersForSymbols(symbols);
      if (watchers.length === 0) return;

      const symbolsByUser = new Map<string, Set<string>>();
      for (const watcher of watchers) {
        const set = symbolsByUser.get(watcher.userId) ?? new Set<string>();
        set.add(watcher.symbol);
        symbolsByUser.set(watcher.userId, set);
      }

      for (const [userId, watchedSymbols] of symbolsByUser) {
        try {
          const user = await this.deps.userRepository.findById(userId);
          if (!user?.email) continue;
          const matchedSignals = input.report.signals.filter((signal) =>
            watchedSymbols.has(normalizeWatchlistSymbol(signal.symbol))
          );
          if (matchedSignals.length === 0) continue;
          const { subject, text, html } = buildWatchlistAlertEmail({
            agentId: input.agentId,
            agentName: input.agentName,
            report: input.report,
            matchedSignals,
            language: input.language
          });
          await this.deps.mailer.send({ to: user.email, subject, text, html });
        } catch (error) {
          logger.warn(`[watchlist] Failed to send watchlist alert to user ${userId}`, error);
        }
      }
    } catch (error) {
      logger.warn('[watchlist] Failed to process watchlist alerts for report', error);
    }
  }
}
