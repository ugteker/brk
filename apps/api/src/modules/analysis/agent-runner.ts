import { buildAnalysisRequest } from './prompt-builder';
import type { ClaudeAnalysisResult, EvidenceBlock, SourceAdapter, SourceConfig } from './types';
import type { ClaudeClient } from './claude-client';
import type { Agent } from '../agents/types';
import type { PromptRepository } from '../prompts/repository';
import type { ArtifactRepository } from '../artifacts/repository';
import type { ReportRepository } from '../reports/repository';

export interface AgentRunResult {
  status: 'succeeded' | 'failed';
  errorCode?: string;
  reportId?: string;
}

export interface AgentRunnerDeps {
  agentRepository: { getAgent(agentId: string): Promise<Agent | null> };
  promptRepository: Pick<PromptRepository, 'getLatestPromptVersion'>;
  artifactRepository: Pick<ArtifactRepository, 'saveArtifact'>;
  reportRepository: Pick<ReportRepository, 'saveRunReport'>;
  claudeClient: Pick<ClaudeClient, 'analyze'>;
  sourceAdapters: Record<SourceConfig['type'], SourceAdapter>;
}

export class AgentRunner {
  constructor(private readonly deps: AgentRunnerDeps) {}

  async run(agentId: string, agentRunId: string): Promise<AgentRunResult> {
    try {
      const agent = await this.deps.agentRepository.getAgent(agentId);
      if (!agent) {
        return { status: 'failed', errorCode: 'agent_not_found' };
      }

      const promptVersion = await this.deps.promptRepository.getLatestPromptVersion(agentId);
      if (!promptVersion) {
        return { status: 'failed', errorCode: 'missing_prompt_version' };
      }

      const evidence: EvidenceBlock[] = [];
      const sourceWarnings: string[] = [];

      for (const source of agent.sources) {
        try {
          const adapter = this.deps.sourceAdapters[source.type];
          const blocks = await adapter.fetch(source);
          for (const block of blocks) {
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

      const request = buildAnalysisRequest(promptVersion, evidence);
      const analysis: ClaudeAnalysisResult = await this.deps.claudeClient.analyze(request);

      const combinedWarnings = [...sourceWarnings, ...analysis.sourceWarnings];
      const report = await this.deps.reportRepository.saveRunReport({
        agentId,
        agentRunId,
        promptVersionId: promptVersion.id,
        summary: analysis.summary,
        sourceWarnings: combinedWarnings,
        needsHumanReview: analysis.needsHumanReview || combinedWarnings.length > 0,
        signals: analysis.signals
      });

      return { status: 'succeeded', reportId: report.id };
    } catch {
      return { status: 'failed', errorCode: 'agent_run_failed' };
    }
  }
}
