import type {
  ClaudeAgentCurationCompletion,
  ClaudeAgentCurationRequest,
  CurationDraft,
  CurationDraftPatch,
  CurationMissingField,
  CurationProfile,
  CurationProfileField,
  CurationSavedReply,
  CurationSession
} from './types';
import { ClaudeCurationResponseError } from '../analysis/claude-client';
import { CHARACTER_TYPES } from '../agents/types';
import { AgentCurationRepository } from './repository';

const REQUIRED_DRAFT_FIELDS: readonly CurationMissingField[] = ['name', 'description', 'characterType', 'systemPrompt'];
const PROFILE_FIELDS: readonly CurationProfileField[] = ['name', 'description', 'avatar', 'characterType', 'systemPrompt'];
export const MAX_CURATION_USER_MESSAGE_CHARS = 4_000;
// Source context is serialized into Claude's prompt, so it has a separate hard character budget.
export const MAX_CURATION_SOURCE_CONTEXT_CHARS = 16_000;
export const MAX_CURATION_PROFILE_DRAFT_CHARS = 8_000;
export const MAX_CURATION_CONVERSATION_MESSAGES = 20;
export const MAX_CURATION_CLIENT_REQUEST_ID_CHARS = 128;

export const CURATION_SYSTEM_INSTRUCTION = [
  'You help users curate an AI agent profile through a short, guided conversation.',
  'Return a concise assistant message, a profile-only draft patch, suggested replies, and the fields still missing.',
  'Interview before you finalize: unless the user already gave a detailed brief, ask focused follow-up questions - one short question per reply - to learn (1) what the agent should watch or analyze, (2) the tone and audience, and (3) the desired output style and depth. A one-line or vague request (e.g. just a name or a two-word idea) must never be enough to complete the profile; ask at least two follow-up questions first.',
  'Only fill systemPrompt once you have enough detail from the conversation to write a specific, useful prompt. Leave it out of the patch until then.',
  'Always infer characterType yourself from the conversation; never ask the user about character types or mention the term.',
  'Suggested replies must be short, pickable answers to the question you just asked (2-4 of them), not generic phrases.',
  'Respect explicit user corrections over any prior profile direction.'
].join('\n');

const CURATION_SOURCE_OPENING_INSTRUCTION = [
  'Use selected source context only for this opening proposal.',
  'Let it inspire a useful character, audience, tone, or output shape, but keep the agent reusable with other sources.',
  'Do not invent source facts, lock profile fields from it, or treat it as a user requirement.',
  'Explicit user direction always wins.'
].join('\n');

export interface AgentCurationClaudeLike {
  curateAgent(request: ClaudeAgentCurationRequest): Promise<ClaudeAgentCurationCompletion>;
}

export interface AgentCurationServiceDeps {
  repository: Pick<
    AgentCurationRepository,
    | 'appendMessage'
    | 'claimReply'
    | 'createSession'
    | 'getReplyForRequest'
    | 'getSessionForOwner'
    | 'releaseReplyClaim'
    | 'saveReply'
  >;
  claudeClient: AgentCurationClaudeLike;
  model: string;
}

export interface StartCurationInput {
  ownerUserId: string;
  mode: CurationSession['mode'];
  targetAgentId?: string | null;
  sourceContext?: CurationSession['sourceContext'];
  currentAgentProfile?: CurationDraftPatch;
  initialDraft?: CurationDraftPatch;
  /** BCP-47-ish app language (e.g. 'de', 'de-DE'). Stored on the session so the curator replies in it. */
  language?: string;
}

export interface CurationReplyResult {
  assistantMessage: string;
  draft: CurationDraft;
  suggestedReplies: string[];
  canReview: boolean;
  session: CurationSession;
}

export interface CurationFinalization {
  draft: CurationDraft;
  summary: CurationProfile;
}

export class CurationGenerationError extends Error {
  readonly code = 'generation_failed';

  constructor() {
    super('generation_failed');
    this.name = 'CurationGenerationError';
  }
}

export class CurationIncompleteError extends Error {
  readonly code = 'curation_incomplete';

