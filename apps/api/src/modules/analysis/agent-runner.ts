import { buildAnalysisRequest } from './prompt-builder';
import { buildEffectiveSystemPrompt } from './character-prompt-strategy';
import type { ClaudeAnalysisResult, EvidenceBlock, SourceAdapter, SourceConfig, SourceCursorState } from './types';
import type { ClaudeClient } from './claude-client';
import type { Agent } from '../agents/types';
import type { PromptRepository } from '../prompts/repository';
import type { ArtifactRepository } from '../artifacts/repository';
import type { ReportRepository } from '../reports/repository';
import type { RunReportRecord } from '../reports/types';
import type { SourceCursorRepositoryLike } from '../crawler/source-cursor-repository';
import type { RunPhase } from '../runs/run-queue.service';
import { logger } from '../../lib/logger';
import { sendReportNotification } from '../agents/notifications';
import type { MailerLike } from '../auth/mailer';
import { estimateCostUsd } from './token-pricing';

export interface AgentRunResult {
  status: 'succeeded' | 'succeeded_no_new_content' | 'failed';
  errorCode?: string;
  errorMessage?: string;
  reportId?: string;
}

/** Forces a run to crawl only one specific episode from one specific episodic source, bypassing
 * the normal "N most recent unseen items" selection - backs the manual-run episode picker. */
export interface ForcedEpisodeSelection {
  sourceType: SourceConfig['type'];
  sourceValue: string;
  itemLink: string;
}

export interface AgentRunOptions {
  forcedEpisode?: ForcedEpisodeSelection;
  playbookRecipients?: string[];
  playbookLanguage?: string;
  playbookNotificationsEnabled?: boolean;
  // 'daily'/'weekly' suppress the immediate per-run email; those reports are rolled up into a
  // periodic digest email by the digest loop instead. 'immediate'/undefined keeps per-run emails.
  playbookDigestFrequency?: string;
}

export interface AgentRunnerDeps {
  agentRepository: { getAgent(agentId: string): Promise<Agent | null> };
  promptRepository: Pick<PromptRepository, 'getLatestPromptVersion'>;
  artifactRepository: Pick<ArtifactRepository, 'saveArtifact'>;
  reportRepository: Pick<ReportRepository, 'saveRunReport'>;
  claudeClient: Pick<ClaudeClient, 'analyze'>;
  sourceAdapters: Record<SourceConfig['type'], SourceAdapter>;
  cursorRepository: SourceCursorRepositoryLike;
  // Best-effort mailer for the automatic post-run report notification - if omitted (or if sending
  // fails), the run itself still succeeds; email is a courtesy, not a run precondition.
  mailer?: MailerLike;
  // Alerts users whose personal watchlist contains a symbol from the new report - independent of
  // playbook recipients/digest settings. Best-effort: never fails the run.
  watchlistNotifier?: {
    notifyForReport(input: { agentId: string; agentName: string; report: RunReportRecord; language?: string }): Promise<void>;
  };
  // Reports the run's current sub-stage (crawling/analyzing/notifying) so the Runs view can show
  // more than a generic spinner. Best-effort: a failure here must never fail the run itself.
  onPhaseChange?: (agentRunId: string, phase: RunPhase) => Promise<void>;
}

export class AgentRunner {
  constructor(private readonly deps: AgentRunnerDeps) {}

  private async setPhase(agentRunId: string, phase: RunPhase): Promise<void> {
    try {
      await this.deps.onPhaseChange?.(agentRunId, phase);
    } catch {
      // Never let a phase-tracking failure fail the run itself.
    }
  }

