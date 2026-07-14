export type AgentAccessPermission = 'read' | 'edit' | 'delete';

export interface AgentAccessGrant {
  id: string;
  grantedByUserId: string;
  granteeUserId: string;
  permission: AgentAccessPermission;
  expiresAt: string | null;
  createdAt: string;
}

export interface GrantAgentAccessPayload {
  granteeUserId: string;
  permission: AgentAccessPermission;
  expiresAt?: string;
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    return typeof body?.message === 'string' ? body.message : fallback;
  } catch {
    return fallback;
  }
}

export async function listAgentAccessGrants(agentId: string): Promise<AgentAccessGrant[]> {
  const response = await fetch(`/api/agents/${agentId}/shares`);
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to load access grants'));
  }
  return response.json();
}

export async function grantAgentAccess(agentId: string, payload: GrantAgentAccessPayload): Promise<void> {
  const response = await fetch(`/api/agents/${agentId}/shares`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to grant access'));
  }
}

export async function revokeAgentAccess(agentId: string, grantId: string): Promise<void> {
  const response = await fetch(`/api/agents/${agentId}/shares/${grantId}`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to revoke access'));
  }
}
