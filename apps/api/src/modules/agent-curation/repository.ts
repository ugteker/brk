import type { PrismaClient } from '@prisma/client';
import { CHARACTER_TYPES } from '../agents/types';
import type { CharacterType } from '../agents/types';
import { CurationSessionConflictError } from './types';
import type {
  AppendCurationMessageInput,
  CreateCurationSessionInput,
  CurationDraft,
  CurationMessage,
  CurationMessageRole,
  CurationMode,
  CurationMissingField,
  CurationProfileField,
  CurationReplyClaim,
  CurationSavedReply,
  CurationSession,
  CurationSourceContext
} from './types';

type AgentCurationDb = Pick<PrismaClient, 'agentCurationSession' | 'agentCurationMessage' | '$transaction'>;

const curationMissingFields: readonly CurationMissingField[] = ['name', 'description', 'characterType', 'systemPrompt'];
const curationMessageRoles: readonly CurationMessageRole[] = ['user', 'assistant'];
const curationProfileFields: readonly CurationProfileField[] = ['name', 'description', 'avatar', 'characterType', 'systemPrompt'];
const maxMessagePositionAttempts = 3;
const replyClaimLeaseMilliseconds = 30_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSourceContext(json: string): CurationSourceContext {
  try {
    const value: unknown = JSON.parse(json);
    if (!isRecord(value)) throw new Error();
    return value;
  } catch {
    throw new Error('invalid_curation_source_context');
  }
}

function parseDraft(json: string): CurationDraft {
  try {
    const value: unknown = JSON.parse(json);
    const metadata = isRecord(value) && value.metadata !== undefined ? value.metadata : undefined;
    if (
      !isRecord(value) ||
      typeof value.name !== 'string' ||
      typeof value.description !== 'string' ||
      (value.avatar !== null && typeof value.avatar !== 'string') ||
      (value.characterType !== null &&
        (typeof value.characterType !== 'string' || !CHARACTER_TYPES.includes(value.characterType as CharacterType))) ||
      typeof value.systemPrompt !== 'string' ||
      (value.completeness !== 'collecting' && value.completeness !== 'ready_for_review') ||
      !Array.isArray(value.missingFields) ||
      !value.missingFields.every((field) => typeof field === 'string' && curationMissingFields.includes(field as CurationMissingField)) ||
      (metadata !== undefined &&
        (!isRecord(metadata) ||
          !Array.isArray(metadata.userLockedFields) ||
          !metadata.userLockedFields.every(
            (field) => typeof field === 'string' && curationProfileFields.includes(field as CurationProfileField)
          )))
    ) {
      throw new Error();
    }

    return {
      name: value.name,
      description: value.description,
      avatar: value.avatar as string | null,
      characterType: value.characterType as CurationDraft['characterType'],
      systemPrompt: value.systemPrompt,
      completeness: value.completeness,
      missingFields: value.missingFields as CurationMissingField[],
      ...(metadata === undefined
        ? {}
        : {
            metadata: {
              userLockedFields: [...(metadata.userLockedFields as CurationProfileField[])]
            }
          })
    };
  } catch {
    throw new Error('invalid_curation_draft');
  }
}

function serializeSourceContext(sourceContext: unknown): string {
  try {
    const json = JSON.stringify(sourceContext);
    if (typeof json !== 'string') throw new Error();
    return JSON.stringify(parseSourceContext(json));
  } catch {
    throw new Error('invalid_curation_source_context');
  }
}

function serializeDraft(draft: unknown): string {
  try {
    const json = JSON.stringify(draft);
    if (typeof json !== 'string') throw new Error();
    return JSON.stringify(parseDraft(json));
  } catch {
    throw new Error('invalid_curation_draft');
  }
}

function parseMode(mode: unknown): CurationMode {
  if (mode === 'create' || mode === 'update') {
    return mode;
  }
  throw new Error('invalid_curation_session');
}

function normalizeCreateSessionInput(input: unknown) {
  if (!isRecord(input)) {
    throw new Error('invalid_curation_session');
  }

  if (input.targetAgentId !== undefined && input.targetAgentId !== null && typeof input.targetAgentId !== 'string') {
    throw new Error('invalid_curation_session');
  }
  if (input.baseAgentVersionId !== undefined && input.baseAgentVersionId !== null && typeof input.baseAgentVersionId !== 'string') {
    throw new Error('invalid_curation_session');
  }

  return {
    targetAgentId: input.targetAgentId ?? null,
    baseAgentVersionId: input.baseAgentVersionId ?? null,
    mode: parseMode(input.mode),
    sourceContextJson: serializeSourceContext(input.sourceContext),
    draftJson: serializeDraft(input.draft)
  };
}

