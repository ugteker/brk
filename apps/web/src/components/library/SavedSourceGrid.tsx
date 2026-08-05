import { AudioOutlined, CheckCircleOutlined, CloseOutlined, GlobalOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Card, Empty, Popconfirm, Tag, Typography } from 'antd';
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { SourceRecord } from '../../api/sources';
import { getCharacterTypeEmoji, getCharacterTypeIconBg } from '../../data/character-types';
import { extractYoutubeVideoId, getYoutubeCoverImageFallback, getYoutubeThumbnailUrl } from '../../utils/youtube';
import { TouchSafeTooltip } from '../TouchSafeTooltip';
import { DiscussionCover } from '../DiscussionCover';

const { Text } = Typography;

interface SavedSourceGridProps {
  sources: SourceRecord[];
  currentUserId?: string;
  onOpenSource: (source: SourceRecord) => void;
  onAddAgent?: (source: SourceRecord) => void | Promise<void>;
  onRemoveAgent?: (playbookId: string, sourceId: string) => void | Promise<void>;
  hasAnySources?: boolean;
  renderSourceActions?: (source: SourceRecord) => ReactNode;
  linkedAgentsBySourceId?: Record<string, Array<{
    playbookId: string;
    agentId: string;
    label: string;
    characterType?: string | null;
    characterLabel?: string;
    personalityLabel?: string;
  }>>;
  highlightedAgentIdBySourceId?: Record<string, string>;
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
  if (firstPreviewVideoId) return getYoutubeThumbnailUrl(firstPreviewVideoId);
  return getYoutubeCoverImageFallback(source.value);
}

function YouTubeLogo() {
  return (
    <span className="inline-flex items-center gap-1" style={{ verticalAlign: 'middle' }}>
      <svg viewBox="0 0 18 15" width="18" height="15" aria-hidden="true">
        <path d="M17.6 3.2A2.3 2.3 0 0 0 15.9 1.5C14.5 1 9 1 9 1S3.5 1 2.1 1.5A2.3 2.3 0 0 0 .4 3.2C0 4.6 0 7.5 0 7.5s0 2.9.4 4.3c.2.9.9 1.5 1.7 1.7C3.5 14 9 14 9 14s5.5 0 6.9-.5c.9-.2 1.5-.8 1.7-1.7C18 10.4 18 7.5 18 7.5s0-2.9-.4-4.3z" fill="#FF0000" />
        <path d="M7 10.5V4.5l5.5 3-5.5 3z" fill="white" />
      </svg>
      <span style={{ fontWeight: 700, fontSize: '0.8em', letterSpacing: '-0.2px', lineHeight: 1 }}>YouTube</span>
    </span>
  );
}

function SavedSourceTypeTag({ type }: { type: SourceRecord['type'] }) {
  if (type === 'youtube_videos') {
    return <YouTubeLogo />;
  }
  if (type === 'podcast_feeds') {
    return <Tag icon={<AudioOutlined />} color="purple" className="m-0 shadow-sm">Podcast</Tag>;
  }
  if (type === 'synthetic_discussion') {
    return <Tag icon={<AudioOutlined />} color="geekblue" className="m-0 shadow-sm">Discussion</Tag>;
  }
  return <Tag icon={<GlobalOutlined />} className="m-0 shadow-sm">Web</Tag>;
}

