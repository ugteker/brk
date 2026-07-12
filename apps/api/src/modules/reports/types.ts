export interface SignalRecord {
  symbol: string;
  side: 'long' | 'short';
  confidence: number;
  rationale: string;
  citations: string[];
}

export interface CreateRunReportInput {
  agentId: string;
  agentRunId: string;
  promptVersionId: string;
  summary: string;
  sourceWarnings: string[];
  needsHumanReview: boolean;
  signals: SignalRecord[];
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
  createdAt: Date;
  model: string | null;
  promptVersionNumber: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
}