function normalizeMessageInput(input: unknown): AppendCurationMessageInput {
  if (
    !isRecord(input) ||
    !curationMessageRoles.includes(input.role as CurationMessageRole) ||
    typeof input.content !== 'string' ||
    (input.clientRequestId !== undefined &&
      (typeof input.clientRequestId !== 'string' || input.clientRequestId.trim().length === 0))
  ) {
    throw new Error('invalid_curation_message');
  }

  return {
    role: input.role as CurationMessageRole,
    content: input.content,
    ...(input.clientRequestId === undefined ? {} : { clientRequestId: input.clientRequestId })
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return isRecord(error) && error.code === 'P2002';
}

function parseRevision(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error('invalid_curation_session');
  }
  return value as number;
}

function parseSavedReply(json: string | null | undefined): CurationSavedReply | null {
  if (json === null || json === undefined) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(json);
    if (
      !isRecord(value) ||
      typeof value.assistantMessage !== 'string' ||
      !Array.isArray(value.suggestedReplies) ||
      !value.suggestedReplies.every((reply) => typeof reply === 'string') ||
      !Number.isInteger(value.sessionRevision) ||
      (value.sessionRevision as number) < 0 ||
      !Number.isInteger(value.assistantMessagePosition) ||
      (value.assistantMessagePosition as number) < 0 ||
      typeof value.sessionUpdatedAt !== 'string' ||
      Number.isNaN(new Date(value.sessionUpdatedAt).getTime())
    ) {
      throw new Error();
    }
    return {
      assistantMessage: value.assistantMessage,
      draft: parseDraft(JSON.stringify(value.draft)),
      suggestedReplies: [...value.suggestedReplies] as string[],
      sessionRevision: value.sessionRevision as number,
      assistantMessagePosition: value.assistantMessagePosition as number,
      sessionUpdatedAt: value.sessionUpdatedAt
    };
  } catch {
    throw new Error('invalid_curation_reply');
  }
}

function serializeSavedReply(reply: CurationSavedReply): string {
  try {
    const json = JSON.stringify({
      assistantMessage: reply.assistantMessage,
      draft: parseDraft(JSON.stringify(reply.draft)),
      suggestedReplies: reply.suggestedReplies,
      sessionRevision: parseRevision(reply.sessionRevision),
      assistantMessagePosition: reply.assistantMessagePosition,
      sessionUpdatedAt: reply.sessionUpdatedAt
    });
    if (typeof json !== 'string') throw new Error();
    return json;
  } catch {
    throw new Error('invalid_curation_reply');
  }
}

function mapMessage(row: any): CurationMessage {
  if (!curationMessageRoles.includes(row.role)) {
    throw new Error('invalid_curation_message');
  }

  return {
    id: row.id,
    sessionId: row.sessionId,
    role: row.role,
    content: row.content,
    ...(row.clientRequestId === null || row.clientRequestId === undefined ? {} : { clientRequestId: row.clientRequestId }),
    position: row.position,
    createdAt: row.createdAt
  };
}

function mapSession(row: any): CurationSession {
  if (row.mode !== 'create' && row.mode !== 'update') {
    throw new Error('invalid_curation_session');
  }
  if (row.status !== 'active' && row.status !== 'finalizing' && row.status !== 'completed') {
    throw new Error('invalid_curation_session');
  }

  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    targetAgentId: row.targetAgentId ?? null,
    baseAgentVersionId: row.baseAgentVersionId ?? null,
    mode: row.mode,
    status: row.status,
    revision: parseRevision(row.revision),
    finalizationAgentId: row.finalizationAgentId ?? null,
    sourceContext: parseSourceContext(row.sourceContextJson),
    draft: parseDraft(row.draftJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    messages: (row.messages ?? []).map(mapMessage)
  };
}

export class AgentCurationRepository {
  constructor(private readonly db: AgentCurationDb) {}

  async createSession(ownerUserId: string, input: CreateCurationSessionInput): Promise<CurationSession> {
    const normalizedInput = normalizeCreateSessionInput(input);
    const row = await this.db.agentCurationSession.create({
      data: {
        ownerUserId,
        targetAgentId: normalizedInput.targetAgentId,
        baseAgentVersionId: normalizedInput.baseAgentVersionId,
        mode: normalizedInput.mode,
        sourceContextJson: normalizedInput.sourceContextJson,
        draftJson: normalizedInput.draftJson
      },
      include: { messages: { orderBy: { position: 'asc' } } }
    });
    return mapSession(row);
  }

