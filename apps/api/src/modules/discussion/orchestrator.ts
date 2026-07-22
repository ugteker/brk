import type { ClaudeMessagesClient } from '../analysis/claude-client';
import type { DiscussionRepositoryLike } from './repository';
import type { Discussion, DiscussionParticipant, DiscussionFormat, ParticipantEvidenceSnapshot } from './types';
import { resolveParticipantReports, type ReportResolutionRepo } from './report-resolution';
import { buildTranscriptEvidence, buildSharedTranscriptEvidence, type EvidenceArtifactRepo, type SharedTranscriptArtifactRepo } from './evidence';
import { sanitizeDiscussionTurnText } from './sanitize-turn-text';
import { logger } from '../../lib/logger';

export interface OrchestratorAgentRepo {
  getAgent(agentId: string): Promise<{ id: string; name: string; characterType: string } | null>;
}

export interface OrchestratorPromptRepo {
  getLatestPromptVersion(agentId: string): Promise<{ systemPrompt: string; model: string } | null>;
}

export interface OrchestratorReportRepo extends ReportResolutionRepo {
  listReportsForAgent(agentId: string): Promise<Array<{ id: string; agentId: string; agentRunId: string; summary: string; createdAt: Date }>>;
  getReportById(reportId: string): Promise<{ id: string; agentId: string; agentRunId: string; summary: string } | null>;
}

export type OrchestratorArtifactRepo = EvidenceArtifactRepo & Partial<SharedTranscriptArtifactRepo>;

export interface OrchestratorSyntheticSource {
  ensureSyntheticSource(
    discussion: Discussion,
    runId: string,
    transcript: string,
    participantNames: string[]
  ): Promise<void>;
}

export interface DiscussionOrchestratorDeps {
  discussionRepository: DiscussionRepositoryLike;
  agentRepository: OrchestratorAgentRepo;
  promptRepository: OrchestratorPromptRepo;
  reportRepository: OrchestratorReportRepo;
  artifactRepository: OrchestratorArtifactRepo;
  claudeClient: ClaudeMessagesClient;
  syntheticSource: OrchestratorSyntheticSource;
  /** Number of an agent's most recent reports to fall back to when a participant has no
   * explicit report selection. Defaults to 3 (mirrors config.discussion.latestReportLimit). */
  latestReportLimit?: number;
}

interface ParticipantContext {
  participant: DiscussionParticipant;
  agentName: string;
  systemPrompt: string;
  /** This participant's own configured model (their agent's latest prompt version),
   * falling back to DISCUSSION_FALLBACK_MODEL if they have no prompt version yet.
   * Each participant speaks using their own model, not one shared hardcoded model. */
  model: string;
  recentReportsSummary: string;
  transcriptExcerpt: string;
}

/** Used only when a participant's agent has no prompt version yet (so no configured
 * model to fall back to) - kept in sync with the default model used elsewhere in the
 * codebase (agent prompt defaults, site inspection, report Q&A chat). */
const DISCUSSION_FALLBACK_MODEL = 'claude-sonnet-4-5';

/**
 * Appended to every participant's persona system prompt before each discussion turn.
 *
 * Agent persona prompts (see apps/web/src/data/prompt-personas.ts's nonFinancePrompt()
 * template, already baked into existing saved AgentPromptVersion rows) are written for the
 * single-agent report pipeline and explicitly instruct Claude to "generate a clear, practical
 * response in the requested JSON shape". Reusing that stored prompt verbatim for a live
 * discussion turn caused Claude to keep obeying its own system prompt and respond with JSON
 * instead of spoken dialogue. This override runs *after* the persona instructions (so the
 * character/persona itself is preserved) and explicitly tells Claude this is a different
 * context, regardless of what any given agent's saved prompt happens to say.
 */
const DISCUSSION_MODE_INSTRUCTION =
  "You are now speaking live in a multi-agent discussion, not writing a structured report. " +
  "Respond only with natural, conversational spoken language for your turn - not JSON, not " +
  "markdown, no headers or bullet lists, no code fences. Just speak naturally in character.";

/** Per-discussion language override (mirrors the playbookLanguage/buildEffectiveSystemPrompt
 * convention used for single-agent reports) - only 'de' needs an explicit instruction since
 * English is the default when unset. */
const DISCUSSION_LANGUAGE_INSTRUCTIONS: Partial<Record<'en' | 'de', string>> = {
  de: 'WICHTIG: Antworte in diesem Redebeitrag auf Deutsch.'
};

/** Per-discussion turn length (formatConfig.turnLength): token budget + explicit style
 * instruction per level. 'medium' matches the original hard-coded behavior (max_tokens 400,
 * no extra instruction) so existing discussions are unaffected. */
