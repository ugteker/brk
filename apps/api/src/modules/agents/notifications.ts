import type { MailerLike } from '../auth/mailer';
import type { Agent } from './types';
import type { RunReportRecord } from '../reports/types';
import { config } from '../../config';
import { logger } from '../../lib/logger';

export type AgentChangeAction = 'created' | 'updated';

function formatSourcesList(agent: Agent): string {
  if (agent.sources.length === 0) return '  (no sources configured)';
  return agent.sources
    .map((source) => `  - [${source.type}] ${source.value} (every ${source.frequencyMinutes} min)`)
    .join('\n');
}

function buildAgentConfirmationEmail(agent: Agent, action: AgentChangeAction, language = 'en'): { subject: string; text: string; html: string } {
  const de = language === 'de';
  const verb = de
    ? (action === 'created' ? 'erstellt' : 'aktualisiert')
    : (action === 'created' ? 'created' : 'updated');
  const subject = de ? `Agent „${agent.name}" ${verb}` : `Agent "${agent.name}" ${verb}`;
  const footer = de
    ? 'Sie erhalten diese E-Mail, weil Sie als Empfänger für Benachrichtigungen dieses Agenten eingetragen sind.'
    : "You're receiving this because you're listed as a recipient for this agent's notifications.";
  const text = de
    ? [`Der Agent „${agent.name}" wurde ${verb}.`, '', `Status: ${agent.status}`, 'Quellen:', formatSourcesList(agent), '', footer].join('\n')
    : [`The agent "${agent.name}" has been ${verb}.`, '', `Status: ${agent.status}`, `Sources:`, formatSourcesList(agent), '', footer].join('\n');
  const html = de
    ? `<p>Der Agent <strong>${agent.name}</strong> wurde <strong>${verb}</strong>.</p><p><strong>Status:</strong> ${agent.status}</p><p><strong>Quellen:</strong></p><ul>${agent.sources.map((s) => `<li>[${s.type}] ${s.value} (alle ${s.frequencyMinutes} Min)</li>`).join('')}</ul><p style="color:#666;font-size:12px;">${footer}</p>`
    : `<p>The agent <strong>${agent.name}</strong> has been <strong>${verb}</strong>.</p><p><strong>Status:</strong> ${agent.status}</p><p><strong>Sources:</strong></p><ul>${agent.sources.map((s) => `<li>[${s.type}] ${s.value} (every ${s.frequencyMinutes} min)</li>`).join('')}</ul><p style="color:#666;font-size:12px;">${footer}</p>`;
  return { subject, text, html };
}

/**
 * Sends a best-effort confirmation email to every configured recipient whenever an agent is
 * created or updated. Failures are logged but never thrown - a flaky SMTP server or a missing
 * mailer configuration must not break the agent create/update request itself.
 */
export async function sendAgentChangeConfirmation(
  mailer: MailerLike | undefined,
  agent: Agent,
  action: AgentChangeAction,
  recipients: string[] = [],
  language = 'en'
): Promise<void> {
  if (!mailer) return;
  if (recipients.length === 0) return;

  const { subject, text, html } = buildAgentConfirmationEmail(agent, action, language);
  await Promise.all(
    recipients.map(async (to) => {
      try {
        await mailer.send({ to, subject, text, html });
      } catch (error) {
        logger.warn(`[agents] Failed to send ${action} confirmation email to ${to}`, error);
      }
    })
  );
}

function formatSignalsList(report: RunReportRecord, agentId: string): string {
  if (report.signals.length === 0) return '  (no signals in this report)';
  return report.signals
    .map(
      (signal) =>
        `  - ${signalArrow(signal.side)} ${signal.symbol} · ${signal.side.toUpperCase()} (confidence ${signal.confidence}%): ${signal.rationale} (${buildSymbolLink(agentId, signal.symbol)})`
    )
    .join('\n');
}

// Plain-text/email-safe arrow used as a long/short indicator (renders reliably across mail
// clients, unlike some emoji glyphs) - up for long, down for short.
function signalArrow(side: string): string {
  return side === 'long' ? '\u25B2' : '\u25BC';
}

function signalColor(side: string): string {
  return side === 'long' ? '#389e0d' : '#cf1322';
}

// Deep link back into the app for a given symbol, read by AgentsPage on load (?agentId=&symbol=)
// to select the agent and jump straight into its SymbolPerformancePage - lets recipients click a
// symbol in the email and land directly on that symbol's chart/signal history.
function buildSymbolLink(agentId: string, symbol: string): string {
  return `${config.appBaseUrl}/?agentId=${encodeURIComponent(agentId)}&symbol=${encodeURIComponent(symbol)}`;
}

// Compact "SYMBOL ▲/▼" pill summarizing every signal in the report, shown at the top of the
// email so recipients can see the overall long/short picture at a glance before reading details.
function buildSignalSummaryHtml(report: RunReportRecord, agentId: string): string {
  if (report.signals.length === 0) return '';
  const pills = report.signals
    .map(
      (signal) => `
      <a href="${buildSymbolLink(agentId, signal.symbol)}" style="display:inline-block;margin:2px 6px 2px 0;padding:4px 10px;border-radius:12px;background:${signalColor(
        signal.side
      )}1a;color:${signalColor(signal.side)};font-weight:600;font-size:13px;text-decoration:none;">
        ${signalArrow(signal.side)} ${signal.symbol} · ${signal.side.toUpperCase()}
      </a>`
    )
    .join('');
  return `<p><strong>Signal summary:</strong></p><div>${pills}</div>`;
}

