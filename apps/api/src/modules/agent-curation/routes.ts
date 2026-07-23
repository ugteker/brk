import type { FastifyInstance, FastifyReply } from 'fastify';
import { ClaudeCurationResponseError } from '../analysis/claude-client';
import type { DomainAccessResolver } from '../access/permissions';
import { CHARACTER_TYPES } from '../agents/types';
import type { AgentRepositoryLike } from '../agents/routes';
import type { Agent, CharacterType, CreateAgentInput } from '../agents/types';
import { validateCreateAgentInput, validatePatchAgentInput } from '../agents/validation';
import type { PromptRepository } from '../prompts/repository';
import { AgentCurationRepository } from './repository';
import {
  AgentCurationService,
  assertCurationProfileWithinLimit,
  type AgentCurationClaudeLike,
  CurationGenerationError,
  CurationIncompleteError,
  CurationInputError,
  CurationReplyInProgressError
} from './service';
import { CurationSessionConflictError } from './types';
import type {
  CurationDraft,
  CurationDraftPatch,
  CurationMissingField,
  CurationProfileField,
  CurationSession,
  CurationSourceContext
} from './types';

type CurationRepositoryLike = Pick<
  AgentCurationRepository,
  | 'appendMessage'
  | 'claimReply'
  | 'createSession'
  | 'getReplyForRequest'
  | 'getSessionForOwner'
  | 'markCompleted'
  | 'releaseFinalization'
  | 'releaseReplyClaim'
  | 'reserveFinalization'
  | 'saveReply'
>;

type CuratedAgentRepositoryLike = Pick<AgentRepositoryLike, 'getAgent' | 'updateAgent'> & {
  createFinalizedAgent(
    ownerUserId: string,
    input: CreateAgentInput,
    curationSessionId: string,
    expectedRevision: number
  ): Promise<Agent>;
  updateFinalizedAgent(
    agentId: string,
    input: CreateAgentInput,
    curationSessionId: string,
    expectedRevision: number
  ): Promise<Agent>;
};

type CuratedPromptRepositoryLike = Pick<PromptRepository, 'savePromptVersion'> & {
  saveCuratedPromptVersion(
    agentId: string,
    input: { model: string; systemPrompt: string; enabled: boolean },
    curationSessionId: string
  ): Promise<unknown>;
  getPromptVersionByCurationSessionId(curationSessionId: string): Promise<{ agentId: string } | null>;
};

export interface AgentCurationFeatureDeps {
  repository: CurationRepositoryLike;
  claudeClient: AgentCurationClaudeLike;
  model: string;
  accessResolver?: Pick<DomainAccessResolver, 'resolve'>;
}

export interface AgentCurationRoutesDeps extends AgentCurationFeatureDeps {
  agentRepository: CuratedAgentRepositoryLike;
  promptRepository: CuratedPromptRepositoryLike;
}

const CURATION_PROFILE_FIELDS: readonly CurationProfileField[] = ['name', 'description', 'avatar', 'characterType', 'systemPrompt'];
const CURATION_MISSING_FIELDS: readonly CurationMissingField[] = ['name', 'description', 'characterType', 'systemPrompt'];
const CURATION_TARGET_AGENT_UPDATED_AT_KEY = 'curationTargetAgentUpdatedAt';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwnField(record: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, field);
}

function invalidDraftPatch(): never {
  throw new CurationInputError('invalid_curation_draft_patch');
}

function parseDraftPatch(value: unknown): CurationDraftPatch | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || Object.keys(value).some((field) => !CURATION_PROFILE_FIELDS.includes(field as CurationProfileField))) {
    return invalidDraftPatch();
  }

  const patch: CurationDraftPatch = {};
  if (hasOwnField(value, 'name')) {
    if (typeof value.name !== 'string') return invalidDraftPatch();
    patch.name = value.name;
  }
  if (hasOwnField(value, 'description')) {
    if (typeof value.description !== 'string') return invalidDraftPatch();
    patch.description = value.description;
  }
  if (hasOwnField(value, 'avatar')) {
    if (value.avatar !== null && typeof value.avatar !== 'string') return invalidDraftPatch();
    patch.avatar = value.avatar;
  }
  if (hasOwnField(value, 'characterType')) {
    if (value.characterType !== null && (!isCharacterType(value.characterType) || typeof value.characterType !== 'string')) {
      return invalidDraftPatch();
    }
    patch.characterType = value.characterType;
  }
  if (hasOwnField(value, 'systemPrompt')) {
    if (typeof value.systemPrompt !== 'string') return invalidDraftPatch();
    patch.systemPrompt = value.systemPrompt;
  }
  return patch;
}