  constructor(readonly missingFields: CurationMissingField[]) {
    super('curation_incomplete');
    this.name = 'CurationIncompleteError';
  }
}

export class CurationReplyInProgressError extends Error {
  readonly code = 'curation_reply_in_progress';

  constructor() {
    super('curation_reply_in_progress');
    this.name = 'CurationReplyInProgressError';
  }
}

type CurationInputErrorCode =
  | 'invalid_curation_user_message'
  | 'curation_user_message_too_long'
  | 'invalid_curation_source_context'
  | 'curation_source_context_too_large'
  | 'invalid_curation_draft_patch'
  | 'curation_profile_draft_too_large'
  | 'invalid_curation_client_request_id';

export class CurationInputError extends Error {
  constructor(readonly code: CurationInputErrorCode) {
    super(code);
    this.name = 'CurationInputError';
  }
}

function createEmptyDraft(): CurationDraft {
  return {
    name: '',
    description: '',
    avatar: null,
    characterType: null,
    systemPrompt: '',
    completeness: 'collecting',
    missingFields: [...REQUIRED_DRAFT_FIELDS],
    metadata: { userLockedFields: [] }
  };
}

function hasOwnField(patch: CurationDraftPatch, field: CurationProfileField): boolean {
  return Object.prototype.hasOwnProperty.call(patch, field);
}

function computeMissingFields(profile: CurationProfile): CurationMissingField[] {
  return REQUIRED_DRAFT_FIELDS.filter((field) => {
    const value = profile[field];
    return typeof value === 'string' ? value.trim().length === 0 : value === null;
  });
}

function profileFromDraft(draft: CurationDraft): CurationProfile {
  return {
    name: draft.name,
    description: draft.description,
    avatar: draft.avatar,
    characterType: draft.characterType,
    systemPrompt: draft.systemPrompt
  };
}

function withCompleteness(profile: CurationProfile, userLockedFields: Iterable<CurationProfileField>): CurationDraft {
  const missingFields = computeMissingFields(profile);
  return {
    ...profile,
    completeness: missingFields.length === 0 ? 'ready_for_review' : 'collecting',
    missingFields,
    metadata: { userLockedFields: [...new Set(userLockedFields)] }
  };
}

function mergePatch(profile: CurationProfile, patch: CurationDraftPatch): CurationProfile {
  const merged = { ...profile };
  for (const field of PROFILE_FIELDS) {
    if (hasOwnField(patch, field)) {
      merged[field] = patch[field] as never;
    }
  }
  return merged;
}

function combineDraftPatches(...patches: CurationDraftPatch[]): CurationDraftPatch {
  const combined: CurationDraftPatch = {};
  for (const patch of patches) {
    for (const field of PROFILE_FIELDS) {
      if (hasOwnField(patch, field)) {
        combined[field] = patch[field] as never;
      }
    }
  }
  return combined;
}

function assertSourceContextWithinLimit(sourceContext: CurationSession['sourceContext']): void {
  let serialized: string;
  try {
    serialized = JSON.stringify(sourceContext);
  } catch {
    throw new CurationInputError('invalid_curation_source_context');
  }
  if (typeof serialized !== 'string') {
    throw new CurationInputError('invalid_curation_source_context');
  }
  if (serialized.length > MAX_CURATION_SOURCE_CONTEXT_CHARS) {
    throw new CurationInputError('curation_source_context_too_large');
  }
}

function assertValidUserText(userText: string): void {
  if (typeof userText !== 'string' || userText.trim().length === 0) {
    throw new CurationInputError('invalid_curation_user_message');
  }
  if (userText.length > MAX_CURATION_USER_MESSAGE_CHARS) {
    throw new CurationInputError('curation_user_message_too_long');
  }
}

function assertValidClientRequestId(clientRequestId: string | undefined): void {
  if (
    clientRequestId !== undefined &&
    (typeof clientRequestId !== 'string' ||
      clientRequestId.trim().length === 0 ||
      clientRequestId.length > MAX_CURATION_CLIENT_REQUEST_ID_CHARS)
  ) {
    throw new CurationInputError('invalid_curation_client_request_id');
  }
}

