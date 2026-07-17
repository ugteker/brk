export type DiscussionFormat = 'free_form' | 'structured' | 'hosted' | 'hybrid';
export type DiscussionRunStatus = 'pending' | 'running' | 'done' | 'error';
export type DiscussionTrigger = 'manual' | 'auto_suggested' | 'scheduled';
export type ParticipantRole = 'speaker' | 'host';
export type OpenAIVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
/** Whether a participant's reports for a run came from the user's explicit selection or from
 * falling back to that agent's most recent reports (see config.discussion.latestReportLimit). */
export type ReportSelectionOrigin = 'explicit' | 'fallback';

export interface DiscussionFormatConfig {
  segments?: string[];
  maxTurnsPerSegment?: number;
  totalTurnTarget?: number;
  hostInstructions?: string;
  /** Language every participant should respond in for this discussion. Defaults to English
   * (undefined) when not set - stored in the existing formatConfigJson column, no schema
   * migration needed. Mirrors the playbookLanguage convention used for single-agent reports. */
  language?: 'en' | 'de';
}

export interface DiscussionParticipant {
  id: string;
  discussionId: string;
  agentId: string;
  role: ParticipantRole;
  voiceId: OpenAIVoice;
  speakerOrder: number;
  /** Explicit report IDs the user picked for this participant when creating/editing the
   * discussion. Empty means "resolve this participant's latest reports at run time" (see
   * config.discussion.latestReportLimit and report-resolution.ts). */
  reportIds: string[];
}

/** Per-participant snapshot of which reports/source material actually fed a given run - frozen
 * at run time so old runs remain readable even if reports are later added/removed or the
 * fallback limit changes. */
export interface ParticipantEvidenceSnapshot {
  participantId: string;
  agentId: string;
  reportIds: string[];
  origin: ReportSelectionOrigin;
  /** IDs of the raw transcript/source material excerpts that were included for this
   * participant's resolved reports (see evidence.ts). Empty when no raw material was found. */
  sourceItemIds: string[];
  /** Human-readable warnings for reports whose raw transcript/source material could not be
   * found - missing material is a warning, not a run failure. */
  transcriptWarnings: string[];
}

/** Snapshot of the full evidence/agenda context used to generate a given run's turns. */
export interface DiscussionRunEvidenceSnapshot {
  /** The shared questions/topics agenda in effect for this run (Discussion.description). */
  agenda: string;
  participants: ParticipantEvidenceSnapshot[];
}

export interface Discussion {
  id: string;
  ownerUserId: string;
  name: string;
  description: string;
  format: DiscussionFormat;
  formatConfig: DiscussionFormatConfig;
  scheduleJson: string | null;
  syntheticSourceId: string | null;
  createdAt: Date;
  updatedAt: Date;
  participants: DiscussionParticipant[];
}

export interface DiscussionTurn {
  id: string;
  discussionRunId: string;
  participantId: string;
  turnIndex: number;
  segmentLabel: string | null;
  content: string;
  audioUrl: string | null;
  createdAt: Date;
}

export interface DiscussionRun {
  id: string;
  discussionId: string;
  status: DiscussionRunStatus;
  triggeredBy: DiscussionTrigger;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  syntheticSourceItemId: string | null;
  audioUrl: string | null;
  createdAt: Date;
  turns: DiscussionTurn[];
  /** Null for legacy runs created before this snapshot existed, or for runs that failed
   * validation before any resolution/evidence was recorded. */
  evidenceSnapshot: DiscussionRunEvidenceSnapshot | null;
}

export interface CreateDiscussionInput {
  name: string;
  description?: string;
  format: DiscussionFormat;
  formatConfig?: DiscussionFormatConfig;
  scheduleJson?: string;
  participants: Array<{
    agentId: string;
    role: ParticipantRole;
    voiceId: OpenAIVoice;
    speakerOrder: number;
    /** Explicit report IDs for this participant; omitted/empty falls back to latest reports. */
    reportIds?: string[];
  }>;
}

export interface UpdateDiscussionInput {
  name?: string;
  description?: string;
  format?: DiscussionFormat;
  formatConfig?: DiscussionFormatConfig;
  scheduleJson?: string | null;
}
