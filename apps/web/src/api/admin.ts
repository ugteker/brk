export interface AdminUserView {
  id: string;
  email: string;
  displayName: string | null;
  role: 'user' | 'admin';
  hasPassword: boolean;
  hasGoogleLinked: boolean;
  createdAt: string;
  locked: boolean;
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    return typeof body?.message === 'string' ? body.message : fallback;
  } catch {
    return fallback;
  }
}

export async function listUsers(): Promise<AdminUserView[]> {
  const response = await fetch('/api/admin/users', { credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to load users'));
  }
  return response.json();
}

export async function lockUser(userId: string): Promise<AdminUserView> {
  const response = await fetch(`/api/admin/users/${userId}/lock`, { method: 'POST', credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to lock user'));
  }
  return response.json();
}

export async function unlockUser(userId: string): Promise<AdminUserView> {
  const response = await fetch(`/api/admin/users/${userId}/unlock`, { method: 'POST', credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to unlock user'));
  }
  return response.json();
}

export async function promoteUser(userId: string): Promise<AdminUserView> {
  const response = await fetch(`/api/admin/users/${userId}/promote`, { method: 'POST', credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to promote user'));
  }
  return response.json();
}

export async function demoteUser(userId: string): Promise<AdminUserView> {
  const response = await fetch(`/api/admin/users/${userId}/demote`, { method: 'POST', credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to demote user'));
  }
  return response.json();
}

export async function deleteUser(userId: string): Promise<void> {
  const response = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE', credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to remove user'));
  }
}

export async function seedDemoData(): Promise<void> {
  const response = await fetch('/api/admin/seed-demo', { method: 'POST', credentials: 'same-origin' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (body?.code === 'already_exists') throw new Error('already_exists');
    throw new Error(await parseErrorMessage(response, 'Failed to seed demo data'));
  }
}

export interface AdminAgentOverviewRow {
  id: string;
  name: string;
  characterType: string | null;
  status: string;
  ownerEmail: string;
  createdAt: string;
  playbookCount: number;
  sourceCount: number;
  discussionCount: number;
  runs30d: number;
  completed30d: number;
  failed30d: number;
  recentRunStatuses: string[];
  lastRunAt: string | null;
  lastRunStatus: string | null;
  reportsTotal: number;
  reports30d: number;
  inputTokens30d: number;
  outputTokens30d: number;
  costUsd30d: number;
  needsReviewCount: number;
}

export interface AdminAgentsOverview {
  totals: {
    agents: number;
    activeAgents: number;
    runs30d: number;
    successRate30d: number | null;
    failed24h: number;
    reports30d: number;
    inputTokens30d: number;
    outputTokens30d: number;
    costUsd30d: number;
    needsReviewCount: number;
    avgRunMs30d: number | null;
  };
  agents: AdminAgentOverviewRow[];
}

export async function fetchAgentsOverview(): Promise<AdminAgentsOverview> {
  const response = await fetch('/api/admin/agents/overview', { credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to load agents overview'));
  }
  return response.json();
}

export async function pauseAgentAsAdmin(agentId: string): Promise<void> {
  const response = await fetch(`/api/admin/agents/${agentId}/pause`, { method: 'POST', credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to pause agent'));
  }
}

export async function resumeAgentAsAdmin(agentId: string): Promise<void> {
  const response = await fetch(`/api/admin/agents/${agentId}/resume`, { method: 'POST', credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to resume agent'));
  }
}

export async function deleteAgentAsAdmin(agentId: string): Promise<void> {
  const response = await fetch(`/api/admin/agents/${agentId}`, { method: 'DELETE', credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to delete agent'));
  }
}

export interface AdminReportRow {
  id: string;
  agentName: string;
  ownerEmail: string;
  summary: string;
  model: string | null;
  needsHumanReview: boolean;
  read: boolean;
  tokens: number;
  costUsd: number;
  createdAt: string;
}

export interface AdminReportsOverview {
  totals: {
    reports30d: number;
    unread30d: number;
    unreadRate30d: number | null;
    needsReviewTotal: number;
    inputTokens30d: number;
    outputTokens30d: number;
    costUsd30d: number;
    avgTokensPerReport30d: number | null;
  };
  reports: AdminReportRow[];
}

export async function fetchReportsOverview(): Promise<AdminReportsOverview> {
  const response = await fetch('/api/admin/reports/overview', { credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to load reports overview'));
  }
  return response.json();
}

export interface AdminSourceRow {
  id: string;
  type: string;
  value: string;
  status: string;
  ownerEmail: string;
  createdAt: string;
  agentCount: number;
  items30d: number;
  lastItemAt: string | null;
  stale: boolean;
}

export interface AdminSourcesOverview {
  totals: {
    sources: number;
    activeSources: number;
    byType: Record<string, number>;
    items30d: number;
    staleSources: number;
    unfollowedSources: number;
  };
  sources: AdminSourceRow[];
}

export async function fetchSourcesOverview(): Promise<AdminSourcesOverview> {
  const response = await fetch('/api/admin/sources/overview', { credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to load sources overview'));
  }
  return response.json();
}

export interface AdminDiscussionRow {
  id: string;
  name: string;
  format: string;
  ownerEmail: string;
  createdAt: string;
  participantCount: number;
  runsTotal: number;
  failedRuns: number;
  turnsTotal: number;
  audioRuns: number;
  lastRunAt: string | null;
  lastRunStatus: string | null;
}

export interface AdminDiscussionsOverview {
  totals: {
    discussions: number;
    runs30d: number;
    failedRuns30d: number;
    turns30d: number;
    audioRuns30d: number;
  };
  discussions: AdminDiscussionRow[];
}

export async function fetchDiscussionsOverview(): Promise<AdminDiscussionsOverview> {
  const response = await fetch('/api/admin/discussions/overview', { credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to load discussions overview'));
  }
  return response.json();
}
