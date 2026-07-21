import type { ClaudeAnalysisRequest, EvidenceBlock } from './types';
import { DEFAULT_CHARACTER_TYPE } from '../agents/types';
import type { CharacterType } from '../agents/types';

export interface PromptVersionInput {
  model: string;
  systemPrompt: string;
}

export function buildAnalysisRequest(
  promptVersion: PromptVersionInput,
  evidence: EvidenceBlock[],
  characterType: CharacterType = DEFAULT_CHARACTER_TYPE
): ClaudeAnalysisRequest {
  return {
    model: promptVersion.model,
    characterType,
    systemPrompt: promptVersion.systemPrompt,
    evidence
  };
}

export function renderEvidenceForPrompt(evidence: EvidenceBlock[]): string {
  return evidence
    .map(
      (block, index) =>
        `Source ${index + 1} (${block.sourceType}, fidelity: ${block.fidelity}, ref: ${block.sourceRef})${
          block.title ? `, title: ${block.title}` : ''
        }:\n${block.content}`
    )
    .join('\n\n');
}