function assertValidCurationDraftPatch(patch: CurationDraftPatch | undefined): void {
  if (patch === undefined) {
    return;
  }
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
    throw new CurationInputError('invalid_curation_draft_patch');
  }
  if (Object.keys(patch).some((field) => !PROFILE_FIELDS.includes(field as CurationProfileField))) {
    throw new CurationInputError('invalid_curation_draft_patch');
  }
  if (
    (hasOwnField(patch, 'name') && typeof patch.name !== 'string') ||
    (hasOwnField(patch, 'description') && typeof patch.description !== 'string') ||
    (hasOwnField(patch, 'avatar') && patch.avatar !== null && typeof patch.avatar !== 'string') ||
    (hasOwnField(patch, 'characterType') &&
      patch.characterType !== null &&
      !CHARACTER_TYPES.includes(patch.characterType as NonNullable<CurationDraftPatch['characterType']>)) ||
    (hasOwnField(patch, 'systemPrompt') && typeof patch.systemPrompt !== 'string')
  ) {
    throw new CurationInputError('invalid_curation_draft_patch');
  }
  assertCurationProfileWithinLimit(patch);
}

export function assertCurationProfileWithinLimit(profile: CurationProfile | CurationDraftPatch): void {
  const characterCount = PROFILE_FIELDS.reduce((total, field) => {
    const value = profile[field];
    return total + (typeof value === 'string' ? value.length : 0);
  }, 0);
  if (characterCount > MAX_CURATION_PROFILE_DRAFT_CHARS) {
    throw new CurationInputError('curation_profile_draft_too_large');
  }
}

