import type { FastifyInstance } from 'fastify';
import { promises as fs } from 'fs';
import path from 'path';
import type { DiscussionRepositoryLike } from './repository';
import type { CreateDiscussionInput, UpdateDiscussionInput, DiscussionTrigger } from './types';
import { resolveParticipantReports, type ReportResolutionRepo } from './report-resolution';
import { sanitizeAudioFileName } from './tts-storage';
import {
  renderDiscussionTurnAudio,
  resolveDiscussionTtsClient,
  type DiscussionTtsClients,
  type DiscussionTtsLike,
  type DiscussionTtsStorageLike
} from './audio-renderer';

const discussionFormats = new Set(['free_form', 'structured', 'hosted', 'hybrid']);
const participantRoles = new Set(['speaker', 'host']);
const discussionVoices = new Set(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']);
const editableFormatConfigKeys = new Set(['segments', 'maxTurnsPerSegment', 'totalTurnTarget', 'hostInstructions', 'language', 'turnLength', 'ttsProvider']);

function isValidDiscussionUpdate(input: unknown): input is UpdateDiscussionInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const update = input as Record<string, unknown>;
  const allowedKeys = new Set(['name', 'format', 'formatConfig', 'scheduleJson', 'participants']);
  if (Object.keys(update).length === 0 || Object.keys(update).some((key) => !allowedKeys.has(key))) return false;
  if (update.name !== undefined && (typeof update.name !== 'string' || update.name.trim().length === 0)) return false;
  if (update.format !== undefined && (typeof update.format !== 'string' || !discussionFormats.has(update.format))) return false;
  if (update.scheduleJson !== undefined && update.scheduleJson !== null && typeof update.scheduleJson !== 'string') return false;
  if (update.formatConfig !== undefined) {
    if (!update.formatConfig || typeof update.formatConfig !== 'object' || Array.isArray(update.formatConfig)) return false;
    const formatConfig = update.formatConfig as Record<string, unknown>;
    if (Object.keys(formatConfig).some((key) => !editableFormatConfigKeys.has(key))) return false;
    if (formatConfig.segments !== undefined && (!Array.isArray(formatConfig.segments) || !formatConfig.segments.every((segment) => typeof segment === 'string'))) return false;
    if (formatConfig.maxTurnsPerSegment !== undefined && (!Number.isInteger(formatConfig.maxTurnsPerSegment) || (formatConfig.maxTurnsPerSegment as number) < 1)) return false;
    if (formatConfig.totalTurnTarget !== undefined && (!Number.isInteger(formatConfig.totalTurnTarget) || (formatConfig.totalTurnTarget as number) < 1)) return false;
    if (formatConfig.hostInstructions !== undefined && typeof formatConfig.hostInstructions !== 'string') return false;
    if (formatConfig.language !== undefined && formatConfig.language !== 'en' && formatConfig.language !== 'de') return false;
    if (formatConfig.turnLength !== undefined && !['short', 'medium', 'long'].includes(formatConfig.turnLength as string)) return false;
    if (formatConfig.ttsProvider !== undefined && !['auto', 'google', 'openai'].includes(formatConfig.ttsProvider as string)) return false;
  }
  if (update.participants !== undefined) {
    if (!Array.isArray(update.participants) || update.participants.length < 2) return false;
    const agentIds = new Set<string>();
    return update.participants.every((participant, index) => {
      if (!participant || typeof participant !== 'object' || Array.isArray(participant)) return false;
      const value = participant as Record<string, unknown>;
      if (
        typeof value.agentId !== 'string' ||
        !participantRoles.has(value.role as string) ||
        !discussionVoices.has(value.voiceId as string) ||
        value.speakerOrder !== index ||
        agentIds.has(value.agentId)
      ) {
        return false;
      }
      agentIds.add(value.agentId);
      return true;
    });
  }
  return true;
}

export interface DiscussionRunTriggerLike {
  triggerDiscussionRun(discussionId: string, runId: string): Promise<void>;
  /** Answers questions submitted on an already-completed run (audio playback outlives
   * generation, so late "live" questions are normal). Optional for legacy wiring/tests. */
  answerEncoreQuestions?(discussionId: string, runId: string): Promise<void>;
}

