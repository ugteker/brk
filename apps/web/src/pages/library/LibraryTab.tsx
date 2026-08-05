import { Badge, Button, Card, Dropdown, Empty, Input, Modal, Skeleton, Tabs, Tag, Typography } from 'antd';
import { ArrowLeftOutlined, AudioOutlined, CaretRightOutlined, CheckCircleOutlined, CompassOutlined, DatabaseOutlined, DeleteOutlined, EditOutlined, FieldTimeOutlined, LinkOutlined, LoadingOutlined, MailOutlined, MoreOutlined, PauseCircleOutlined, PlayCircleOutlined, PlusOutlined, ReadOutlined, RobotOutlined, SearchOutlined } from '@ant-design/icons';
import { AgentRunsBrowser } from '../../components/AgentRunsBrowser';
import { EntityActions } from '../../components/EntityActions';
import { InlineDeleteButton } from '../../components/InlineDeleteButton';
import { ListenIdleButton } from '../../components/ListenButtons';
import { LibraryOverview } from '../../components/library/LibraryOverview';
import { SourceSearchPicker } from '../../components/SourceSearchPicker';
import { TouchSafeTooltip } from '../../components/TouchSafeTooltip';
import { getCharacterTypeEmoji, getCharacterTypeIconBg } from '../../data/character-types';
import { getAgentDisplayLabel } from '../../utils/agent-label';
import { extractYoutubeVideoId, getYoutubeThumbnailUrl } from '../../utils/youtube';
import { EpisodeArtwork, SourceTypeBadge, formatPlaybookSchedule, getSourceCoverImageUrl, getSourceDisplayTitle, humanizeCharacterType } from '../shared/helpers';
import type { DigestFrequency } from '../../api/playbooks';

const { Title, Text } = Typography;

