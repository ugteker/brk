export type SignalSide = 'long' | 'short';
export type CharacterType = 'finance_expert' | 'teacher' | 'trainer' | 'philosopher' | 'influencer' | 'summarizer';
export { probeSource } from './sources';
export type { SourceProbePreviewItem, SourceProbeResult } from './sources';

export interface PromptConfig {
  tone?: string;
  depth?: string;
  format_style?: string;
  audience?: string;
  output_length?: string;
  custom_instructions?: string;
  risk_level?: string;
  personality_id?: string;
  personality_label?: string;
}

export interface CreateAgentPayload {
  name: string;
  description?: string;
  active?: boolean;
  characterType?: CharacterType;
  promptConfig?: PromptConfig;
  sources?: Array<{ type: 'web_urls' | 'podcast_feeds' | 'youtube_videos'; value: string; frequencyMinutes?: number; maxItems?: number }>;
  preferences: Record<string, string[]>;
  schedule?:
    | { mode: 'interval'; intervalMinutes: number }
    | { mode: 'daily'; dailyTime: string; timezone: string }
    | { mode: 'weekly'; daysOfWeek: number[]; dailyTime: string; timezone: string };
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
  ownerUserId: string;
  name: string;
  characterType?: CharacterType;
  promptConfig?: PromptConfig;
  status: string;
  sources: Array<{ type: 'web_urls' | 'podcast_feeds' | 'youtube_videos'; value: string }>;
  schedule:
    | { mode: 'interval'; intervalMinutes: number }
    | { mode: 'daily'; dailyTime: string; timezone: string }
    | { mode: 'weekly'; daysOfWeek: number[]; dailyTime: string; timezone: string }
    | null;
  runCount: number;
  reportCount: number;
  latestReportAt: string | null;
}

export interface AgentDetail extends AgentSummary {
  description: string;
  sources: Array<{ type: 'web_urls' | 'podcast_feeds' | 'youtube_videos'; value: string; frequencyMinutes: number; maxItems: number }>;
  preferences: Record<string, string[]>;
  schedule:
    | { mode: 'interval'; intervalMinutes: number }
    | { mode: 'daily'; dailyTime: string; timezone: string }
    | { mode: 'weekly'; daysOfWeek: number[]; dailyTime: string; timezone: string }
    | null;
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    return typeof body?.message === 'string' ? body.message : fallback;
  } catch {
    return fallback;
  }
}

export async function listAgents(): Promise<AgentSummary[]> {
  const response = await fetch('/api/agents');
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to load agents'));
  }
  return response.json();
}

export async function getAgent(agentId: string): Promise<AgentDetail> {
  const response = await fetch(`/api/agents/${agentId}`);
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to load agent'));
  }
  return response.json();
}


export async function disableAgent(agentId: string): Promise<void> {
  const response = await fetch(`/api/agents/${agentId}/disable`, { method: 'POST' });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to pause agent'));
  }
}

export async function enableAgent(agentId: string): Promise<void> {
  const response = await fetch(`/api/agents/${agentId}/enable`, { method: 'POST' });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to resume agent'));
  }
}

export interface RunAgentNowResult {
  status: string;
  errorCode?: string;
}

export interface EpisodeOptionDto {
  sourceType: 'podcast_feeds' | 'youtube_videos';
  sourceValue: string;
  title: string;
  link: string;
  pubDate: string | null;
}

/**
 * Sneak preview (last 10, combined across an agent's episodic sources) shown by the manual-run
 * episode picker, letting the user pick a specific episode to run against instead of always
 * crawling for "new content since last run".
 */
export async function listAgentEpisodeOptions(agentId: string): Promise<EpisodeOptionDto[]> {
  const response = await fetch(`/api/agents/${agentId}/episode-options`);
  if (!response.ok) {
    throw new Error(response.status === 503 ? 'Episode preview is not available right now' : 'Failed to load episode options');
  }
  return response.json();
}

export interface ForcedEpisodeSelection {
  sourceType: 'podcast_feeds' | 'youtube_videos';
  sourceValue: string;
  itemLink: string;
}

