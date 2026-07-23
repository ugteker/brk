import type { CharacterType } from '../agents/types';

export type CurationMode = 'create' | 'update';
export type CurationSessionStatus = 'active' | 'finalizing' | 'completed';
export type CurationCompleteness = 'collecting' | 'ready_for_review';
export type CurationMissingField = 'name' | 'description' | 'characterType' | 'systemPrompt';
export type CurationMessageRole = 'user' | 'assistant';
export type CurationSourceContext = Record<string, unknown>;
export type CurationProfileField = 'name' | 'description' | 'avatar' | 'characterType' | 'systemPrompt';

export class CurationSessionConflictError extends Error {
  readonly code = 'curation_session_conflict';

  constructor() {
    super('curation_session_conflict');
    this.name = 'CurationSessionConflictError';
  }
}

export interface CurationProfile {
  name: string;
  description: string;
  avatar: string | null;
  characterType: CharacterType | null;
  systemPrompt: string;
}

export type CurationDraftPatch = Partial<CurationProfile>;

export interface CurationDraftMetadata {
  userLockedFields: CurationProfileField[];
}

export interface CurationDraft extends CurationProfile {
  completeness: CurationCompleteness;
  missingFields: CurationMissingField[];
  metadata?: CurationDraftMetadata;
}

export interface CurationMessage {
  id: string;
  sessionId: string;
  role: CurationMessageRole;
  content: string;
  clientRequestId?: string;
  position: number;
  createdAt: Date;
}

export interface CurationSavedReply {
  assistantMessage: string;
  draft: CurationDraft;
  suggestedReplies: string[];
  sessionRevision: number;
  assistantMessagePosition: number;
  sessionUpdatedAt: string;
}

export type CurationReplyClaim =
  | { status: 'claimed' }
  | { status: 'in_progress' }
  | { status: 'completed'; reply: CurationSavedReply };

export interface CurationSession {
  id: string;
  ownerUserId: string;
  targetAgentId: string | null;
  mode: CurationMode;
  status: CurationSessionStatus;
  revision: number;
  finalizationAgentId: string | null;
  sourceContext: CurationSourceContext;
  draft: CurationDraft;
  createdAt: Date;
  updatedAt: Date;
  messages: CurationMessage[];
}

export interface CreateCurationSessionInput {
  targetAgentId?: string | null;
  mode: CurationMode;
  sourceContext: CurationSourceContext;
  draft: CurationDraft;
}

export interface AppendCurationMessageInput {
  role: CurationMessageRole;
  content: string;
  clientRequestId?: string;
}

export interface ClaudeAgentCurationRequest {
  model: string;
  systemInstruction: string;
  conversation: Array<{ role: CurationMessageRole; content: string }>;
  sourceContext: CurationSourceContext;
  currentAgentProfile: CurationProfile;
}

export interface ClaudeAgentCurationCompletion {
  message: string;
  draftPatch: CurationDraftPatch;
  suggestedReplies: string[];
  missingFields: CurationMissingField[];
}