export function LibraryTab({ ctx }: { ctx: any }) {
  const { activeLibraryTabId, activeSourceTab, agents, autoDetectedSource, catalogLoadState, cloningPublicationId, closeSourceDialog, commitEditingLibraryTab, createLibraryTab, deletePlaybook, detectTimerRef, editingLibraryTabId, editingLibraryTabName, editingSource, filteredMarketplaceSources, filteredSources, getSourceEpisodeCount, getSourceKindLabel, highlightedAgentIdBySourceId, i18n, isPostSourceAgentGuidancePending, isSourceCreateOpen, isSourceDetecting, isSourceSaving, libraryGuidanceSeen, libraryTabs, linkedAgentsBySourceId, marketplaceSourceCount, markLibraryGuidanceSeen, materialAudioByItemKey, materialAudioLoadingItemKey, message, navigate, normaliseUrl, normalizedSourceSearch, onCloneMarketplaceSource, onCreateDetectedSource, onDeleteSource, onDetectSourceFromUrl, onDiscussSource, onEditSource, onFollowSource, onLibraryTabClick, onOpenScheduleEdit, onPickSearchedSource, onPlaySyntheticMaterialAudio, onRemoveAgentFromSource, onResendReportEmail, onRunSourceEpisode, onSaveStarterSource, onSourceUrlChange, onTogglePlaybookEnabled, openMaterialAudioItemKey, openReportDrawer, openSourceInLibrary, parseSyntheticRunId, playbooks, publishSource, recentlyConnectedAgent, refreshCatalog, refreshMarketplaceCounts, refreshPlaybooks, removeCatalogSource, resendingReportId, runningAgentId, selectedSourceId, setActiveLibraryTabId, setActiveSourceTab, setAutoDetectedSource, setEditingLibraryTabName, setEditingSource, setIsSourceCreateOpen, setRecentlyUpdatedSourceId, setSelectedSourceId, setShowSourcesMarketplace, setSourceUrlDraft, setSourcesSearch, shareSource, showSourcesMarketplace, sourceDetailLoading, sourceDetailReports, sourceDetailRuns, sources, sourcesLoadState, sourceUrlDraft, sourcesSearch, starterSources, startEditingLibraryTab, t, togglingPlaybookId, updatePlaybook, user } = ctx;

  return (
                  <Card
                    className="min-w-0"
                    styles={{ header: { overflow: 'visible' }, title: { overflow: 'visible' } }}
                    title={
                      <div className="flex items-center justify-between gap-3">
                        <Title level={4} style={{ margin: 0 }}><DatabaseOutlined /> {t('nav.library')}</Title>
                        {showSourcesMarketplace ? (
                          <Button
                            aria-label={t('library.backToLibrary')}
                            icon={<ArrowLeftOutlined />}
                            size="small"
                            onClick={() => setShowSourcesMarketplace(false)}
                          >
                            <span className="hidden sm:inline">{t('library.backToLibrary')}</span>
                          </Button>
                        ) : (
                          <Badge count={marketplaceSourceCount} size="small" className="mr-2">
                            <Button
                              aria-label={t('library.browseMarketplace')}
                              icon={<CompassOutlined />}
                              size="small"
                              onClick={async () => {
                                await refreshMarketplaceCounts();
                                setShowSourcesMarketplace(true);
                              }}
                            >
                              <span className="hidden sm:inline">{t('library.browseMarketplace')}</span>
                            </Button>
                          </Badge>
                        )}
                      </div>
                    }
                  >
                   {/* Unified inner tab bar: user library tabs + fixed Marketplace tab */}
                   <div
                     onDoubleClick={() => {
                       const tab = libraryTabs.find((candidate: any) => candidate.id === activeLibraryTabId);
                       if (tab) startEditingLibraryTab(tab);
                     }}
                   >
                     <Tabs
                       activeKey={activeLibraryTabId}
                       onChange={(key) => {
                         setActiveLibraryTabId(key);
                         setShowSourcesMarketplace(false);
                       }}
                       onTabClick={onLibraryTabClick}
                       tabBarExtraContent={
                         <TouchSafeTooltip title={t('library.tabTooltip')}>
                           <Button
                             aria-label={t('library.createTab')}
                             size="small"
                             shape="circle"
                             icon={<PlusOutlined />}
                             onClick={createLibraryTab}
                           />
                         </TouchSafeTooltip>
                       }
                       items={libraryTabs.map((tab: any) => ({
                         key: tab.id,
                         label:
                           editingLibraryTabId === tab.id ? (
                             <Input
                               aria-label={t('library.renameTab')}
                               autoFocus
                               size="small"
                               value={editingLibraryTabName}
                               onChange={(event) => setEditingLibraryTabName(event.currentTarget.value)}
                               onPressEnter={() => commitEditingLibraryTab(tab.id)}
                               onBlur={() => commitEditingLibraryTab(tab.id)}
                               onClick={(event) => event.stopPropagation()}
                               style={{ width: 160 }}
                             />
                           ) : (
                             <span className="inline-flex items-center gap-1">
                               {tab.name}
                               {tab.id === activeLibraryTabId ? (
                                 <button
                                   type="button"
                                   aria-label={t('library.renameTab')}
                                   onClick={(event) => {
                                     event.stopPropagation();
                                     startEditingLibraryTab(tab);
                                   }}
                                   className="text-xs text-gray-500 hover:text-gray-700"
                                 >
                                   ✎
                                 </button>
                               ) : null}
                             </span>
                           )
                       }))}
                     />
                   </div>

                   {/* Search row — always visible */}
                   <div className="mb-4 flex items-center justify-between gap-2">
                     <Input
                       aria-label="Search sources"
                       value={sourcesSearch}
                       onChange={(event) => setSourcesSearch(event.currentTarget.value)}
                       placeholder="Search title, URL, or preview episode"
                       prefix={<SearchOutlined />}
                       className="min-w-0 flex-1 sm:w-auto sm:flex-none"
                       style={{ maxWidth: 420 }}
                     />
                     <div className="flex shrink-0 items-center justify-end gap-2">
                       {!showSourcesMarketplace ? (
                         <TouchSafeTooltip title={t('library.addSource')}>
                           <Button
                             type="primary"
                             shape="circle"
                             icon={<PlusOutlined />}
                             aria-label={t('library.addSource')}
                             onClick={() => {
                               setEditingSource(null);
                               setIsSourceCreateOpen(true);
                               setSourceUrlDraft('');
                               setAutoDetectedSource(null);
                             }}
                           />
                         </TouchSafeTooltip>
                       ) : null}
                     </div>
                   </div>

                   {/* Marketplace grid — same rich card layout as library, Clone button only */}
                   {showSourcesMarketplace ? (
                     <div>
                       {/* Marketplace mode indicator banner */}
                       <div className="mb-4 flex items-center gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 dark:border-sky-800 dark:bg-sky-950">
                         <CompassOutlined className="text-sky-500 text-lg shrink-0" />
                         <div className="min-w-0">
                           <p className="text-sm font-semibold text-sky-800 dark:text-sky-200">{t('marketplace.sourcesHeading')}</p>
                           <p className="text-xs text-sky-600 dark:text-sky-400">{t('marketplace.sourcesDesc')}</p>
                         </div>
                       </div>
                       {filteredMarketplaceSources.length === 0 ? (
                         <div className="flex flex-col items-center gap-3 py-12 text-center">
                           <span className="text-5xl">🧭</span>
                           <p className="text-base font-semibold text-gray-700 dark:text-gray-200">{t('marketplace.emptyHeadline')}</p>
                           <p className="text-sm text-gray-400 max-w-xs">{normalizedSourceSearch ? t('marketplace.noItems') : t('marketplace.emptyDesc')}</p>
                         </div>
                       ) : null}
                       <div className="grid gap-3 sm:grid-cols-2">
                         {filteredMarketplaceSources.map((item: any) => {
                           const src = item as unknown as import('../../api/sources').SourceRecord;
                           return (
                             <Card
                               key={item.publicationId}
                               size="small"
                               className="min-h-[170px] transition-shadow"
                               extra={
                                 <Button
                                   type="primary"
                                   size="small"
                                   icon={<CompassOutlined />}
                                   loading={cloningPublicationId === item.publicationId}
                                   onClick={() => onCloneMarketplaceSource(item.publicationId)}
                                   aria-label={`Clone ${item.title}`}
                                 >
                                   Clone
                                 </Button>
                               }
                             >
                               <div className="grid grid-cols-[56px_1fr] gap-3">
                                 {getSourceCoverImageUrl(src) ? (
                                   <img
                                     src={getSourceCoverImageUrl(src)!}
                                     alt={`${getSourceDisplayTitle(src)} cover`}
                                     className="h-14 w-14 rounded-md object-cover"
                                   />
                                 ) : (
                                   <div className="flex h-14 w-14 items-center justify-center rounded-md border border-dashed text-[10px] text-muted-foreground">
                                     {t('library.coverUnavailable')}
                                   </div>
                                 )}
                                 <div className="min-w-0">
                                   <div className="text-sm font-semibold">{getSourceDisplayTitle(src)}</div>
                                   <Text type="secondary" className="text-xs">{item.value}</Text>
                                   <div className="mt-1 flex flex-wrap gap-1 text-xs">
                                     <SourceTypeBadge type={item.type} />
                                     <Tag>{getSourceKindLabel(src)}</Tag>
                                     {(item.type === 'podcast_feeds' || item.type === 'youtube_videos') ? (
                                       <Tag color="purple">{t('library.episodes', { count: getSourceEpisodeCount(src) })}</Tag>
                                     ) : null}
                                   </div>
                                 </div>
                               </div>
                               <div className="mt-3 text-xs text-muted-foreground">
                                 {item.metadata.previewItems.length > 0 ? (
                                   <>
                                     <div className="mb-1 font-medium">{t('library.recentEpisodes')}</div>
                                     <ul className="list-inside list-disc space-y-1">
                                       {item.metadata.previewItems.slice(0, 3).map((pi: any) => (
                                         <li key={`${item.publicationId}:${pi.link ?? pi.title}`}>{pi.title}</li>
                                       ))}
                                     </ul>
                                   </>
                                 ) : (
                                   t('library.noEpisodes')
                                 )}
                               </div>
                             </Card>
                           );
                         })}
                       </div>
                     </div>
                   ) : null}
                   {!showSourcesMarketplace ? (
                   <>
                   {sourcesLoadState === 'error' ? <p className="text-sm text-red-700">{t('library.failedSources')}</p> : null}
                   {sourcesLoadState === 'loading' ? (
                     <div className="grid gap-3 sm:grid-cols-2">
                       {[1, 2, 3, 4].map((i) => (
                         <Card key={i} size="small" className="min-h-[170px]">
                           <div className="flex items-start gap-3">
                             <Skeleton.Avatar active shape="square" size={56} className="shrink-0 rounded-md" />
                             <div className="flex-1 min-w-0 space-y-2 pt-1">
                               <Skeleton.Input active size="small" style={{ width: '65%' }} block />
                               <Skeleton.Input active size="small" style={{ width: '90%' }} block />
                               <Skeleton.Input active size="small" style={{ width: '50%' }} block />
                             </div>
                           </div>
                           <div className="mt-4 space-y-2">
                             <Skeleton.Input active size="small" style={{ width: '80%' }} block />
                             <Skeleton.Input active size="small" style={{ width: '60%' }} block />
                           </div>
                         </Card>
                       ))}
                     </div>
                   ) : null}
                   {sourcesLoadState !== 'loading' && selectedSourceId ? (() => {
                     const selectedSource = sources.find((s: any) => s.id === selectedSourceId);
                     const linkedPlaybooks = playbooks.filter((p: any) => p.sourceId === selectedSourceId);
                     return selectedSource ? (
                       <Card
                         className="min-w-0"
                         title={
                           <span className="flex min-w-0 items-center gap-2">
                             <Button
                               type="text"
                               aria-label={t('library.backToLibrary')}
                               icon={<ArrowLeftOutlined />}
                               className="shrink-0 -ml-2"
                               onClick={() => setSelectedSourceId(null)}
                             />
                             <span className="truncate">{getSourceDisplayTitle(selectedSource)}</span>
                             <SourceTypeBadge type={selectedSource.type} />
                           </span>
                         }
                         extra={
                           <div className="flex items-center gap-2">
                             {linkedPlaybooks.length > 0 && (selectedSource.type !== 'youtube_videos' && selectedSource.type !== 'podcast_feeds') ? (
                               <TouchSafeTooltip title={t('library.analyzeNewContentHelp')}>
                                 <Button
                                   type="primary"
                                   loading={runningAgentId === linkedPlaybooks[0]?.agentId}
                                   icon={<CaretRightOutlined />}
                                   onClick={() => void onRunSourceEpisode(undefined)}
                                 >
                                   <span className="hidden sm:inline">{t('library.analyzeNewContent')}</span>
                                 </Button>
                               </TouchSafeTooltip>
                             ) : null}
                             <TouchSafeTooltip title={t('library.addAgent')}>
                               <Button
                                 type="dashed"
                                 shape="circle"
                                 size="large"
                                 aria-label={t('library.addAgent')}
                                 icon={<PlusOutlined />}
                                 className={isPostSourceAgentGuidancePending(selectedSource.id) ? 'library-next-action' : undefined}
                                 onClick={(event) => onFollowSource(selectedSource, event)}
                               />
                             </TouchSafeTooltip>
                             {sourceDetailReports.length > 0 ? (
                               <TouchSafeTooltip title={t('studio.discussThisSource')}>
                                 <Button
                                   aria-label={t('studio.discussThisSource')}
                                   shape="circle"
                                   icon={<AudioOutlined />}
                                   onClick={() => onDiscussSource(selectedSource)}
                                 />
                               </TouchSafeTooltip>
                             ) : null}
                             <Dropdown
                               trigger={['click']}
                               menu={{
                                 items: [
                                   { key: 'edit', label: t('common.edit'), icon: <EditOutlined /> }
                                 ],
                                 onClick: ({ key }) => {
                                   if (key === 'edit') onEditSource(selectedSource);
                                 }
                               }}
                             >
                               <Button
                                 aria-label={t('library.manageSource')}
                                 shape="circle"
                                 icon={<MoreOutlined />}
                               />
                             </Dropdown>
                           </div>
                         }
                       >
                         {(() => {
                           const coverUrl = getSourceCoverImageUrl(selectedSource);
                           const episodeCount = getSourceEpisodeCount(selectedSource);
                           const latestItem = selectedSource.metadata.previewItems[0] ?? null;
                           let hostname = '';
                           try { hostname = new URL(selectedSource.value).hostname; } catch { hostname = selectedSource.value; }
                           return (
                             <>
                             <div className="flex flex-col sm:flex-row gap-4 mb-4 pb-4 border-b border-border">
                               {coverUrl ? (
                                 <img src={coverUrl} alt="" className="w-full sm:w-24 h-auto sm:h-24 shrink-0 rounded-xl object-cover shadow-sm ring-1 ring-gray-200 dark:ring-gray-700" />
                               ) : (
                                 <div className="flex h-24 w-full sm:w-24 sm:h-24 shrink-0 items-center justify-center rounded-xl bg-muted text-4xl shadow-sm ring-1 ring-gray-200 dark:ring-gray-700">
                                   {selectedSource.type === 'youtube_videos' ? '📺' : selectedSource.type === 'podcast_feeds' ? '🎙' : '🌐'}
                                 </div>
                               )}
                               <div className="min-w-0 flex-1">
                                 {selectedSource.type !== 'synthetic_discussion' ? (
                                   <a
                                     href={selectedSource.value}
                                     target="_blank"
                                     rel="noopener noreferrer"
                                     className="text-sm text-[#9d6fe8] hover:underline flex items-center gap-1"
                                     onClick={(e) => e.stopPropagation()}
                                   >
                                     {hostname} <LinkOutlined className="text-xs" />
                                   </a>
                                 ) : null}
                                 {episodeCount > 0 ? (
                                   <p className="text-xs text-muted-foreground mt-0.5">
                                     {selectedSource.type === 'synthetic_discussion'
                                       ? [
                                           t('library.materialTranscripts', { count: episodeCount }),
                                           (selectedSource.metadata.audioCount ?? 0) > 0
                                             ? t('library.materialAudio', { count: selectedSource.metadata.audioCount })
                                             : null
                                         ].filter(Boolean).join(' · ')
                                       : selectedSource.type === 'youtube_videos'
                                         ? t('library.countVideos', { count: episodeCount })
                                         : selectedSource.type === 'podcast_feeds'
                                           ? t('library.countEpisodes', { count: episodeCount })
                                           : t('library.countPages', { count: episodeCount })}
                                   </p>
                                 ) : null}
                                 {selectedSource.type === 'youtube_videos' ? (
                                   <p className="text-xs text-muted-foreground mt-0.5">{t('library.youtubeTranscriptNote')}</p>
                                 ) : null}
                                 {latestItem?.link ? (
                                   <a
                                     href={latestItem.link}
                                     target="_blank"
                                     rel="noopener noreferrer"
                                     className="mt-1.5 block text-xs text-foreground hover:text-[#9d6fe8] hover:underline truncate"
                                     onClick={(e) => e.stopPropagation()}
                                   >
                                     <span className="text-muted-foreground mr-1">{t('library.latestLabel')}</span>
                                     {latestItem.title}
                                     {latestItem.pubDate ? <span className="ml-1 text-muted-foreground">· {new Date(latestItem.pubDate).toLocaleDateString(i18n.language)}</span> : null}
                                   </a>
                                 ) : null}
                               </div>
                             </div>
                             {linkedPlaybooks.length > 0 ? (
                               <div className="mt-3 pt-3 border-t border-border">
                                 <p className="text-sm font-semibold text-foreground mb-1.5">{t('library.expertsWatching')}</p>
                                 <div className="flex flex-col gap-1.5">
                                   {linkedPlaybooks.map((pb: any) => {
                                     const agent = agents.find((a: any) => a.id === pb.agentId);
                                     const characterLabel = agent?.characterType ? humanizeCharacterType(agent.characterType) : null;
                                     return (
                                       <div
                                         key={pb.id}
                                         className={`flex items-start gap-2.5 rounded-lg text-xs transition-all ${
                                           recentlyConnectedAgent?.sourceId === selectedSource.id &&
                                           recentlyConnectedAgent.agentId === pb.agentId
                                             ? 'animate-pulse bg-violet-500/10 ring-2 ring-violet-400/70'
                                             : ''
                                         } ${pb.enabled ? '' : 'opacity-60'}`}
                                       >
                                         <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base ${getCharacterTypeIconBg(agent?.characterType)}`}>
                                           {getCharacterTypeEmoji(agent?.characterType)}
                                         </div>
                                         <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                                           <div className="flex items-center gap-1.5 min-w-0">
                                             <span
                                               className={`h-1.5 w-1.5 shrink-0 rounded-full ${pb.enabled ? 'bg-emerald-500' : 'bg-gray-400'}`}
                                               title={pb.enabled ? t('playbook.active') : t('playbook.paused')}
                                             />
                                             <span className="font-semibold text-foreground truncate">{pb.name}</span>
                                             {agent && characterLabel ? (
                                               <span className="text-muted-foreground truncate">· {characterLabel}</span>
                                             ) : null}
                                           </div>
                                           <div className="text-muted-foreground">
                                             {formatPlaybookSchedule(pb.schedule)}
                                             {!pb.enabled ? ` · ${t('playbook.paused')}` : ''}
                                           </div>
                                           {pb.recipients.length > 0 && (
                                             <div className="flex flex-wrap gap-1 text-muted-foreground mt-0.5">
                                               <MailOutlined className="opacity-50 mt-0.5" />
                                               {pb.recipients.slice(0, 2).map((r: any) => (
                                                 <span key={r} className="truncate max-w-[120px]">{r}</span>
                                               ))}
                                               {pb.recipients.length > 2 && (
                                                 <span className="text-gray-400">+{pb.recipients.length - 2}</span>
                                               )}
                                             </div>
                                           )}
                                         </div>
                                         <TouchSafeTooltip title={pb.enabled ? t('playbook.pause') : t('playbook.resume')}>
                                           <Button
                                             size="small"
                                             shape="circle"
                                             aria-label={pb.enabled ? `${t('playbook.pause')} playbook` : `${t('playbook.resume')} playbook`}
                                             icon={pb.enabled ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                                             loading={togglingPlaybookId === pb.id}
                                             onClick={(e) => onTogglePlaybookEnabled(pb, e)}
                                           />
                                         </TouchSafeTooltip>
                                         <Dropdown
                                           trigger={['click']}
                                           menu={{
                                             items: [
                                               {
                                                 key: 'notifications',
                                                 icon: <MailOutlined />,
                                                 label: pb.notificationsEnabled !== false ? t('playbook.notificationsOn') : t('playbook.notificationsOff')
                                               },
                                               {
                                                 key: 'digest',
                                                 icon: <FieldTimeOutlined />,
                                                 label: t('playbook.digestFrequency'),
                                                 children: [
                                                   { key: 'digest:immediate', label: t('playbook.digestImmediate') },
                                                   { key: 'digest:daily', label: t('playbook.digestDaily') },
                                                   { key: 'digest:weekly', label: t('playbook.digestWeekly') }
                                                 ]
                                               },
                                               { key: 'edit', icon: <EditOutlined />, label: t('common.edit') },
                                               { type: 'divider' },
                                               { key: 'delete', icon: <DeleteOutlined />, label: t('common.delete'), danger: true }
                                             ],
                                             selectedKeys: [`digest:${pb.digestFrequency ?? 'immediate'}`],
                                             onClick: async ({ key, domEvent }) => {
                                               domEvent.stopPropagation();
                                               if (key === 'notifications') {
                                                 await updatePlaybook(pb.id, { notificationsEnabled: !(pb.notificationsEnabled !== false) });
                                                 await refreshPlaybooks();
                                               } else if (key.startsWith('digest:')) {
                                                 await updatePlaybook(pb.id, { digestFrequency: key.slice('digest:'.length) as DigestFrequency });
                                                 await refreshPlaybooks();
                                               } else if (key === 'edit') {
                                                 onOpenScheduleEdit(pb);
                                               } else if (key === 'delete') {
                                                 Modal.confirm({
                                                   title: t('common.delete'),
                                                   okText: t('common.delete'),
                                                   okButtonProps: { danger: true },
                                                   onOk: async () => {
                                                     await deletePlaybook(pb.id);
                                                     await refreshPlaybooks();
                                                   }
                                                 });
                                               }
                                             }
                                           }}
                                         >
                                           <Button
                                             size="small"
                                             shape="circle"
                                             aria-label={t('library.manageSource')}
                                             icon={<MoreOutlined />}
                                             onClick={(e) => e.stopPropagation()}
                                           />
                                         </Dropdown>
                                       </div>
                                     );
                                   })}
                                 </div>
                               </div>
                             ) : null}
                             </>
                           );
                         })()}
                         <Tabs
                             activeKey={activeSourceTab}
                             onChange={setActiveSourceTab}
                             items={[
                               ...(selectedSource.type === 'youtube_videos' || selectedSource.type === 'podcast_feeds'
                                 ? [{
                                     key: 'episodes',
                                     label: t('library.episodesTab'),
                                     children: (() => {
                                       const episodes = selectedSource.metadata.previewItems.filter((item: any) => Boolean(item.link));
                                       const linkedAgent = agents.find((a: any) => a.id === linkedPlaybooks[0]?.agentId);
                                       // Match an episode to an existing report via the report's cited source references.
                                       const findEpisodeReport = (epLink: string | undefined) => {
                                         if (!epLink) return undefined;
                                         const epVideoId = extractYoutubeVideoId(epLink);
                                         return sourceDetailReports.find((r: any) =>
                                           (r.report?.common?.source_references ?? []).some((ref: any) => {
                                             if (ref.reference === epLink) return true;
                                             if (!epVideoId) return false;
                                             return extractYoutubeVideoId(ref.reference) === epVideoId;
                                           })
                                         );
                                       };
                                       return episodes.length === 0 ? (
                                         <Empty description={<span className="text-sm text-muted-foreground">{t('library.noEpisodes')}</span>} />
                                       ) : (
                                         <ul className="divide-y divide-border">
                                           {episodes.map((ep: any) => {
                                             const videoId = selectedSource.type === 'youtube_videos' ? extractYoutubeVideoId(ep.link) : null;
                                             const episodeImageUrl =
                                               ep.imageUrl ?? (videoId ? getYoutubeThumbnailUrl(videoId, 'mqdefault') : null);
                                             const coverImageUrl = selectedSource.metadata.coverImageUrl;
                                             const episodeReport = findEpisodeReport(ep.link);
                                             return (
                                               <li
                                                 key={ep.link}
                                                 className="grid grid-cols-[72px_minmax(0,1fr)] items-start gap-x-3 py-2.5 sm:grid-cols-[64px_minmax(0,1fr)_auto] sm:items-center"
                                               >
                                                 {episodeImageUrl || coverImageUrl ? (
                                                   <img
                                                     src={episodeImageUrl ?? coverImageUrl ?? ''}
                                                     alt=""
                                                     className="h-12 w-[72px] shrink-0 rounded object-cover bg-muted sm:h-11 sm:w-16"
                                                     onError={(e) => {
                                                       const img = e.currentTarget;
                                                       if (img.src !== coverImageUrl && coverImageUrl) {
                                                         img.src = coverImageUrl;
                                                       } else {
                                                         img.style.display = 'none';
                                                       }
                                                     }}
                                                   />
                                                 ) : (
                                                   <div className="flex h-12 w-[72px] shrink-0 items-center justify-center rounded bg-muted text-sm sm:h-11 sm:w-16">
                                                     {selectedSource.type === 'youtube_videos' ? '📺' : selectedSource.type === 'podcast_feeds' ? '🎙️' : '🌐'}
                                                   </div>
                                                 )}
                                                 <div className="min-w-0">
                                                   <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
                                                     <span className="truncate text-sm font-medium">{ep.title}</span>
                                                     {episodeReport ? (
                                                       <Tag className="m-0 shrink-0 border-0 bg-emerald-100 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-200 w-fit">
                                                         ✓ {t('library.analyzedBadge')}
                                                       </Tag>
                                                     ) : null}
                                                   </div>
                                                   {ep.pubDate ? (
                                                     <div className="mt-0.5 text-xs text-muted-foreground">
                                                       {new Date(ep.pubDate).toLocaleDateString(i18n.language)}
                                                     </div>
                                                   ) : null}
                                                 </div>
                                                 <div className="col-start-2 mt-2 flex gap-1 sm:col-start-3 sm:row-start-1 sm:mt-0 sm:shrink-0">
                                                   {episodeReport ? (
                                                     <TouchSafeTooltip title={t('library.openReport')}>
                                                       <Button
                                                         size="small"
                                                         shape="circle"
                                                         aria-label={t('library.openReport')}
                                                         icon={<ReadOutlined />}
                                                         onClick={() => openReportDrawer(episodeReport)}
                                                       />
                                                     </TouchSafeTooltip>
                                                   ) : null}
                                                   {episodeReport ? (
                                                     <TouchSafeTooltip title={t('library.resendEmail')}>
                                                       <Button
                                                         size="small"
                                                         shape="circle"
                                                         aria-label={t('library.resendEmail')}
                                                         icon={<MailOutlined />}
                                                         loading={resendingReportId === episodeReport.id}
                                                         onClick={() => void onResendReportEmail(episodeReport)}
                                                       />
                                                     </TouchSafeTooltip>
                                                   ) : null}
                                                   {ep.link ? (
                                                     <TouchSafeTooltip title={t('library.openLink')}>
                                                       <Button
                                                         size="small"
                                                         shape="circle"
                                                         aria-label={t('library.openLink')}
                                                         icon={<LinkOutlined />}
                                                         href={ep.link}
                                                         target="_blank"
                                                         rel="noopener noreferrer"
                                                         onClick={(e) => e.stopPropagation()}
                                                       />
                                                     </TouchSafeTooltip>
                                                   ) : null}
                                                   {linkedAgent && !episodeReport ? (
                                                     <TouchSafeTooltip title={t('library.runAnalysisNow')}>
                                                       <Button
                                                         size="small"
                                                         shape="circle"
                                                         aria-label={t('library.runAnalysisNow')}
                                                         icon={<CaretRightOutlined />}
                                                         loading={runningAgentId === linkedAgent.id}
                                                         onClick={() => void onRunSourceEpisode({ title: ep.title, link: ep.link!, pubDate: ep.pubDate })}
                                                       />
                                                     </TouchSafeTooltip>
                                                   ) : null}
                                                 </div>
                                               </li>
                                             );
                                           })}
                                         </ul>
                                       );
                                     })()
                                   }]
                                 : []),
                               ...(selectedSource.type === 'synthetic_discussion'
                                 ? [{
                                     key: 'material',
                                     label: (
                                       <span className="flex items-center gap-1.5">
                                         {t('library.materialTab')}
                                         {selectedSource.metadata.previewItems.length > 0 ? (
                                           <Badge count={selectedSource.metadata.itemCount ?? selectedSource.metadata.previewItems.length} color="purple" size="small" overflowCount={99} />
                                         ) : null}
                                       </span>
                                     ),
                                     children: (() => {
                                       const materialItems = selectedSource.metadata.previewItems;
                                       const discussionId = typeof selectedSource.config.discussionId === 'string' ? selectedSource.config.discussionId : null;
                                       return materialItems.length === 0 ? (
                                         <Empty description={<span className="text-sm text-muted-foreground">{t('library.noRuns')}</span>} />
                                       ) : (
                                         <ul className="divide-y divide-border" data-testid="library-material-list">
                                           {materialItems.map((item: any) => {
                                             const itemKey = item.link ?? item.title;
                                             const runId = parseSyntheticRunId(item.link);
                                             const audioUrl = materialAudioByItemKey[itemKey];
                                             const isAudioOpen = openMaterialAudioItemKey === itemKey && Boolean(audioUrl);
                                             return (
                                               <li key={itemKey} className="py-2.5">
                                                 <div className="flex items-center gap-3">
                                                   <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-base dark:bg-violet-950/40">📄</div>
                                                   <div className="min-w-0 flex-1">
                                                     <div className="flex min-w-0 items-center gap-2">
                                                       <span className="truncate text-sm font-medium">{item.title}</span>
                                                       <Tag className="m-0 shrink-0 border-0 bg-slate-100 text-[10px] font-semibold text-slate-600 dark:bg-slate-800/70 dark:text-slate-300">
                                                         {t('library.materialTranscriptBadge')}
                                                       </Tag>
                                                       {item.hasAudio ? (
                                                         <Tag className="m-0 shrink-0 border-0 bg-violet-100 text-[10px] font-semibold text-violet-700 dark:bg-violet-950/70 dark:text-violet-200">
                                                           🔊 {t('library.materialAudioBadge')}
                                                         </Tag>
                                                       ) : null}
                                                     </div>
                                                     {item.pubDate ? (
                                                       <div className="mt-0.5 text-xs text-muted-foreground">
                                                         {new Date(item.pubDate).toLocaleDateString(i18n.language)}
                                                       </div>
                                                     ) : null}
                                                   </div>
                                                   <div className="flex shrink-0 items-center gap-1">
                                                     {discussionId && item.hasAudio && runId ? (
                                                       <TouchSafeTooltip title={isAudioOpen ? 'Hide audio player' : 'Listen'}>
                                                         <Button
                                                           size="small"
                                                           shape="circle"
                                                           aria-label={isAudioOpen ? 'Hide audio player' : `Listen to ${item.title}`}
                                                           icon={<AudioOutlined />}
                                                           loading={materialAudioLoadingItemKey === itemKey}
                                                           onClick={() => onPlaySyntheticMaterialAudio(itemKey, runId, discussionId)}
                                                         />
                                                       </TouchSafeTooltip>
                                                     ) : null}
                                                     {discussionId ? (
                                                       <TouchSafeTooltip title={t('library.openDiscussion')}>
                                                         <Button
                                                           size="small"
                                                           shape="circle"
                                                           aria-label={t('library.openDiscussion')}
                                                           icon={<CaretRightOutlined />}
                                                           onClick={() => navigate(`/studio/${discussionId}`)}
                                                         />
                                                       </TouchSafeTooltip>
                                                     ) : null}
                                                   </div>
                                                 </div>
                                                 {isAudioOpen && audioUrl ? (
                                                   <div className="pl-11 pt-2">
                                                     <audio data-testid="library-material-inline-audio" src={audioUrl} controls autoPlay style={{ width: '100%' }} />
                                                   </div>
                                                 ) : null}
                                               </li>
                                             );
                                           })}
                                         </ul>
                                       );
                                     })()
                                   }]
                                 : []),
                               {
                                 key: 'reports',
                                 label: (
                                   <span className="flex items-center gap-1.5">
                                     {t('library.reportsTab')}
                                     {!sourceDetailLoading && sourceDetailReports.length > 0 ? (
                                       <Badge count={sourceDetailReports.length} color="blue" size="small" overflowCount={99} />
                                     ) : null}
                                   </span>
                                 ),
                                 children: linkedPlaybooks.length === 0 ? (
                                   <Empty
                                     description={
                                       <span className="text-sm text-gray-600">{t('library.noWorkflowCta')}</span>
                                     }
                                   >
                                     <ListenIdleButton
                                       icon={<RobotOutlined />}
                                       style={{ background: 'rgba(114,46,209,0.12)', borderColor: 'rgba(114,46,209,0.4)', color: '#9d6fe8', fontWeight: 600 }}
                                       onClick={(event) => onFollowSource(selectedSource, event)}
                                     >
                                       {t('listen.listen')}
                                     </ListenIdleButton>
                                   </Empty>
                                 ) : sourceDetailLoading ? (
                                   <Skeleton active avatar={false} paragraph={{ rows: 4 }} />
                                 ) : sourceDetailReports.length === 0 ? (
                                   <Empty description={t('library.noReportsYet')} />
                                 ) : (
                                   <div className="flex flex-col gap-1.5">
                                     {sourceDetailReports.map((report: any) => {
                                       const reportAgent = agents.find((a: any) => a.id === report.agentId);
                                       const headline = report.report?.common?.headline?.trim() || report.summary;
                                       const relevance = report.report?.common?.relevance;
                                       const relPct = relevance && relevance > 0
                                         ? Math.round(relevance <= 1 ? relevance * 100 : Math.min(100, relevance))
                                         : null;
                                       return (
                                         <button
                                           key={report.id}
                                           type="button"
                                           onClick={() => openReportDrawer(report)}
                                           className="flex w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-[#9d6fe8]/50 hover:bg-muted/50"
                                         >
                                           <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base ${getCharacterTypeIconBg(reportAgent?.characterType)}`}>
                                             {getCharacterTypeEmoji(reportAgent?.characterType)}
                                           </div>
                                           <div className="min-w-0 flex-1">
                                             <p className="truncate text-sm font-medium text-foreground">{headline}</p>
                                             <p className="mt-0.5 text-xs text-muted-foreground">
                                               {reportAgent ? `${getAgentDisplayLabel(reportAgent)} · ` : ''}
                                               {new Date(report.createdAt).toLocaleDateString(i18n.language)}
                                               {relPct !== null ? ` · ${t('report.relevanceLabel')} ${relPct} %` : ''}
                                             </p>
                                           </div>
                                           <ReadOutlined className="shrink-0 text-muted-foreground" />
                                         </button>
                                       );
                                     })}
                                   </div>
                                 )
                               },
                               ...(linkedPlaybooks.length > 0 ? [{
                                 key: 'runs',
                                 label: (
                                   <span className="flex items-center gap-1.5">
                                     {t('library.runsTab')}
                                     {!sourceDetailLoading && sourceDetailRuns.length > 0 ? (
                                       <Badge count={sourceDetailRuns.length} color="default" size="small" overflowCount={99} />
                                     ) : null}
                                   </span>
                                 ),
                                 children: sourceDetailLoading ? (
                                   <Skeleton active avatar={false} paragraph={{ rows: 4 }} />
                                 ) : (
                                   <AgentRunsBrowser
                                     agentId={linkedPlaybooks[0].agentId}
                                     runs={sourceDetailRuns}
                                   />
                                 )
                               }] : [])
                             ]}
                           />
                       </Card>
                     ) : null;
                   })() : sourcesLoadState !== 'loading' ? (
                   <div className="space-y-4">
                     {sourcesLoadState === 'error' ? <p className="text-sm text-red-700">{t('library.failedSources')}</p> : null}
                     <LibraryOverview
                       starterSources={starterSources}
                       savedSources={filteredSources}
                       currentUserId={user?.id}
                       isCatalogLoading={catalogLoadState === 'loading'}
                       catalogError={catalogLoadState === 'error'}
                       showAddSourceAttention={sources.length === 0 && !libraryGuidanceSeen}
                       onAddSource={() => {
                         markLibraryGuidanceSeen();
                         setEditingSource(null);
                         setIsSourceCreateOpen(true);
                         setSourceUrlDraft('');
                         setAutoDetectedSource(null);
                       }}
                       onSaveStarter={onSaveStarterSource}
                       onOpenSource={(source) => {
                         setRecentlyUpdatedSourceId(null);
                         openSourceInLibrary(source);
                         setActiveSourceTab(source.type === 'youtube_videos' || source.type === 'podcast_feeds' ? 'episodes' : 'reports');
                       }}
                       onAddAgent={(source) => onFollowSource(source)}
                       onRemoveAgent={(playbookId) => {
                         const playbook = playbooks.find((candidate: any) => candidate.id === playbookId);
                         if (playbook) {
                           return onRemoveAgentFromSource(playbook);
                         }
                       }}
                       linkedAgentsBySourceId={linkedAgentsBySourceId}
                       highlightedAgentIdBySourceId={highlightedAgentIdBySourceId}
                       onRetryCatalog={() => void refreshCatalog(i18n.resolvedLanguage ?? i18n.language)}
                       hasAnySavedSources={sources.length > 0}
                       renderSavedSourceActions={(source) => (
                         source.ownerUserId === user?.id ? (
                           <EntityActions
                             entityLabel="source"
                             isOwner
                             variant="menu"
                             menuAriaLabel={t('library.manageSource')}
                             onEdit={() => onEditSource(source)}
                             onShare={(payload) =>
                               shareSource(source.id, {
                                 granteeUserId: payload.granteeUserId,
                                 permission: payload.permission as 'read' | 'update' | 'delete' | '*'
                               })
                             }
                             sharePermissions={['read', 'update', 'delete', '*']}
                             onPublish={(payload) => publishSource(source.id, payload)}
                             defaultPublishTitle={getSourceDisplayTitle(source)}
                           />
                         ) : (
                           <InlineDeleteButton
                             ariaLabel={t('library.removeFromLibrary')}
                             confirmText={t('common.remove')}
                             onConfirm={() => {
                               void removeCatalogSource(source.id).catch(() => {
                                 message.error(t('library.removeSourceFailed'));
                               });
                             }}
                           />
                         )
                       )}
                     />
                   </div>
                   ) : null}
                   </>
                   ) : null}
                   <Modal
                     title={editingSource ? 'Edit source from URL' : 'Create source from URL'}
                     open={isSourceCreateOpen}
                     onCancel={closeSourceDialog}
                     onOk={onCreateDetectedSource}
                     okText={editingSource ? 'Save source' : 'Add source'}
                     okButtonProps={{ disabled: !autoDetectedSource, loading: isSourceSaving }}
                     footer={(_, { OkBtn }) => (
                       <div className="flex items-center justify-between gap-2">
                         {editingSource && editingSource.ownerUserId === user?.id ? (
                           <Button
                             danger
                             icon={<DeleteOutlined />}
                             onClick={() => {
                               void onDeleteSource(editingSource);
                               closeSourceDialog();
                             }}
                           >
                             Remove source
                           </Button>
                         ) : <span />}
                         <OkBtn />
                       </div>
                     )}
                     destroyOnHidden
                   >
                     <div className="space-y-3">
                       {(() => {
                        const urlField = (
                          <Input
                         aria-label="Source URL"
                         value={sourceUrlDraft}
                         placeholder="https://..."
                         onChange={(e) => onSourceUrlChange(e.currentTarget.value)}
                         onPressEnter={() => {
                           if (detectTimerRef.current) clearTimeout(detectTimerRef.current);
                           const url = normaliseUrl(sourceUrlDraft);
                           if (url) void onDetectSourceFromUrl(url);
                         }}
                         onPaste={(e) => {
                           const pasted = e.clipboardData.getData('text');
                           const url = normaliseUrl(pasted);
                           if (!url) return;
                           if (detectTimerRef.current) clearTimeout(detectTimerRef.current);
                           // Short delay lets React process onChange first
                           detectTimerRef.current = setTimeout(() => { void onDetectSourceFromUrl(url); }, 50);
                         }}
                         suffix={
                           isSourceDetecting
                             ? <LoadingOutlined spin className="text-sky-500" />
                             : autoDetectedSource
                               ? <CheckCircleOutlined className="text-green-500" />
                               : null
                         }
                          />
                        );
                        // Editing keeps the plain URL field; creating starts with name search
                        // and offers the URL field as a collapsible fallback.
                        return editingSource ? urlField : (
                          <SourceSearchPicker
                            selectedValue={autoDetectedSource?.url ?? null}
                            onSelect={(selection) => void onPickSearchedSource(selection)}
                            urlFallback={urlField}
                          />
                        );
                       })()}
                       {isSourceDetecting ? (
                         <Card size="small">
                           <div className="flex items-start gap-3">
                             <Skeleton.Avatar active shape="square" size={64} className="shrink-0 rounded-md" />
                             <div className="flex-1 min-w-0 space-y-2 pt-1">
                               <Skeleton.Input active size="small" style={{ width: '60%' }} block />
                               <Skeleton.Input active size="small" style={{ width: '85%' }} block />
                               <Skeleton.Input active size="small" style={{ width: '45%' }} block />
                             </div>
                           </div>
                         </Card>
                       ) : autoDetectedSource ? (
                         <Card size="small">
                           <div className="flex gap-3">
                             {autoDetectedSource.coverImageUrl ? (
                               <img
                                 src={autoDetectedSource.coverImageUrl}
                                 alt="Source cover"
                                 className="h-16 w-16 shrink-0 rounded-md object-cover shadow-sm"
                               />
                             ) : (
                               <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-dashed text-xl text-gray-400">
                                 🎙
                               </div>
                             )}
                             <div className="min-w-0 flex-1">
                               <div className="mb-1 truncate text-sm font-semibold">
                                 {autoDetectedSource.title ?? autoDetectedSource.url}
                               </div>
                               <div className="mb-2 flex flex-wrap gap-1">
                                 <Tag>
                                   {autoDetectedSource.type === 'podcast_feeds'
                                     ? 'Podcast'
                                     : autoDetectedSource.type === 'youtube_videos'
                                       ? 'YouTube'
                                       : 'Web'}
                                 </Tag>
                                 <Tag>{autoDetectedSource.kind}</Tag>
                               </div>
                               <div className="space-y-0.5 text-xs text-gray-500">
                                 {autoDetectedSource.previewItems.length > 0
                                   ? autoDetectedSource.previewItems.map((item: any) => (
                                       <div key={item.link ?? item.title} className="truncate">{item.title}</div>
                                     ))
                                   : <span>No episode preview available</span>}
                               </div>
                             </div>
                           </div>
                         </Card>
                       ) : null}
                     </div>
                   </Modal>
                  </Card>
  );
}


