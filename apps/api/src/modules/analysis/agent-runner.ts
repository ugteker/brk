import { buildAnalysisRequest } from './prompt-builder';
import { buildEffectiveSystemPrompt } from './character-prompt-strategy';
import type {
  ClaudeAnalysisResult,
  EvidenceBlock,
  SourceConfig,
  SourceCursorState,
  SourceFetchOptions,
  SourceFetchResult
} from './types';
import type { ClaudeClient } from './claude-client';
import type { Agent } from '../agents/types';
import type { PromptRepository } from '../prompts/repository';
import type { ArtifactRepository } from '../artifacts/repository';
import type { ReportRepository } from '../reports/repository';
import type { RunReportRecord } from '../reports/types';
import type { SourceCursorRepositoryLike } from '../crawler/source-cursor-repository';
import type { SourceIngestionRepositoryLike, SourceItemRecord } from '../source/ingestion-repository';
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
  agentVersionId?: string;
  playbookId?: string;
  playbookMaxItemsPerSource?: number;
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
  promptRepository: Pick<PromptRepository, 'getLatestPromptVersion' | 'getPromptVersionById'>;
  artifactRepository: Pick<ArtifactRepository, 'saveArtifact'>;
  reportRepository: Pick<ReportRepository, 'saveRunReport'>;
  cursorRepository: Pick<SourceCursorRepositoryLike, 'getCursor' | 'saveCursor' | 'touchCrawlAttempt'>;
  ingestionRepository: Pick<
    SourceIngestionRepositoryLike,
    'listPlaybookSources' | 'listUnconsumed' | 'markConsumed' | 'getSourceItemByLink'
  >;
  ingestionService: {
    ensureFresh(sourceId: string, now: Date, options?: SourceFetchOptions): Promise<{ warning?: string }>;
  };
  claudeClient: Pick<ClaudeClient, 'analyze'>;
  sourceAdapters: Partial<
    Record<
      SourceConfig['type'],
      {
        fetch(agentId: string, source: SourceConfig, options?: SourceFetchOptions): Promise<SourceFetchResult>;
      }
    >
  >;
  // Best-effort mailer for the automatic post-run report notification - if omitted (or if sending
  // fails), the run itself still succeeds; email is a courtesy, not a run precondition.
  mailer?: MailerLike;
  // Alerts users whose personal watchlist contains a symbol from the new report - independent of
  // playbook recipients/digest settings. Best-effort: never fails the run.
  watchlistNotifier?: {
    notifyForReport(input: { agentId: string; agentName: string; report: RunReportRecord; language?: string }): Promise<void>;
  };
  // Monthly cost guardrail: when configured and the agent owner's month-to-date estimated spend
  // has reached their budget, the run fails fast with budget_exceeded *before* calling Claude.
  budgetGuard?: {
    checkRunAllowed(userId: string): Promise<{ allowed: boolean; spentUsd: number; budgetUsd: number | null }>;
  };
  // Reports the run's current sub-stage (crawling/analyzing/notifying) so the Runs view can show
  // more than a generic spinner. Best-effort: a failure here must never fail the run itself.
  onPhaseChange?: (agentRunId: string, phase: RunPhase) => Promise<void>;
}

function normalizeFidelity(value: unknown): EvidenceBlock['fidelity'] {
  return value === 'medium' || value === 'low' || value === 'high' ? value : 'high';
}

function readStringArray(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : fallback;
}

function storedItemToEvidence(item: SourceItemRecord): EvidenceBlock {
  return {
    sourceId: item.sourceValue,
    sourceType: item.sourceType,
    sourceRef: typeof item.metadata.sourceRef === 'string' ? item.metadata.sourceRef : item.link,
    content: item.content,
    fidelity: normalizeFidelity(item.metadata.fidelity),
    citations: readStringArray(item.metadata.citations, [item.link]),
    itemId: typeof item.metadata.itemId === 'string' ? item.metadata.itemId : item.id,
    publishedAt: item.publishedAt.toISOString(),
    title: item.title || undefined
  };
}

export class AgentRunner {
  constructor(private readonly deps: AgentRunnerDeps) {}

