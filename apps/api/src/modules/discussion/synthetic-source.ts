import type { PrismaClient } from '@prisma/client';
import type { Discussion } from './types';
import type { OrchestratorSyntheticSource } from './orchestrator';

type SyntheticSourceDb = Pick<PrismaClient, 'source' | 'sourceItem' | 'discussion' | 'discussionRun'>;

export class SyntheticSourceService implements OrchestratorSyntheticSource {
  constructor(private readonly db: SyntheticSourceDb) {}

  async ensureSyntheticSource(
    discussion: Discussion,
    runId: string,
    transcript: string,
    participantNames: string[]
  ): Promise<void> {
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
            configJson: JSON.stringify({
              discussionId: discussion.id,
              name: discussion.name,
              participants: participantNames,
              libraryCard: { title: discussion.name }
            })
          }
        });
        sourceId = source.id;
      }
      await (this.db as any).discussion.update({
        where: { id: discussion.id },
        data: { syntheticSourceId: sourceId }
      });
    } else {
      // Participants and title were stored at creation time; no re-fetch needed on subsequent runs.
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

    // Refresh the library card (recent runs as preview items + run count) so the
    // Library grid can render the discussion like any other source. Card metadata
    // lives in configJson.libraryCard (see source/repository.ts). Failures here
    // must never fail the discussion run itself.
    try {
      await this.refreshLibraryCard(sourceId!, discussion.name);
    } catch {
      // best-effort only
    }
  }

  private async refreshLibraryCard(sourceId: string, title: string): Promise<void> {
    const source = await (this.db as any).source.findUnique({ where: { id: sourceId } });
    if (!source) return;
    let config: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(source.configJson ?? '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) config = parsed;
    } catch {
      // keep empty config
    }
    const [items, itemCount, runs] = await Promise.all([
      (this.db as any).sourceItem.findMany({
        where: { sourceId },
        orderBy: { publishedAt: 'desc' },
        take: 3,
        select: { title: true, link: true, publishedAt: true }
      }),
      (this.db as any).sourceItem.count({ where: { sourceId } }),
      // All materialized runs of this discussion, to flag which episodes have rendered audio.
      (this.db as any).discussionRun.findMany({
        where: { syntheticSourceItemId: { not: null }, discussion: { syntheticSourceId: sourceId } },
        select: { id: true, audioUrl: true }
      }) as Promise<Array<{ id: string; audioUrl: string | null }>>
    ]);
    const runsWithAudio = new Set(runs.filter((run) => run.audioUrl).map((run) => run.id));
    const previousCard = (config.libraryCard && typeof config.libraryCard === 'object' && !Array.isArray(config.libraryCard))
      ? config.libraryCard as Record<string, unknown>
      : {};
    config.libraryCard = {
      ...previousCard,
      title: typeof previousCard.title === 'string' && previousCard.title.trim() ? previousCard.title : title,
      itemCount,
      audioCount: runsWithAudio.size,
      previewItems: items.map((item: { title: string; link: string | null; publishedAt: Date | null }) => {
        const runId = item.link?.startsWith('discussion-run:') ? item.link.slice('discussion-run:'.length) : null;
        return {
          title: item.title,
          link: item.link ?? undefined,
          pubDate: item.publishedAt ? item.publishedAt.toISOString() : null,
          hasAudio: runId ? runsWithAudio.has(runId) : false
        };
      })
    };
    await (this.db as any).source.update({
      where: { id: sourceId },
      data: { configJson: JSON.stringify(config) }
    });
  }
}