function buildSignalSummaryText(report: RunReportRecord, agentId: string): string {
  if (report.signals.length === 0) return '';
  return report.signals
    .map((signal) => `${signalArrow(signal.side)} ${signal.symbol} (${signal.side.toUpperCase()}) ${buildSymbolLink(agentId, signal.symbol)}`)
    .join('  ');
}

function formatItemTitlesList(itemTitles: string[]): string {
  if (itemTitles.length === 0) return '  (item titles unavailable for this run)';
  return itemTitles.map((title) => `  - ${title}`).join('\n');
}

function buildReportNotificationEmail(
  agent: Agent,
  report: RunReportRecord,
  itemTitles: string[],
  language = 'en'
): { subject: string; text: string; html: string } {
  const de = language === 'de';
  const subject = de ? `Bericht für „${agent.name}"` : `Report for "${agent.name}"`;
  const footer = de
    ? 'Sie erhalten diese E-Mail, weil Sie als Empfänger für Benachrichtigungen dieses Agenten eingetragen sind.'
    : "You're receiving this because you're listed as a recipient for this agent's notifications.";
  const summaryLine = buildSignalSummaryText(report, agent.id);
  const text = [
    de ? `Für den Agenten „${agent.name}" ist ein neuer Bericht verfügbar.` : `A report is available for the agent "${agent.name}".`,
    '',
    itemTitles.length > 0 ? `${de ? 'Verarbeitete Inhalte' : 'Crawled item(s)'}:\n${formatItemTitlesList(itemTitles)}` : '',
    '',
    summaryLine ? `${de ? 'Signalübersicht' : 'Signal summary'}: ${summaryLine}` : '',
    '',
    `${de ? 'Zusammenfassung' : 'Summary'}: ${report.summary}`,
    '',
    `${de ? 'Signale' : 'Signals'}:`,
    formatSignalsList(report, agent.id),
    '',
    report.needsHumanReview ? (de ? 'Dieser Bericht ist zur manuellen Überprüfung markiert.' : 'This report is flagged as needing human review.') : '',
    report.sourceWarnings.length > 0 ? `${de ? 'Quellwarnungen' : 'Source warnings'}:\n${report.sourceWarnings.map((w) => `  - ${w}`).join('\n')}` : '',
    '',
    footer
  ]
    .filter((line) => line !== '')
    .join('\n');
  const html = `
    <p>${de ? `Für den Agenten <strong>${agent.name}</strong> ist ein neuer Bericht verfügbar.` : `A report is available for the agent <strong>${agent.name}</strong>.`}</p>
    ${itemTitles.length > 0 ? `<p><strong>${de ? 'Verarbeitete Inhalte' : 'Crawled item(s)'}:</strong></p><ul>${itemTitles.map((title) => `<li>${title}</li>`).join('')}</ul>` : ''}
    ${buildSignalSummaryHtml(report, agent.id)}
    <p><strong>${de ? 'Zusammenfassung' : 'Summary'}:</strong> ${report.summary}</p>
    <p><strong>${de ? 'Signale' : 'Signals'}:</strong></p>
    <ul>${report.signals.map((signal) => `<li><span style="color:${signalColor(signal.side)};font-weight:700;">${signalArrow(signal.side)}</span> <a href="${buildSymbolLink(agent.id, signal.symbol)}" style="color:#1677ff;font-weight:600;text-decoration:none;">${signal.symbol}</a> · ${signal.side.toUpperCase()} (${de ? 'Konfidenz' : 'confidence'} ${signal.confidence}%): ${signal.rationale}</li>`).join('')}</ul>
    ${report.needsHumanReview ? `<p><strong>${de ? 'Dieser Bericht ist zur manuellen Überprüfung markiert.' : 'This report is flagged as needing human review.'}</strong></p>` : ''}
    ${report.sourceWarnings.length > 0 ? `<p><strong>${de ? 'Quellwarnungen' : 'Source warnings'}:</strong></p><ul>${report.sourceWarnings.map((w) => `<li>${w}</li>`).join('')}</ul>` : ''}
    <p style="color:#666;font-size:12px;">${footer}</p>
  `;
  return { subject, text, html };
}

/**
 * Sends a best-effort email about a specific report to every configured recipient - used both by
 * a future automatic post-run notification and by the manual "re-send" action in the Reports view.
 * `itemTitles` lists the human-readable title of each episode/article/video crawled and fed into
 * this report (falls back to the raw source URL when a title wasn't available), so recipients can
 * see at a glance exactly which content generated the report - defaults to an empty list for
 * callers (e.g. the manual re-send action) that don't have this information handy.
 * Like `sendAgentChangeConfirmation`, failures are logged per-recipient but never thrown, so a
 * flaky SMTP server can't break the calling request.
 */
export async function sendReportNotification(
  mailer: MailerLike | undefined,
  agent: Agent,
  report: RunReportRecord,
  itemTitles: string[] = [],
  recipients: string[] = [],
  language = 'en'
): Promise<void> {
  if (!mailer) return;
  if (recipients.length === 0) return;

  const { subject, text, html } = buildReportNotificationEmail(agent, report, itemTitles, language);
  await Promise.all(
    recipients.map(async (to) => {
      try {
        await mailer.send({ to, subject, text, html });
      } catch (error) {
        logger.warn(`[agents] Failed to send report notification email to ${to}`, error);
      }
    })
  );
}
