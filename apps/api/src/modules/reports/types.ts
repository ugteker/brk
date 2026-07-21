import type { CharacterType } from '../agents/types';

export interface SignalRecord {
  symbol: string;
  side: 'long' | 'short';
  confidence: number;
  rationale: string;
  citations: string[];
}

export type ReportResultType = 'insight' | 'summary' | 'risk' | 'recommendation' | 'question' | 'update';
export type ReportTimeHorizon = 'immediate' | 'short_term' | 'medium_term' | 'long_term' | 'unspecified';
export type ReportTone = 'neutral' | 'positive' | 'cautious' | 'critical' | 'urgent';

export interface ReportEvidence {
  claim: string;
  citations: string[];
}

export interface ReportEntity {
  name: string;
  type: string;
}

export interface ReportSourceReference {
  label: string;
  reference: string;
}

export type ReportCardEmphasis = 'standard' | 'attention' | 'critical' | 'positive';
export type ReportCardPrimaryField = 'headline' | 'short_summary' | 'recommendation' | 'open_question' | 'key_takeaway';
export type ReportCardSupportingField =
  | 'result_type'
  | 'keywords'
  | 'relevance'
  | 'confidence'
  | 'time_horizon'
  | 'entities'
  | 'evidence'
  | 'novelty';

export interface CardPresentation {
  emphasis: ReportCardEmphasis;
  primary_field: ReportCardPrimaryField;
  supporting_fields: ReportCardSupportingField[];
  hide_when_empty: boolean;
  rationale: string;
}

export interface UnifiedReportCommonFields {
  summary: string;
  key_takeaways: string[];
  sources_used: string[];
  citations: string[];
  headline: string;
  short_summary: string;
  result_type: ReportResultType;
  keywords: string[];
  relevance: number;
  confidence: number;
  evidence: ReportEvidence[];
  entities: ReportEntity[];
  recommendation: string;
  open_questions: string[];
  time_horizon: ReportTimeHorizon;
  tone: ReportTone;
  source_references: ReportSourceReference[];
  novelty: number;
  card_presentation: CardPresentation;
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
  playbookId: string | null;
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
