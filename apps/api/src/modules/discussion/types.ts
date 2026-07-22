export type DiscussionFormat = 'free_form' | 'structured' | 'hosted' | 'hybrid';
export type DiscussionRunStatus = 'pending' | 'running' | 'done' | 'error';
export type DiscussionTrigger = 'manual' | 'auto_suggested' | 'scheduled';
export type ParticipantRole = 'speaker' | 'host';
export type OpenAIVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
/** Which text-to-speech backend renders this discussion's audio. 'auto' (or undefined) keeps
 * the server default (Google preferred when both are configured). Stored in formatConfigJson,
 * no schema migration needed. */
export type TtsProvider = 'auto' | 'google' | 'openai';
/** Whether a participant's reports for a run came from the user's explicit selection, from
 * falling back to that agent's most recent reports (see config.discussion.latestReportLimit),
 * or were intentionally skipped ('none') because the discussion is grounded in a shared
 * transcript or a free question instead of reports. */
export type ReportSelectionOrigin = 'explicit' | 'fallback' | 'none';

/** What the discussion is grounded in - the "Worüber?" entry point chosen in the wizard.
 * 'material' is the current wizard mode: one shared, agent-independent pool of reports and/or
 * transcripts every participant discusses. 'reports' (per-participant picks) and 'transcript'
 * remain supported so historical discussions keep running unchanged. */
export type DiscussionGroundingMode = 'reports' | 'transcript' | 'free' | 'material';

export interface DiscussionGroundingConfig {
  mode: DiscussionGroundingMode;
  /** For mode 'transcript': AgentRunArtifact ids whose raw source material (episode/page
   * transcripts downloaded during agent runs) is shared with every participant.
   * For mode 'material': the transcript half of the shared pool. */
  artifactIds?: string[];
  /** For mode 'material': AgentRunReport ids in the shared pool - any agent's reports may be
   * picked, not just the participants' own. Stored as references in formatConfigJson. */
  reportIds?: string[];
}

export interface DiscussionFormatConfig {
  segments?: string[];
  maxTurnsPerSegment?: number;
  totalTurnTarget?: number;
  hostInstructions?: string;
  /** Language every participant should respond in for this discussion. Defaults to English
   * (undefined) when not set - stored in the existing formatConfigJson column, no schema
   * migration needed. Mirrors the playbookLanguage convention used for single-agent reports. */
  language?: 'en' | 'de';
  /** How long each spoken turn should be. Maps to a per-turn token budget and an explicit
   * brevity/depth instruction in the orchestrator. Undefined means 'medium' (the original
   * behavior). Stored in formatConfigJson, no schema migration needed. */
  turnLength?: 'short' | 'medium' | 'long';
  /** Voice API used when rendering this discussion as audio. Undefined means 'auto'. */
  ttsProvider?: TtsProvider;
  /** How this discussion is grounded. Undefined means 'reports' (the original behavior:
   * per-participant report picks with latest-N fallback). Stored in formatConfigJson,
   * no schema migration needed. */
  grounding?: DiscussionGroundingConfig;
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

/** Snapshot of the shared, agent-independent material pool (grounding mode 'material') that fed
 * a run - which reports actually resolved, which raw source items were excerpted, and any
 * missing-material warnings. Frozen at run time like the per-participant snapshots. */
export interface SharedMaterialSnapshot {
  reportIds: string[];
  sourceItemIds: string[];
  transcriptWarnings: string[];
}

/** Snapshot of the full evidence/agenda context used to generate a given run's turns. */
export interface DiscussionRunEvidenceSnapshot {
  /** The shared questions/topics agenda in effect for this run (Discussion.description). */
  agenda: string;
  participants: ParticipantEvidenceSnapshot[];
  /** Present only for material-grounded runs (shared pool); absent on legacy runs. */
  shared?: SharedMaterialSnapshot;
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
