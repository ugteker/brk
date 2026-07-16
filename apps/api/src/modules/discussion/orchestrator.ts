import type { ClaudeMessagesClient } from '../analysis/claude-client';
import type { DiscussionRepositoryLike } from './repository';
import type { Discussion, DiscussionParticipant, DiscussionFormat } from './types';
import { logger } from '../../lib/logger';

export interface OrchestratorAgentRepo {
  getAgent(agentId: string): Promise<{ id: string; name: string; characterType: string } | null>;
}

export interface OrchestratorPromptRepo {
  getLatestPromptVersion(agentId: string): Promise<{ systemPrompt: string } | null>;
}

export interface OrchestratorReportRepo {
  listReportsForAgent(agentId: string): Promise<Array<{ summary: string; createdAt: Date }>>;
}

export interface OrchestratorSyntheticSource {
  ensureSyntheticSource(discussion: Discussion, runId: string, transcript: string): Promise<void>;
}

export interface DiscussionOrchestratorDeps {
  discussionRepository: DiscussionRepositoryLike;
  agentRepository: OrchestratorAgentRepo;
  promptRepository: OrchestratorPromptRepo;
  reportRepository: OrchestratorReportRepo;
  claudeClient: ClaudeMessagesClient;
  syntheticSource: OrchestratorSyntheticSource;
}

interface ParticipantContext {
  participant: DiscussionParticipant;
  agentName: string;
  systemPrompt: string;
  recentReportsSummary: string;
}

export class DiscussionOrchestrator {
  constructor(private readonly deps: DiscussionOrchestratorDeps) {}

  async run(discussionId: string, runId: string): Promise<void> {
    const { discussionRepository, agentRepository, promptRepository, reportRepository, claudeClient, syntheticSource } = this.deps;

    await discussionRepository.updateRun(runId, { status: 'running', startedAt: new Date() });

    try {
      const discussion = await discussionRepository.getDiscussion(discussionId);
      if (!discussion) throw new Error(`Discussion ${discussionId} not found`);

      const contexts: ParticipantContext[] = [];
      for (const p of discussion.participants.sort((a, b) => a.speakerOrder - b.speakerOrder)) {
        const agent = await agentRepository.getAgent(p.agentId);
        const promptVersion = await promptRepository.getLatestPromptVersion(p.agentId);
        const reports = await reportRepository.listReportsForAgent(p.agentId);
        const recent = reports.slice(0, 3);
        const recentReportsSummary = recent.length
          ? recent.map((r, i) => `Report ${i + 1}: ${r.summary}`).join('\n')
          : 'No recent reports yet.';
        contexts.push({
          participant: p,
          agentName: agent?.name ?? `Agent-${p.agentId.slice(0, 6)}`,
          systemPrompt: promptVersion?.systemPrompt ?? `You are an AI analyst named ${agent?.name ?? 'Agent'}.`,
          recentReportsSummary
        });
      }

      const totalTurns = discussion.formatConfig.totalTurnTarget ?? 12;
      const conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
      const segments = this.getSegments(discussion.format, discussion.formatConfig.segments);
      let turnIndex = 0;

      for (let turn = 0; turn < totalTurns; turn++) {
        const ctx = contexts[turn % contexts.length];
        const segmentIdx = segments ? Math.floor((turn / totalTurns) * segments.length) : -1;
        const segment = segments ? segments[Math.min(segmentIdx, segments.length - 1)] : null;

        const directorPrefix = this.buildDirectorContext(discussion, contexts, segment);
        const userPrompt =
          conversationHistory.length === 0
            ? `${directorPrefix}\n\nYou are speaking first. Begin the discussion as ${ctx.agentName}. Draw on your recent analysis:\n${ctx.recentReportsSummary}`
            : `${directorPrefix}\n\nIt's ${ctx.agentName}'s turn${segment ? ` (segment: ${segment})` : ''}. Respond to what was just said, staying in character. Your recent analysis:\n${ctx.recentReportsSummary}`;

        const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
          ...conversationHistory,
          { role: 'user', content: userPrompt }
        ];

        const response = await claudeClient.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 400,
          system: ctx.systemPrompt,
          messages
        });

        const text = response.content.find((c) => c.type === 'text')?.text ?? '';
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
        await syntheticSource.ensureSyntheticSource(discussion, runId, transcript);
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
