import type { FastifyInstance } from 'fastify';
import type { DomainAccessResolver } from '../access/permissions';
import type { CreatePlaybookInput, PublishPlaybookInput, SharePlaybookInput, UpdatePlaybookInput } from './types';
import type { PlaybookRepositoryLike } from './repository';
import type { UserRepositoryLike } from '../auth/repository';

export interface PlaybookForcedEpisode {
  sourceType: string;
  sourceValue: string;
  itemLink: string;
}

export interface PlaybookRunOptions {
  forcedEpisode?: PlaybookForcedEpisode;
}

export interface PlaybookRunTriggerLike {
  triggerRun(playbookId: string, options?: PlaybookRunOptions): Promise<{ status: string; errorCode?: string }>;
}

export interface PlaybookRoutesDeps {
  playbookRepository: PlaybookRepositoryLike;
  accessResolver: DomainAccessResolver;
  userRepository: Pick<UserRepositoryLike, 'findById'>;
  runTrigger?: PlaybookRunTriggerLike;
}

const PLAYBOOK_SHARE_PERMISSIONS = new Set(['read', 'edit', 'delete', 'execute']);
const PLAYBOOK_MODES = new Set(['manual', 'interval', 'daily', 'weekly']);
const EXECUTION_MODES = new Set(['latest_only', 'all_sources']);
const FOLLOW_TARGET_TYPES = new Set(['channel', 'episode']);
const DIGEST_FREQUENCIES = new Set(['immediate', 'daily', 'weekly']);

/** Validates a schedule payload's shape before it ever reaches computeNextRun(), which assumes
 * dailyTime/timezone/daysOfWeek are present for daily/weekly and does not itself guard against
 * missing fields - a malformed schedule used to reach it and crash the request with an unhandled
 * TypeError instead of a clean 400 (e.g. a client sending "daily" without a dailyTime). */
function validateScheduleInput(schedule: unknown): string | null {
  if (schedule === undefined) return null;
  if (typeof schedule !== 'object' || schedule === null || !('mode' in schedule)) {
    return 'schedule must be an object with a mode';
  }
  const s = schedule as { mode: unknown; intervalMinutes?: unknown; dailyTime?: unknown; timezone?: unknown; daysOfWeek?: unknown };
  if (!PLAYBOOK_MODES.has(s.mode as string)) {
    return 'schedule.mode must be manual, interval, daily, or weekly';
  }
  if (s.mode === 'interval' && (typeof s.intervalMinutes !== 'number' || s.intervalMinutes <= 0)) {
    return 'schedule.intervalMinutes must be a positive number for interval schedules';
  }
  if (s.mode === 'daily' || s.mode === 'weekly') {
    if (typeof s.dailyTime !== 'string' || s.dailyTime.trim().length === 0) {
      return 'schedule.dailyTime is required for daily/weekly schedules';
    }
    if (typeof s.timezone !== 'string' || s.timezone.trim().length === 0) {
      return 'schedule.timezone is required for daily/weekly schedules';
    }
  }
  if (s.mode === 'weekly' && (!Array.isArray(s.daysOfWeek) || s.daysOfWeek.length === 0)) {
    return 'schedule.daysOfWeek must be a non-empty array for weekly schedules';
  }
  return null;
}

async function requirePlaybookAccess(
  deps: PlaybookRoutesDeps,
  request: { userId?: string; userRole?: 'user' | 'admin' },
  playbookId: string,
  action: 'read' | 'edit' | 'delete' | 'execute'
) {
  const playbook = await deps.playbookRepository.getPlaybook(playbookId);
  if (!playbook) {
    return { ok: false as const, statusCode: 404, code: 'not_found', message: 'Playbook not found' };
  }

  const decision = await deps.accessResolver.resolve({
    actorUserId: request.userId!,
    actorRole: request.userRole ?? 'user',
    resourceType: 'playbook',
    resourceId: playbookId,
    action
  });
  if (!decision.allowed) {
    return { ok: false as const, statusCode: 403, code: 'forbidden', message: 'Playbook access denied' };
  }

  return { ok: true as const, playbook, reason: decision.reason };
}

async function requireOwnerOrAdminForShareManagement(deps: PlaybookRoutesDeps, request: { userId?: string; userRole?: 'user' | 'admin' }, playbookId: string) {
  const access = await requirePlaybookAccess(deps, request, playbookId, 'edit');
  if (!access.ok) return access;
  if (access.reason === 'grant') {
    return { ok: false as const, statusCode: 403, code: 'forbidden', message: 'Only owner/admin can manage shares' };
  }
  return access;
}

