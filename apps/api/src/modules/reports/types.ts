import type { CharacterType } from '../agents/types';

export interface SignalRecord {
  symbol: string;
  side: 'long' | 'short';
  confidence: number;
  rationale: string;
  citations: string[];
}

export interface UnifiedReportCommonFields {
  summary: string;
  key_takeaways: string[];
  sources_used: string[];
  citations: string[];
}

export interface FinanceExpertSection {
  character_type: 'finance_expert';
  market_summary: string;
  signals: SignalRecord[];
}

export interface TeacherSection {
  character_type: 'teacher';
  lesson_explanation: string;
}

export interface TrainerSection {
  character_type: 'trainer';
  qa_drill: Array<{ question: string; answer: string }>;
}

export interface PhilosopherSection {
  character_type: 'philosopher';
  argument_reflection: string;
}

export interface InfluencerSection {
  character_type: 'influencer';
  content_angles: string[];
  hooks: string[];
}

export interface SummarizerSection {
  character_type: 'summarizer';
  bullet_digest: string[];
}

export type UnifiedCharacterSection =
  | FinanceExpertSection
  | TeacherSection
  | TrainerSection
  | PhilosopherSection
  | InfluencerSection
  | SummarizerSection;

export interface UnifiedCharacterReport {
  common: UnifiedReportCommonFields;
  section: UnifiedCharacterSection;
}

export interface CreateRunReportInput {
  agentId: string;
  agentRunId: string;
  promptVersionId: string;
  characterType?: CharacterType;
  summary: string;
  sourceWarnings: string[];
  needsHumanReview: boolean;
  signals: SignalRecord[];
  report?: UnifiedCharacterReport;
  model?: string | null;
  promptVersionNumber?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  estimatedCostUsd?: number | null;
}

export interface RunReportRecord {
  id: string;
  agentId: string;
  agentRunId: string;
  promptVersionId: string;
  summary: string;
  sourceWarnings: string[];
  needsHumanReview: boolean;
  signals: SignalRecord[];
  report: UnifiedCharacterReport;
  createdAt: Date;
  model: string | null;
  promptVersionNumber: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
}