  async appendMessage(sessionId: string, input: AppendCurationMessageInput): Promise<CurationMessage> {
    const normalizedInput = normalizeMessageInput(input);

    for (let attempt = 0; attempt < maxMessagePositionAttempts; attempt += 1) {
      try {
        return await this.db.$transaction(async (tx: any) => {
          if (normalizedInput.clientRequestId) {
            const existing = await tx.agentCurationMessage.findUnique({
              where: {
                sessionId_clientRequestId: {
                  sessionId,
                  clientRequestId: normalizedInput.clientRequestId
                }
              }
            });
            if (existing) {
              return mapMessage(existing);
            }
          }

          const claimed = await tx.agentCurationSession.updateMany({
            where: { id: sessionId, status: 'active' },
            data: { revision: { increment: 1 } }
          });
          if (claimed.count !== 1) {
            const session = await tx.agentCurationSession.findUnique({ where: { id: sessionId }, select: { id: true } });
            if (!session) {
              throw new Error('not_found');
            }
            throw new CurationSessionConflictError();
          }

          const session = await tx.agentCurationSession.findUnique({
            where: { id: sessionId },
            select: { messages: { orderBy: { position: 'desc' }, take: 1, select: { position: true } } }
          });
          if (!session) {
            throw new Error('not_found');
          }

          const position = (session.messages[0]?.position ?? -1) + 1;
          const row = await tx.agentCurationMessage.create({
            data: {
              sessionId,
              role: normalizedInput.role,
              content: normalizedInput.content,
              ...(normalizedInput.clientRequestId === undefined ? {} : { clientRequestId: normalizedInput.clientRequestId }),
              position
            }
          });
          return mapMessage(row);
        });
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          throw error;
        }
        if (normalizedInput.clientRequestId) {
          const existing = await this.db.agentCurationMessage.findUnique({
            where: {
              sessionId_clientRequestId: {
                sessionId,
                clientRequestId: normalizedInput.clientRequestId
              }
            }
          });
          if (existing) {
            return mapMessage(existing);
          }
        }
      }
    }