export async function registerPlaybookRoutes(app: FastifyInstance, deps: PlaybookRoutesDeps) {
  app.post('/api/playbooks', async (req, reply) => {
    const input = req.body as Partial<CreatePlaybookInput>;
    if (typeof input.agentId !== 'string' || input.agentId.trim().length === 0 || typeof input.name !== 'string' || input.name.trim().length === 0) {
      return reply.status(400).send({ code: 'validation_error', message: 'agentId and name are required' });
    }
    if (!Array.isArray(input.sourceIds) || input.sourceIds.length === 0 || input.sourceIds.some((sourceId) => typeof sourceId !== 'string' || sourceId.trim().length === 0)) {
      return reply.status(400).send({ code: 'validation_error', message: 'sourceIds must contain at least one source id' });
    }
    const scheduleError = validateScheduleInput(input.schedule);
    if (scheduleError) {
      return reply.status(400).send({ code: 'validation_error', message: scheduleError });
    }
    if (input.executionMode !== undefined && !EXECUTION_MODES.has(input.executionMode)) {
      return reply.status(400).send({ code: 'validation_error', message: 'executionMode must be latest_only or all_sources' });
    }
    if (input.followTargetType !== undefined && !FOLLOW_TARGET_TYPES.has(input.followTargetType)) {
      return reply.status(400).send({ code: 'validation_error', message: 'followTargetType must be channel or episode' });
    }

    const schedule = input.schedule ?? { mode: 'interval' as const, intervalMinutes: 60 };

    const recipients = Array.isArray(input.recipients)
      ? input.recipients.filter((entry) => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean)
      : [];
    // Default a freshly created playbook's notification recipient/language to its creator, so a
    // manual run works out of the box with no separate config step, and reports come back in
    // whatever language the owner is currently using the app in - only kicks in when the caller
    // didn't explicitly set these (an update that clears recipients later is untouched, this
    // only applies at creation time).
    const needsOwnerDefaults = recipients.length === 0 || typeof input.language !== 'string';
    const owner = needsOwnerDefaults ? await deps.userRepository.findById(req.userId!) : null;
    if (recipients.length === 0 && owner?.email) {
      recipients.push(owner.email);
    }

    const created = await deps.playbookRepository.createPlaybook(req.userId!, {
      agentId: input.agentId,
      name: input.name,
      description: input.description,
      enabled: input.enabled,
      sourceIds: input.sourceIds,
      recipients,
      executionMode: input.executionMode,
      maxSourcesPerRun: input.maxSourcesPerRun,
      maxItemsPerSource: input.maxItemsPerSource,
      followTargetType: input.followTargetType,
      followTargetKey: input.followTargetKey,
      followTargetTitle: input.followTargetTitle,
      language: typeof input.language === 'string' ? input.language : (owner?.language ?? 'en'),
      schedule
    });
    return reply.status(201).send(created);
  });

  app.get('/api/playbooks', async (req, reply) => {
    const rows = await deps.playbookRepository.listPlaybooks(req.userRole === 'admin' ? undefined : req.userId!);
    return reply.status(200).send(rows);
  });

  app.get('/api/playbooks/marketplace', async (_req, reply) => {
    const rows = await deps.playbookRepository.listMarketplacePlaybooks();
    return reply.status(200).send(rows);
  });

  app.post('/api/playbooks/marketplace/:publicationId/clone', async (req, reply) => {
    const { publicationId } = req.params as { publicationId: string };
    try {
      const cloned = await deps.playbookRepository.cloneFromMarketplace(publicationId, req.userId!);
      return reply.status(cloned.cloned ? 201 : 200).send(cloned);
    } catch {
      return reply.status(404).send({ code: 'not_found', message: 'Marketplace playbook not found' });
    }
  });

  app.get('/api/playbooks/:playbookId', async (req, reply) => {
    const { playbookId } = req.params as { playbookId: string };
    const access = await requirePlaybookAccess(deps, req, playbookId, 'read');
    if (!access.ok) {
      return reply.status(access.statusCode).send({ code: access.code, message: access.message });
    }
    return reply.status(200).send(access.playbook);
  });

  app.patch('/api/playbooks/:playbookId', async (req, reply) => {
    const { playbookId } = req.params as { playbookId: string };
    const patch = req.body as UpdatePlaybookInput;
    const access = await requirePlaybookAccess(deps, req, playbookId, 'edit');
    if (!access.ok) {
      return reply.status(access.statusCode).send({ code: access.code, message: access.message });
    }
    if (patch.sourceIds) {
      if (!Array.isArray(patch.sourceIds) || patch.sourceIds.some((sourceId) => typeof sourceId !== 'string' || sourceId.trim().length === 0)) {
        return reply.status(400).send({ code: 'validation_error', message: 'sourceIds must be an array of source ids' });
      }
    }
    const scheduleError = validateScheduleInput(patch.schedule);
    if (scheduleError) {
      return reply.status(400).send({ code: 'validation_error', message: scheduleError });
    }
    if (patch.recipients !== undefined) {
      if (
        !Array.isArray(patch.recipients) ||
        patch.recipients.some((recipient) => typeof recipient !== 'string')
      ) {
        return reply.status(400).send({ code: 'validation_error', message: 'recipients must be an array of emails' });
      }
      patch.recipients = patch.recipients.map((recipient) => recipient.trim()).filter(Boolean);
    }
    if (patch.followTargetType !== undefined && patch.followTargetType !== null && !FOLLOW_TARGET_TYPES.has(patch.followTargetType)) {
      return reply.status(400).send({ code: 'validation_error', message: 'followTargetType must be channel or episode' });
    }
    if (patch.digestFrequency !== undefined && !DIGEST_FREQUENCIES.has(patch.digestFrequency)) {
      return reply.status(400).send({ code: 'validation_error', message: 'digestFrequency must be immediate, daily, or weekly' });
    }
    try {
      const updated = await deps.playbookRepository.updatePlaybook(playbookId, patch);
      return reply.status(200).send(updated);
    } catch (error) {
      // Only the repository's own "row vanished between the access check and the update"
      // race maps to 404 here - any other failure (e.g. a bad sourceId FK) must surface as a
      // real error instead of being misreported as "not found".
      if (error instanceof Error && error.message === 'not_found') {
        return reply.status(404).send({ code: 'not_found', message: 'Playbook not found' });
      }
      throw error;
    }
  });

  app.delete('/api/playbooks/:playbookId', async (req, reply) => {
    const { playbookId } = req.params as { playbookId: string };
    const access = await requirePlaybookAccess(deps, req, playbookId, 'delete');
    if (!access.ok) {
      return reply.status(access.statusCode).send({ code: access.code, message: access.message });
    }
    try {
      await deps.playbookRepository.deletePlaybook(playbookId);
      return reply.status(204).send();
    } catch (error) {
      if (error instanceof Error && error.message === 'not_found') {
        return reply.status(404).send({ code: 'not_found', message: 'Playbook not found' });
      }
      throw error;
    }
  });

  app.post('/api/playbooks/:playbookId/run', async (req, reply) => {
    const { playbookId } = req.params as { playbookId: string };
    if (!deps.runTrigger) {
      return reply.status(503).send({ code: 'run_trigger_unavailable', message: 'Manual runs are not available' });
    }
    const access = await requirePlaybookAccess(deps, req, playbookId, 'execute');
    if (!access.ok) {
      return reply.status(access.statusCode).send({ code: access.code, message: access.message });
    }
    const body = (req.body ?? {}) as Partial<{ sourceType: string; sourceValue: string; itemLink: string }>;
    const forcedEpisode =
      body.sourceType && body.sourceValue && body.itemLink
        ? { sourceType: body.sourceType, sourceValue: body.sourceValue, itemLink: body.itemLink }
        : undefined;
    const result = await deps.runTrigger.triggerRun(playbookId, forcedEpisode ? { forcedEpisode } : undefined);
    await deps.playbookRepository.markExecuted(playbookId);
    return reply.status(200).send(result);
  });

  app.post('/api/playbooks/:playbookId/share', async (req, reply) => {
    const { playbookId } = req.params as { playbookId: string };
    const access = await requireOwnerOrAdminForShareManagement(deps, req, playbookId);
    if (!access.ok) {
      return reply.status(access.statusCode).send({ code: access.code, message: access.message });
    }
    const input = req.body as Partial<SharePlaybookInput>;
    if (typeof input.granteeUserId !== 'string' || input.granteeUserId.trim().length === 0 || typeof input.permission !== 'string' || !PLAYBOOK_SHARE_PERMISSIONS.has(input.permission)) {
      return reply.status(400).send({ code: 'validation_error', message: 'granteeUserId and valid permission are required' });
    }
    await deps.playbookRepository.sharePlaybook(playbookId, req.userId!, {
      granteeUserId: input.granteeUserId,
      permission: input.permission as SharePlaybookInput['permission'],
      expiresAt: input.expiresAt
    });
    return reply.status(204).send();
  });

  app.post('/api/playbooks/:playbookId/publish', async (req, reply) => {
    const { playbookId } = req.params as { playbookId: string };
    const access = await requirePlaybookAccess(deps, req, playbookId, 'edit');
    if (!access.ok) {
      return reply.status(access.statusCode).send({ code: access.code, message: access.message });
    }
    if (access.reason === 'grant') {
      return reply.status(403).send({ code: 'forbidden', message: 'Only owner/admin can publish' });
    }
    const input = req.body as Partial<PublishPlaybookInput>;
    if (typeof input.title !== 'string' || input.title.trim().length === 0) {
      return reply.status(400).send({ code: 'validation_error', message: 'title is required' });
    }
    const published = await deps.playbookRepository.publishPlaybook(playbookId, req.userId!, {
      title: input.title,
      summary: input.summary,
      visibility: input.visibility
    });
    return reply.status(201).send(published);
  });

  app.post('/api/playbooks/:playbookId/unpublish', async (req, reply) => {
    const { playbookId } = req.params as { playbookId: string };
    const access = await requirePlaybookAccess(deps, req, playbookId, 'edit');
    if (!access.ok) {
      return reply.status(access.statusCode).send({ code: access.code, message: access.message });
    }
    if (access.reason === 'grant') {
      return reply.status(403).send({ code: 'forbidden', message: 'Only owner/admin can unpublish' });
    }
    try {
      await deps.playbookRepository.unpublishPlaybook(playbookId);
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ code: 'not_found', message: 'Published marketplace playbook not found' });
    }
  });
}
