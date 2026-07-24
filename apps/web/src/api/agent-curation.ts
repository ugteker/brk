import type { CharacterType, PromptConfig } from './agents';

export type CurationMode = 'create' | 'update';
export type CurationSessionStatus = 'active' | 'finalizing' | 'completed';
export type CurationCompleteness = 'collecting' | 'ready_for_review';
export type CurationMissingField = 'name' | 'description' | 'characterType' | 'systemPrompt';
export type CurationProfileField = 'name' | 'description' | 'avatar' | 'characterType' | 'systemPrompt';

export type CurationSourceContext = Record<string, unknown>;

export interface CurationProfile {
  name: string;
  description: string;
  avatar: string | null;
  characterType: CharacterType | null;
  systemPrompt: string;
}

export type CurationDraftPatch = Partial<CurationProfile>;

export interface CurationDraft extends CurationProfile {
  completeness: CurationCompleteness;
  missingFields: CurationMissingField[];
  metadata?: {
    userLockedFields: CurationProfileField[];
  };
}

export interface CurationMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  position: number;
  createdAt: string;
}

export interface CurationSession {
  id: string;
  ownerUserId: string;
  targetAgentId: string | null;
  baseAgentVersionId: string | null;
  mode: CurationMode;
  status: CurationSessionStatus;
  revision: number;
  finalizationAgentId: string | null;
  sourceContext: CurationSourceContext;
  draft: CurationDraft;
  createdAt: string;
  updatedAt: string;
  messages: CurationMessage[];
}

export interface StartAgentCurationInput {
  mode: CurationMode;
  targetAgentId?: string | null;
  baseAgentVersionId?: string | null;
  sourceContext?: CurationSourceContext;
  currentAgentProfile?: CurationDraftPatch;
  initialDraft?: CurationDraftPatch;
  /** App UI language (e.g. 'de'); the curator converses and drafts in it. */
  language?: string;
}

export interface SendAgentCurationMessageInput {
  text: string;
  userDraftPatch?: CurationDraftPatch;
  clientRequestId?: string;
}

export interface AgentCurationReply {
  assistantMessage: string;
  draft: CurationDraft;
  suggestedReplies: string[];
  canReview: boolean;
  session: CurationSession;
}

export interface CuratedAgent {
  id: string;
  ownerUserId?: string;
  name: string;
  description: string;
  characterType: CharacterType;
  promptConfig?: PromptConfig;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  sources?: Array<{ type: 'web_urls' | 'podcast_feeds' | 'youtube_videos'; value: string; frequencyMinutes: number; maxItems: number }>;
  preferences?: Record<string, string[]>;
  schedule?: unknown;
}

export interface FinalizeAgentCurationResult {
  agent: CuratedAgent;
  session: CurationSession;
}

interface AgentCurationErrorBody {
  code?: string;
  message?: string;
  retryable?: boolean;
  missingFields?: CurationMissingField[];
}

export class AgentCurationApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly retryable: boolean;
  readonly missingFields?: CurationMissingField[];

  constructor({
    status,
    message,
    code,
    retryable = false,
    missingFields
  }: {
    status: number;
    message: string;
    code?: string;
    retryable?: boolean;
    missingFields?: CurationMissingField[];
  }) {
    super(message);
    this.name = 'AgentCurationApiError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.missingFields = missingFields;
  }
}

function isErrorBody(value: unknown): value is AgentCurationErrorBody {
  return typeof value === 'object' && value !== null;
}

async function createApiError(response: Response, fallback: string): Promise<AgentCurationApiError> {
  let body: AgentCurationErrorBody | undefined;
  try {
    const value: unknown = await response.json();
    if (isErrorBody(value)) body = value;
  } catch {
    // The established clients fall back to a local message for non-JSON errors.
  }

  return new AgentCurationApiError({
    status: response.status,
    message: typeof body?.message === 'string' ? body.message : fallback,
    code: typeof body?.code === 'string' ? body.code : undefined,
    retryable: body?.retryable === true,
    missingFields: Array.isArray(body?.missingFields) ? body.missingFields : undefined
  });
}

async function parseJsonOrThrow<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) throw await createApiError(response, fallback);
  return response.json() as Promise<T>;
}

export async function startAgentCuration(input: StartAgentCurationInput): Promise<CurationSession> {
  const response = await fetch('/api/agent-curations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });
  return parseJsonOrThrow(response, 'Failed to start curation session');
}

export async function getAgentCurationSession(sessionId: string): Promise<CurationSession> {
  const response = await fetch(`/api/agent-curations/${sessionId}`);
  return parseJsonOrThrow(response, 'Failed to load curation session');
}

export async function sendAgentCurationMessage(
  sessionId: string,
  input: SendAgentCurationMessageInput
): Promise<AgentCurationReply> {
  const response = await fetch(`/api/agent-curations/${sessionId}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });
  return parseJsonOrThrow(response, 'Failed to send curation message');
}

export async function finalizeAgentCuration(sessionId: string, draft: CurationDraft): Promise<FinalizeAgentCurationResult> {
  const response = await fetch(`/api/agent-curations/${sessionId}/finalize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(draft)
  });
  return parseJsonOrThrow(response, 'Failed to finalize agent curation');
}
