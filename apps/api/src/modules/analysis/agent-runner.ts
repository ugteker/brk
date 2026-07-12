import { buildAnalysisRequest } from './prompt-builder';
import type { ClaudeAnalysisResult, EvidenceBlock, SourceAdapter, SourceConfig, SourceCursorState } from './types';
import type { ClaudeClient } from './claude-client';
import type { Agent } from '../agents/types';
import type { PromptRepository } from '../prompts/repository';
import type { ArtifactRepository } from '../artifacts/repository';
import type { ReportRepository } from '../reports/repository';
import type { SourceCursorRepositoryLike } from '../crawler/source-cursor-repository';
import type { RunPhase } from '../runs/run-queue.service';
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
      const sourcesToCrawl = forcedEpisode
        ? agent.sources.filter((source) => source.type === forcedEpisode.sourceType && source.value === forcedEpisode.sourceValue)
        : agent.sources;

      for (const source of sourcesToCrawl) {
        try {
          const adapter = this.deps.sourceAdapters[source.type];
          const fetchOptions = forcedEpisode ? { forcedItemLink: forcedEpisode.itemLink } : undefined;
          const result = await adapter.fetch(agentId, source, fetchOptions);

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
          sourceWarnings.push(
            `Failed to fetch source ${source.value}: ${error instanceof Error ? error.message : 'unknown error'}`
          );
        }
      }

      if (evidence.length === 0) {
        // Nothing new was found across any source this run: skip the Claude call/report entirely
        // and leave cursors untouched (a failed/skipped source's items remain unseen for retry).
        return { status: 'succeeded_no_new_content' };
      }

      await this.setPhase(agentRunId, 'analyzing');

      const request = buildAnalysisRequest(promptVersion, evidence);
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
        summary: analysis.summary,
        sourceWarnings: combinedWarnings,
        needsHumanReview: analysis.needsHumanReview || combinedWarnings.length > 0,
        signals: analysis.signals,
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
      await sendReportNotification(this.deps.mailer, agent, report);

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