  async run(agentId: string, agentRunId: string, options?: AgentRunOptions): Promise<AgentRunResult> {
    try {
      const agent = await this.deps.agentRepository.getAgent(agentId);
      if (!agent) {
        return { status: 'failed', errorCode: 'agent_not_found' };
      }

      const promptVersion = await this.deps.promptRepository.getLatestPromptVersion(agentId);
      if (!promptVersion) {
        return { status: 'failed', errorCode: 'missing_prompt_version' };
      }

      await this.setPhase(agentRunId, 'crawling');

      const evidence: EvidenceBlock[] = [];
      const sourceWarnings: string[] = [];
      const pendingCursorUpdates: SourceCursorState[] = [];

      const forcedEpisode = options?.forcedEpisode;
      let sourcesToCrawl: typeof agent.sources;
      if (forcedEpisode) {
        const matched = agent.sources.filter(
          (source) => source.type === forcedEpisode.sourceType && source.value === forcedEpisode.sourceValue
        );
        // If the forced source isn't in agent.sources (e.g. it came from the library, not the agent's
        // own source config), create an ad-hoc config so the run proceeds instead of silently
        // returning succeeded_no_new_content.
        sourcesToCrawl =
          matched.length > 0
            ? matched
            : [{ type: forcedEpisode.sourceType, value: forcedEpisode.sourceValue, frequencyMinutes: 60, maxItems: 1 }];
      } else {
        sourcesToCrawl = agent.sources;
      }

      for (const source of sourcesToCrawl) {
        try {
          // Enforce each source's own crawl cadence (frequencyMinutes), independent of how often
          // the agent's overall schedule triggers a run. A forced episode-picker run always bypasses
          // this, since it's an explicit user-initiated request for that specific source/item.
          if (!forcedEpisode && source.frequencyMinutes) {
            const cursor = await this.deps.cursorRepository.getCursor(agentId, source.value);
            if (cursor?.lastCrawledAt) {
              const elapsedMs = Date.now() - new Date(cursor.lastCrawledAt).getTime();
              if (elapsedMs < source.frequencyMinutes * 60_000) {
                continue;
              }
            }
          }

          const adapter = this.deps.sourceAdapters[source.type];
          const fetchOptions = forcedEpisode ? { forcedItemLink: forcedEpisode.itemLink } : undefined;
          const result = await adapter.fetch(agentId, source, fetchOptions);
          // Recorded immediately (not deferred like pendingCursorUpdates) so the cadence is
          // enforced even if this run ultimately fails or finds no new content.
          await this.deps.cursorRepository.touchCrawlAttempt(agentId, source.value, new Date().toISOString());

          if (result.warning) {
            sourceWarnings.push(result.warning);
          }

          if (result.cursorUpdate) {
            pendingCursorUpdates.push(result.cursorUpdate);
          }

          for (const block of result.evidence) {
            evidence.push(block);
            if (block.fidelity === 'low') {
              sourceWarnings.push(`Low-fidelity evidence from ${block.sourceRef} (fell back to show notes/summary).`);
            }
            await this.deps.artifactRepository.saveArtifact({
              agentId,
              agentRunId,
              kind: 'normalized_evidence',
              sourceRef: block.sourceRef,
              payloadJson: JSON.stringify(block),
              fidelity: block.fidelity
            });
          }
        } catch (error) {
          logger.warn(`[agent-runner] Failed to fetch source ${source.value}`, error);
          sourceWarnings.push(
            `Failed to fetch source ${source.value}: ${error instanceof Error ? error.message : 'unknown error'}`
          );
        }
      }

      if (evidence.length === 0) {
        // Nothing new was found across any source this run: skip the Claude call/report entirely
        // and leave cursors untouched (a failed/skipped source's items remain unseen for retry).
        // Surface any collected warnings (e.g. a forced episode-picker selection that couldn't be
        // found in the current feed fetch) via errorMessage so they're visible in the Runs view,
        // instead of silently looking identical to "nothing new to report".
        return {
          status: 'succeeded_no_new_content',
          errorMessage: sourceWarnings.length > 0 ? sourceWarnings.join(' | ') : undefined
        };
      }

      await this.setPhase(agentRunId, 'analyzing');

      const effectiveSystemPrompt = buildEffectiveSystemPrompt({
        characterType: agent.characterType,
        promptConfig: agent.promptConfig,
        promptVersionSystemPrompt: promptVersion.systemPrompt,
        language: options?.playbookLanguage
      });
      const request = buildAnalysisRequest({ ...promptVersion, systemPrompt: effectiveSystemPrompt }, evidence, agent.characterType);
      const analysis: ClaudeAnalysisResult = await this.deps.claudeClient.analyze(request);

      const combinedWarnings = [...sourceWarnings, ...analysis.sourceWarnings];
      const usage = analysis.usage;
      const estimatedCostUsd = usage
        ? estimateCostUsd(promptVersion.model, usage.inputTokens, usage.outputTokens)
        : null;
      const report = await this.deps.reportRepository.saveRunReport({
        agentId,
        agentRunId,
        promptVersionId: promptVersion.id,
        characterType: agent.characterType,
        summary: analysis.summary,
        sourceWarnings: combinedWarnings,
        needsHumanReview: analysis.needsHumanReview || combinedWarnings.length > 0,
        signals: analysis.signals,
        report: analysis.report,
        model: promptVersion.model,
        promptVersionNumber: promptVersion.version,
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
        estimatedCostUsd
      });

      // Cursor only advances on success: applying pending updates here (after the report is
      // durably saved) ensures a failed Claude call or report save leaves cursors untouched so
      // the same new items are retried on the next scheduled run rather than silently lost.
      for (const cursorUpdate of pendingCursorUpdates) {
        await this.deps.cursorRepository.saveCursor(cursorUpdate);
      }

      await this.setPhase(agentRunId, 'notifying');
      // Best-effort: sendReportNotification already catches/logs per-recipient failures
      // internally and never throws, so a flaky SMTP server can't fail an otherwise-successful run.
      // Falls back to the source URL for any evidence block without a resolved title (e.g. plain
      // web-page sources), and de-dupes in case the same item appears from more than one source.
      // Skipped when the playbook has muted notifications (notificationsEnabled === false) or uses
      // a daily/weekly digest cadence - digest playbooks get one rollup email from the digest loop.
      const digestsDefer = options?.playbookDigestFrequency === 'daily' || options?.playbookDigestFrequency === 'weekly';
      if (options?.playbookNotificationsEnabled !== false && !digestsDefer) {
        const itemTitles = [...new Set(evidence.map((block) => block.title || block.sourceRef))];
        await sendReportNotification(this.deps.mailer, agent, report, itemTitles, options?.playbookRecipients ?? [], options?.playbookLanguage);
      }

      // Watchlist alerts fire for every new report - a watchlist follow is the user's own explicit
      // subscription, so playbook mute/digest settings don't suppress it. Never fails the run.
      if (this.deps.watchlistNotifier) {
        await this.deps.watchlistNotifier.notifyForReport({
          agentId,
          agentName: agent.name,
          report,
          language: options?.playbookLanguage
        });
      }

      return { status: 'succeeded', reportId: report.id };
    } catch (error) {
      // Evidence/artifacts for this run may already be durably saved (per-source, before this
      // point) even though the overall run is reported as failed - e.g. a Claude analysis call or
      // report save failing after fetch succeeded. Capture the real reason here instead of the
      // previous bare `catch {}`, which silently discarded it and left only an opaque
      // 'agent_run_failed' code with no way to tell why the run actually failed.
      return {
        status: 'failed',
        errorCode: 'agent_run_failed',
        errorMessage: error instanceof Error ? error.message : String(error)
      };
    }
  }
}
