export type PlaybookSchedule =
  | { mode: 'interval'; intervalMinutes: number }
  | { mode: 'daily'; dailyTime: string; timezone: string }
  | { mode: 'weekly'; daysOfWeek: number[]; dailyTime: string; timezone: string };

export type PlaybookExecutionMode = 'latest_only' | 'all_sources';
export type PlaybookSharePermission = 'read' | 'edit' | 'delete' | 'execute';
export type PublicationVisibility = 'public' | 'private';

export interface PlaybookRecord {
  id: string;
  ownerUserId: string;
  agentId: string;
  name: string;
  description: string;
  enabled: boolean;
  schedule: PlaybookSchedule;
  sourceIds: string[];
  recipients: string[];
  executionMode: PlaybookExecutionMode;
  maxSourcesPerRun: number;
  maxItemsPerSource: number;
  lastRunAt: string | null;
  nextRunAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlaybookPayload {
  agentId: string;
  name: string;
  description?: string;
  enabled?: boolean;
  schedule?: PlaybookSchedule;
  sourceIds: string[];
  recipients?: string[];
  executionMode?: PlaybookExecutionMode;
  maxSourcesPerRun?: number;
  maxItemsPerSource?: number;
}

export interface UpdatePlaybookPayload {
  name?: string;
  description?: string;
  enabled?: boolean;
  schedule?: PlaybookSchedule;
  sourceIds?: string[];
  recipients?: string[];
  executionMode?: PlaybookExecutionMode;
  maxSourcesPerRun?: number;
  maxItemsPerSource?: number;
}

export interface SharePlaybookPayload {
  granteeUserId: string;
  permission: PlaybookSharePermission;
  expiresAt?: string;
}

export interface PublishPlaybookPayload {
  title: string;
  summary?: string;
  visibility?: PublicationVisibility;
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    return typeof body?.message === 'string' ? body.message : fallback;
  } catch {
    return fallback;
  }
}

export async function createPlaybook(payload: CreatePlaybookPayload): Promise<PlaybookRecord> {
  const response = await fetch('/api/playbooks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to create playbook'));
  }
  return response.json();
}

export async function listPlaybooks(): Promise<PlaybookRecord[]> {
  const response = await fetch('/api/playbooks');
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to load playbooks'));
  }
  return response.json();
}

export async function getPlaybook(playbookId: string): Promise<PlaybookRecord> {
  const response = await fetch(`/api/playbooks/${playbookId}`);
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to load playbook'));
  }
  return response.json();
}

export async function updatePlaybook(playbookId: string, payload: UpdatePlaybookPayload): Promise<PlaybookRecord> {
  const response = await fetch(`/api/playbooks/${playbookId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to update playbook'));
  }
  return response.json();
}

export async function deletePlaybook(playbookId: string): Promise<void> {
  const response = await fetch(`/api/playbooks/${playbookId}`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to remove playbook'));
  }
}

export async function runPlaybookNow(playbookId: string): Promise<{ status: string; errorCode?: string }> {
  const response = await fetch(`/api/playbooks/${playbookId}/run`, { method: 'POST' });
  if (!response.ok) {
    if (response.status === 503) {
      throw new Error('Manual runs are not available right now');
    }
    throw new Error(await parseErrorMessage(response, 'Failed to run playbook'));
  }
  return response.json();
}

export async function sharePlaybook(playbookId: string, payload: SharePlaybookPayload): Promise<void> {
  const response = await fetch(`/api/playbooks/${playbookId}/share`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to share playbook'));
  }
}

export async function publishPlaybook(
  playbookId: string,
  payload: PublishPlaybookPayload
): Promise<{ publicationId: string }> {
  const response = await fetch(`/api/playbooks/${playbookId}/publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to publish playbook'));
  }
  return response.json();
}