export function SavedSourceGrid({
  sources,
  currentUserId,
  onOpenSource,
  onAddAgent,
  onRemoveAgent,
  hasAnySources = sources.length > 0,
  renderSourceActions,
  linkedAgentsBySourceId = {},
  highlightedAgentIdBySourceId = {}
}: SavedSourceGridProps) {
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
        const hasReports = reportCount > 0;
        const linkedAgents = linkedAgentsBySourceId[source.id] ?? [];
        const highlightedAgentId = highlightedAgentIdBySourceId[source.id];

        return (
          <Card
            key={source.id}
            size="small"
            hoverable
            className="flex h-full min-h-[170px] flex-col overflow-hidden border border-[rgba(114,46,209,0.18)] shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-[rgba(114,46,209,0.38)] hover:shadow-md dark:border-[rgba(167,139,250,0.30)] dark:hover:border-[rgba(167,139,250,0.55)]"
            styles={{ body: { display: 'flex', flexDirection: 'column', flex: 1, padding: 0 } }}
            onClick={() => onOpenSource(source)}
          >
            <div className="relative h-44 overflow-hidden bg-slate-900">
              {coverImageUrl ? (
                <>
                  <img
                    aria-hidden
                    src={coverImageUrl}
                    className="absolute -inset-4 h-[calc(100%+2rem)] w-[calc(100%+2rem)] object-cover blur-xl opacity-60"
                  />
                  <img
                    src={coverImageUrl}
                    alt={`${title} cover`}
                    className="relative h-full w-full object-contain"
                  />
                </>
              ) : source.type === 'synthetic_discussion' ? (
                <DiscussionCover
                  id={typeof source.config.discussionId === 'string' ? source.config.discussionId : source.id}
                  format={typeof source.config.format === 'string' ? source.config.format : 'structured'}
                  className="absolute inset-0 h-full w-full"
                />
              ) : (
                source.type === 'youtube_videos' ? (
                  <div className="flex h-full items-center justify-center bg-slate-900/80 text-slate-100">
                    <YouTubeLogo />
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-300">
                    {t('library.coverUnavailable')}
                  </div>
                )
              )}
              <div className="absolute left-3 top-3 rounded-lg bg-black/55 px-2 py-1 shadow-sm backdrop-blur-[1px]">
                <SavedSourceTypeTag type={source.type} />
              </div>
              {renderSourceActions ? (
                <div className="absolute right-2 top-2" onClick={(event) => event.stopPropagation()}>
                  {renderSourceActions(source)}
                </div>
              ) : null}
            </div>
            <div className="flex flex-1 flex-col p-4">
              <div className="min-w-0">
                <div className="text-base font-semibold leading-snug text-foreground">{title}</div>
              </div>
              <div className="mt-3 flex-1 text-xs">
                {previewItems.length > 0 ? (
                    <ul className="space-y-1 text-foreground/80">
                      {previewItems.map((item) => (
                        <li key={`${source.id}:${item.link ?? item.title}`} className="truncate">
                          {item.title}
                        </li>
                      ))}
                    </ul>
                ) : (
                  <Text type="secondary">
                    {source.type === 'synthetic_discussion' ? t('library.noRuns') : t('library.noEpisodes')}
                  </Text>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
                {hasReports ? (
                  <div className="flex items-center gap-1.5">
                    <CheckCircleOutlined className="text-leaf-500 dark:text-leaf-400" />
                    <span className="font-semibold text-foreground">{t('library.reportsAvailable', { count: reportCount })}</span>
                  </div>
                ) : null}
                {onAddAgent ? (
                  linkedAgents.length === 0 ? (
                    <div className="flex min-w-0 items-center gap-2" onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-violet-400/60 bg-transparent px-3 py-1 text-xs text-violet-700 transition-colors hover:border-violet-500 hover:bg-violet-50 dark:text-violet-300 dark:hover:border-violet-300 dark:hover:bg-violet-500/15 dark:hover:text-white"
                        onClick={() => void onAddAgent(source)}
                      >
                        <PlusOutlined /> {t('library.followAgentCta')}
                      </button>
                      {!hasReports ? <span className="min-w-0 truncate">{t('library.reportsWillAppearHere')}</span> : null}
                    </div>
                  ) : (
                  <div className="flex min-w-0 items-center gap-2" onClick={(event) => event.stopPropagation()}>
                    {hasReports ? <span aria-hidden className="text-muted-foreground/60">·</span> : null}
                    <div className="flex items-center">
                      {linkedAgents.map((agent, index) => {
                        const canRemove = source.ownerUserId === currentUserId && Boolean(onRemoveAgent);
                        return (
                          <div
                            key={agent.playbookId}
                            className={`group relative hover:z-10 focus-within:z-10 ${index > 0 ? '-ml-2' : ''}`}
                          >
                            <TouchSafeTooltip
                              title={(
                                <div>
                                  <div className="font-medium">{agent.label}</div>
                                  {agent.characterLabel ? <div>{agent.characterLabel}</div> : null}
                                  {agent.personalityLabel ? <div>{agent.personalityLabel}</div> : null}
                                </div>
                              )}
                            >
                              <button
                                type="button"
                                aria-label={agent.label}
                                className={`flex h-7 w-7 cursor-default items-center justify-center rounded-full border-0 p-0 text-sm ring-2 transition-all ${
                                  getCharacterTypeIconBg(agent.characterType)
                                } ${
                                  highlightedAgentId === agent.agentId
                                    ? 'animate-pulse ring-violet-400'
                                    : 'ring-card'
                                }`}
                              >
                                {getCharacterTypeEmoji(agent.characterType)}
                              </button>
                            </TouchSafeTooltip>
                            {canRemove ? (
                              <TouchSafeTooltip title={t('library.removeAgentFromSource')}>
                                <Popconfirm
                                  title={t('library.removeAgentConfirm', { name: agent.label })}
                                  description={t('library.removeAgentConfirmDescription')}
                                  okText={t('common.remove')}
                                  cancelText={t('common.cancel')}
                                  onConfirm={() => void onRemoveAgent?.(agent.playbookId, source.id)}
                                >
                                  <Button
                                    type="primary"
                                    danger
                                    shape="circle"
                                    size="small"
                                    aria-label={t('library.removeAgentFromSource')}
                                    icon={<CloseOutlined />}
                                    className="absolute -right-1.5 -top-1.5 !h-5 !w-5 !min-w-0 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                                    onClick={(event) => event.stopPropagation()}
                                  />
                                </Popconfirm>
                              </TouchSafeTooltip>
                            ) : null}
                          </div>
                        );
                      })}
                      <TouchSafeTooltip title={t('library.addAgent')}>
                        <button
                          type="button"
                          aria-label={t('library.addAgent')}
                          className="-ml-2 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border border-dashed border-violet-400 bg-violet-50 text-xs text-violet-700 shadow-sm ring-2 ring-card transition-colors hover:border-violet-500 hover:bg-violet-100 hover:text-violet-800 dark:border-violet-400/60 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:border-violet-300 dark:hover:bg-violet-500/25 dark:hover:text-white"
                          onClick={(event) => {
                            event.stopPropagation();
                            void onAddAgent(source);
                          }}
                        >
                          <PlusOutlined />
                        </button>
                      </TouchSafeTooltip>
                    </div>
                    <span className="min-w-0 truncate">
                      {linkedAgents.length === 1
                        ? t('library.agentFollows', { name: linkedAgents[0].label })
                        : t('library.agentsFollowCount', { count: linkedAgents.length })}
                    </span>
                  </div>
                  )
                ) : !hasReports ? (
                  <span>{t('library.noReportsYet')}</span>
                ) : null}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
