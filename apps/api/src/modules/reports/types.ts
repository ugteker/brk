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
}