export async function runAgentNow(agentId: string, forcedEpisode?: ForcedEpisodeSelection): Promise<RunAgentNowResult> {
  const response = await fetch(`/api/agents/${agentId}/run`, {
    method: 'POST',
    headers: forcedEpisode ? { 'content-type': 'application/json' } : undefined,
    body: forcedEpisode ? JSON.stringify(forcedEpisode) : undefined
  });
  if (!response.ok) {
    throw new Error(response.status === 503 ? 'Manual runs are not available right now' : await parseErrorMessage(response, 'Failed to run agent'));
  }
  return response.json();
}

export async function deleteAgent(agentId: string): Promise<void> {
  const response = await fetch(`/api/agents/${agentId}`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to remove agent'));
  }
}

export interface PublishAgentPayload {
  title: string;
  summary?: string;
  visibility?: 'public' | 'private';
}

export async function publishAgent(agentId: string, payload: PublishAgentPayload): Promise<{ publicationId: string }> {
  const response = await fetch(`/api/agents/${agentId}/publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to publish agent'));
  }
  return response.json();
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
    throw new Error(await parseErrorMessage(response, 'Failed to load recent runs'));
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

export interface UnifiedReportCommonFieldsDto {
  summary: string;
  key_takeaways: string[];
  sources_used: string[];
  citations: string[];
}

export type UnifiedCharacterSectionDto =
  | { character_type: 'finance_expert'; market_summary: string; signals: SignalDto[] }
  | { character_type: 'teacher'; lesson_explanation: string }
  | { character_type: 'trainer'; qa_drill: Array<{ question: string; answer: string }> }
  | { character_type: 'philosopher'; argument_reflection: string }
  | { character_type: 'influencer'; content_angles: string[]; hooks: string[] }
  | { character_type: 'summarizer'; bullet_digest: string[] };

export interface UnifiedCharacterReportDto {
  common: UnifiedReportCommonFieldsDto;
  section: UnifiedCharacterSectionDto;
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
  model: string | null;
  promptVersionNumber: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
  report?: UnifiedCharacterReportDto;
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

export interface ResendReportNotificationResult {
  status: string;
  recipientCount: number;
}

export async function resendReportNotification(
  agentId: string,
  reportId: string,
  recipients: string[]
): Promise<ResendReportNotificationResult> {
  const response = await fetch(`/api/agents/${agentId}/reports/${reportId}/resend-notification`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ recipients })
  });
  if (!response.ok) {
    if (response.status === 400) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.message ?? 'Playbook recipients are required to send report notification');
    }
    throw new Error('Failed to send report notification');
  }
  return response.json();
}

export async function getLatestAgentPrompt(agentId: string): Promise<PromptVersionDto | null> {
  const response = await fetch(`/api/agents/${agentId}/prompt/latest`);
  if (response.status === 404) return null;
  return parseJsonOrThrow(response, 'Failed to load latest agent prompt');
}

// Chronological (oldest-first) history of this agent's own reports that contain at least one
// signal for `symbol` - used by the symbol performance view alongside the TradingView chart.
export async function listSymbolSignalHistory(agentId: string, symbol: string): Promise<RunReportDto[]> {
  const response = await fetch(`/api/agents/${agentId}/signals/${encodeURIComponent(symbol)}`);
  return parseJsonOrThrow(response, 'Failed to load signal history for this symbol');
}

export interface RunArtifactPreviewDto {
  id: string;
  sourceRef: string;
  fidelity: string;
  contentPreview: string;
  contentLength: number;
}

export interface RunReportSummaryDto {
  id: string;
  summary: string;
  needsHumanReview: boolean;
  signalCount: number;
}

export interface RunDetailDto {
  id: string;
  agentId: string;
  status: string;
  phase: string | null;
  scheduledFor: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  retryCount: number;
  report: RunReportSummaryDto | null;
  artifacts: RunArtifactPreviewDto[];
}

export async function listAgentRuns(agentId: string): Promise<RunDetailDto[]> {
  const response = await fetch(`/api/agents/${agentId}/runs`);
  return parseJsonOrThrow(response, 'Failed to load agent runs');
}

// Plain URL (not a fetch wrapper) - meant to be used directly as an <a href> so the browser
// handles the download/Content-Disposition itself, with same-origin session cookies applied
// automatically.
export function artifactDownloadUrl(agentId: string, runId: string, artifactId: string): string {
  return `/api/agents/${agentId}/runs/${runId}/artifacts/${artifactId}/download`;
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
