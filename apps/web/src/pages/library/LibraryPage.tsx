import { useEffect, useRef, useState } from 'react';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import { useSafeNavigate } from '../../utils/useSafeNavigate';
import { type CuratedAgent } from '../../components/AgentCurator';
import { type SourcePickerSelection } from '../../components/SourceSearchPicker';
import { EpisodePickerModal } from '../../components/EpisodePickerModal';
import { PostSourceChoiceModal } from '../../components/library/PostSourceChoiceModal';
import { AgentConnectedModal } from '../../components/agent-selection/AgentConnectedModal';
import { SymbolPerformancePage } from '../SymbolPerformancePage';
import { useAppData } from '../../context/AppDataContext';
import { useRealtimeSubscription } from '../../context/RealtimeContext';
import {
  listAgentEpisodeOptions,
  runAgentNow,
  type AgentSummary,
  type EpisodeOptionDto,
  type ForcedEpisodeSelection,
  type RunDetailDto,
  type RunReportDto
} from '../../api/agents';
import { getDiscussionRun, type DiscussionPreselect } from '../../api/discussions';
import { cloneMarketplaceSource } from '../../api/marketplace';
import {
  deletePlaybook,
  runPlaybookNow,
  updatePlaybook,
  type PlaybookRecord
} from '../../api/playbooks';
import {
  createSource,
  deleteSource,
  listSourceReports,
  listSourceRuns,
  probeSource,
  publishSource,
  shareSource,
  saveSource,
  updateSource,
  type SourceRecord
} from '../../api/sources';
import { useAuth } from '../../auth/AuthContext';
import { getAgentDisplayLabel } from '../../utils/agent-label';
import { useSymbolView } from '../../hooks/useSymbolView';
import {
  type ProbeKind,
  type LibraryTabRecord,
  type AutoDetectedSource,
  DEFAULT_LIBRARY_TAB_ID,
  DEFAULT_LIBRARY_TAB_NAME,
  LIBRARY_GUIDANCE_KEY
} from '../shared/types';
import {
  detectSourceTypeCandidates,
  probeRankScore,
  getAgentCharacterLabel,
  getAgentPersonalityLabel,
  hasEpisodicSource,
  getSourceDisplayTitle
} from '../shared/helpers';
import { LibraryTab } from './LibraryTab';
import { FollowWizardModal } from '../shared/FollowWizardModal';
import { ReportDrawer } from '../shared/ReportDrawer';
import { AgentPickerModal } from './AgentPickerModal';
import { ScheduleEditModal } from '../shared/ScheduleEditModal';
import { useScheduleDraft } from '../shared/useScheduleDraft';
import { useReportsFeed } from '../shared/useReportsFeed';
import { useLibrarySourceNavigation } from './useLibrarySourceNavigation';

