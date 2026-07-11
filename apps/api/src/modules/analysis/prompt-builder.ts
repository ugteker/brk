import type { ClaudeAnalysisRequest, EvidenceBlock } from './types';

export interface PromptVersionInput {
  model: string;
  systemPrompt: string;
}

export function buildAnalysisRequest(promptVersion: PromptVersionInput, evidence: EvidenceBlock[]): ClaudeAnalysisRequest {
  return {
    model: promptVersion.model,
    systemPrompt: promptVersion.systemPrompt,
    evidence
  };
}

export function renderEvidenceForPrompt(evidence: EvidenceBlock[]): string {
  return evidence
    .map(
      (block, index) =>
        `Source ${index + 1} (${block.sourceType}, fidelity: ${block.fidelity}, ref: ${block.sourceRef}):\n${block.content}`
    )
    .join('\n\n');
}
