import { AudioOutlined, CheckCircleOutlined, CloseOutlined, GlobalOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Card, Empty, Popconfirm, Tag, Typography } from 'antd';
import { Fragment, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { SourceRecord } from '../../api/sources';
import { getCharacterTypeEmoji, getCharacterTypeIconBg } from '../../data/character-types';
import { extractYoutubeVideoId, getYoutubeCoverImageFallback, getYoutubeThumbnailUrl } from '../../utils/youtube';
import { TouchSafeTooltip } from '../TouchSafeTooltip';

const { Text } = Typography;

interface SavedSourceGridProps {
  sources: SourceRecord[];
  currentUserId?: string;
  onOpenSource: (source: SourceRecord) => void;
  onAddAgent?: (source: SourceRecord) => void | Promise<void>;
  onRemoveAgent?: (playbookId: string, sourceId: string) => void | Promise<void>;
  hasAnySources?: boolean;
  leadingCard?: ReactNode;
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
  leadingCard,
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
      {leadingCard ? <Fragment key="library-leading-card">{leadingCard}</Fragment> : null}
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
                {source.type !== 'synthetic_discussion' ? (
                  <Text type="secondary" className="mt-1 block truncate text-xs">
                    {source.value}
                  </Text>
                ) : null}
              </div>
              <div className="mt-4 text-xs">
                {previewItems.length > 0 ? (
                  <>
                    <div className="mb-1 font-medium text-muted-foreground">
                      {source.type === 'synthetic_discussion' ? t('library.recentRuns') : t('library.recentItems')}
                    </div>
                    <ul className="space-y-1 text-foreground">
                      {previewItems.map((item) => (
                        <li key={`${source.id}:${item.link ?? item.title}`} className="truncate">
                          ▶ {item.title}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <Text type="secondary">
                    {source.type === 'synthetic_discussion' ? t('library.noRuns') : t('library.noEpisodes')}
                  </Text>
                )}
              </div>
              <div className="mt-4" onClick={(event) => event.stopPropagation()}>
                <Button
                  type="text"
                  block
                  className={`h-auto rounded-lg border px-3 py-2 text-left ${
                    hasReports
                      ? 'border-violet-200 bg-violet-50/70 hover:!border-violet-300 hover:!bg-violet-100/70 dark:border-violet-500/30 dark:bg-violet-950/30 dark:hover:!border-violet-400/50 dark:hover:!bg-violet-950/50'
                      : 'border-dashed border-border bg-muted/30 hover:!border-violet-300 hover:!bg-violet-50/50 dark:hover:!border-violet-400/50 dark:hover:!bg-violet-950/30'
                  }`}
                  aria-label={hasReports ? t('library.openReports', { count: reportCount }) : t('library.noReportsYet')}
                  onClick={() => onOpenSource(source)}
                >
                  <span className="flex items-center gap-2">
                    <CheckCircleOutlined className={hasReports ? 'text-emerald-500 dark:text-emerald-400' : 'text-muted-foreground'} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-foreground">
                        {hasReports ? t('library.reportsAvailable', { count: reportCount }) : t('library.noReportsYet')}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {hasReports ? t('library.sourceReportsAvailableHint') : t('library.reportsWillAppearHere')}
                      </span>
                    </span>
                    {hasReports ? <span className="text-base text-violet-500 dark:text-violet-300">›</span> : null}
                  </span>
                </Button>
              </div>
              {onAddAgent ? (
                <div className="mt-4 border-t border-border pt-4" onClick={(event) => event.stopPropagation()}>
                  <div className="mb-2 text-xs font-medium text-muted-foreground">{t('library.agentFollowLabel')}</div>
                  <div className="rounded-lg border border-slate-200/80 bg-slate-50/60 p-3 dark:border-slate-700/80 dark:bg-slate-800/40">
                    <div className="flex flex-wrap items-start gap-3">
                      {linkedAgents.map((agent) => {
                        const canRemove = source.ownerUserId === currentUserId && Boolean(onRemoveAgent);
                        return (
                          <div key={agent.playbookId} className="group relative w-[72px]">
                            <TouchSafeTooltip
                              title={(
                                <div>
                                  <div className="font-medium">{agent.label}</div>
                                  {agent.characterLabel ? <div>{agent.characterLabel}</div> : null}
                                  {agent.personalityLabel ? <div>{agent.personalityLabel}</div> : null}
                                </div>
                              )}
                            >
                              <Button
                                type="text"
                                aria-label={agent.label}
                                className="h-auto w-[72px] p-0"
                              >
                                <span className="flex flex-col items-center gap-1 text-center">
                                  <span
                                    className={`flex h-10 w-10 items-center justify-center rounded-full text-lg transition-all ${
                                      getCharacterTypeIconBg(agent.characterType)
                                    } ${
                                      highlightedAgentId === agent.agentId
                                        ? 'animate-pulse ring-2 ring-violet-400 ring-offset-2 ring-offset-slate-50 dark:ring-offset-slate-800'
                                        : ''
                                    }`}
                                  >
                                    {getCharacterTypeEmoji(agent.characterType)}
                                  </span>
                                  <span className="line-clamp-2 min-h-[2.5em] w-full break-words text-[10px] leading-tight [overflow-wrap:anywhere]">
                                    {agent.label}
                                  </span>
                                </span>
                              </Button>
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
                                    className="absolute -right-1 -top-1 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                                    onClick={(event) => event.stopPropagation()}
                                  />
                                </Popconfirm>
                              </TouchSafeTooltip>
                            ) : null}
                          </div>
                        );
                      })}
                      <TouchSafeTooltip title={t('library.addAgent')}>
                        <Button
                          type="dashed"
                          shape="circle"
                          size="large"
                          aria-label={t('library.addAgent')}
                          icon={<PlusOutlined />}
                          className="border-2 border-dashed border-sky-400 bg-sky-50 text-sky-700 shadow-sm transition-colors hover:border-sky-500 hover:bg-sky-100 hover:text-sky-800 dark:border-sky-500 dark:bg-sky-950/50 dark:text-sky-300"
                          onClick={(event) => {
                            event.stopPropagation();
                            void onAddAgent(source);
                          }}
                        />
                      </TouchSafeTooltip>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