function isCharacterType(value: unknown): value is CharacterType {
  return typeof value === 'string' && CHARACTER_TYPES.includes(value as CharacterType);
}

function parseCurationDraft(value: unknown): CurationDraft {
  if (!isRecord(value)) {
    throw new CurationInputError('invalid_curation_draft_patch');
  }
  const allowedFields = new Set(['name', 'description', 'avatar', 'characterType', 'systemPrompt', 'completeness', 'missingFields', 'metadata']);
  if (Object.keys(value).some((field) => !allowedFields.has(field))) {
    throw new CurationInputError('invalid_curation_draft_patch');
  }

  const profileInput: Record<string, unknown> = {};
  for (const field of CURATION_PROFILE_FIELDS) {
    if (hasOwnField(value, field)) {
      profileInput[field] = value[field];
    }
  }
  const patch = parseDraftPatch(profileInput);
  if (
    !patch ||
    typeof patch.name !== 'string' ||
    typeof patch.description !== 'string' ||
    !hasOwnField(profileInput, 'avatar') ||
    !hasOwnField(profileInput, 'characterType') ||
    typeof patch.systemPrompt !== 'string' ||
    (patch.characterType !== null && patch.characterType === undefined)
  ) {
    throw new CurationInputError('invalid_curation_draft_patch');
  }
  if (value.completeness !== 'collecting' && value.completeness !== 'ready_for_review') {
    throw new CurationInputError('invalid_curation_draft_patch');
  }
  if (
    !Array.isArray(value.missingFields) ||
    !value.missingFields.every((field) => typeof field === 'string' && CURATION_MISSING_FIELDS.includes(field as CurationMissingField))
  ) {
    throw new CurationInputError('invalid_curation_draft_patch');
  }

  let metadata: CurationDraft['metadata'];
  if (value.metadata !== undefined) {
    if (
      !isRecord(value.metadata) ||
      Object.keys(value.metadata).some((field) => field !== 'userLockedFields') ||
      !Array.isArray(value.metadata.userLockedFields) ||
      !value.metadata.userLockedFields.every(
        (field) => typeof field === 'string' && CURATION_PROFILE_FIELDS.includes(field as CurationProfileField)
      )
    ) {
      throw new CurationInputError('invalid_curation_draft_patch');
    }
    metadata = { userLockedFields: [...value.metadata.userLockedFields] as CurationProfileField[] };
  }

  return {
    name: patch.name,
    description: patch.description,
    avatar: patch.avatar ?? null,
    characterType: patch.characterType ?? null,
    systemPrompt: patch.systemPrompt,
    completeness: value.completeness,
    missingFields: [...value.missingFields] as CurationMissingField[],
    ...(metadata ? { metadata } : {})
  };
}

function parseStartInput(value: unknown): {
  mode: 'create' | 'update';
  targetAgentId?: string | null;
  sourceContext?: CurationSourceContext;
  currentAgentProfile?: CurationDraftPatch;
  initialDraft?: CurationDraftPatch;
  language?: string;
} {
  if (!isRecord(value) || (value.mode !== 'create' && value.mode !== 'update')) {
    throw new CurationInputError('invalid_curation_draft_patch');
  }
  if (value.targetAgentId !== undefined && value.targetAgentId !== null && typeof value.targetAgentId !== 'string') {
    throw new CurationInputError('invalid_curation_draft_patch');
  }
  if (value.mode === 'update' && (typeof value.targetAgentId !== 'string' || value.targetAgentId.trim().length === 0)) {
    throw new CurationInputError('invalid_curation_draft_patch');
  }
  if (value.sourceContext !== undefined && !isRecord(value.sourceContext)) {
    throw new CurationInputError('invalid_curation_source_context');
  }

  return {
    mode: value.mode,
    ...(value.targetAgentId === undefined ? {} : { targetAgentId: value.targetAgentId }),
    ...(value.sourceContext === undefined ? {} : { sourceContext: value.sourceContext }),
    ...(value.currentAgentProfile === undefined ? {} : { currentAgentProfile: parseDraftPatch(value.currentAgentProfile) }),
    ...(value.initialDraft === undefined ? {} : { initialDraft: parseDraftPatch(value.initialDraft) }),
    ...(typeof value.language === 'string' ? { language: value.language } : {})
  };
}