export function LibraryPage() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const { message } = App.useApp();
  const navigate = useSafeNavigate();
  const {
    agents,
    sources,
    catalog,
    playbooks,
    sourcesLoadState,
    catalogLoadState,
    marketplaceSources,
    marketplaceSourceCount,
    refreshAgents: _refreshAgents,
    refreshSources: _refreshSources,
    refreshPlaybooks: _refreshPlaybooks,
    refreshCatalog,
    removeCatalogSource
  } = useAppData();
  const { symbolView, setSymbolView } = useSymbolView(agents);
  const [sourcesSearch, setSourcesSearch] = useState('');
  const [libraryTabs, setLibraryTabs] = useState<LibraryTabRecord[]>([{ id: DEFAULT_LIBRARY_TAB_ID, name: DEFAULT_LIBRARY_TAB_NAME }]);
  const [activeLibraryTabId, setActiveLibraryTabId] = useState(DEFAULT_LIBRARY_TAB_ID);
  const [sourceLibraryBySourceId, setSourceLibraryBySourceId] = useState<Record<string, string>>({});
  const [editingLibraryTabId, setEditingLibraryTabId] = useState<string | null>(null);
  const [editingLibraryTabName, setEditingLibraryTabName] = useState('');
  const [lastLibraryTabClick, setLastLibraryTabClick] = useState<{ tabId: string; at: number } | null>(null);
  const [isSourceCreateOpen, setIsSourceCreateOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<SourceRecord | null>(null);
  const [sourceUrlDraft, setSourceUrlDraft] = useState('');
  const [isSourceDetecting, setIsSourceDetecting] = useState(false);
  const [isSourceSaving, setIsSourceSaving] = useState(false);
  const [autoDetectedSource, setAutoDetectedSource] = useState<AutoDetectedSource | null>(null);
  const detectNonceRef = useRef(0);
  const detectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [agentAssignmentOrigin, setAgentAssignmentOrigin] = useState<'library' | 'detail'>('library');
  const [recentlyConnectedAgent, setRecentlyConnectedAgent] = useState<{ sourceId: string; agentId: string } | null>(null);
  const connectedAgentHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { selectedSourceId, setSelectedSourceId } = useLibrarySourceNavigation();
  const initialDeepLinkedSourceIdRef = useRef(selectedSourceId);
  const appliedInitialSourceTabRef = useRef(false);
  const [activeSourceTab, setActiveSourceTab] = useState<string>('reports');
  const [sourceDetailReports, setSourceDetailReports] = useState<RunReportDto[]>([]);
  const [sourceDetailRuns, setSourceDetailRuns] = useState<RunDetailDto[]>([]);
  const [sourceDetailLoading, setSourceDetailLoading] = useState(false);
  const [sourceDetailRefreshKey, setSourceDetailRefreshKey] = useState(0);
  const [materialAudioByItemKey, setMaterialAudioByItemKey] = useState<Record<string, string>>({});
  const [openMaterialAudioItemKey, setOpenMaterialAudioItemKey] = useState<string | null>(null);
  const [materialAudioLoadingItemKey, setMaterialAudioLoadingItemKey] = useState<string | null>(null);
  const [isPlaybookCreateOpen, setIsPlaybookCreateOpen] = useState(false);
  const [playbookSourceIdDraft, setPlaybookSourceIdDraft] = useState<string | null>(null);
  const scheduleDraft = useScheduleDraft();
  // Agent picker for manual runs when multiple agents are linked to the same source
  const [runPickerOpen, setRunPickerOpen] = useState(false);
  const [runPickerLinked, setRunPickerLinked] = useState<{ playbook: PlaybookRecord; agent: AgentSummary | undefined }[]>([]);
  const [runPickerEpisode, setRunPickerEpisode] = useState<{ title: string; link: string; pubDate?: string | null } | undefined>(undefined);
  // Schedule-only edit modal — opened via ✎ on individual playbook cards
  const [isScheduleEditOpen, setIsScheduleEditOpen] = useState(false);
  const [scheduleEditPlaybook, setScheduleEditPlaybook] = useState<PlaybookRecord | null>(null);
  const [isScheduleEditSaving, setIsScheduleEditSaving] = useState(false);
  const [connectedAgentPlaybook, setConnectedAgentPlaybook] = useState<PlaybookRecord | null>(null);
  const [runningConnectedAgentPlaybook, setRunningConnectedAgentPlaybook] = useState(false);
  // AI curation inside the follow wizard (alternative to picking an existing agent)
  const [inlineAgentCurating, setInlineAgentCurating] = useState(false);
  const [inlineCurationBaseAgentVersionId, setInlineCurationBaseAgentVersionId] = useState<string | null>(null);
  const [showSourcesMarketplace, setShowSourcesMarketplace] = useState(false);
  const [cloningPublicationId, setCloningPublicationId] = useState<string | null>(null);
  const [libraryGuidanceSeen, setLibraryGuidanceSeen] = useState(() =>
    localStorage.getItem(LIBRARY_GUIDANCE_KEY) === '1'
  );
  const [postSourceChoiceSource, setPostSourceChoiceSource] = useState<SourceRecord | null>(null);
  const [viewingFullReport, setViewingFullReport] = useState<RunReportDto & { agentName: string; playbookName: string } | null>(null);
  const [runningAgentId, setRunningAgentId] = useState<string | null>(null);
  const [episodePickerAgent, setEpisodePickerAgent] = useState<AgentSummary | null>(null);
  const [episodeOptions, setEpisodeOptions] = useState<EpisodeOptionDto[]>([]);
  const [loadingEpisodeOptions, setLoadingEpisodeOptions] = useState(false);
  const [togglingPlaybookId, setTogglingPlaybookId] = useState<string | null>(null);

  const {
    markFeedReportRead,
    onResendReportEmail,
    resendingReportId
  } = useReportsFeed({ agents, playbooks, selectedPlaybook: null, executionAgentId: null, message, t });

  function libraryTabsStorageKey(): string {
    return `chattrader:library-tabs:${user?.id ?? 'anonymous'}`;
  }

  function libraryAssignmentsStorageKey(): string {
    return `chattrader:library-assignments:${user?.id ?? 'anonymous'}`;
  }

  function normalizeLibraryTabs(candidate: unknown): LibraryTabRecord[] {
    if (!Array.isArray(candidate)) {
      return [{ id: DEFAULT_LIBRARY_TAB_ID, name: DEFAULT_LIBRARY_TAB_NAME }];
    }
    const normalized = candidate
      .filter((tab): tab is { id: string; name: string } => typeof tab?.id === 'string' && typeof tab?.name === 'string')
      .map((tab) => ({ id: tab.id, name: tab.name.trim() || 'Untitled Library' }));
    if (!normalized.some((tab) => tab.id === DEFAULT_LIBRARY_TAB_ID)) {
      normalized.unshift({ id: DEFAULT_LIBRARY_TAB_ID, name: DEFAULT_LIBRARY_TAB_NAME });
    }
    return normalized;
  }

  function reconcileSourceLibraries(nextSources: SourceRecord[]) {
    setSourceLibraryBySourceId((current) => {
      const validTabIds = new Set(libraryTabs.map((tab) => tab.id));
      const next: Record<string, string> = {};
      for (const source of nextSources) {
        const assignedTabId = current[source.id];
        next[source.id] = assignedTabId && validTabIds.has(assignedTabId) ? assignedTabId : DEFAULT_LIBRARY_TAB_ID;
      }
      return next;
    });
  }

  function createLibraryTab() {
    const defaultName = `Library ${libraryTabs.length + 1}`;
    const newTabId = `library-${Date.now()}`;
    setLibraryTabs((current) => [...current, { id: newTabId, name: defaultName }]);
    setActiveLibraryTabId(newTabId);
    // Immediately enter inline edit mode so the user can rename without extra clicks
    setEditingLibraryTabId(newTabId);
    setEditingLibraryTabName(defaultName);
  }

  function startEditingLibraryTab(tab: LibraryTabRecord) {
    setEditingLibraryTabId(tab.id);
    setEditingLibraryTabName(tab.name);
  }

  function deleteLibraryTab(tabId: string) {
    if (tabId === DEFAULT_LIBRARY_TAB_ID) return;
    setLibraryTabs((current) => current.filter((tab) => tab.id !== tabId));
    // Sources assigned to the deleted tab fall back to the default library
    setSourceLibraryBySourceId((current) => {
      const next: Record<string, string> = {};
      for (const [sourceId, assigned] of Object.entries(current)) {
        next[sourceId] = assigned === tabId ? DEFAULT_LIBRARY_TAB_ID : assigned;
      }
      return next;
    });
    if (activeLibraryTabId === tabId) setActiveLibraryTabId(DEFAULT_LIBRARY_TAB_ID);
    if (editingLibraryTabId === tabId) {
      setEditingLibraryTabId(null);
      setEditingLibraryTabName('');
    }
  }

  function onLibraryTabClick(tabId: string) {
    const now = Date.now();
    if (lastLibraryTabClick && lastLibraryTabClick.tabId === tabId && now - lastLibraryTabClick.at <= 350) {
      const tab = libraryTabs.find((candidate) => candidate.id === tabId);
      if (tab) {
        startEditingLibraryTab(tab);
      }
      setLastLibraryTabClick(null);
      return;
    }
    setLastLibraryTabClick({ tabId, at: now });
  }

  function commitEditingLibraryTab(tabId: string) {
    const trimmed = editingLibraryTabName.trim();
    if (!trimmed) {
      message.warning(t('library.tabNameRequired'));
      return;
    }
    setLibraryTabs((current) => current.map((tab) => (tab.id === tabId ? { ...tab, name: trimmed } : tab)));
    setEditingLibraryTabId(null);
    setEditingLibraryTabName('');
  }

  // Keep these as wrappers so existing call sites work; actual data management is in AppDataContext
  async function refreshSources() {
    await _refreshSources();
    reconcileSourceLibraries(sources);
  }

  async function refreshPlaybooks() {
    return _refreshPlaybooks();
  }

  async function refreshAgents() {
    return _refreshAgents();
  }

  async function refreshMarketplaceCounts() {
    // Marketplace counts now come from AppDataContext — no-op here
  }

  // Library guidance replaces the old forced onboarding flows.

  // Load library tabs and source assignments from localStorage
  useEffect(() => {
    try {
      const savedTabs = window.localStorage.getItem(libraryTabsStorageKey());
      const parsedTabs = savedTabs ? JSON.parse(savedTabs) : null;
      const normalizedTabs = normalizeLibraryTabs(parsedTabs);
      setLibraryTabs(normalizedTabs);
      const savedAssignments = window.localStorage.getItem(libraryAssignmentsStorageKey());
      const parsedAssignments = savedAssignments ? JSON.parse(savedAssignments) : {};
      if (parsedAssignments && typeof parsedAssignments === 'object') {
        setSourceLibraryBySourceId(parsedAssignments as Record<string, string>);
      } else {
        setSourceLibraryBySourceId({});
      }
      setActiveLibraryTabId((current) =>
        normalizedTabs.some((tab) => tab.id === current) ? current : DEFAULT_LIBRARY_TAB_ID
      );
    } catch {
      setLibraryTabs([{ id: DEFAULT_LIBRARY_TAB_ID, name: DEFAULT_LIBRARY_TAB_NAME }]);
      setActiveLibraryTabId(DEFAULT_LIBRARY_TAB_ID);
      setSourceLibraryBySourceId({});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Persist library tabs and source assignments to localStorage
  useEffect(() => {
    try {
      window.localStorage.setItem(libraryTabsStorageKey(), JSON.stringify(libraryTabs));
      window.localStorage.setItem(libraryAssignmentsStorageKey(), JSON.stringify(sourceLibraryBySourceId));
    } catch {
      // ignore storage failures
    }
  }, [libraryTabs, sourceLibraryBySourceId, user?.id]);

  useEffect(() => {
    if (appliedInitialSourceTabRef.current) return;
    if (!initialDeepLinkedSourceIdRef.current) return;
    const deepLinkedSource = sources.find((source) => source.id === initialDeepLinkedSourceIdRef.current);
    if (!deepLinkedSource) return;
    setActiveSourceTab(deepLinkedSource.type === 'youtube_videos' || deepLinkedSource.type === 'podcast_feeds' ? 'episodes' : 'reports');
    appliedInitialSourceTabRef.current = true;
  }, [sources]);

  // Start a Studio discussion seeded with this report + its agent. The wizard still needs a
  // second participant (discussions require >= 2), so this lands the user in /studio/new with
  // the agent pre-checked rather than creating a discussion outright.
  function openDiscussionFromReport(report: RunReportDto) {
    const contextLabel = (report.report?.common?.headline?.trim() || report.summary || '').slice(0, 80);
    const preselect: DiscussionPreselect = {
      entries: [{ agentId: report.agentId, reportIds: [report.id] }],
      contextLabel
    };
    navigate('/studio/new', { state: { preselect } });
  }

  // Jump from a feed card straight to its source's detail view in the Library hub.
  function openSourceInLibrary(source: SourceRecord) {
    setSelectedSourceId(source.id);
    setActiveSourceTab(source.type === 'youtube_videos' || source.type === 'podcast_feeds' ? 'episodes' : 'reports');
  }

  function parseSyntheticRunId(link: string | null | undefined): string | null {
    if (!link?.startsWith('discussion-run:')) return null;
    const runId = link.slice('discussion-run:'.length).trim();
    return runId.length > 0 ? runId : null;
  }

  async function onPlaySyntheticMaterialAudio(itemKey: string, runId: string, discussionId: string) {
    const cachedAudioUrl = materialAudioByItemKey[itemKey];
    if (cachedAudioUrl) {
      setOpenMaterialAudioItemKey((current) => (current === itemKey ? null : itemKey));
      return;
    }
    setMaterialAudioLoadingItemKey(itemKey);
    try {
      const run = await getDiscussionRun(discussionId, runId);
      if (!run.audioUrl) {
        message.warning('Audio is not available for this run yet');
        return;
      }
      setMaterialAudioByItemKey((current) => ({ ...current, [itemKey]: run.audioUrl! }));
      setOpenMaterialAudioItemKey(itemKey);
    } catch {
      message.error('Failed to load run audio');
    } finally {
      setMaterialAudioLoadingItemKey(null);
    }
  }

  // Load reports + runs for the selected source (merged from all agents analyzing it), both via
  // the source-scoped endpoints - only reports/runs whose generating run actually crawled this
  // source, never another source an agent's playbook happens to also link to.
  useEffect(() => {
    if (!selectedSourceId) {
      setSourceDetailReports([]);
      setSourceDetailRuns([]);
      return;
    }
    let alive = true;
    const linked = playbooks.filter((p) => p.sourceId === selectedSourceId);
    if (linked.length === 0) {
      setSourceDetailReports([]);
      setSourceDetailRuns([]);
      return;
    }
    setSourceDetailLoading(true);
    Promise.all([listSourceReports<RunReportDto>(selectedSourceId), listSourceRuns<RunDetailDto>(selectedSourceId)])
      .then(([allReports, allRuns]) => {
        if (!alive) return;
        allReports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        allRuns.sort((a, b) => new Date(b.scheduledFor).getTime() - new Date(a.scheduledFor).getTime());
        setSourceDetailReports(allReports);
        setSourceDetailRuns(allRuns);
      })
      .catch(() => { /* silently ignore — empty state handles this */ })
      .finally(() => { if (alive) setSourceDetailLoading(false); });
    return () => { alive = false; };
  }, [selectedSourceId, playbooks, sourceDetailRefreshKey]);

  // Refresh the selected source's detail runs/reports only when its own source record
  // changes — replaces the previous 5s polling interval that ran for as long as any
  // agent run was in progress.
  useRealtimeSubscription(['source.changed'], (event) => {
    if (!selectedSourceId) return;
    if (event.topic === 'resync' || event.entityId === selectedSourceId) {
      setSourceDetailRefreshKey((k) => k + 1);
    }
  });

  async function executeRun(agent: AgentSummary, forcedEpisode?: ForcedEpisodeSelection) {
    setRunningAgentId(agent.id);
    // Realtime `run.changed`/`report.changed` events drive live updates elsewhere on the
    // page; explicitly reload here too so the panel for this agent (when it's also the
    // currently viewed execution agent) reflects the just-finished run without waiting on
    // the realtime delivery round-trip.
    try {
      const result = await runAgentNow(agent.id, forcedEpisode);
      if (result.status === 'failed') {
        message.error(`Run failed${result.errorCode ? `: ${result.errorCode}` : ''}`);
      } else if (result.status === 'no_run_claimed') {
        message.info('Another run is already in progress');
      } else {
        message.success('Agent run completed');
        setSourceDetailRefreshKey((k) => k + 1);
      }
      await refreshAgents();
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to run agent');
    } finally {
      setRunningAgentId(null);
    }
  }

  async function onRunNow(agent: AgentSummary, event?: React.MouseEvent) {
    event?.stopPropagation();
    if (!hasEpisodicSource(agent)) {
      await executeRun(agent);
      return;
    }

    setEpisodePickerAgent(agent);
    setEpisodeOptions([]);
    setLoadingEpisodeOptions(true);
    try {
      const options = await listAgentEpisodeOptions(agent.id);
      setEpisodeOptions(options);
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to load episode options');
    } finally {
      setLoadingEpisodeOptions(false);
    }
  }

  function closeEpisodePicker() {
    setEpisodePickerAgent(null);
    setEpisodeOptions([]);
  }

  async function onRunNormallyFromPicker() {
    const agent = episodePickerAgent;
    closeEpisodePicker();
    if (agent) await executeRun(agent);
  }

  async function onSelectEpisodeFromPicker(episode: EpisodeOptionDto) {
    const agent = episodePickerAgent;
    closeEpisodePicker();
    if (agent) {
      await executeRun(agent, { sourceType: episode.sourceType, sourceValue: episode.sourceValue, itemLink: episode.link });
    }
  }

  function onFollowSource(source: SourceRecord, event?: React.MouseEvent) {
    event?.stopPropagation();
    setAgentAssignmentOrigin(selectedSourceId === source.id ? 'detail' : 'library');
    clearPostSourceAgentGuidance(source.id);
    setPlaybookSourceIdDraft(source.id);
    setIsPlaybookCreateOpen(true);
  }

  function onChoosePostSourceAgent(source: SourceRecord) {
    setPostSourceChoiceSource(null);
    onFollowSource(source);
  }

  function onSkipPostSourceAgent(source: SourceRecord) {
    setPostSourceAgentGuidancePending(source.id);
    setPostSourceChoiceSource(null);
  }

  async function handleAgentSelectionConnected(playbook: PlaybookRecord) {
    await Promise.all([refreshAgents(), refreshPlaybooks(), refreshSources()]);
    const sourceId = playbook.sourceId;
    if (sourceId) {
      if (connectedAgentHighlightTimerRef.current) {
        clearTimeout(connectedAgentHighlightTimerRef.current);
      }
      setRecentlyConnectedAgent({ sourceId, agentId: playbook.agentId });
      connectedAgentHighlightTimerRef.current = setTimeout(() => setRecentlyConnectedAgent(null), 4000);
    }
    message.success(t('agentSelection.connectionSuccess'));
    setPostSourceChoiceSource(null);
    setIsPlaybookCreateOpen(false);
    setInlineAgentCurating(false);
    setConnectedAgentPlaybook(playbook);
  }

  async function onRunFirstConnectedReport() {
    if (!connectedAgentPlaybook) return;
    setRunningConnectedAgentPlaybook(true);
    try {
      const result = await runPlaybookNow(connectedAgentPlaybook.id);
      if (result.status === 'scheduled') {
        message.success(t('agentSelection.runFirstReportScheduled'));
      } else {
        message.info(result.status);
      }
      await refreshPlaybooks();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('agentSelection.runFirstReportFailed'));
    } finally {
      setRunningConnectedAgentPlaybook(false);
    }
  }

  function onScheduleConnectedAgentPlaybook() {
    if (!connectedAgentPlaybook) return;
    setConnectedAgentPlaybook(null);
    onOpenScheduleEdit(connectedAgentPlaybook);
  }

  async function onDoneConnectedAgentPlaybook() {
    const playbook = connectedAgentPlaybook;
    setConnectedAgentPlaybook(null);
    if (!playbook) return;

    await Promise.all([refreshAgents(), refreshPlaybooks(), refreshSources()]);
    const sourceId = playbook.sourceId;
    if (!sourceId) return;

    if (agentAssignmentOrigin === 'library') {
      setSelectedSourceId(null);
    } else if (selectedSourceId !== sourceId) {
      setSelectedSourceId(sourceId);
    }
  }

  async function onRemoveAgentFromSource(playbook: PlaybookRecord) {
    try {
      await deletePlaybook(playbook.id);
      await refreshPlaybooks();
      message.success(t('library.agentRemovedFromSource'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('library.removeAgentFromSourceFailed'));
    }
  }

  function onCancelPlaybookCreate() {
    setIsPlaybookCreateOpen(false);
    setInlineAgentCurating(false);
    setInlineCurationBaseAgentVersionId(null);
  }

  function openInlineAgentCuration(baseAgentVersionId?: string) {
    setInlineCurationBaseAgentVersionId(baseAgentVersionId ?? null);
    setInlineAgentCurating(true);
  }

  async function onInlineAgentCurated(agent: CuratedAgent) {
    await refreshAgents();
    void agent;
    setInlineAgentCurating(false);
  }

  async function onCloneMarketplaceSource(publicationId: string) {
    setCloningPublicationId(publicationId);
    try {
      await cloneMarketplaceSource(publicationId);
      await refreshSources();
      message.success('Source cloned to your library');
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to clone source');
    } finally {
      setCloningPublicationId(null);
    }
  }

  /** Groups this source's merged report list (sourceDetailReports) by agent, taking
   * each agent's latest report (first occurrence, since already sorted newest-first)
   * as the explicit pick, and jumps into the Studio wizard pre-seeded with them. */
  function onDiscussSource(source: SourceRecord) {
    const latestReportByAgent = new Map<string, RunReportDto>();
    for (const report of sourceDetailReports) {
      if (!latestReportByAgent.has(report.agentId)) {
        latestReportByAgent.set(report.agentId, report);
      }
    }
    const preselect: DiscussionPreselect = {
      entries: Array.from(latestReportByAgent.entries()).map(([agentId, report]) => ({
        agentId,
        reportIds: [report.id]
      })),
      contextLabel: getSourceDisplayTitle(source)
    };
    navigate('/studio/new', { state: { preselect } });
  }

  /** Opens the shared full-report drawer (report + stats + chat) from any tab. */
  function openReportDrawer(report: RunReportDto & Partial<{ agentName: string; playbookName: string }>) {
    markFeedReportRead(report);
    const reportAgent = agents.find((a) => a.id === report.agentId);
    const playbook = report.playbookId ? playbooks.find((p) => p.id === report.playbookId) : undefined;
    setViewingFullReport({
      ...report,
      agentName: report.agentName ?? (reportAgent ? getAgentDisplayLabel(reportAgent) : ''),
      playbookName: report.playbookName ?? playbook?.name ?? ''
    });
  }

  async function onEditSource(source: SourceRecord) {
    setEditingSource(source);
    setSourceUrlDraft(source.value);
    setAutoDetectedSource({
      type: source.type,
      url: source.value,
      kind: source.type === 'web_urls' ? 'listing_page' : 'feed',
      title: source.metadata.title,
      coverImageUrl: source.metadata.coverImageUrl ?? undefined,
      itemCount: source.metadata.itemCount,
      previewItems: source.metadata.previewItems.map((item) => ({
        title: item.title,
        link: item.link ?? null,
        pubDate: item.pubDate ?? null,
        imageUrl: item.imageUrl ?? null
      }))
    });
    setIsSourceCreateOpen(true);
  }

  async function onDeleteSource(source: SourceRecord) {
    try {
      await deleteSource(source.id);
      setSourceLibraryBySourceId((current) => {
        const next = { ...current };
        delete next[source.id];
        return next;
      });
      await refreshSources();
      message.success('Source removed');
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to remove source');
    }
  }

  /** Opens the schedule-only edit modal for a specific playbook (from ✎ on expert cards). */
  function onOpenScheduleEdit(playbook: PlaybookRecord, event?: React.MouseEvent) {
    event?.stopPropagation();
    setScheduleEditPlaybook(playbook);
    scheduleDraft.apply(playbook.schedule);
    scheduleDraft.setRecipients(playbook.recipients);
    setIsScheduleEditOpen(true);
  }

  async function onSaveScheduleEdit() {
    if (!scheduleEditPlaybook) return;
    setIsScheduleEditSaving(true);
    try {
      const schedule =
        scheduleDraft.mode === 'manual'
          ? { mode: 'manual' as const }
          : scheduleDraft.mode === 'interval'
            ? { mode: 'interval' as const, intervalMinutes: scheduleDraft.intervalMinutes }
            : scheduleDraft.mode === 'weekly'
              ? { mode: 'weekly' as const, daysOfWeek: scheduleDraft.daysOfWeek, dailyTime: scheduleDraft.dailyTime, timezone: scheduleDraft.timezone }
              : { mode: 'daily' as const, dailyTime: scheduleDraft.dailyTime, timezone: scheduleDraft.timezone };
      const cleanedRecipients = scheduleDraft.recipients.map((v) => v.trim()).filter(Boolean);
      await updatePlaybook(scheduleEditPlaybook.id, { schedule, recipients: cleanedRecipients });
      await refreshPlaybooks();
      message.success(t('playbook.updatePlaybook'));
      setIsScheduleEditOpen(false);
      setScheduleEditPlaybook(null);
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to update schedule');
    } finally {
      setIsScheduleEditSaving(false);
    }
  }

  async function onTogglePlaybookEnabled(playbook: PlaybookRecord, event: React.MouseEvent) {
    event.stopPropagation();
    setTogglingPlaybookId(playbook.id);
    try {
      await updatePlaybook(playbook.id, { enabled: !playbook.enabled });
      await refreshPlaybooks();
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to update subscription');
    } finally {
      setTogglingPlaybookId(null);
    }
  }

  async function onDeletePlaybook(playbook: PlaybookRecord) {
    try {
      await deletePlaybook(playbook.id);
      await refreshPlaybooks();
      message.success('Subscription removed');
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to remove subscription');
    }
  }

  const normalizedSourceSearch = sourcesSearch.trim().toLowerCase();
  const filteredSources = sources.filter((source) => {
    if ((sourceLibraryBySourceId[source.id] ?? DEFAULT_LIBRARY_TAB_ID) !== activeLibraryTabId) {
      return false;
    }
    if (!normalizedSourceSearch) return true;
    const scannedTitle = source.metadata.title ?? '';
    const preview = source.metadata.previewItems.map((item) => item.title).join(' ');
    return `${scannedTitle} ${source.value} ${preview}`.toLowerCase().includes(normalizedSourceSearch);
  });
  const linkedAgentsBySourceId = playbooks.reduce<Record<string, Array<{
    playbookId: string;
    agentId: string;
    label: string;
    characterType?: string | null;
    characterLabel?: string;
    personalityLabel?: string;
  }>>>(
    (result, playbook) => {
      const agent = agents.find((candidate) => candidate.id === playbook.agentId);
      const linkedAgent = {
        playbookId: playbook.id,
        agentId: playbook.agentId,
        label: playbook.name,
        characterType: agent?.characterType,
        characterLabel: agent ? getAgentCharacterLabel(agent) : undefined,
        personalityLabel: agent ? getAgentPersonalityLabel(agent) : undefined
      };
      const current = result[playbook.sourceId] ?? [];
      if (!current.some((candidate) => candidate.agentId === linkedAgent.agentId)) {
        result[playbook.sourceId] = [...current, linkedAgent];
      }
      return result;
    },
    {}
  );
  const highlightedAgentIdBySourceId = recentlyConnectedAgent
    ? { [recentlyConnectedAgent.sourceId]: recentlyConnectedAgent.agentId }
    : {};
  const filteredMarketplaceSources = marketplaceSources.filter((item) => {
    if (!normalizedSourceSearch) return true;
    return `${item.title} ${item.value} ${item.summary}`.toLowerCase().includes(normalizedSourceSearch);
  });
  const starterSources = [...catalog]
    .filter((source) => !source.saved)
    .filter((source) => {
      if (!normalizedSourceSearch) return true;
      return `${source.title} ${source.summary} ${source.value}`.toLowerCase().includes(normalizedSourceSearch);
    })
    .sort((left, right) => left.editorialRank - right.editorialRank);

  function getSourceKindLabel(source: SourceRecord): string {
    if (source.type === 'youtube_videos' || source.type === 'podcast_feeds') return 'Playlist';
    if (source.type === 'synthetic_discussion') return 'Discussion';
    return 'Page';
  }

  function getSourceEpisodeCount(source: SourceRecord): number {
    return source.metadata.itemCount ?? source.metadata.previewItems.length;
  }

  function markLibraryGuidanceSeen() {
    if (libraryGuidanceSeen) return;
    setLibraryGuidanceSeen(true);
    localStorage.setItem(LIBRARY_GUIDANCE_KEY, '1');
  }

  function postSourceAgentGuidanceKey(sourceId: string): string {
    return `brk:library:add-agent-guidance:${sourceId}`;
  }

  function setPostSourceAgentGuidancePending(sourceId: string) {
    try {
      localStorage.setItem(postSourceAgentGuidanceKey(sourceId), 'pending');
    } catch {
      // ignore storage failures
    }
  }

  function clearPostSourceAgentGuidance(sourceId: string) {
    try {
      localStorage.removeItem(postSourceAgentGuidanceKey(sourceId));
    } catch {
      // ignore storage failures
    }
  }

  function isPostSourceAgentGuidancePending(sourceId: string): boolean {
    try {
      return localStorage.getItem(postSourceAgentGuidanceKey(sourceId)) === 'pending';
    } catch {
      return false;
    }
  }

  async function onSaveStarterSource(source: import('../../api/catalog').CatalogSource) {
    try {
      const locale = i18n.resolvedLanguage ?? i18n.language;
      const savedSource = await saveSource(source.sourceId);
      markLibraryGuidanceSeen();
      await Promise.all([refreshSources(), refreshCatalog(locale)]);
      message.success(t('library.sourceSaved'));
      setPostSourceChoiceSource(savedSource);
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('library.addSourceFailed'));
      throw error;
    }
  }

  async function onDetectSourceFromUrl(url: string) {
    const nonce = ++detectNonceRef.current;
    setIsSourceDetecting(true);
    setAutoDetectedSource(null);
    try {
      const candidates = detectSourceTypeCandidates(url);
      let best: AutoDetectedSource | null = null;
      let bestScore = -1;
      let index = 0;
      for (const candidate of candidates) {
        try {
          const probe = await probeSource({ type: candidate, value: url, maxItems: 5 });
          const score = probeRankScore(probe as { reachable: boolean; kind: ProbeKind; confidence?: number }, candidate);
          if (score > bestScore) {
            bestScore = score;
            best = {
              type: candidate,
              url,
              kind: probe.kind,
              title: probe.title,
              coverImageUrl: probe.coverImageUrl,
              itemCount: probe.itemCount,
              previewItems: (probe.previewItems ?? []).slice(0, 5)
            };
          }
          // Fast-path: if the preferred candidate already looks healthy, avoid expensive
          // additional probes on the same URL.
          if (index === 0 && probe.reachable && probe.kind !== 'unknown') {
            break;
          }
          if (score >= 130) break;
        } catch {
          // try next candidate
        }
        index += 1;
      }

      if (detectNonceRef.current !== nonce) return; // stale — a newer URL took over

      if (!best) {
        message.error('Could not detect this source yet. Please try another URL.');
        return;
      }
      setAutoDetectedSource(best);
    } finally {
      if (detectNonceRef.current === nonce) setIsSourceDetecting(false);
    }
  }

  function normaliseUrl(raw: string): string | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try { new URL(withProto); return withProto; } catch { return null; }
  }

  /** Search-picker selection: the source type is already known, so probe it directly
   * (single probe for preview items/cover) instead of candidate-guessing from the URL. */
  async function onPickSearchedSource(selection: SourcePickerSelection) {
    const nonce = ++detectNonceRef.current;
    if (detectTimerRef.current) clearTimeout(detectTimerRef.current);
    setSourceUrlDraft(selection.value);
    setIsSourceDetecting(true);
    setAutoDetectedSource(null);
    try {
      const probe = await probeSource({ type: selection.type, value: selection.value, maxItems: 5 });
      if (detectNonceRef.current !== nonce) return;
      setAutoDetectedSource({
        type: selection.type,
        url: selection.value,
        kind: probe.kind,
        title: probe.title ?? selection.title,
        coverImageUrl: probe.coverImageUrl ?? selection.coverImageUrl ?? undefined,
        itemCount: probe.itemCount,
        previewItems: (probe.previewItems ?? []).slice(0, 5)
      });
    } catch {
      if (detectNonceRef.current === nonce) message.error(t('source.probeError'));
    } finally {
      if (detectNonceRef.current === nonce) setIsSourceDetecting(false);
    }
  }

  function onSourceUrlChange(value: string) {
    setSourceUrlDraft(value);
    setAutoDetectedSource(null);
    if (detectTimerRef.current) clearTimeout(detectTimerRef.current);
    if (!value.trim()) {
      setIsSourceDetecting(false);
      return;
    }
    const url = normaliseUrl(value);
    if (!url) return; // not a parseable URL yet — keep waiting
    detectTimerRef.current = setTimeout(() => { void onDetectSourceFromUrl(url); }, 600);
  }

  function closeSourceDialog() {
    if (detectTimerRef.current) clearTimeout(detectTimerRef.current);
    setIsSourceCreateOpen(false);
    setEditingSource(null);
    setAutoDetectedSource(null);
    setSourceUrlDraft('');
  }

  async function onRunSourceEpisode(episode?: { title: string; link: string; pubDate?: string | null }) {
    if (!selectedSourceId) return;
    const linked = playbooks.filter((p) => p.sourceId === selectedSourceId);
    if (linked.length === 0) return;

    // When multiple agents watch this source, ask the user which one to run
    if (linked.length > 1) {
      setRunPickerLinked(linked.map((pb) => ({ playbook: pb, agent: agents.find((a) => a.id === pb.agentId) })));
      setRunPickerEpisode(episode);
      setRunPickerOpen(true);
      return;
    }

    setActiveSourceTab('runs');

    const agent = agents.find((a) => a.id === linked[0].agentId);
    if (!agent) {
      try {
        setSourceDetailRefreshKey((k) => k + 1); // show queued run immediately
        await runPlaybookNow(linked[0].id);
        setSourceDetailRefreshKey((k) => k + 1); // refresh again on completion
      } catch (err) {
        message.error(err instanceof Error ? err.message : 'Failed to start analysis');
      }
      return;
    }

    try {
      setSourceDetailRefreshKey((k) => k + 1);
      if (episode) {
        const libSource = sources.find((s) => s.id === selectedSourceId);
        if (!libSource) return;
        await runPlaybookNow(linked[0].id, {
          sourceType: libSource.type,
          sourceValue: libSource.value,
          itemLink: episode.link
        });
      } else {
        await runPlaybookNow(linked[0].id);
      }
      setSourceDetailRefreshKey((k) => k + 1);
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to start analysis');
    }
  }

  // Called when user picks a specific agent from the multi-agent run picker modal
  async function onRunPickerSelect(playbook: PlaybookRecord, agent: AgentSummary | undefined) {
    setRunPickerOpen(false);
    void agent;
    const episode = runPickerEpisode;
    setRunPickerEpisode(undefined);
    setActiveSourceTab('runs');
    try {
      setSourceDetailRefreshKey((k) => k + 1);
      if (episode) {
        const libSource = sources.find((s) => s.id === selectedSourceId);
        if (!libSource) return;
        await runPlaybookNow(playbook.id, {
          sourceType: libSource.type,
          sourceValue: libSource.value,
          itemLink: episode.link
        });
      } else {
        await runPlaybookNow(playbook.id);
      }
      setSourceDetailRefreshKey((k) => k + 1);
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to start analysis');
    }
  }

  async function onCreateDetectedSource() {
    if (!autoDetectedSource) {
      message.warning('Detect a source first');
      return;
    }
    setIsSourceSaving(true);
    try {
      let createdSource: SourceRecord | null = null;
      if (editingSource) {
        if (autoDetectedSource.type !== editingSource.type) {
          message.warning('Source type cannot be changed on edit. Please create a new source instead.');
          return;
        }
        await updateSource(editingSource.id, {
          value: autoDetectedSource.url,
          metadata: {
            title: autoDetectedSource.title,
            coverImageUrl: autoDetectedSource.coverImageUrl ?? null,
            itemCount: autoDetectedSource.itemCount,
            previewItems: autoDetectedSource.previewItems.map((item) => ({
              title: item.title,
              link: item.link ?? undefined,
              pubDate: item.pubDate,
              imageUrl: item.imageUrl ?? null
            }))
          }
        });
      } else {
        createdSource = await createSource({
          type: autoDetectedSource.type,
          value: autoDetectedSource.url,
          metadata: {
            title: autoDetectedSource.title,
            coverImageUrl: autoDetectedSource.coverImageUrl ?? null,
            itemCount: autoDetectedSource.itemCount,
            previewItems: autoDetectedSource.previewItems.map((item) => ({
              title: item.title,
              link: item.link ?? undefined,
              pubDate: item.pubDate,
              imageUrl: item.imageUrl ?? null
            }))
          }
        });
        setSourceLibraryBySourceId((current) => ({ ...current, [createdSource!.id]: activeLibraryTabId }));
      }
      await refreshSources();
      message.success(editingSource ? 'Source updated' : t('library.sourceAdded'));
      closeSourceDialog();
      if (!editingSource) {
        setPostSourceChoiceSource(createdSource);
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : editingSource ? 'Failed to update source' : 'Failed to create source');
    } finally {
      setIsSourceSaving(false);
    }
  }

  const libraryTabCtx = {
    activeLibraryTabId, activeSourceTab, agents, autoDetectedSource, catalogLoadState, cloneMarketplaceSource, cloningPublicationId,
    closeSourceDialog, commitEditingLibraryTab, createLibraryTab, deleteLibraryTab, deletePlaybook, detectTimerRef, editingLibraryTabId,
    editingLibraryTabName, editingSource, filteredMarketplaceSources, filteredSources, getSourceEpisodeCount, getSourceKindLabel,
    highlightedAgentIdBySourceId, i18n, isPostSourceAgentGuidancePending, isSourceCreateOpen, isSourceDetecting, isSourceSaving,
    libraryGuidanceSeen, libraryTabs, linkedAgentsBySourceId, marketplaceSourceCount, markLibraryGuidanceSeen,
    materialAudioByItemKey, materialAudioLoadingItemKey, message, navigate, normaliseUrl, onCloneMarketplaceSource,
    onCreateDetectedSource, onDeleteSource, onDetectSourceFromUrl, onDiscussSource, onEditSource, onFollowSource, onLibraryTabClick,
    onOpenScheduleEdit, onPickSearchedSource, onPlaySyntheticMaterialAudio, onRemoveAgentFromSource, onResendReportEmail,
    onRunSourceEpisode, onSaveStarterSource, onSourceUrlChange, onTogglePlaybookEnabled, openMaterialAudioItemKey,
    openReportDrawer, openSourceInLibrary, parseSyntheticRunId, playbooks, publishSource, recentlyConnectedAgent, refreshCatalog,
    refreshMarketplaceCounts, refreshPlaybooks, removeCatalogSource, resendingReportId, runningAgentId,
    normalizedSourceSearch, selectedSourceId, setSourcesSearch, sourcesSearch, togglingPlaybookId,
    setActiveLibraryTabId, setActiveSourceTab, setAutoDetectedSource, setEditingLibraryTabName, setEditingSource,
    setIsSourceCreateOpen, setSelectedSourceId, setShowSourcesMarketplace, setSourceUrlDraft,
    shareSource, showSourcesMarketplace, sourceDetailLoading, sourceDetailReports, sourceDetailRuns, sources, sourcesLoadState,
    sourceUrlDraft, starterSources, startEditingLibraryTab, t, updatePlaybook, user
  };

  if (symbolView) {
    return (
      <SymbolPerformancePage
        agentId={symbolView.agentId}
        symbol={symbolView.symbol}
        onBack={() => setSymbolView(null)}
      />
    );
  }

  void openDiscussionFromReport;
  void onRunNow;

  return (
    <>
      <div className="mx-auto max-w-6xl space-y-4">
        <LibraryTab ctx={libraryTabCtx} />
      </div>
      <ReportDrawer report={viewingFullReport} onClose={() => setViewingFullReport(null)} />
      <FollowWizardModal
        open={isPlaybookCreateOpen}
        sources={sources}
        agents={agents}
        user={user}
        playbookSourceIdDraft={playbookSourceIdDraft}
        inlineAgentCurating={inlineAgentCurating}
        setInlineAgentCurating={setInlineAgentCurating}
        inlineCurationBaseAgentVersionId={inlineCurationBaseAgentVersionId}
        onCancelPlaybookCreate={onCancelPlaybookCreate}
        handleAgentSelectionConnected={handleAgentSelectionConnected}
        openInlineAgentCuration={openInlineAgentCuration}
        onInlineAgentCurated={onInlineAgentCurated}
      />
      <EpisodePickerModal
        open={Boolean(episodePickerAgent)}
        loading={loadingEpisodeOptions}
        episodes={episodeOptions}
        onRunNormally={onRunNormallyFromPicker}
        onSelectEpisode={onSelectEpisodeFromPicker}
        onCancel={closeEpisodePicker}
      />
      <AgentPickerModal
        open={runPickerOpen}
        linked={runPickerLinked}
        onSelect={onRunPickerSelect}
        onClose={() => setRunPickerOpen(false)}
      />
      <ScheduleEditModal
        open={isScheduleEditOpen}
        playbook={scheduleEditPlaybook}
        agents={agents}
        draft={scheduleDraft}
        saving={isScheduleEditSaving}
        onSave={onSaveScheduleEdit}
        onClose={() => { setIsScheduleEditOpen(false); setScheduleEditPlaybook(null); }}
      />
      <PostSourceChoiceModal
        source={postSourceChoiceSource}
        open={Boolean(postSourceChoiceSource)}
        onChooseAgent={onChoosePostSourceAgent}
        onSkip={onSkipPostSourceAgent}
      />
      <AgentConnectedModal
        open={Boolean(connectedAgentPlaybook)}
        playbook={connectedAgentPlaybook}
        running={runningConnectedAgentPlaybook}
        onRunFirstReport={onRunFirstConnectedReport}
        onScheduleRecurring={onScheduleConnectedAgentPlaybook}
        onDone={() => void onDoneConnectedAgentPlaybook()}
      />
    </>
  );
}
