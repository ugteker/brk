import type { FastifyInstance } from 'fastify';
import { promises as fs } from 'fs';
import path from 'path';
import type { DiscussionRepositoryLike } from './repository';
import type { CreateDiscussionInput, UpdateDiscussionInput, DiscussionTrigger } from './types';
import { resolveParticipantReports, type ReportResolutionRepo } from './report-resolution';
import { sanitizeAudioFileName } from './tts-storage';

export interface DiscussionRunTriggerLike {
  triggerDiscussionRun(discussionId: string, runId: string): Promise<void>;
}

export interface DiscussionTtsLike {
  renderTurn(text: string, voice: string): Promise<Buffer>;
}

export interface DiscussionTtsStorageLike {
  save(key: string, buffer: Buffer): Promise<string>;
}

export interface DiscussionRoutesDeps {
  discussionRepository: DiscussionRepositoryLike;
  runTrigger?: DiscussionRunTriggerLike;
  ttsClient?: DiscussionTtsLike;
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
  // Tracks in-flight/failed audio renders per run so the UI can poll for progress -
  // the actual render runs detached from the triggering request.
  const audioRenderState = new Map<string, 'rendering' | 'error' | 'done'>();

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
    const updated = await deps.discussionRepository.updateDiscussion(id, req.body as UpdateDiscussionInput);
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
    if (deps.reportRepository && groundingMode === 'reports') {
      const resolution = await resolveParticipantReports(
        discussion.participants.map((p) => ({ id: p.id, agentId: p.agentId, reportIds: p.reportIds })),
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

  // SSE stream for a live run
  app.get('/api/discussions/:id/runs/:runId/stream', async (req, reply) => {
    const { id, runId } = req.params as { id: string; runId: string };
    const discussion = await deps.discussionRepository.getDiscussion(id);
    if (!discussion || discussion.ownerUserId !== req.userId) {
      return reply.status(404).send({ code: 'not_found', message: 'Discussion not found' });
    }
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders();

    let lastTurnIndex = -1;
    const interval = setInterval(async () => {
      const run = await deps.discussionRepository.getRunWithTurns(runId);
      if (!run) {
        clearInterval(interval);
        reply.raw.end();
        return;
      }
      for (const turn of run.turns) {
        if (turn.turnIndex > lastTurnIndex) {
          reply.raw.write(`event: turn\ndata: ${JSON.stringify(turn)}\n\n`);
          lastTurnIndex = turn.turnIndex;
        }
      }
      if (run.status === 'done' || run.status === 'error') {
        reply.raw.write(`event: ${run.status}\ndata: ${JSON.stringify({ runId })}\n\n`);
        clearInterval(interval);
        reply.raw.end();
      }
    }, 2000);

    req.raw.on('close', () => clearInterval(interval));
    return reply;
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
    if (!deps.ttsClient || !deps.ttsStorage) {
      return reply.status(501).send({ code: 'tts_not_configured', message: 'TTS not configured' });
    }

    const ttsClient = deps.ttsClient;
    const ttsStorage = deps.ttsStorage;
    audioRenderState.set(runId, 'rendering');
    (async () => {
      const allAudio: Buffer[] = [];
      for (const turn of run.turns) {
        const participant = discussion.participants.find((p) => p.id === turn.participantId);
        const voice = participant?.voiceId ?? 'alloy';
        const buffer = await ttsClient.renderTurn(turn.content, voice);
        const turnUrl = await ttsStorage.save(`${runId}-turn-${turn.turnIndex}`, buffer);
        await deps.discussionRepository.updateTurnAudioUrl(turn.id, turnUrl);
        allAudio.push(buffer);
      }
      const stitched = Buffer.concat(allAudio);
      const stitchedUrl = await ttsStorage.save(`${runId}-full`, stitched);
      await deps.discussionRepository.updateRun(runId, { audioUrl: stitchedUrl });
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
    const state = audioRenderState.get(runId) ?? (run.audioUrl ? 'done' : 'idle');
    return reply.send({ state, audioUrl: run.audioUrl ?? null });
  });
}