function extractLabeledUserPatch(userText: string): CurationDraftPatch {
  const patch: CurationDraftPatch = {};
  const labels: Array<[CurationProfileField, RegExp]> = [
    ['name', /(?:^|\n)\s*name\s*:\s*(.+?)\s*$/im],
    ['description', /(?:^|\n)\s*description\s*:\s*(.+?)\s*$/im],
    ['avatar', /(?:^|\n)\s*avatar\s*:\s*(.+?)\s*$/im],
    ['systemPrompt', /(?:^|\n)\s*system\s+prompt\s*:\s*(.+?)\s*$/im]
  ];
  for (const [field, pattern] of labels) {
    const value = userText.match(pattern)?.[1]?.trim();
    if (value) {
      patch[field] = value as never;
    }
  }

  const directName = userText.match(/(?:^|\n)\s*change\s+the\s+name\s+to\s+(.+?)\s*$/im)?.[1]?.trim();
  if (directName) {
    patch.name = directName;
  }

  const lowerText = userText.toLowerCase();
  const candidates: Array<{ characterType: NonNullable<CurationProfile['characterType']>; index: number }> = [
    { characterType: 'finance_expert' as const, index: lowerText.lastIndexOf('finance analyst') },
    { characterType: 'finance_expert' as const, index: lowerText.lastIndexOf('finance expert') },
    { characterType: 'teacher' as const, index: lowerText.lastIndexOf('teacher') },
    { characterType: 'trainer' as const, index: lowerText.lastIndexOf('trainer') },
    { characterType: 'philosopher' as const, index: lowerText.lastIndexOf('philosopher') },
    { characterType: 'influencer' as const, index: lowerText.lastIndexOf('influencer') },
    { characterType: 'summarizer' as const, index: lowerText.lastIndexOf('research digest') },
    { characterType: 'summarizer' as const, index: lowerText.lastIndexOf('summarizer') },
    { characterType: 'summarizer' as const, index: lowerText.lastIndexOf('digest') }
  ].filter((candidate) => {
    if (candidate.index < 0) return false;
    return !/\b(?:do not|don't|not)\b[^.!?\n]{0,40}$/.test(lowerText.slice(Math.max(0, candidate.index - 48), candidate.index));
  });
  const selected = candidates.sort((left, right) => right.index - left.index)[0];
  if (selected?.characterType) {
    patch.characterType = selected.characterType;
  }
  return patch;
}

function mergeCurationDraft(current: CurationDraft, userPatch: CurationDraftPatch, generatedPatch: CurationDraftPatch): CurationDraft {
  const userLockedFields = new Set(current.metadata?.userLockedFields ?? []);
  const afterUserInput = mergePatch(profileFromDraft(current), userPatch);
  for (const field of PROFILE_FIELDS) {
    if (hasOwnField(userPatch, field)) {
      userLockedFields.add(field);
    }
  }

  const allowedGeneratedPatch: CurationDraftPatch = {};
  for (const field of PROFILE_FIELDS) {
    if (hasOwnField(generatedPatch, field) && !userLockedFields.has(field)) {
      allowedGeneratedPatch[field] = generatedPatch[field] as never;
    }
  }
  return withCompleteness(mergePatch(afterUserInput, allowedGeneratedPatch), userLockedFields);
}

const CURATION_LANGUAGE_NAMES: Record<string, string> = {
  de: 'German',
  en: 'English',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian'
};

function curationLanguageDirective(sourceContext: CurationSession['sourceContext']): string {
  const raw = sourceContext?.preferredLanguage;
  if (typeof raw !== 'string') return '';
  const languageName = CURATION_LANGUAGE_NAMES[raw.toLowerCase().split('-')[0] ?? ''];
  if (!languageName || languageName === 'English') return '';
  return `\nThe app language is ${languageName}. Write your assistant message, suggested replies, and all profile draft fields (name, description, systemPrompt) in ${languageName}.`;
}

function hasSelectedSourceContext(sourceContext: CurationSession['sourceContext']): boolean {
  return ['title', 'type', 'url', 'value', 'selectedSources'].some((field) =>
    Object.prototype.hasOwnProperty.call(sourceContext, field)
  );
}

function toReplyResult(reply: CurationSavedReply, session: CurationSession): CurationReplyResult {
  return {
    assistantMessage: reply.assistantMessage,
    draft: reply.draft,
    suggestedReplies: reply.suggestedReplies,
    canReview: reply.draft.completeness === 'ready_for_review',
    session: {
      ...session,
      revision: reply.sessionRevision,
      draft: reply.draft,
      updatedAt: new Date(reply.sessionUpdatedAt),
      messages: session.messages.filter((message) => message.position <= reply.assistantMessagePosition)
    }
  };
}

export class AgentCurationService {
  constructor(private readonly deps: AgentCurationServiceDeps) {}

  async start(input: StartCurationInput): Promise<CurationSession> {
    if (typeof input.ownerUserId !== 'string' || input.ownerUserId.trim().length === 0) {
      throw new Error('invalid_curation_start');
    }

    assertValidCurationDraftPatch(input.currentAgentProfile);
    assertValidCurationDraftPatch(input.initialDraft);
    const sourceContext = { ...(input.sourceContext ?? {}) };
    if (typeof input.language === 'string' && input.language.trim().length > 0 && input.language.length <= 35) {
      sourceContext.preferredLanguage = input.language.trim();
    }
    assertSourceContextWithinLimit(sourceContext);
    const currentProfile = mergePatch(profileFromDraft(createEmptyDraft()), input.currentAgentProfile ?? {});
    const initialDraft = input.initialDraft ?? {};
    const draft = withCompleteness(
      mergePatch(currentProfile, initialDraft),
      PROFILE_FIELDS.filter((field) => hasOwnField(initialDraft, field))
    );
    return this.deps.repository.createSession(input.ownerUserId, {
      mode: input.mode,
      targetAgentId: input.targetAgentId,
      sourceContext,
      draft
    });
  }

  async reply(
    session: CurationSession,
    userText: string,
    userDraftPatch?: CurationDraftPatch,
    clientRequestId?: string
  ): Promise<CurationReplyResult> {
    assertValidUserText(userText);
    assertValidClientRequestId(clientRequestId);
    assertValidCurationDraftPatch(userDraftPatch);
    const ownedSession = await this.deps.repository.getSessionForOwner(session.id, session.ownerUserId);
    if (!ownedSession) {
      throw new Error('not_found');
    }
    const userMessage = await this.deps.repository.appendMessage(session.id, {
      role: 'user',
      content: userText,
      ...(clientRequestId === undefined ? {} : { clientRequestId })
    });
    if (clientRequestId !== undefined) {
      const replyClaim = await this.deps.repository.claimReply(session.id, clientRequestId);
      if (replyClaim.status === 'completed') {
        const completedSession = await this.deps.repository.getSessionForOwner(session.id, session.ownerUserId);
        if (!completedSession) {
          throw new Error('not_found');
        }
        return toReplyResult(replyClaim.reply, completedSession);
      }
      if (replyClaim.status === 'in_progress') {
        throw new CurationReplyInProgressError();
      }
    }
    const freshSession = await this.deps.repository.getSessionForOwner(session.id, session.ownerUserId);
    if (!freshSession) {
      throw new Error('not_found');
    }
    assertSourceContextWithinLimit(freshSession.sourceContext);
    const currentAgentProfile = profileFromDraft(freshSession.draft);
    assertValidCurationDraftPatch(currentAgentProfile);
    const isOpeningTurn = freshSession.messages.filter((message) => message.role === 'user').length === 1;
    const useSourceContext = isOpeningTurn && hasSelectedSourceContext(freshSession.sourceContext);
    const request: ClaudeAgentCurationRequest = {
      model: this.deps.model,
      systemInstruction:
        CURATION_SYSTEM_INSTRUCTION +
        (useSourceContext ? `\n${CURATION_SOURCE_OPENING_INSTRUCTION}` : '') +
        curationLanguageDirective(freshSession.sourceContext),
      conversation: freshSession.messages
        .slice(-MAX_CURATION_CONVERSATION_MESSAGES)
        .map((message) => ({ role: message.role, content: message.content })),
      sourceContext: useSourceContext ? freshSession.sourceContext : {},
      currentAgentProfile
    };

    let completion: ClaudeAgentCurationCompletion;
    try {
      completion = await this.deps.claudeClient.curateAgent(request);
    } catch (error) {
      if (clientRequestId !== undefined) {
        await this.deps.repository.releaseReplyClaim(session.id, clientRequestId);
      }
      if (error instanceof ClaudeCurationResponseError) {
        throw error;
      }
      throw new CurationGenerationError();
    }

    const userPatch = combineDraftPatches(extractLabeledUserPatch(userText), userDraftPatch ?? {});
    const mergedDraft = mergeCurationDraft(freshSession.draft, userPatch, completion.draftPatch);
    let savedSession: CurationSession;
    try {
      savedSession = await this.deps.repository.saveReply(
        freshSession.id,
        freshSession.revision,
        completion.message,
        mergedDraft,
        clientRequestId === undefined ? undefined : userMessage.id,
        completion.suggestedReplies
      );
    } catch (error) {
      if (clientRequestId !== undefined) {
        const savedReply = await this.deps.repository.getReplyForRequest(session.id, clientRequestId);
        if (savedReply) {
          const completedSession = await this.deps.repository.getSessionForOwner(session.id, session.ownerUserId);
          if (!completedSession) {
            throw new Error('not_found');
          }
          return toReplyResult(savedReply, completedSession);
        }
        await this.deps.repository.releaseReplyClaim(session.id, clientRequestId);
      }
      throw error;
    }
    return {
      assistantMessage: completion.message,
      draft: savedSession.draft,
      suggestedReplies: completion.suggestedReplies,
      canReview: savedSession.draft.completeness === 'ready_for_review',
      session: savedSession
    };
  }

  async buildFinalization(session: CurationSession): Promise<CurationFinalization> {
    const draft = withCompleteness(profileFromDraft(session.draft), session.draft.metadata?.userLockedFields ?? []);
    if (draft.missingFields.length > 0) {
      throw new CurationIncompleteError(draft.missingFields);
    }
    return { draft, summary: profileFromDraft(draft) };
  }
}
