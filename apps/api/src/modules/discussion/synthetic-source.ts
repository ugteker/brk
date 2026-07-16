import type { PrismaClient } from '@prisma/client';
import type { Discussion } from './types';
import type { OrchestratorSyntheticSource } from './orchestrator';

type SyntheticSourceDb = Pick<PrismaClient, 'source' | 'sourceItem' | 'discussion' | 'discussionRun'>;

export class SyntheticSourceService implements OrchestratorSyntheticSource {
  constructor(private readonly db: SyntheticSourceDb) {}

  async ensureSyntheticSource(discussion: Discussion, runId: string, transcript: string): Promise<void> {
    let sourceId = discussion.syntheticSourceId;

    if (!sourceId) {
      const sourceValue = `synthetic_discussion:${discussion.id}`;
      const existing = await (this.db as any).source.findFirst({
        where: { ownerUserId: discussion.ownerUserId, type: 'synthetic_discussion', value: sourceValue }
      });
      if (existing) {
        sourceId = existing.id;
      } else {
        const source = await (this.db as any).source.create({
          data: {
            ownerUserId: discussion.ownerUserId,
            type: 'synthetic_discussion',
            value: sourceValue,
            configJson: JSON.stringify({ discussionId: discussion.id, name: discussion.name })
          }
        });
        sourceId = source.id;
      }
      await (this.db as any).discussion.update({
        where: { id: discussion.id },
        data: { syntheticSourceId: sourceId }
      });
    }

    const episodeTitle = `${discussion.name} — ${new Date().toISOString().slice(0, 10)}`;
    const item = await (this.db as any).sourceItem.create({
      data: {
        sourceId,
        title: episodeTitle,
        content: transcript,
        link: `discussion-run:${runId}`,
        publishedAt: new Date()
      }
    });

    await (this.db as any).discussionRun.update({
      where: { id: runId },
      data: { syntheticSourceItemId: item.id }
    });
  }
}