    throw new Error('curation_message_position_conflict');
  }

  async getReplyForRequest(sessionId: string, clientRequestId: string): Promise<CurationSavedReply | null> {
    const message = await this.db.agentCurationMessage.findUnique({
      where: { sessionId_clientRequestId: { sessionId, clientRequestId } },
      select: { replyJson: true }
    });
    return parseSavedReply(message?.replyJson);
  }

  async claimReply(sessionId: string, clientRequestId: string): Promise<CurationReplyClaim> {
    return this.db.$transaction(async (tx: any) => {
      const message = await tx.agentCurationMessage.findUnique({
        where: { sessionId_clientRequestId: { sessionId, clientRequestId } },
        select: { id: true, replyJson: true }
      });
      if (!message) {
        throw new Error('not_found');
      }

      const completedReply = parseSavedReply(message.replyJson);
      if (completedReply) {
        return { status: 'completed' as const, reply: completedReply };
      }

      const now = new Date();
      const claimed = await tx.agentCurationMessage.updateMany({
        where: {
          id: message.id,
          replyJson: null,
          OR: [{ replyClaimedAt: null }, { replyClaimedAt: { lt: new Date(now.getTime() - replyClaimLeaseMilliseconds) } }]
        },
        data: { replyClaimedAt: now }
      });
      if (claimed.count === 1) {
        return { status: 'claimed' as const };
      }
      return { status: 'in_progress' as const };
    });
  }

  async releaseReplyClaim(sessionId: string, clientRequestId: string): Promise<void> {
    await this.db.agentCurationMessage.updateMany({
      where: {
        sessionId,
        clientRequestId,
        replyJson: null
      },
      data: { replyClaimedAt: null }
    });
  }

  async saveDraft(sessionId: string, expectedRevision: number, draft: CurationDraft): Promise<CurationSession> {
    const draftJson = serializeDraft(draft);
    return this.db.$transaction(async (tx: any) => {
      const updated = await tx.agentCurationSession.updateMany({
        where: { id: sessionId, revision: expectedRevision, status: 'active' },
        data: { draftJson, revision: { increment: 1 } }
      });
      if (updated.count !== 1) {
        throw new CurationSessionConflictError();
      }

      const row = await tx.agentCurationSession.findUnique({
        where: { id: sessionId },
        include: { messages: { orderBy: { position: 'asc' } } }
      });
      if (!row) {
        throw new Error('not_found');
      }
      return mapSession(row);
    });
  }

  async saveReply(
    sessionId: string,
    expectedRevision: number,
    assistantMessage: string,
    draft: CurationDraft,
    requestMessageId?: string,
    suggestedReplies: string[] = []
  ): Promise<CurationSession> {
    const draftJson = serializeDraft(draft);
    const normalizedMessage = normalizeMessageInput({ role: 'assistant', content: assistantMessage });

    for (let attempt = 0; attempt < maxMessagePositionAttempts; attempt += 1) {
      try {
        return await this.db.$transaction(async (tx: any) => {
          const updated = await tx.agentCurationSession.updateMany({
            where: { id: sessionId, revision: expectedRevision, status: 'active' },
            data: { draftJson, revision: { increment: 1 } }
          });
          if (updated.count !== 1) {
            throw new CurationSessionConflictError();
          }

          const session = await tx.agentCurationSession.findUnique({
            where: { id: sessionId },
            select: { messages: { orderBy: { position: 'desc' }, take: 1, select: { position: true } } }
          });
          if (!session) {
            throw new Error('not_found');
          }

          const position = (session.messages[0]?.position ?? -1) + 1;
          await tx.agentCurationMessage.create({
            data: { sessionId, role: normalizedMessage.role, content: normalizedMessage.content, position }
          });
          const row = await tx.agentCurationSession.findUnique({
            where: { id: sessionId },
            include: { messages: { orderBy: { position: 'asc' } } }
          });
          if (!row) {
            throw new Error('not_found');
          }
          const savedSession = mapSession(row);
          if (requestMessageId !== undefined) {
            const replyJson = serializeSavedReply({
              assistantMessage,
              draft,
              suggestedReplies: [...suggestedReplies],
              sessionRevision: savedSession.revision,
              assistantMessagePosition: position,
              sessionUpdatedAt: savedSession.updatedAt.toISOString()
            });
            const linked = await tx.agentCurationMessage.updateMany({
              where: { id: requestMessageId, sessionId, role: 'user', replyJson: null },
              data: { replyJson, replyClaimedAt: null }
            });
            if (linked.count !== 1) {
              throw new CurationSessionConflictError();
            }
          }
          return savedSession;
        });
      } catch (error) {
        if (isUniqueConstraintError(error) && attempt < maxMessagePositionAttempts - 1) {
          continue;
        }
        throw error;
      }
    }

    throw new Error('curation_message_position_conflict');
  }

  async getSessionForOwner(sessionId: string, ownerUserId: string): Promise<CurationSession | null> {
    const row = await this.db.agentCurationSession.findFirst({
      where: { id: sessionId, ownerUserId },
      include: { messages: { orderBy: { position: 'asc' } } }
    });
    return row ? mapSession(row) : null;
  }

  async reserveFinalization(sessionId: string, expectedRevision: number, draft: CurationDraft): Promise<CurationSession> {
    const draftJson = serializeDraft(draft);
    const updated = await this.db.agentCurationSession.updateMany({
      where: { id: sessionId, revision: expectedRevision, status: 'active' },
      data: { draftJson, status: 'finalizing', finalizationAgentId: null, revision: { increment: 1 } }
    });
    if (updated.count !== 1) {
      throw new CurationSessionConflictError();
    }

    const row = await this.db.agentCurationSession.findUnique({
      where: { id: sessionId },
      include: { messages: { orderBy: { position: 'asc' } } }
    });
    if (!row) {
      throw new Error('not_found');
    }
    return mapSession(row);
  }

  async releaseFinalization(sessionId: string, expectedRevision: number): Promise<void> {
    const updated = await this.db.agentCurationSession.updateMany({
      where: { id: sessionId, revision: expectedRevision, status: 'finalizing' },
      data: { status: 'active', finalizationAgentId: null }
    });
    if (updated.count !== 1) {
      throw new CurationSessionConflictError();
    }
  }

  async recordFinalizationResult(sessionId: string, expectedRevision: number, agentId: string): Promise<CurationSession> {
    const updated = await this.db.agentCurationSession.updateMany({
      where: { id: sessionId, revision: expectedRevision, status: 'finalizing', finalizationAgentId: null },
      data: { finalizationAgentId: agentId }
    });
    if (updated.count !== 1) {
      throw new CurationSessionConflictError();
    }

    const row = await this.db.agentCurationSession.findUnique({
      where: { id: sessionId },
      include: { messages: { orderBy: { position: 'asc' } } }
    });
    if (!row) {
      throw new Error('not_found');
    }
    return mapSession(row);
  }

  async markCompleted(sessionId: string, expectedRevision: number): Promise<void> {
    const updated = await this.db.agentCurationSession.updateMany({
      where: { id: sessionId, revision: expectedRevision, status: 'finalizing' },
      data: { status: 'completed' }
    });
    if (updated.count === 1) {
      return;
    }

    const session = await this.db.agentCurationSession.findUnique({
      where: { id: sessionId },
      select: { status: true }
    });
    if (session?.status !== 'completed') {
      throw new CurationSessionConflictError();
    }
  }
}
