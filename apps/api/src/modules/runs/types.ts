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
  /** Human-readable episode/item title from the underlying EvidenceBlock, when the source
   * adapter had one available (e.g. a podcast episode or YouTube video title). Null when the
   * source has no such title (e.g. a plain web page), so the UI can fall back to the raw URL. */
  title: string | null;
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