function toEditableAgentInput(draft: CurationDraft): CreateAgentInput {
  if (!draft.characterType) {
    throw new CurationIncompleteError(['characterType']);
  }
  return {
    name: draft.name,
    description: draft.description,
    characterType: draft.characterType
  };
}

function toCreateAgentInput(draft: CurationDraft): CreateAgentInput {
  const input = toEditableAgentInput(draft);
  // Curation does not collect investment risk, but finance experts require it under the
  // established agent validation contract. Match the existing agent form's neutral default.
  return input.characterType === 'finance_expert' ? { ...input, promptConfig: { risk_level: 'medium' } } : input;
}

function toUpdateAgentInput(draft: CurationDraft, existingAgent: Agent): CreateAgentInput {
  const input = toEditableAgentInput(draft);
  if (input.characterType === 'finance_expert') {
    return {
      ...input,
      promptConfig: {
        ...existingAgent.promptConfig,
        risk_level: existingAgent.promptConfig.risk_level?.trim() || 'medium'
      }
    };
  }
  if ('risk_level' in existingAgent.promptConfig) {
    const promptConfig = { ...existingAgent.promptConfig };
    delete promptConfig.risk_level;
    return { ...input, promptConfig };
  }
  return input;
}

async function requireAgentEditAccess(
  deps: AgentCurationRoutesDeps,
  request: { userId?: string; userRole?: 'user' | 'admin' },
  agentId: string
) {
  const agent = await deps.agentRepository.getAgent(agentId);
  if (!agent) {
    return { ok: false as const, statusCode: 404, code: 'not_found', message: 'Agent not found' };
  }
  if (!deps.accessResolver) {
    return {
      ok: false as const,
      statusCode: 500,
      code: 'access_resolver_unavailable',
      message: 'Access resolver is not configured'
    };
  }

  const decision = await deps.accessResolver.resolve({
    actorUserId: request.userId!,
    actorRole: request.userRole ?? 'user',
    resourceType: 'agent',
    resourceId: agentId,
    action: 'edit'
  });
  if (!decision.allowed) {
    return { ok: false as const, statusCode: 403, code: 'forbidden', message: 'Agent access denied' };
  }
  return { ok: true as const, agent };
}

function sendInputError(reply: FastifyReply, error: CurationInputError) {
  return reply.status(400).send({ code: error.code, message: 'Invalid curation input' });
}

function sendMessageError(reply: FastifyReply, error: unknown) {
  if (error instanceof CurationInputError) {
    return sendInputError(reply, error);
  }
  if (error instanceof CurationGenerationError) {
    return reply.status(502).send({
      code: error.code,
      message: 'Curation generation failed; retry the request',
      retryable: true
    });
  }
  if (error instanceof ClaudeCurationResponseError) {
    return reply.status(502).send({
      code: 'invalid_curation_model_output',
      message: 'Curation model returned an invalid response'
    });
  }
  if (error instanceof CurationSessionConflictError) {
    return reply.status(409).send({
      code: error.code,
      message: 'Curation session changed; retry the request',
      retryable: true
    });
  }
  if (error instanceof CurationReplyInProgressError) {
    return reply.status(409).send({
      code: error.code,
      message: 'Curation reply is still being generated; retry the request',
      retryable: true
    });
  }
  if (error instanceof Error && error.message === 'not_found') {
    return reply.status(404).send({ code: 'not_found', message: 'Curation session not found' });
  }
  throw error;
}

function isActiveSession(session: CurationSession): boolean {
  return session.status === 'active';
}

function targetAgentVersionMatches(session: CurationSession, updatedAt: Date): boolean {
  return session.sourceContext[CURATION_TARGET_AGENT_UPDATED_AT_KEY] === updatedAt.toISOString();
}

