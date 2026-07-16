const BASE = '/api/discussions';

export interface DiscussionParticipantDto {
  id: string;
  discussionId: string;
  agentId: string;
  role: 'speaker' | 'host';
  voiceId: string;
  speakerOrder: number;
}

export interface DiscussionDto {
  id: string;
  ownerUserId: string;
  name: string;
  description: string;
  format: 'free_form' | 'structured' | 'hosted' | 'hybrid';
  formatConfig: { segments?: string[]; totalTurnTarget?: number; hostInstructions?: string };
  scheduleJson: string | null;
  syntheticSourceId: string | null;
  createdAt: string;
  updatedAt: string;
  participants: DiscussionParticipantDto[];
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
  formatConfig?: object;
  scheduleJson?: string;
  participants: Array<{ agentId: string; role: 'speaker' | 'host'; voiceId: string; speakerOrder: number }>;
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
