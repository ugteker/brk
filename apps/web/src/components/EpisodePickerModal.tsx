import { useEffect, useState } from 'react';
import { Button, Empty, List, Modal, Spin, Tag } from 'antd';
import type { EpisodeOptionDto } from '../api/agents';

interface EpisodePickerModalProps {
  open: boolean;
  loading: boolean;
  episodes: EpisodeOptionDto[];
  onRunNormally: () => void;
  onSelectEpisode: (episode: EpisodeOptionDto) => void;
  onCancel: () => void;
}

const SOURCE_TYPE_LABELS: Record<EpisodeOptionDto['sourceType'], string> = {
  podcast_feeds: 'Podcast',
  youtube_videos: 'YouTube'
};

const INITIAL_VISIBLE_COUNT = 5;
const SHOW_MORE_INCREMENT = 5;

/**
 * Sneak preview of the last 10 episodes (combined across an agent's episodic sources), shown
 * when triggering a manual run so the user can pick a specific episode to run against instead
 * of always crawling for "new content since last run". Only shown for agents with at least one
 * podcast/YouTube source - agents with only web_urls sources keep the old immediate-run behavior.
 * Only the first 5 episodes are shown initially, with a "Show more" button revealing the next 5.
 */
export function EpisodePickerModal({ open, loading, episodes, onRunNormally, onSelectEpisode, onCancel }: EpisodePickerModalProps) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);

  // Reset back to the initial page size whenever the modal (re)opens or a new episode list
  // arrives (e.g. picker reopened for a different agent) so it never starts "pre-expanded".
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, [open, episodes]);

  const visibleEpisodes = episodes.slice(0, visibleCount);
  const hasMore = visibleCount < episodes.length;

  return (
    <Modal title="Run against a specific episode" open={open} onCancel={onCancel} footer={null} destroyOnClose>
      <p className="mb-3 text-sm text-gray-500">
        Pick a recent episode to run this agent against, or run normally to crawl for new content since the last run.
      </p>
      <Button type="primary" block onClick={onRunNormally} style={{ marginBottom: 16 }}>
        Run normally (crawl for new content)
      </Button>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
          <Spin />
        </div>
      ) : episodes.length === 0 ? (
        <Empty description="No recent episodes found" />
      ) : (
        <>
          <List
            dataSource={visibleEpisodes}
            renderItem={(episode) => (
              <List.Item
                key={`${episode.sourceValue}:${episode.link}`}
                actions={[
                  <Button key="run" size="small" onClick={() => onSelectEpisode(episode)}>
                    Run this episode
                  </Button>
                ]}
              >
                <List.Item.Meta
                  title={
                    <span>
                      <Tag>{SOURCE_TYPE_LABELS[episode.sourceType]}</Tag> {episode.title}
                    </span>
                  }
                  description={episode.pubDate ? new Date(episode.pubDate).toLocaleString() : undefined}
                />
              </List.Item>
            )}
          />
          {hasMore ? (
            <Button
              block
              style={{ marginTop: 8 }}
              onClick={() => setVisibleCount((prev) => Math.min(prev + SHOW_MORE_INCREMENT, episodes.length))}
            >
              Show more
            </Button>
          ) : null}
        </>
      )}
    </Modal>
  );
}