export interface DiscussionRoutesDeps {
  discussionRepository: DiscussionRepositoryLike;
  runTrigger?: DiscussionRunTriggerLike;
  /** Single default TTS backend (legacy wiring/tests). Used when ttsClients is absent. */
  ttsClient?: DiscussionTtsLike;
  /** Per-provider TTS backends; enables the per-discussion provider choice. */
  ttsClients?: DiscussionTtsClients;
  ttsStorage?: DiscussionTtsStorageLike;
  /** Directory rendered mp3 files are read from by GET /api/discussions/audio/:file. */
  audioDir?: string;
  /** When provided, POST /runs validates that every participant resolves at least one report
   * (explicit selection or latest-N fallback) before creating the run, rejecting with 422
   * otherwise. Omitted in older wiring/tests, in which case only the async orchestrator's own
   * validation applies. */
  /** When provided, POST /runs validates that every participant resolves at least one report
   * (explicit selection or latest-N fallback) before creating the run, rejecting with 422
   * otherwise. Omitted in older wiring/tests, in which case only the async orchestrator's own
   * validation applies. Skipped entirely for transcript/free-grounded discussions. */
  reportRepository?: ReportResolutionRepo;
  latestReportLimit?: number;
  /** When provided, GET /api/discussions/transcript-options lists the user's recent raw
   * source-material artifacts as pickable grounding for transcript-based discussions. */
  artifactRepository?: {
    listRecentEvidenceArtifacts(userId: string, limit?: number): Promise<Array<{
      id: string;
      agentId: string;
      sourceRef: string;
      payloadJson: string;
      createdAt: Date;
    }>>;
  };
}

