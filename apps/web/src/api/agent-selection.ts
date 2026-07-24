import type { PlaybookRecord } from './playbooks';

export interface UseAgentForSourceInput {
  sourceId: string;
}

export interface UpdateSavedAgentVersionInput {
  fromAgentVersionId: string;
  updateManualPlaybooks: boolean;
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    return typeof body?.message === 'string' ? body.message : fallback;
  } catch {
    return fallback;
  }
}

export async function useAgentForSource(
  agentVersionId: string,
  sourceId: string
): Promise<{ playbook: PlaybookRecord; created: boolean }> {
  const response = await fetch(`/api/catalog/agent-versions/${agentVersionId}/use`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sourceId })
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to use agent'));
  }
  return response.json();
}

export async function updateSavedAgentVersion(
  agentVersionId: string,
  input: UpdateSavedAgentVersionInput
): Promise<{ fromAgentVersionId: string; toAgentVersionId: string; playbooksUpdated: number }> {
  const response = await fetch(`/api/catalog/agent-versions/${agentVersionId}/update`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to update saved agent version'));
  }
  return response.json();
}