export const DISCUSSION_TURN_LENGTH_SETTINGS: Record<'short' | 'medium' | 'long', { maxTokens: number; instruction?: string }> = {
  short: {
    maxTokens: 160,
    instruction: 'Keep each spoken turn short and punchy: 2-3 concise sentences, one clear point per turn. Never exceed 4 sentences.'
  },
  medium: { maxTokens: 400 },
  long: {
    maxTokens: 700,
    instruction: 'You may elaborate in depth: develop your argument over several sentences with reasoning and examples.'
  }
};

export class DiscussionOrchestrator {
  constructor(private readonly deps: DiscussionOrchestratorDeps) {}

  async run(discussionId: string, runId: string): Promise<void> {
    const {
      discussionRepository,
      agentRepository,
      promptRepository,
      reportRepository,
      artifactRepository,
      claudeClient,
      syntheticSource
    } = this.deps;
    const latestReportLimit = this.deps.latestReportLimit ?? 3;

    await discussionRepository.updateRun(runId, { status: 'running', startedAt: new Date() });

    try {
      const discussion = await discussionRepository.getDiscussion(discussionId);
      if (!discussion) throw new Error(`Discussion ${discussionId} not found`);

      const orderedParticipants = discussion.participants.sort((a, b) => a.speakerOrder - b.speakerOrder);
      const groundingMode = discussion.formatConfig.grounding?.mode ?? 'reports';

      let resolution: Awaited<ReturnType<typeof resolveParticipantReports>> = { resolved: [], errors: [] };
      if (groundingMode === 'reports') {
        resolution = await resolveParticipantReports(
          orderedParticipants.map((p) => ({ id: p.id, agentId: p.agentId, reportIds: p.reportIds })),
          reportRepository,
          latestReportLimit
        );

        if (resolution.errors.length > 0) {
          const message = `Cannot start discussion - no reports resolved for: ${resolution.errors
            .map((e) => `agent ${e.agentId}`)
            .join(', ')}`;
          await discussionRepository.updateRun(runId, { status: 'error', errorMessage: message, completedAt: new Date() });
          return;
        }
      }

      // Material-grounded discussions (the current wizard mode) share one agent-independent
      // pool of reports + transcripts with every participant.
      let sharedMaterial: {
        summariesText: string;
        excerptText: string;
        reportIds: string[];
        sourceItemIds: string[];
        warnings: string[];
      } | null = null;
      if (groundingMode === 'material') {
        const poolReportIds = discussion.formatConfig.grounding?.reportIds ?? [];
        const poolArtifactIds = discussion.formatConfig.grounding?.artifactIds ?? [];
        if (poolReportIds.length === 0 && poolArtifactIds.length === 0) {
          await discussionRepository.updateRun(runId, {
            status: 'error',
            errorMessage: 'Cannot start discussion - no material selected for this discussion',
            completedAt: new Date()
          });
          return;
        }

        const warnings: string[] = [];
        const reportRecords = (
          await Promise.all(poolReportIds.map((id) => reportRepository.getReportById(id)))
        ).filter((r): r is { id: string; agentId: string; agentRunId: string; summary: string } => r !== null);
        for (const id of poolReportIds) {
          if (!reportRecords.some((r) => r.id === id)) warnings.push(`Report ${id} no longer exists`);
        }

        const reportEvidence = await buildTranscriptEvidence(
          reportRecords.map((r) => ({ id: r.id, agentRunId: r.agentRunId })),
          artifactRepository
        );

        let artifactEvidence: { excerptText: string; sourceItemIds: string[]; warnings: string[] } = {
          excerptText: '',
          sourceItemIds: [],
          warnings: []
        };
        if (poolArtifactIds.length > 0 && typeof artifactRepository.getArtifactsByIds === 'function') {
          artifactEvidence = await buildSharedTranscriptEvidence(
            poolArtifactIds,
            artifactRepository as SharedTranscriptArtifactRepo
          );
        }

        if (reportRecords.length === 0 && !artifactEvidence.excerptText) {
          await discussionRepository.updateRun(runId, {
            status: 'error',
            errorMessage: `Cannot start discussion - none of the selected material could be resolved (${[
              ...warnings,
              ...artifactEvidence.warnings
            ].join('; ')})`,
            completedAt: new Date()
          });
          return;
        }

        sharedMaterial = {
          summariesText: reportRecords.length
            ? reportRecords.map((r, i) => `Report ${i + 1}: ${r.summary}`).join('\n')
            : 'This discussion is grounded in the shared source material below.',
          excerptText: [reportEvidence.excerptText, artifactEvidence.excerptText].filter(Boolean).join('\n\n'),
          reportIds: reportRecords.map((r) => r.id),
          sourceItemIds: [...reportEvidence.sourceItemIds, ...artifactEvidence.sourceItemIds],
          warnings: [...warnings, ...reportEvidence.warnings, ...artifactEvidence.warnings]
        };
      }

      // Transcript-grounded discussions share one bounded excerpt set with every participant.
      let sharedEvidence: { excerptText: string; sourceItemIds: string[]; warnings: string[] } | null = null;
      if (groundingMode === 'transcript') {
        const artifactIds = discussion.formatConfig.grounding?.artifactIds ?? [];
        if (artifactIds.length === 0 || typeof artifactRepository.getArtifactsByIds !== 'function') {
          await discussionRepository.updateRun(runId, {
            status: 'error',
            errorMessage: 'Cannot start discussion - no transcript selected for transcript-grounded discussion',
            completedAt: new Date()
          });
          return;
        }
        sharedEvidence = await buildSharedTranscriptEvidence(artifactIds, artifactRepository as SharedTranscriptArtifactRepo);
        if (!sharedEvidence.excerptText) {
          await discussionRepository.updateRun(runId, {
            status: 'error',
            errorMessage: `Cannot start discussion - selected transcript(s) have no readable content (${sharedEvidence.warnings.join('; ')})`,
            completedAt: new Date()
          });
          return;
        }
      }

      const contexts: ParticipantContext[] = [];
      const evidenceParticipants: ParticipantEvidenceSnapshot[] = [];

      for (const p of orderedParticipants) {
        const agent = await agentRepository.getAgent(p.agentId);
        const promptVersion = await promptRepository.getLatestPromptVersion(p.agentId);

        let recentReportsSummary: string;
        let transcriptExcerpt: string;
        let snapshotReportIds: string[] = [];
        let snapshotOrigin: ParticipantEvidenceSnapshot['origin'] = 'none';
        let snapshotSourceItemIds: string[] = [];
        let snapshotWarnings: string[] = [];

        if (groundingMode === 'reports') {
          const resolvedForParticipant = resolution.resolved.find((r) => r.participantId === p.id)!;

          const reportRecords = (
            await Promise.all(resolvedForParticipant.reportIds.map((id) => reportRepository.getReportById(id)))
          ).filter((r): r is { id: string; agentId: string; agentRunId: string; summary: string } => r !== null);

          recentReportsSummary = reportRecords.length
            ? reportRecords.map((r, i) => `Report ${i + 1}: ${r.summary}`).join('\n')
            : 'No recent reports yet.';

          const evidence = await buildTranscriptEvidence(
            reportRecords.map((r) => ({ id: r.id, agentRunId: r.agentRunId })),
            artifactRepository
          );
          transcriptExcerpt = evidence.excerptText;
          snapshotReportIds = resolvedForParticipant.reportIds;
          snapshotOrigin = resolvedForParticipant.origin;
          snapshotSourceItemIds = evidence.sourceItemIds;
          snapshotWarnings = evidence.warnings;
        } else if (groundingMode === 'transcript') {
          recentReportsSummary =
            'This discussion is grounded in the shared source material below - base your contributions on it.';
          transcriptExcerpt = sharedEvidence?.excerptText ?? '';
          snapshotSourceItemIds = sharedEvidence?.sourceItemIds ?? [];
          snapshotWarnings = sharedEvidence?.warnings ?? [];
        } else if (groundingMode === 'material') {
          // Shared pool: identical context for every participant; the pool itself is
          // snapshotted once at the run level (see `shared` below), not per participant.
          recentReportsSummary = sharedMaterial?.summariesText ?? '';
          transcriptExcerpt = sharedMaterial?.excerptText ?? '';
        } else {
          recentReportsSummary =
            'There are no source reports for this discussion - argue from your own expertise and the agenda question.';
          transcriptExcerpt = '';
        }

        const languageInstruction = DISCUSSION_LANGUAGE_INSTRUCTIONS[discussion.formatConfig.language ?? 'en'];
        const turnLengthSetting = DISCUSSION_TURN_LENGTH_SETTINGS[discussion.formatConfig.turnLength ?? 'medium'];
        const systemPromptSections = [
          promptVersion?.systemPrompt ?? `You are an AI analyst named ${agent?.name ?? 'Agent'}.`,
          DISCUSSION_MODE_INSTRUCTION,
          ...(turnLengthSetting.instruction ? [turnLengthSetting.instruction] : []),
          ...(languageInstruction ? [languageInstruction] : [])
        ];

        contexts.push({
          participant: p,
          agentName: agent?.name ?? `Agent-${p.agentId.slice(0, 6)}`,
          systemPrompt: systemPromptSections.join('\n\n'),
          model: promptVersion?.model ?? DISCUSSION_FALLBACK_MODEL,
          recentReportsSummary,
          transcriptExcerpt
        });

        evidenceParticipants.push({
          participantId: p.id,
          agentId: p.agentId,
          reportIds: snapshotReportIds,
          origin: snapshotOrigin,
          sourceItemIds: snapshotSourceItemIds,
          transcriptWarnings: snapshotWarnings
        });
      }

      await discussionRepository.setRunEvidenceSnapshot(runId, {
        agenda: discussion.description,
        participants: evidenceParticipants,
        ...(sharedMaterial
          ? {
              shared: {
                reportIds: sharedMaterial.reportIds,
                sourceItemIds: sharedMaterial.sourceItemIds,
                transcriptWarnings: sharedMaterial.warnings
              }
            }
          : {})
      });

      const totalTurns = discussion.formatConfig.totalTurnTarget ?? 12;
      const turnMaxTokens = DISCUSSION_TURN_LENGTH_SETTINGS[discussion.formatConfig.turnLength ?? 'medium'].maxTokens;
      const conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
      const segments = this.getSegments(discussion.format, discussion.formatConfig.segments);
      let turnIndex = 0;

      for (let turn = 0; turn < totalTurns; turn++) {
        const ctx = contexts[turn % contexts.length];
        const segmentIdx = segments ? Math.floor((turn / totalTurns) * segments.length) : -1;
        const segment = segments ? segments[Math.min(segmentIdx, segments.length - 1)] : null;

        const directorPrefix = this.buildDirectorContext(discussion, contexts, segment);
        const evidenceSuffix = ctx.transcriptExcerpt
          ? `\n\nRelevant source material excerpts:\n${ctx.transcriptExcerpt}`
          : '';
        const userPrompt =
          conversationHistory.length === 0
            ? `${directorPrefix}\n\nYou are speaking first. Begin the discussion as ${ctx.agentName}. Draw on your recent analysis:\n${ctx.recentReportsSummary}${evidenceSuffix}`
            : `${directorPrefix}\n\nIt's ${ctx.agentName}'s turn${segment ? ` (segment: ${segment})` : ''}. Respond to what was just said, staying in character. Your recent analysis:\n${ctx.recentReportsSummary}${evidenceSuffix}`;

        const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
          ...conversationHistory,
          { role: 'user', content: userPrompt }
        ];

        const response = await claudeClient.messages.create({
          model: ctx.model,
          max_tokens: turnMaxTokens,
          system: ctx.systemPrompt,
          messages
        });

        const rawText = response.content.find((c) => c.type === 'text')?.text ?? '';
        const text = sanitizeDiscussionTurnText(rawText);
        await discussionRepository.createTurn(runId, ctx.participant.id, turnIndex, text, segment);

        conversationHistory.push({ role: 'user', content: userPrompt });
        conversationHistory.push({ role: 'assistant', content: text });
        turnIndex++;
      }

      const run = await discussionRepository.getRunWithTurns(runId);
      if (run) {
        const transcript = run.turns
          .map((t) => {
            const ctx = contexts.find((c) => c.participant.id === t.participantId);
            return `${ctx?.agentName ?? 'Agent'}: ${t.content}`;
          })
          .join('\n\n');
        await syntheticSource.ensureSyntheticSource(discussion, runId, transcript, contexts.map((c) => c.agentName));
      }

      await discussionRepository.updateRun(runId, { status: 'done', completedAt: new Date() });
      logger.info(`[DiscussionOrchestrator] run ${runId} completed successfully`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[DiscussionOrchestrator] run ${runId} failed: ${message}`);
      await discussionRepository.updateRun(runId, { status: 'error', errorMessage: message, completedAt: new Date() });
    }
  }

  private getSegments(format: DiscussionFormat, configSegments?: string[]): string[] | null {
    if (format === 'free_form') return null;
    if (configSegments?.length) return configSegments;
    return ['opening', 'disagreements', 'common_ground', 'final_call'];
  }

  private buildDirectorContext(discussion: Discussion, contexts: ParticipantContext[], currentSegment: string | null): string {
    const participantList = contexts.map((c) => `- ${c.agentName} (${c.participant.role})`).join('\n');
    return `[Discussion: "${discussion.name}" | Format: ${discussion.format}${currentSegment ? ` | Segment: ${currentSegment}` : ''}]\nParticipants:\n${participantList}${discussion.description ? `\nContext: ${discussion.description}` : ''}`;
  }
}