export async function registerDiscussionRoutes(app: FastifyInstance, deps: DiscussionRoutesDeps) {
  const availableTtsProviders = (): Array<'google' | 'openai'> => {
    const providers: Array<'google' | 'openai'> = [];
    if (deps.ttsClients?.openai) providers.push('openai');
    if (deps.ttsClients?.google) providers.push('google');
    return providers;
  };

  const hasAnyTtsClient = (): boolean =>
    availableTtsProviders().length > 0 || Boolean(deps.ttsClient);

  /** Resolves the TTS backend for a discussion's provider choice; null when the requested
   * provider (or any provider, for 'auto') isn't configured on this server. */
  const resolveTtsClient = (provider?: 'auto' | 'google' | 'openai'): DiscussionTtsLike | null => {
    return resolveDiscussionTtsClient(deps.ttsClients, deps.ttsClient, provider);
  };

  // Tracks in-flight/failed audio renders per run so the UI can poll for progress -
  // the actual render runs detached from the triggering request.
  const audioRenderState = new Map<string, 'rendering' | 'error' | 'done'>();
  const hasCompleteTurnAudio = (run: { audioUrl: string | null; turns: Array<{ audioUrl: string | null }> }): boolean =>
    Boolean(run.audioUrl) || (run.turns.length > 0 && run.turns.every((turn) => turn.audioUrl));

  // Serves rendered discussion audio. Registered before /api/discussions/:id so the
  // static "audio" segment wins route matching. File names embed the run ID, which is
  // resolved back to its discussion to enforce ownership.
  app.get('/api/discussions/audio/:file', async (req, reply) => {
    const { file } = req.params as { file: string };
    if (!deps.audioDir) {
      return reply.status(404).send({ code: 'not_found', message: 'Audio not available' });
    }
    const safeName = sanitizeAudioFileName(file.replace(/\.mp3$/i, ''));
    // Keys are `${runId}-turn-N` or `${runId}-full`; run IDs are cuid-style with no dashes.
    const runId = safeName.split('-')[0];
    const run = await deps.discussionRepository.getRunWithTurns(runId);
    const discussion = run ? await deps.discussionRepository.getDiscussion(run.discussionId) : null;
    if (!discussion || discussion.ownerUserId !== req.userId) {
      return reply.status(404).send({ code: 'not_found', message: 'Audio not found' });
    }
    try {
      const buffer = await fs.readFile(path.join(deps.audioDir, `${safeName}.mp3`));
      reply.header('Content-Type', 'audio/mpeg');
      reply.header('Cache-Control', 'private, max-age=86400');
      return reply.send(buffer);
    } catch {
      return reply.status(404).send({ code: 'not_found', message: 'Audio file not found' });
    }
  });

  // Lets the UI know which optional features are wired up so it can hide dead controls
  // (e.g. the "Render audio" button when no TTS backend is configured). Registered before
  // /api/discussions/:id so the static segment wins route matching.
  app.get('/api/discussions/capabilities', async (_req, reply) => {
    return reply.send({
      tts: Boolean(hasAnyTtsClient() && deps.ttsStorage),
      ttsProviders: availableTtsProviders()
    });
  });

  // List the user's recent raw source-material artifacts (episode/page transcripts downloaded
  // during agent runs) as pickable grounding for transcript-based discussions. Registered
  // before /api/discussions/:id so the static segment wins route matching.
  app.get('/api/discussions/transcript-options', async (req, reply) => {
    if (!deps.artifactRepository) {
      return reply.status(200).send([]);
    }
    const artifacts = await deps.artifactRepository.listRecentEvidenceArtifacts(req.userId!, 50);
    const options = artifacts.map((artifact) => {
      let parsed: { content?: unknown; title?: unknown; itemId?: unknown } | null = null;
      try {
        parsed = JSON.parse(artifact.payloadJson);
      } catch {
        parsed = null;
      }
      const content = typeof parsed?.content === 'string' ? parsed.content : '';
      return {
        artifactId: artifact.id,
        agentId: artifact.agentId,
        title: typeof parsed?.title === 'string' && parsed.title.length > 0 ? parsed.title : artifact.sourceRef,
        sourceRef: artifact.sourceRef,
        contentChars: content.length,
        preview: content.slice(0, 160),
        createdAt: artifact.createdAt
      };
    }).filter((option) => option.contentChars > 0);
    return reply.status(200).send(options);
  });

  // List discussions
  app.get('/api/discussions', async (req, reply) => {
    const discussions = await deps.discussionRepository.listDiscussions(req.userId!);
    return reply.status(200).send(discussions);
  });

  // Create discussion
  app.post('/api/discussions', async (req, reply) => {
    const input = req.body as CreateDiscussionInput;
    if (!input.name || !input.format || !Array.isArray(input.participants) || input.participants.length < 2) {
      return reply.status(400).send({ code: 'invalid_input', message: 'name, format, and at least 2 participants required' });
    }
    const grounding = input.formatConfig?.grounding;
    if (grounding?.mode === 'material' && (grounding.reportIds?.length ?? 0) + (grounding.artifactIds?.length ?? 0) === 0) {
      return reply.status(400).send({
        code: 'invalid_input',
        message: 'material-grounded discussions need at least one report or transcript selected'
      });
    }
    const discussion = await deps.discussionRepository.createDiscussion(req.userId!, input);
    return reply.status(201).send(discussion);
  });

  // Get discussion
  app.get('/api/discussions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const discussion = await deps.discussionRepository.getDiscussion(id);
    if (!discussion || discussion.ownerUserId !== req.userId) {
      return reply.status(404).send({ code: 'not_found', message: 'Discussion not found' });
    }
    return reply.status(200).send(discussion);
  });

  // Update discussion
  app.patch('/api/discussions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const discussion = await deps.discussionRepository.getDiscussion(id);
    if (!discussion || discussion.ownerUserId !== req.userId) {
      return reply.status(404).send({ code: 'not_found', message: 'Discussion not found' });
    }
    if (!isValidDiscussionUpdate(req.body)) {
      return reply.status(400).send({ code: 'invalid_input', message: 'Invalid discussion update' });
    }
    const input = req.body as UpdateDiscussionInput;
    const updated = await deps.discussionRepository.updateDiscussion(id, {
      ...input,
      ...(input.name !== undefined ? { name: input.name.trim() } : {})
    });
    return reply.status(200).send(updated);
  });

  // Delete discussion
  app.delete('/api/discussions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const discussion = await deps.discussionRepository.getDiscussion(id);
    if (!discussion || discussion.ownerUserId !== req.userId) {
      return reply.status(404).send({ code: 'not_found', message: 'Discussion not found' });
    }
    await deps.discussionRepository.deleteDiscussion(id);
    return reply.status(204).send();
  });

  // List runs
  app.get('/api/discussions/:id/runs', async (req, reply) => {
    const { id } = req.params as { id: string };
    const discussion = await deps.discussionRepository.getDiscussion(id);
    if (!discussion || discussion.ownerUserId !== req.userId) {
      return reply.status(404).send({ code: 'not_found', message: 'Discussion not found' });
    }
    const runs = await deps.discussionRepository.listRuns(id);
    return reply.status(200).send(runs);
  });

  // Trigger a run
  app.post('/api/discussions/:id/runs', async (req, reply) => {
    const { id } = req.params as { id: string };
    const discussion = await deps.discussionRepository.getDiscussion(id);
    if (!discussion || discussion.ownerUserId !== req.userId) {
      return reply.status(404).send({ code: 'not_found', message: 'Discussion not found' });
    }

    const groundingMode = discussion.formatConfig?.grounding?.mode ?? 'reports';
    if (groundingMode === 'material') {
      const g = discussion.formatConfig?.grounding;
      if ((g?.reportIds?.length ?? 0) + (g?.artifactIds?.length ?? 0) === 0) {
        return reply.status(422).send({
          code: 'no_material_selected',
          message: 'Cannot start discussion - no material selected for this discussion'
        });
      }
    }
    if (deps.reportRepository && groundingMode === 'reports') {
      const resolution = await resolveParticipantReports(
        discussion.participants.filter((p) => p.active).map((p) => ({ id: p.id, agentId: p.agentId, reportIds: p.reportIds })),
        deps.reportRepository,
        deps.latestReportLimit ?? 3
      );
      if (resolution.errors.length > 0) {
        return reply.status(422).send({
          code: 'no_report_resolved',
          message: `Cannot start discussion - no reports resolved for: ${resolution.errors
            .map((e) => `agent ${e.agentId}`)
            .join(', ')}`
        });
      }
    }

    const trigger: DiscussionTrigger = (req.body as any)?.triggeredBy ?? 'manual';
    const run = await deps.discussionRepository.createRun(id, trigger);
    deps.runTrigger?.triggerDiscussionRun(id, run.id).catch(() => {});
    return reply.status(202).send(run);
  });

  // Get run
  app.get('/api/discussions/:id/runs/:runId', async (req, reply) => {
    const { id, runId } = req.params as { id: string; runId: string };
    const discussion = await deps.discussionRepository.getDiscussion(id);
    if (!discussion || discussion.ownerUserId !== req.userId) {
      return reply.status(404).send({ code: 'not_found', message: 'Discussion not found' });
    }
    const run = await deps.discussionRepository.getRunWithTurns(runId);
    if (!run || run.discussionId !== id) {
      return reply.status(404).send({ code: 'not_found', message: 'Run not found' });
    }
    return reply.status(200).send(run);
  });

  app.post('/api/discussions/:id/runs/:runId/questions', async (req, reply) => {
    const { id, runId } = req.params as { id: string; runId: string };
    const body = req.body as { content?: unknown } | null;
    if (!body || typeof body.content !== 'string') {
      return reply.status(400).send({ code: 'invalid_input', message: 'content must be a string' });
    }
    const content = body.content.trim();
    if (content.length === 0) {
      return reply.status(422).send({ code: 'invalid_content', message: 'content must not be empty' });
    }
    if (content.length > 500) {
      return reply.status(422).send({ code: 'invalid_content', message: 'content must not exceed 500 characters' });
    }
    const discussion = await deps.discussionRepository.getDiscussion(id);
    if (!discussion || discussion.ownerUserId !== req.userId) {
      return reply.status(404).send({ code: 'not_found', message: 'Discussion not found' });
    }
    const run = await deps.discussionRepository.getRunWithTurns(runId);
    if (!run || run.discussionId !== id) {
      return reply.status(404).send({ code: 'not_found', message: 'Run not found' });
    }
    const result = await deps.discussionRepository.submitLiveQuestion(runId, content);
    if (!result.ok) {
      if (result.reason === 'run_not_found') {
        return reply.status(404).send({ code: 'not_found', message: 'Run not found' });
      }
      if (result.reason === 'question_limit_reached') {
        return reply.status(409).send({
          code: 'question_limit_reached',
          message: 'A run accepts at most 10 questions'
        });
      }
      return reply.status(409).send({
        code: 'run_not_live',
        message: 'Questions are not accepted on a failed run'
      });
    }
    if (run.status === 'done') {
      void deps.runTrigger?.answerEncoreQuestions?.(id, runId).catch(() => {});
    }
    return reply.status(201).send(result.question);
  });

  // Trigger TTS audio render for a completed run
  app.post('/api/discussions/:id/runs/:runId/audio', async (req, reply) => {
    const { id, runId } = req.params as { id: string; runId: string };
    const discussion = await deps.discussionRepository.getDiscussion(id);
    if (!discussion || discussion.ownerUserId !== req.userId) {
      return reply.status(404).send({ code: 'not_found', message: 'Discussion not found' });
    }
    const run = await deps.discussionRepository.getRunWithTurns(runId);
    if (!run || run.status !== 'done') {
      return reply.status(422).send({ code: 'run_not_done', message: 'Run must be completed before rendering audio' });
    }
    const requestedProvider = discussion.formatConfig.ttsProvider;
    const ttsClient = resolveTtsClient(requestedProvider);
    if (!ttsClient || !deps.ttsStorage) {
      if ((requestedProvider === 'google' || requestedProvider === 'openai') && hasAnyTtsClient() && deps.ttsStorage) {
        return reply.status(422).send({
          code: 'tts_provider_unavailable',
          message: `The ${requestedProvider === 'google' ? 'Google' : 'OpenAI'} voice service is not configured on this server`
        });
      }
      return reply.status(501).send({ code: 'tts_not_configured', message: 'TTS not configured' });
    }

    if (audioRenderState.get(runId) === 'rendering') {
      return reply.status(202).send({ message: 'Audio rendering already started' });
    }
    if (audioRenderState.get(runId) === 'done' || hasCompleteTurnAudio(run)) {
      audioRenderState.set(runId, 'done');
      return reply.status(200).send({ message: 'Audio already available' });
    }

    const ttsStorage = deps.ttsStorage;
    audioRenderState.set(runId, 'rendering');
    const language = discussion.formatConfig.language ?? 'en';
    (async () => {
      for (const turn of run.turns) {
        if (turn.audioUrl) continue;
        const participant = discussion.participants.find((p) => p.id === turn.participantId);
        const voice = participant?.voiceId ?? 'alloy';
        await renderDiscussionTurnAudio({
          runId,
          turn,
          voice,
          language,
          ttsClient,
          ttsStorage,
          repository: deps.discussionRepository
        });
      }
      audioRenderState.set(runId, 'done');
    })().catch((error) => {
      audioRenderState.set(runId, 'error');
      app.log.error({ err: error, runId }, 'discussion audio render failed');
    });

    return reply.status(202).send({ message: 'Audio rendering started' });
  });

  // Lets the UI poll whether a triggered audio render finished, failed, or was never
  // started (state survives only in-process; a restart falls back to audioUrl presence).
  app.get('/api/discussions/:id/runs/:runId/audio-status', async (req, reply) => {
    const { id, runId } = req.params as { id: string; runId: string };
    const discussion = await deps.discussionRepository.getDiscussion(id);
    if (!discussion || discussion.ownerUserId !== req.userId) {
      return reply.status(404).send({ code: 'not_found', message: 'Discussion not found' });
    }
    const run = await deps.discussionRepository.getRunWithTurns(runId);
    if (!run) {
      return reply.status(404).send({ code: 'not_found', message: 'Run not found' });
    }
    const state = audioRenderState.get(runId) ?? (hasCompleteTurnAudio(run) ? 'done' : 'idle');
    return reply.send({ state, audioUrl: run.audioUrl ?? null });
  });
}
