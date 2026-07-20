const BASE = '/api/discussions';

/** A single participant to seed the New Discussion wizard with, used by entry points
 * that jump into Studio from a specific report or Library source (rather than the
 * default agent-first flow). */
export interface DiscussionPreselectEntry {
  agentId: string;
  /** Explicit report IDs to seed this participant with; empty falls back like normal. */
  reportIds: string[];
}

/** Passed as `location.state.preselect` when navigating to `/studio/new` from a
 * report card or a Library source detail view, so the wizard can pre-check agents
 * and pre-fill their report selection instead of starting from a blank slate. */
export interface DiscussionPreselect {
  entries: DiscussionPreselectEntry[];
  /** Short human-readable label shown in the wizard's "Starting a discussion about…"
   * banner (e.g. a report summary snippet or a source title). */
  contextLabel?: string;
}

export interface DiscussionParticipantDto {
  id: string;
  discussionId: string;
  agentId: string;
  role: 'speaker' | 'host';
  voiceId: string;
  speakerOrder: number;
  /** Explicit report IDs picked for this participant; empty means "use latest reports". */
  reportIds: string[];
}

/** How a discussion sources its material: agent reports (default), a shared
 * episode transcript, or nothing at all (free question, experts argue from
 * their own expertise). */
export type DiscussionGroundingMode = 'reports' | 'transcript' | 'free';

export interface DiscussionGroundingConfigDto {
  mode: DiscussionGroundingMode;
  /** Artifact IDs of the shared transcripts (transcript mode only). */
  artifactIds?: string[];
}

export interface DiscussionFormatConfigDto {
  segments?: string[];
  totalTurnTarget?: number;
  hostInstructions?: string;
  /** Language every participant should respond in. Defaults to English when unset. */
  language?: 'en' | 'de';
  /** Absent means classic reports grounding. */
  grounding?: DiscussionGroundingConfigDto;
}

/** A downloaded episode transcript that can ground a discussion. */
export interface TranscriptOptionDto {
  artifactId: string;
  agentId: string;
  title: string;
  sourceRef: string;
  contentChars: number;
  preview: string;
  createdAt: string;
}

export interface DiscussionDto {
  id: string;
  ownerUserId: string;
  name: string;
  description: string;
  format: 'free_form' | 'structured' | 'hosted' | 'hybrid';
  formatConfig: DiscussionFormatConfigDto;
  scheduleJson: string | null;
  syntheticSourceId: string | null;
  createdAt: string;
  updatedAt: string;
  participants: DiscussionParticipantDto[];
}

export type ReportSelectionOrigin = 'explicit' | 'fallback' | 'none';

export interface ParticipantEvidenceSnapshotDto {
  participantId: string;
  agentId: string;
  reportIds: string[];
  origin: ReportSelectionOrigin;
  sourceItemIds: string[];
  transcriptWarnings: string[];
}

export interface DiscussionRunEvidenceSnapshotDto {
  agenda: string;
  participants: ParticipantEvidenceSnapshotDto[];
}

export interface DiscussionRunDto {
  id: string;
  discussionId: string;
  status: 'pending' | 'running' | 'done' | 'error';
  triggeredBy: string;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  syntheticSourceItemId: string | null;
  audioUrl: string | null;
  createdAt: string;
  turns: DiscussionTurnDto[];
  /** Null for runs created before evidence snapshots existed, or runs that failed
   * validation before any resolution was recorded. */
  evidenceSnapshot: DiscussionRunEvidenceSnapshotDto | null;
}

export interface DiscussionTurnDto {
  id: string;
  discussionRunId: string;
  participantId: string;
  turnIndex: number;
  segmentLabel: string | null;
  content: string;
  audioUrl: string | null;
  createdAt: string;
}

export interface CreateDiscussionPayload {
  name: string;
  description?: string;
  format: 'free_form' | 'structured' | 'hosted' | 'hybrid';
  formatConfig?: DiscussionFormatConfigDto;
  scheduleJson?: string;
  participants: Array<{
    agentId: string;
    role: 'speaker' | 'host';
    voiceId: string;
    speakerOrder: number;
    /** Explicit report IDs for this participant; omitted/empty falls back to latest reports. */
    reportIds?: string[];
  }>;
}

export async function listTranscriptOptions(): Promise<TranscriptOptionDto[]> {
  const res = await fetch(`${BASE}/transcript-options`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to list transcript options');
  return res.json();
}

export async function listDiscussions(): Promise<DiscussionDto[]> {
  const res = await fetch(BASE, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to list discussions');
  return res.json();
}

export async function createDiscussion(payload: CreateDiscussionPayload): Promise<DiscussionDto> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Failed to create discussion');
  return res.json();
}

export async function getDiscussion(id: string): Promise<DiscussionDto> {
  const res = await fetch(`${BASE}/${id}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to get discussion');
  return res.json();
}

export async function triggerDiscussionRun(id: string): Promise<DiscussionRunDto> {
  const res = await fetch(`${BASE}/${id}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({})
  });
  if (!res.ok) throw new Error('Failed to trigger run');
  return res.json();
}

export async function listDiscussionRuns(id: string): Promise<DiscussionRunDto[]> {
  const res = await fetch(`${BASE}/${id}/runs`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to list runs');
  return res.json();
}

export async function getDiscussionRun(id: string, runId: string): Promise<DiscussionRunDto> {
  const res = await fetch(`${BASE}/${id}/runs/${runId}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to get run');
  return res.json();
}

export async function triggerAudioRender(id: string, runId: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}/runs/${runId}/audio`, {
    method: 'POST',
    credentials: 'include'
  });
  if (!res.ok) throw new Error('Failed to trigger audio render');
}

export async function deleteDiscussion(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE', credentials: 'include' });
  if (!res.ok) throw new Error('Failed to delete discussion');
}