  private async setPhase(agentRunId: string, phase: RunPhase): Promise<void> {
    try {
      await this.deps.onPhaseChange?.(agentRunId, phase);
    } catch (error) {
      logger.warn(`[agent-runner] Failed to persist phase ${phase} for run ${agentRunId}`, error);
    }
  }

  private async collectPlaybookEvidence(
    playbookId: string,
    forcedEpisode: ForcedEpisodeSelection | undefined,
    maxItemsPerSource: number,
    now: Date
  ): Promise<{ evidence: EvidenceBlock[]; warnings: string[]; consumedSourceItemIds: string[] }> {
    const warnings: string[] = [];
    const evidence: EvidenceBlock[] = [];
    const consumedSourceItemIds: string[] = [];
    const playbookSources = await this.deps.ingestionRepository.listPlaybookSources(playbookId);
    const sourcesToProcess = forcedEpisode
      ? playbookSources.filter(
          (source) => source.source.type === forcedEpisode.sourceType && source.source.value === forcedEpisode.sourceValue
        )
      : playbookSources;

    if (forcedEpisode && sourcesToProcess.length === 0) {
      return {
        evidence: [],
        warnings: [
          `Could not find a playbook source matching ${forcedEpisode.sourceType}:${forcedEpisode.sourceValue} for forced item ${forcedEpisode.itemLink}.`
        ],
        consumedSourceItemIds: []
      };
    }

    for (const source of sourcesToProcess) {
      const refresh = await this.deps.ingestionService.ensureFresh(source.sourceId, now, {
        forcedItemLink: forcedEpisode?.itemLink,
        limit: maxItemsPerSource
      });
      if (refresh.warning) {
        warnings.push(refresh.warning);
      }

      if (forcedEpisode) {
        const item = await this.deps.ingestionRepository.getSourceItemByLink(source.sourceId, forcedEpisode.itemLink);
        if (!item) {
          warnings.push(
            `Could not resolve stored source item ${forcedEpisode.itemLink} for canonical source ${source.source.value}.`
          );
          continue;
        }
        evidence.push(storedItemToEvidence(item));
        continue;
      }

      const items = await this.deps.ingestionRepository.listUnconsumed(playbookId, source.sourceId, maxItemsPerSource);
      for (const item of items) {
        evidence.push(storedItemToEvidence(item));
        consumedSourceItemIds.push(item.id);
      }
    }

    return { evidence, warnings, consumedSourceItemIds };
  }

