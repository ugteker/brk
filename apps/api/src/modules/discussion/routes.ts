import type { FastifyInstance } from 'fastify';
import type { DiscussionRepositoryLike } from './repository';
import type { CreateDiscussionInput, UpdateDiscussionInput, DiscussionTrigger } from './types';

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
}

export async function registerDiscussionRoutes(app: FastifyInstance, deps: DiscussionRoutesDeps) {
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
    })().catch(() => {});

    return reply.status(202).send({ message: 'Audio rendering started' });
  });
}