export async function registerAgentCurationRoutes(app: FastifyInstance, deps: AgentCurationRoutesDeps) {
  const service = new AgentCurationService({
    repository: deps.repository,
    claudeClient: deps.claudeClient,
    model: deps.model
  });

  app.post('/api/agent-curations', async (req, reply) => {
    let input: ReturnType<typeof parseStartInput>;
    try {
      input = parseStartInput(req.body);
    } catch (error) {
      if (error instanceof CurationInputError) return sendInputError(reply, error);
      throw error;
    }

    let sourceContext = input.sourceContext;
    if (input.mode === 'update') {
      const access = await requireAgentEditAccess(deps, req, input.targetAgentId!);
      if (!access.ok) {
        return reply.status(access.statusCode).send({ code: access.code, message: access.message });
      }
      sourceContext = {
        ...(input.sourceContext ?? {}),
        [CURATION_TARGET_AGENT_UPDATED_AT_KEY]: access.agent.updatedAt.toISOString()
      };
    }

    try {
      const session = await service.start({ ownerUserId: req.userId!, ...input, sourceContext });
      return reply.status(201).send(session);
    } catch (error) {
      if (error instanceof CurationInputError) return sendInputError(reply, error);
      throw error;
    }
  });

  app.get('/api/agent-curations/:sessionId', async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const session = await deps.repository.getSessionForOwner(sessionId, req.userId!);
    if (!session) {
      return reply.status(404).send({ code: 'not_found', message: 'Curation session not found' });
    }
    return reply.status(200).send(session);
  });

  app.post('/api/agent-curations/:sessionId/messages', async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const session = await deps.repository.getSessionForOwner(sessionId, req.userId!);
    if (!session) {
      return reply.status(404).send({ code: 'not_found', message: 'Curation session not found' });
    }
    if (!isActiveSession(session)) {
      return reply.status(409).send({ code: 'curation_session_completed', message: 'Curation session is already completed' });
    }
    if (
      !isRecord(req.body) ||
      typeof req.body.text !== 'string' ||
      (req.body.clientRequestId !== undefined && typeof req.body.clientRequestId !== 'string')
    ) {
      return sendInputError(reply, new CurationInputError('invalid_curation_user_message'));
    }

    let userDraftPatch: CurationDraftPatch | undefined;
    try {
      userDraftPatch = parseDraftPatch(req.body.userDraftPatch);
    } catch (error) {
      if (error instanceof CurationInputError) return sendInputError(reply, error);
      throw error;
    }

    try {
      const result = await service.reply(session, req.body.text, userDraftPatch, req.body.clientRequestId);
      return reply.status(200).send(result);
    } catch (error) {
      return sendMessageError(reply, error);
    }
  });

  app.post('/api/agent-curations/:sessionId/finalize', async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    let session = await deps.repository.getSessionForOwner(sessionId, req.userId!);
    if (!session) {
      return reply.status(404).send({ code: 'not_found', message: 'Curation session not found' });
    }
    let recoveryDraft: CurationDraft | null = null;
    if ((session.status === 'finalizing' || session.status === 'completed') && session.mode === 'update') {
      if (!session.targetAgentId) {
        return reply.status(409).send({ code: 'invalid_curation_session', message: 'Update curation has no target agent' });
      }
      const access = await requireAgentEditAccess(deps, req, session.targetAgentId);
      if (!access.ok) {
        return reply.status(access.statusCode).send({ code: access.code, message: access.message });
      }
    }
    if ((session.status === 'finalizing' || session.status === 'completed') && session.finalizationAgentId) {
      const agent = await deps.agentRepository.getAgent(session.finalizationAgentId);
      if (!agent) {
        return reply.status(409).send({
          code: 'finalization_agent_not_found',
          message: 'Finalized agent is unavailable; retry the request'
        });
      }
      if (session.mode === 'create' && agent.ownerUserId !== req.userId) {
        return reply.status(409).send({
          code: 'finalization_agent_not_found',
          message: 'Finalized agent is unavailable; retry the request'
        });
      }
      if (session.status === 'finalizing') {
        try {
          await deps.promptRepository.saveCuratedPromptVersion(
            agent.id,
            {
              model: deps.model,
              systemPrompt: session.draft.systemPrompt,
              enabled: true
            },
            session.id
          );
          await deps.repository.markCompleted(session.id, session.revision);
        } catch (error) {
          return sendMessageError(reply, error);
        }
      }
      const completedSession = await deps.repository.getSessionForOwner(session.id, req.userId!);
      if (!completedSession) {
        throw new Error('not_found');
      }
      return reply.status(session.mode === 'update' ? 200 : 201).send({ agent, session: completedSession });
    }
    if (session.status === 'finalizing') {
      recoveryDraft = session.draft;
      try {
        await deps.repository.releaseFinalization(session.id, session.revision);
      } catch (error) {
        return sendMessageError(reply, error);
      }
      const recoveredSession = await deps.repository.getSessionForOwner(session.id, req.userId!);
      if (!recoveredSession) {
        throw new Error('not_found');
      }
      session = recoveredSession;
    }
    if (!isActiveSession(session)) {
      return reply.status(409).send({ code: 'curation_session_completed', message: 'Curation session is already completed' });
    }

    let submittedDraft: CurationDraft;
    if (recoveryDraft) {
      submittedDraft = recoveryDraft;
    } else {
      try {
        submittedDraft = parseCurationDraft(req.body);
        assertCurationProfileWithinLimit(submittedDraft);
      } catch (error) {
        if (error instanceof CurationInputError) return sendInputError(reply, error);
        throw error;
      }
    }

    let finalization;
    try {
      finalization = await service.buildFinalization({ ...session, draft: submittedDraft });
    } catch (error) {
      if (error instanceof CurationIncompleteError) {
        return reply.status(422).send({
          code: error.code,
          message: 'Curation draft is incomplete',
          missingFields: error.missingFields
        });
      }
      throw error;
    }

    if (finalization.draft.avatar !== null) {
      return reply.status(400).send({ code: 'avatar_not_supported', message: 'Agent avatars are not supported' });
    }

    let targetAgentId: string | undefined;
    let updateInput: CreateAgentInput | null = null;
    if (session.mode === 'update') {
      if (!session.targetAgentId) {
        return reply.status(409).send({ code: 'invalid_curation_session', message: 'Update curation has no target agent' });
      }
      const access = await requireAgentEditAccess(deps, req, session.targetAgentId);
      if (!access.ok) {
        return reply.status(access.statusCode).send({ code: access.code, message: access.message });
      }
      if (!targetAgentVersionMatches(session, access.agent.updatedAt)) {
        return reply.status(409).send({
          code: 'curation_target_stale',
          message: 'Agent changed while this curation was in progress; start a new curation to review the latest agent',
          retryable: true
        });
      }
      targetAgentId = session.targetAgentId;
      updateInput = toUpdateAgentInput(finalization.draft, access.agent);
      const validation = validatePatchAgentInput(access.agent, updateInput);
      if (!validation.ok) {
        return reply.status(400).send({
          code: 'validation_error',
          message: 'Invalid agent configuration',
          fieldErrors: validation.errors
        });
      }
    } else {
      const validation = validateCreateAgentInput(toCreateAgentInput(finalization.draft));
      if (!validation.ok) {
        return reply.status(400).send({
          code: 'validation_error',
          message: 'Invalid agent configuration',
          fieldErrors: validation.errors
        });
      }
    }

    let reservedSession: CurationSession;
    try {
      reservedSession = await deps.repository.reserveFinalization(session.id, session.revision, finalization.draft);
    } catch (error) {
      return sendMessageError(reply, error);
    }

    let agent: Agent;
    try {
      if (targetAgentId) {
        if (!updateInput) {
          throw new Error('missing_curation_update_input');
        }
        agent = await deps.agentRepository.updateFinalizedAgent(
          targetAgentId,
          updateInput,
          reservedSession.id,
          reservedSession.revision
        );
      } else {
        agent = await deps.agentRepository.createFinalizedAgent(
          req.userId!,
          toCreateAgentInput(finalization.draft),
          reservedSession.id,
          reservedSession.revision
        );
      }
    } catch (error) {
      await deps.repository.releaseFinalization(reservedSession.id, reservedSession.revision);
      throw error;
    }

    try {
      await deps.promptRepository.saveCuratedPromptVersion(
        agent.id,
        {
          model: deps.model,
          systemPrompt: finalization.draft.systemPrompt,
          enabled: true
        },
        reservedSession.id
      );
    } catch (error) {
      throw error;
    }

    await deps.repository.markCompleted(reservedSession.id, reservedSession.revision);
    const completedSession = await deps.repository.getSessionForOwner(reservedSession.id, req.userId!);
    if (!completedSession) {
      throw new Error('not_found');
    }
    return reply.status(targetAgentId ? 200 : 201).send({ agent, session: completedSession });
  });
}