  private async collectLegacyEvidence(
    agent: Agent,
    forcedEpisode?: ForcedEpisodeSelection
  ): Promise<{ evidence: EvidenceBlock[]; warnings: string[]; pendingCursorUpdates: SourceCursorState[] }> {
    logger.warn(`[agent-runner] Run is missing playbookId; falling back to legacy agent.sources crawling for agent ${agent.id}`);

    const configuredSources = forcedEpisode
      ? (() => {
          const matched = agent.sources.filter(
            (source) => source.type === forcedEpisode.sourceType && source.value === forcedEpisode.sourceValue
          );
          return matched.length > 0
            ? matched
            : [{ type: forcedEpisode.sourceType, value: forcedEpisode.sourceValue, frequencyMinutes: 60, maxItems: 1 }];
        })()
      : agent.sources;

    const evidence: EvidenceBlock[] = [];
    const warnings: string[] = [];
    const pendingCursorUpdates: SourceCursorState[] = [];

    for (const source of configuredSources) {
      try {
        if (!forcedEpisode && source.frequencyMinutes) {
          const cursor = await this.deps.cursorRepository.getCursor(agent.id, source.value);
          if (cursor?.lastCrawledAt) {
            const elapsedMs = Date.now() - new Date(cursor.lastCrawledAt).getTime();
            if (elapsedMs < source.frequencyMinutes * 60_000) {
              continue;
            }
          }
        }

        const adapter = this.deps.sourceAdapters[source.type];
        if (!adapter) {
          throw new Error(`unsupported_source_type:${source.type}`);
        }
        const result = await adapter.fetch(agent.id, source, forcedEpisode ? { forcedItemLink: forcedEpisode.itemLink } : undefined);
        await this.deps.cursorRepository.touchCrawlAttempt(agent.id, source.value, new Date().toISOString());

        if (result.warning) {
          warnings.push(result.warning);
        }
        if (result.cursorUpdate) {
          pendingCursorUpdates.push(result.cursorUpdate);
        }
        evidence.push(...result.evidence);
      } catch (error) {
        logger.warn(`[agent-runner] Failed to fetch source ${source.value}`, error);
        warnings.push(`Failed to fetch source ${source.value}: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }

    return { evidence, warnings, pendingCursorUpdates };
  }

  async run(agentId: string, agentRunId: string, options?: AgentRunOptions): Promise<AgentRunResult> {
    try {
      const agent = await this.deps.agentRepository.getAgent(agentId);
      if (!agent) {
        return { status: 'failed', errorCode: 'agent_not_found' };
      }

      const promptVersion = options?.agentVersionId
        ? await this.deps.promptRepository.getPromptVersionById(options.agentVersionId)
        : await this.deps.promptRepository.getLatestPromptVersion(agentId);
      if (!promptVersion) {
        return { status: 'failed', errorCode: 'missing_prompt_version' };
      }

      await this.setPhase(agentRunId, 'crawling');

      const now = new Date();
      const sourceWarnings: string[] = [];
      let evidence: EvidenceBlock[] = [];
      let consumedSourceItemIds: string[] = [];
      let pendingCursorUpdates: SourceCursorState[] = [];

      if (options?.playbookId) {
        const collected = await this.collectPlaybookEvidence(
          options.playbookId,
          options.forcedEpisode,
          options.playbookMaxItemsPerSource ?? 1,
          now
        );
        evidence = collected.evidence;
        sourceWarnings.push(...collected.warnings);
        consumedSourceItemIds = collected.consumedSourceItemIds;
      } else {
        const collected = await this.collectLegacyEvidence(agent, options?.forcedEpisode);
        evidence = collected.evidence;
        sourceWarnings.push(...collected.warnings);
        pendingCursorUpdates = collected.pendingCursorUpdates;
      }

      for (const block of evidence) {
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

      if (evidence.length === 0) {
        return {
          status: 'succeeded_no_new_content',
          errorMessage: sourceWarnings.length > 0 ? sourceWarnings.join(' | ') : undefined
        };
      }

      await this.setPhase(agentRunId, 'analyzing');

      if (this.deps.budgetGuard) {
        const budgetCheck = await this.deps.budgetGuard.checkRunAllowed(agent.ownerUserId);
        if (!budgetCheck.allowed) {
          return {
            status: 'failed',
            errorCode: 'budget_exceeded',
            errorMessage: `Monthly AI budget reached: ~$${budgetCheck.spentUsd.toFixed(2)} of $${(budgetCheck.budgetUsd ?? 0).toFixed(2)} spent this month. Raise or remove the budget in Usage & budget to resume runs.`
          };
        }
      }

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

      if (options?.playbookId && !options.forcedEpisode && consumedSourceItemIds.length > 0) {
        await this.deps.ingestionRepository.markConsumed(options.playbookId, consumedSourceItemIds, new Date());
      } else if (!options?.playbookId) {
        for (const cursorUpdate of pendingCursorUpdates) {
          await this.deps.cursorRepository.saveCursor(cursorUpdate);
        }
      }

      await this.setPhase(agentRunId, 'notifying');
      const digestsDefer = options?.playbookDigestFrequency === 'daily' || options?.playbookDigestFrequency === 'weekly';
      if (options?.playbookNotificationsEnabled !== false && !digestsDefer) {
        const itemTitles = [...new Set(evidence.map((block) => block.title || block.sourceRef))];
        await sendReportNotification(this.deps.mailer, agent, report, itemTitles, options?.playbookRecipients ?? [], options?.playbookLanguage);
      }

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
      return {
        status: 'failed',
        errorCode: 'agent_run_failed',
        errorMessage: error instanceof Error ? error.message : String(error)
      };
    }
  }
}
