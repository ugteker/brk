export interface RunReportSummary {
  id: string;
  summary: string;
  needsHumanReview: boolean;
  signalCount: number;
}

export interface RunArtifactPreview {
  id: string;
  sourceRef: string;
  fidelity: string;
  contentPreview: string;
  contentLength: number;
}

export interface RunDetailRecord {
  id: string;
  agentId: string;
  status: string;
  phase: string | null;
  scheduledFor: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  durationMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  retryCount: number;
  report: RunReportSummary | null;
  artifacts: RunArtifactPreview[];
}
