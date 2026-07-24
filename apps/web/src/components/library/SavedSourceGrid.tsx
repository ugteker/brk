import { AudioOutlined, GlobalOutlined, YoutubeOutlined } from '@ant-design/icons';
import { Button, Card, Empty, Tag, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import type { SourceRecord } from '../../api/sources';
import { extractYoutubeVideoId, getYoutubeThumbnailUrl } from '../../utils/youtube';

const { Text } = Typography;

interface SavedSourceGridProps {
  sources: SourceRecord[];
  onOpenSource: (source: SourceRecord) => void;
  onAddAgent?: (source: SourceRecord) => void | Promise<void>;
  hasAnySources?: boolean;
}

function getSourceDisplayTitle(source: SourceRecord): string {
  if (source.metadata.title?.trim()) return source.metadata.title;
  if (source.type === 'synthetic_discussion' && typeof source.config.name === 'string' && source.config.name.trim()) {
    return source.config.name.trim();
  }
  try {
    return new URL(source.value).hostname;
  } catch {
    return source.value;
  }
}

function getSourceCoverImageUrl(source: SourceRecord): string | null {
  if (source.metadata.coverImageUrl) return source.metadata.coverImageUrl;
  if (source.type !== 'youtube_videos') return null;
  const firstPreviewVideoId = extractYoutubeVideoId(source.metadata.previewItems[0]?.link);
  return firstPreviewVideoId ? getYoutubeThumbnailUrl(firstPreviewVideoId) : null;
}

function SavedSourceTypeTag({ type }: { type: SourceRecord['type'] }) {
  if (type === 'youtube_videos') {
    return <Tag icon={<YoutubeOutlined />} color="red" className="m-0">YouTube</Tag>;
  }
  if (type === 'podcast_feeds') {
    return <Tag icon={<AudioOutlined />} color="purple" className="m-0">Podcast</Tag>;
  }
  if (type === 'synthetic_discussion') {
    return <Tag icon={<AudioOutlined />} color="geekblue" className="m-0">Discussion</Tag>;
  }
  return <Tag icon={<GlobalOutlined />} className="m-0">Web</Tag>;
}

export function SavedSourceGrid({ sources, onOpenSource, onAddAgent, hasAnySources = sources.length > 0 }: SavedSourceGridProps) {
  const { t } = useTranslation();

  if (sources.length === 0) {
    return hasAnySources ? (
      <Empty description={t('library.noSources')} />
    ) : (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12 text-center">
        <span className="text-5xl">📚</span>
        <p className="text-base font-semibold text-foreground">{t('library.savedEmptyTitle')}</p>
        <p className="max-w-xs text-sm text-muted-foreground">{t('library.savedEmptyDescription')}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {sources.map((source) => {
        const coverImageUrl = getSourceCoverImageUrl(source);
        const previewItems = source.metadata.previewItems.slice(0, 2);
        const title = getSourceDisplayTitle(source);
        const reportCount = source.reportCount ?? 0;

        return (
          <Card
            key={source.id}
            size="small"
            hoverable
            className="h-full min-h-[170px]"
            onClick={() => onOpenSource(source)}
          >
            <div className="flex h-full flex-col gap-4">
              <div className="flex items-start gap-3">
                {coverImageUrl ? (
                  <img
                    src={coverImageUrl}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded-lg object-cover ring-1 ring-gray-200 dark:ring-gray-700"
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-muted text-2xl">
                    {source.type === 'youtube_videos' ? '📺' : source.type === 'podcast_feeds' ? '🎙' : source.type === 'synthetic_discussion' ? '🗣️' : '🌐'}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <SavedSourceTypeTag type={source.type} />
                    {reportCount > 0 ? <Tag color="success" className="m-0">{t('library.reportsAvailable', { count: reportCount })}</Tag> : null}
                  </div>
                  <div className="mt-2 text-base font-semibold leading-snug text-foreground">{title}</div>
                  {source.type !== 'synthetic_discussion' ? (
                    <Text type="secondary" className="mt-1 block truncate text-xs">
                      {source.value}
                    </Text>
                  ) : null}
                </div>
              </div>
              <div className="mt-auto">
                {previewItems.length > 0 ? (
                  <>
                    <div className="mb-1 text-xs font-medium text-muted-foreground">
                      {source.type === 'synthetic_discussion' ? t('library.recentRuns') : t('library.recentItems')}
                    </div>
                    <ul className="space-y-1 text-xs text-foreground">
                      {previewItems.map((item) => (
                        <li key={`${source.id}:${item.link ?? item.title}`} className="truncate">
                          {item.title}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <Text type="secondary" className="text-xs">
                    {source.type === 'synthetic_discussion' ? t('library.noRuns') : t('library.noEpisodes')}
                  </Text>
                )}
                {onAddAgent ? (
                  <Button
                    size="small"
                    className="mt-3"
                    onClick={(event) => {
                      event.stopPropagation();
                      void onAddAgent(source);
                    }}
                  >
                    {t('library.addAgent')}
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
