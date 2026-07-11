export type SignalSide = 'long' | 'short';

export interface CreateAgentPayload {
  name: string;
  description?: string;
  sources: Array<{ type: 'web_urls' | 'podcast_feeds'; value: string; frequencyMinutes?: number }>;
  preferences: Record<string, string[]>;
  recipients: string[];
  schedule: { mode: 'interval'; intervalMinutes: number } | { mode: 'daily'; dailyTime: string; timezone: string };
}

export async function createAgent(payload: CreateAgentPayload) {
  const response = await fetch('/api/agents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error('Failed to create agent');
  }
  return response.json();
}

export async function updateAgent(agentId: string, payload: Partial<CreateAgentPayload>): Promise<AgentDetail> {
  const response = await fetch(`/api/agents/${agentId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error('Failed to update agent');
  }
  return response.json();
}

export interface AgentSummary {
  id: string;
  name: string;
  status: string;
  sources: Array<{ type: 'web_urls' | 'podcast_feeds'; value: string }>;
}

export interface AgentDetail extends AgentSummary {
  description: string;
  sources: Array<{ type: 'web_urls' | 'podcast_feeds'; value: string; frequencyMinutes: number }>;
  preferences: Record<string, string[]>;
  recipients: string[];
  schedule:
    | { mode: 'interval'; intervalMinutes: number }
    | { mode: 'daily'; dailyTime: string; timezone: string }
    | null;
}

export async function listAgents(): Promise<AgentSummary[]> {
  const response = await fetch('/api/agents');
  if (!response.ok) {
    throw new Error('Failed to load agents');
  }
  return response.json();
}

export async function getAgent(agentId: string): Promise<AgentDetail> {
  const response = await fetch(`/api/agents/${agentId}`);
  if (!response.ok) {
    throw new Error('Failed to load agent');
  }
  return response.json();
}


export async function disableAgent(agentId: string): Promise<void> {
  const response = await fetch(`/api/agents/${agentId}/disable`, { method: 'POST' });
  if (!response.ok) {
    throw new Error('Failed to pause agent');
  }
}

export async function enableAgent(agentId: string): Promise<void> {
  const response = await fetch(`/api/agents/${agentId}/enable`, { method: 'POST' });
  if (!response.ok) {
    throw new Error('Failed to resume agent');
  }
}

export async function deleteAgent(agentId: string): Promise<void> {
  const response = await fetch(`/api/agents/${agentId}`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error('Failed to remove agent');
  }
}

export interface RecentRunDto {
  id: string;
  agentId: string;
  agentName: string;
  status: string;
  scheduledFor: string;
  finishedAt: string | null;
}

export async function listRecentRuns(limit = 3): Promise<RecentRunDto[]> {
  const response = await fetch(`/api/agents/runs/recent?limit=${limit}`);
  if (!response.ok) {
    throw new Error('Failed to load recent runs');
  }
  return response.json();
}

export interface SignalDto {
  symbol: string;
  side: SignalSide;
  confidence: number;
  rationale: string;
  citations: string[];
}

export interface RunReportDto {
  id: string;
  agentId: string;
  agentRunId: string;
  promptVersionId: string;
  summary: string;
  sourceWarnings: string[];
  needsHumanReview: boolean;
  signals: SignalDto[];
  createdAt: string;
}

export interface PromptVersionDto {
  id: string;
  agentId: string;
  version: number;
  model: string;
  systemPrompt: string;
  enabled: boolean;
  createdAt: string;
}

async function parseJsonOrThrow<T>(response: Response, errorMessage: string): Promise<T> {
  if (!response.ok) {
    throw new Error(errorMessage);
  }
  return response.json();
}

export async function listAgentReports(agentId: string): Promise<RunReportDto[]> {
  const response = await fetch(`/api/agents/${agentId}/reports`);
  return parseJsonOrThrow(response, 'Failed to load agent reports');
}

export async function getLatestAgentReport(agentId: string): Promise<RunReportDto | null> {
  const response = await fetch(`/api/agents/${agentId}/report/latest`);
  if (response.status === 404) return null;
  return parseJsonOrThrow(response, 'Failed to load latest agent report');
}

export async function getLatestAgentPrompt(agentId: string): Promise<PromptVersionDto | null> {
  const response = await fetch(`/api/agents/${agentId}/prompt/latest`);
  if (response.status === 404) return null;
  return parseJsonOrThrow(response, 'Failed to load latest agent prompt');
}

export async function saveAgentPrompt(
  agentId: string,
  payload: { model: string; systemPrompt: string; enabled: boolean }
): Promise<PromptVersionDto> {
  const response = await fetch(`/api/agents/${agentId}/prompt`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return parseJsonOrThrow(response, 'Failed to save agent prompt');
}
