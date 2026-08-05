import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { useSafeNavigate } from '../../utils/useSafeNavigate';
import { useTranslation } from 'react-i18next';
import { App, Tabs } from 'antd';
import {
  DatabaseOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { type CuratedAgent } from '../../components/AgentCurator';
import { type SourcePickerSelection } from '../../components/SourceSearchPicker';
import { EpisodePickerModal } from '../../components/EpisodePickerModal';
import { PostSourceChoiceModal } from '../../components/library/PostSourceChoiceModal';
import { AgentConnectedModal } from '../../components/agent-selection/AgentConnectedModal';
import { SymbolPerformancePage } from '../SymbolPerformancePage';
import { seedDemoData } from '../../api/admin';
import { useAppData } from '../../context/AppDataContext';
import { useRealtimeSubscription } from '../../context/RealtimeContext';
import {
  createAgent,
  deleteAgent,
  disableAgent,
  enableAgent,
  getAgent,
  listAgents,
  listAgentEpisodeOptions,
  publishAgent,
  runAgentNow,
  saveAgentPrompt,
  type AgentDetail,
  type AgentSummary,
  type EpisodeOptionDto,
  type ForcedEpisodeSelection,
  type RunDetailDto
} from '../../api/agents';
import { getLatestAgentPrompt, type PromptVersionDto, type RunReportDto } from '../../api/agents';
import { grantAgentAccess, listAgentAccessGrants } from '../../api/access';
import { getDiscussionRun, type DiscussionPreselect } from '../../api/discussions';
import {
  cloneMarketplaceAgent,
  cloneMarketplacePlaybook,
  cloneMarketplaceSource,
  type MarketplaceAgentListItem,
  type MarketplacePlaybookListItem,
  type MarketplaceSourceListItem
} from '../../api/marketplace';
import {
  createPlaybook,
  deletePlaybook,
  listPlaybooks,
  publishPlaybook,
  runPlaybookNow,
  sharePlaybook,
  updatePlaybook,
  type DigestFrequency,
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
  type SourceRecord,
  type SourceType
} from '../../api/sources';
import { useAuth } from '../../auth/AuthContext';
import { getPromptCharacter, getPromptCharactersForPersona, getPromptPersona, PROMPT_PERSONAS, DEFAULT_PROMPT_CHARACTER_ID, DEFAULT_PROMPT_PERSONA_ID } from '../../data/prompt-personas';
import { getAgentDisplayLabel } from '../../utils/agent-label';
import {
  type HubKey,
  type ProbeKind,
  type AgentEditor,
  type LibraryTabRecord,
  type AutoDetectedSource,
  DEFAULT_LIBRARY_TAB_ID,
  DEFAULT_LIBRARY_TAB_NAME,
  LIBRARY_GUIDANCE_KEY
} from './types';
import {
  detectSourceTypeCandidates,
  probeRankScore,
  getAgentCharacterLabel,
  getAgentPersonalityLabel,
  hasEpisodicSource,
  getSourceDisplayTitle,
} from './helpers';
import { FeedTab } from './FeedTab';
import { AgentPickerModal } from './components/AgentPickerModal';
import { ScheduleEditModal } from './components/ScheduleEditModal';
import { FollowWizardModal } from './components/FollowWizardModal';
import { useScheduleDraft } from './hooks/useScheduleDraft';
import { ReportDrawer } from './components/ReportDrawer';
import { AdminWorkspace } from './components/AdminWorkspace';
import { LibraryTab } from './components/LibraryTab';
import { useHubNavigation } from './hooks/useHubNavigation';
import { useReportsFeed } from './hooks/useReportsFeed';

export function HubPage({ hub: initialHub }: { hub?: HubKey } = {}) {
  const { user, isAdmin, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const { message } = App.useApp();
  const navigate = useSafeNavigate();
  const {
    agents, setAgents,
    sources,
    catalog,
    playbooks,
    agentsLoadState: loadState,
    sourcesLoadState,
    playbooksLoadState,
    catalogLoadState,
    marketplaceAgents, setMarketplaceAgents: _setMarketplaceAgents,
    marketplaceSources, setMarketplaceSources: _setMarketplaceSources,
    marketplacePlaybooks, setMarketplacePlaybooks: _setMarketplacePlaybooks,
    marketplaceAgentCount, marketplaceSourceCount, marketplacePlaybookCount,
    refreshAgents: _refreshAgents, refreshSources: _refreshSources, refreshPlaybooks: _refreshPlaybooks, refreshCatalog,
    removeCatalogSource,
    failedRunNotices, setFailedRunNotices,
    newReportNotices, setNewReportNotices,
    bellDismissedIds,
  } = useAppData();
  const [viewingSymbol, setViewingSymbol] = useState<string | null>(null);
  const [agentEditor, setAgentEditor] = useState<AgentEditor>(null);
  const [isLoadingEditTarget, setIsLoadingEditTarget] = useState(false);
  const [agentsSearch, setAgentsSearch] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<PromptVersionDto | null>(null);
  const [togglingAgentId, setTogglingAgentId] = useState<string | null>(null);
  const [togglingPlaybookId, setTogglingPlaybookId] = useState<string | null>(null);
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);
  const [runningAgentId, setRunningAgentId] = useState<string | null>(null);
  const [episodePickerAgent, setEpisodePickerAgent] = useState<AgentSummary | null>(null);
  const [episodeOptions, setEpisodeOptions] = useState<EpisodeOptionDto[]>([]);
  const [loadingEpisodeOptions, setLoadingEpisodeOptions] = useState(false);
  const [activePlaybookTab, setActivePlaybookTab] = useState('reports');
  const [highlightedReportId, setHighlightedReportId] = useState<string | null>(null);
  const [viewingFullReport, setViewingFullReport] = useState<RunReportDto & { agentName: string; playbookName: string } | null>(null);
  const nav = useHubNavigation({ initialHub, navigate, agents, setSelectedAgentId, setViewingSymbol });
  const { activeHub, setActiveHub, showAdminWorkspace } = nav;
  const [sourcesSearch, setSourcesSearch] = useState('');
  const [libraryTabs, setLibraryTabs] = useState<LibraryTabRecord[]>([{ id: DEFAULT_LIBRARY_TAB_ID, name: DEFAULT_LIBRARY_TAB_NAME }]);
  const [activeLibraryTabId, setActiveLibraryTabId] = useState(DEFAULT_LIBRARY_TAB_ID);
  const [sourceLibraryBySourceId, setSourceLibraryBySourceId] = useState<Record<string, string>>({});
  const [editingLibraryTabId, setEditingLibraryTabId] = useState<string | null>(null);
  const [editingLibraryTabName, setEditingLibraryTabName] = useState('');
  const [lastLibraryTabClick, setLastLibraryTabClick] = useState<{ tabId: string; at: number } | null>(null);
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null);
  const [isSourceCreateOpen, setIsSourceCreateOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<SourceRecord | null>(null);
  const [sourceUrlDraft, setSourceUrlDraft] = useState('');
  const [isSourceDetecting, setIsSourceDetecting] = useState(false);
  const [isSourceSaving, setIsSourceSaving] = useState(false);
  const [autoDetectedSource, setAutoDetectedSource] = useState<AutoDetectedSource | null>(null);
  const detectNonceRef = useRef(0);
  const detectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [recentlyUpdatedSourceId, setRecentlyUpdatedSourceId] = useState<string | null>(null);
  const updatedHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [agentAssignmentOrigin, setAgentAssignmentOrigin] = useState<'library' | 'detail'>('library');
  const [recentlyConnectedAgent, setRecentlyConnectedAgent] = useState<{ sourceId: string; agentId: string } | null>(null);
  const connectedAgentHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playbooksSearch, setPlaybooksSearch] = useState('');
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string | null>(null);
  const { selectedSourceId, setSelectedSourceId } = nav;
  const [activeSourceTab, setActiveSourceTab] = useState<string>('reports');
  const [sourceDetailReports, setSourceDetailReports] = useState<RunReportDto[]>([]);
  const [sourceDetailRuns, setSourceDetailRuns] = useState<RunDetailDto[]>([]);
  const [sourceDetailLoading, setSourceDetailLoading] = useState(false);
  const [sourceDetailRefreshKey, setSourceDetailRefreshKey] = useState(0);
  const [materialAudioByItemKey, setMaterialAudioByItemKey] = useState<Record<string, string>>({});
  const [openMaterialAudioItemKey, setOpenMaterialAudioItemKey] = useState<string | null>(null);
  const [materialAudioLoadingItemKey, setMaterialAudioLoadingItemKey] = useState<string | null>(null);
  const [isPlaybookCreateOpen, setIsPlaybookCreateOpen] = useState(false);
  // When true the wizard was opened via "Follow this source" on a specific card;
  // step 0 (Pick source) is skipped because the source is already known.
  const [followWizardSourcePreselected, setFollowWizardSourcePreselected] = useState(false);
  const [playbookCreateStep, setPlaybookCreateStep] = useState(0);
  const [isPlaybookSaving, setIsPlaybookSaving] = useState(false);
  const [confirmingUnfollow, setConfirmingUnfollow] = useState(false);
  const [editingPlaybookId, setEditingPlaybookId] = useState<string | null>(null);
  const [playbookAgentIdsDraft, setPlaybookAgentIdsDraft] = useState<string[]>([]);
  // Tracks which agents already watch the source when the wizard opens — used for save diff
  // (create new playbooks for additions, delete playbooks for removals, skip unchanged).
  const [wizardAlreadyLinkedAgentIds, setWizardAlreadyLinkedAgentIds] = useState<string[]>([]);
  const [wizardAlreadyLinkedPlaybooks, setWizardAlreadyLinkedPlaybooks] = useState<{ agentId: string; playbookId: string }[]>([]);
  // The agent whose playbook settings are shown in the schedule step (edit mode via ✎ button)
  const [wizardFocusedAgentId, setWizardFocusedAgentId] = useState<string | null>(null);
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
  // Inline agent creation inside the follow wizard (step: pick agent) — full 4-step sub-wizard
  const [showInlineAgentCreate, setShowInlineAgentCreate] = useState(false);
  const [isInlineAgentSaving, setIsInlineAgentSaving] = useState(false);
  const [inlineAgentStep, setInlineAgentStep] = useState(0); // 0=character+personality, 1=model+prompt, 2=schedule+recipients
  const [inlineAgentDescription, setInlineAgentDescription] = useState('');
  const [inlineAgentPersonaId, setInlineAgentPersonaId] = useState(DEFAULT_PROMPT_PERSONA_ID);
  const [inlineAgentCharacterId, setInlineAgentCharacterId] = useState(DEFAULT_PROMPT_CHARACTER_ID);
  const [inlineAgentModel, setInlineAgentModel] = useState('claude-sonnet-4-5');
  const [inlineAgentSystemPrompt, setInlineAgentSystemPrompt] = useState(
    () => getPromptCharacter(DEFAULT_PROMPT_PERSONA_ID, DEFAULT_PROMPT_CHARACTER_ID)?.systemPrompt ?? ''
  );
  const [inlineAgentRiskLevel, setInlineAgentRiskLevel] = useState<'low' | 'medium' | 'high'>('medium');
  const [inlineAgentReportDetailLevel, setInlineAgentReportDetailLevel] = useState<'brief' | 'standard' | 'detailed'>('standard');
  const [inlineAgentValidationError, setInlineAgentValidationError] = useState<string | null>(null);
  // AI curation inside the follow wizard's "pick agent" step (alternative to the manual sub-wizard)
  const [inlineAgentCurating, setInlineAgentCurating] = useState(false);
  const [inlineCurationBaseAgentVersionId, setInlineCurationBaseAgentVersionId] = useState<string | null>(null);
  const [showSourcesMarketplace, setShowSourcesMarketplace] = useState(false);
  const [showPlaybooksMarketplace, setShowPlaybooksMarketplace] = useState(false);
  const [showAgentsMarketplace, setShowAgentsMarketplace] = useState(false);
  const [cloningPublicationId, setCloningPublicationId] = useState<string | null>(null);
  const [marketplaceAgentsSearch, setMarketplaceAgentsSearch] = useState('');
  const [marketplacePlaybooksSearch, setMarketplacePlaybooksSearch] = useState('');
  const [accessGrantCount, setAccessGrantCount] = useState(0);
  const [onboardingDismissed, setOnboardingDismissed] = useState(() =>
    localStorage.getItem('chattrader:onboarding:dismissed') === '1'
  );
  const [libraryGuidanceSeen, setLibraryGuidanceSeen] = useState(() =>
    localStorage.getItem(LIBRARY_GUIDANCE_KEY) === '1'
  );
  const [postSourceChoiceSource, setPostSourceChoiceSource] = useState<SourceRecord | null>(null);
  const [wizardShowAdvanced, setWizardShowAdvanced] = useState(false);
  const selectedPlaybook = playbooks.find((playbook) => playbook.id === selectedPlaybookId) ?? null;
  const executionAgentId = selectedPlaybook?.agentId ?? null;
  const feed = useReportsFeed({ agents, playbooks, selectedPlaybook, executionAgentId, message, t });
  const {
    feedReports,
    feedLoading,
    feedSearch,
    setFeedSearch,
    runs,
    reports,
    selectedPlaybookReports,
    reloadExecutionAgentData,
    markFeedReportRead,
    dismissFeedReport,
    onResendReportEmail,
    resendingReportId
  } = feed;

  /** Onboarding step completion */
  const onboardingHasFirstReport = agents.some((a) => (a.reportCount ?? 0) > 0);
  const onboardingAllDone = sources.length > 0 && agents.length > 0 && playbooks.length > 0 && onboardingHasFirstReport;
  const onboardingDataLoaded = sourcesLoadState !== 'loading' && loadState !== 'loading' && playbooksLoadState !== 'loading';

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

  function openCurationCreate() {
    setAgentEditor({ mode: 'curation-create' });
    setSelectedAgentId(null);
  }

  async function completeAgentCuration(agent: CuratedAgent) {
    setAgentEditor(null);
    try {
      await refreshAgents();
    } finally {
      setSelectedAgentId(agent.id);
    }
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
    setActiveHub('sources');
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

  useEffect(() => {
    if (!selectedAgentId) return;
    let alive = true;

    async function loadAgentDetail() {
      const agentPrompt = await getLatestAgentPrompt(selectedAgentId as string);
      if (!alive) return;
      setPrompt(agentPrompt);
    }

    loadAgentDetail();
    return () => {
      alive = false;
    };
  }, [selectedAgentId]);

  // Accumulate failed runs into the bell notification centre (driven by realtime updates)
  useEffect(() => {
    const failedRuns = runs.filter((r) => r.status === 'failed');
    if (failedRuns.length === 0) return;
    const executionAgent = agents.find((agent) => agent.id === executionAgentId);
    const agentName = executionAgent ? getAgentDisplayLabel(executionAgent) : executionAgentId ?? '';
    setFailedRunNotices((prev) => {
      const existingIds = new Set(prev.map((n) => n.runId));
      const newNotices = failedRuns
        .filter((r) => !existingIds.has(r.id))
        .map((r) => ({ runId: r.id, agentId: executionAgentId!, agentName, errorMessage: r.errorMessage ?? null, timestamp: r.finishedAt ?? r.startedAt ?? '' }));
      return newNotices.length > 0 ? [...prev, ...newNotices] : prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs]);

  // Accumulate newly-created reports into the bell notification centre too (driven by the
  // same realtime-refreshed data), so users don't have to keep an agent selected/open to
  // notice new output.
  useEffect(() => {
    if (reports.length === 0) return;
    const executionAgent = agents.find((agent) => agent.id === executionAgentId);
    const agentName = executionAgent ? getAgentDisplayLabel(executionAgent) : executionAgentId ?? '';
    setNewReportNotices((prev) => {
      const existingIds = new Set(prev.map((n) => n.reportId));
      const newNotices = reports
        .filter((r) => !existingIds.has(r.id))
        .map((r) => ({ reportId: r.id, agentId: executionAgentId!, agentName, summary: r.summary, timestamp: r.createdAt }));
      return newNotices.length > 0 ? [...prev, ...newNotices] : prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports]);

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

  useEffect(() => {
    if (!selectedAgentId) {
      setAccessGrantCount(0);
      return;
    }
    let alive = true;
    async function loadAccessGrants() {
      try {
        const grants = await listAgentAccessGrants(selectedAgentId);
        if (!alive) return;
        setAccessGrantCount(grants.length);
      } catch {
        if (!alive) return;
        setAccessGrantCount(0);
      }
    }
    loadAccessGrants();
    return () => {
      alive = false;
    };
  }, [selectedAgentId]);

  function onViewReport(reportId: string) {
    setHighlightedReportId(reportId);
    setActivePlaybookTab('reports');
  }

  async function onTogglePause(agent: AgentSummary, event: React.MouseEvent) {
    event.stopPropagation();
    setTogglingAgentId(agent.id);
    try {
      if (agent.status === 'disabled') {
        await enableAgent(agent.id);
      } else {
        await disableAgent(agent.id);
      }
      await refreshAgents();
    } finally {
      setTogglingAgentId(null);
    }
  }

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
      if (result.status !== 'no_run_claimed' && agent.id === executionAgentId) {
        await reloadExecutionAgentData();
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

  async function onDeleteAgent(agent: AgentSummary, event?: React.MouseEvent) {
    event?.stopPropagation();
    setDeletingAgentId(agent.id);
    try {
      await deleteAgent(agent.id);
      if (selectedAgentId === agent.id) {
        setSelectedAgentId(null);
      }
      await refreshAgents();
    } catch (error) {
      if (error instanceof Error && error.message === 'Agent not found') {
        if (selectedAgentId === agent.id) {
          setSelectedAgentId(null);
        }
        await refreshAgents();
        return;
      }
      message.error(error instanceof Error ? error.message : 'Failed to delete agent');
    } finally {
      setDeletingAgentId(null);
    }
  }

  async function onEditAgent(agent: AgentSummary, event?: React.MouseEvent) {
    event?.stopPropagation();
    setIsLoadingEditTarget(true);
    try {
      const [detail, latestPrompt] = await Promise.all([getAgent(agent.id), getLatestAgentPrompt(agent.id)]);
      setAgentEditor({ mode: 'manual-edit', detail, prompt: latestPrompt });
    } finally {
      setIsLoadingEditTarget(false);
    }
  }

  async function onImproveAgentWithAI(agent: AgentSummary, event?: React.MouseEvent) {
    event?.stopPropagation();
    setIsLoadingEditTarget(true);
    try {
      const [detail, latestPrompt] = await Promise.all([getAgent(agent.id), getLatestAgentPrompt(agent.id)]);
      setAgentEditor({ mode: 'curation-update', detail, prompt: latestPrompt });
    } finally {
      setIsLoadingEditTarget(false);
    }
  }

  function openPlaybookCreate() {
    setEditingPlaybookId(null);
    setWizardFocusedAgentId(null);
    setPlaybookCreateStep(0);
    setPlaybookAgentIdsDraft([]);
    setWizardAlreadyLinkedAgentIds([]);
    setWizardAlreadyLinkedPlaybooks([]);
    setPlaybookSourceIdDraft(sources[0]?.id ?? null);
    scheduleDraft.reset(user?.email ? [user.email] : []);
    setIsPlaybookCreateOpen(true);
  }

  function onFollowSource(source: SourceRecord, event?: React.MouseEvent) {
    event?.stopPropagation();
    setAgentAssignmentOrigin(selectedSourceId === source.id ? 'detail' : 'library');
    clearPostSourceAgentGuidance(source.id);
    // Opening the follow wizard must never expose the admin-only Agents/Playbooks
    // tabs to non-admin users. The wizard is a standalone Modal reachable regardless
    // of tab state. Source is already known so we skip step 0 (Pick source).
    setFollowWizardSourcePreselected(true);
    setShowInlineAgentCreate(false);
    setEditingPlaybookId(null);
    setWizardFocusedAgentId(null);
    setPlaybookCreateStep(1);
    setPlaybookSourceIdDraft(source.id);
    scheduleDraft.reset(user?.email ? [user.email] : []);
    // Pre-select agents that already watch this source; track their playbook IDs for the
    // save diff (delete removed, create added, skip unchanged).
    const linkedPbs = playbooks.filter((p) => p.sourceId === source.id);
    const alreadyLinkedAgentIds = linkedPbs.map((p) => p.agentId);
    setWizardAlreadyLinkedAgentIds(alreadyLinkedAgentIds);
    setWizardAlreadyLinkedPlaybooks(linkedPbs.map((p) => ({ agentId: p.agentId, playbookId: p.id })));
    setPlaybookAgentIdsDraft(alreadyLinkedAgentIds);
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
      markSourceUpdated(sourceId);
      if (connectedAgentHighlightTimerRef.current) {
        clearTimeout(connectedAgentHighlightTimerRef.current);
      }
      setRecentlyConnectedAgent({ sourceId, agentId: playbook.agentId });
      connectedAgentHighlightTimerRef.current = setTimeout(() => setRecentlyConnectedAgent(null), 4000);
    }
    message.success(t('agentSelection.connectionSuccess'));
    setPostSourceChoiceSource(null);
    setIsPlaybookCreateOpen(false);
    setFollowWizardSourcePreselected(false);
    setInlineAgentCurating(false);
    setPlaybookCreateStep(0);
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
      setActiveHub('sources');
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
    setPlaybookCreateStep(0);
    setEditingPlaybookId(null);
    setWizardFocusedAgentId(null);
    setWizardAlreadyLinkedPlaybooks([]);
    setFollowWizardSourcePreselected(false);
    setShowInlineAgentCreate(false);
    setInlineAgentCurating(false);
    setInlineAgentStep(0);
    setInlineAgentValidationError(null);
    setConfirmingUnfollow(false);
    setWizardShowAdvanced(false);
    setInlineCurationBaseAgentVersionId(null);
  }

  function closeInlineAgentCreate() {
    setShowInlineAgentCreate(false);
    setInlineAgentValidationError(null);
  }

  function openInlineAgentCuration(baseAgentVersionId?: string) {
    setShowInlineAgentCreate(false);
    setInlineAgentValidationError(null);
    setPlaybookAgentIdsDraft([]);
    setInlineCurationBaseAgentVersionId(baseAgentVersionId ?? null);
    setInlineAgentCurating(true);
  }

  async function onInlineAgentCurated(agent: CuratedAgent) {
    await refreshAgents();
    // Auto-select the curated agent in the wizard draft and return to the agent grid
    setPlaybookAgentIdsDraft((prev) => (prev.includes(agent.id) ? prev : [...prev, agent.id]));
    setInlineAgentCurating(false);
  }

  function onInlineAgentPersonaChange(nextPersonaId: string) {
    const chars = getPromptCharactersForPersona(nextPersonaId);
    const first = chars[0];
    setInlineAgentPersonaId(nextPersonaId as typeof inlineAgentPersonaId);
    if (first) {
      setInlineAgentCharacterId(first.id);
      setInlineAgentSystemPrompt(first.systemPrompt);
      if (nextPersonaId === 'finance_expert') setInlineAgentRiskLevel(first.riskLevel);
    }
  }

  function onInlineAgentCharacterChange(nextCharId: string) {
    setInlineAgentCharacterId(nextCharId);
    const char = getPromptCharacter(inlineAgentPersonaId, nextCharId);
    if (!char) return;
    setInlineAgentSystemPrompt(char.systemPrompt);
    if (inlineAgentPersonaId === 'finance_expert') setInlineAgentRiskLevel(char.riskLevel);
  }

  function validateInlineAgentStep(step: number): boolean {
    if (step === 1) {
      if (inlineAgentPersonaId === 'finance_expert' && !inlineAgentRiskLevel) {
        setInlineAgentValidationError('Risk level is required for Finance Expert.');
        return false;
      }
    }
    setInlineAgentValidationError(null);
    return true;
  }

  function onInlineAgentNext() {
    if (!validateInlineAgentStep(inlineAgentStep)) return;
    setInlineAgentStep((prev) => Math.min(2, prev + 1));
  }

  function onInlineAgentBack() {
    setInlineAgentValidationError(null);
    if (inlineAgentStep === 0) {
      closeInlineAgentCreate();
      return;
    }
    setInlineAgentStep((prev) => prev - 1);
  }

  async function onSaveInlineAgent() {
    setIsInlineAgentSaving(true);
    try {
      const inlinePersona = getPromptPersona(inlineAgentPersonaId);
      const inlineChar = getPromptCharacter(inlineAgentPersonaId, inlineAgentCharacterId);
      const payload = {
        description: inlineAgentDescription,
        active: true,
        characterType: inlineAgentPersonaId,
        promptConfig: {
          personality_id: inlineAgentCharacterId,
          personality_label: inlineChar?.name ?? inlineAgentCharacterId,
          report_detail_level: inlineAgentReportDetailLevel,
          ...(inlineAgentPersonaId === 'finance_expert' ? { risk_level: inlineAgentRiskLevel } : {})
        },
        preferences: inlineAgentPersonaId === 'finance_expert' ? { risk_level: [inlineAgentRiskLevel] } : {}
      };
      const newAgent = await createAgent(payload) as AgentSummary;
      await saveAgentPrompt(newAgent.id, { model: inlineAgentModel, systemPrompt: inlineAgentSystemPrompt, enabled: true });
      setAgents((prev) => [...prev, newAgent]);
      // Auto-select the new agent in the wizard draft and return to the agent grid
      setPlaybookAgentIdsDraft((prev) => [...prev, newAgent.id]);
      void inlinePersona;
      setShowInlineAgentCreate(false);
      // Stay on step 1 so the user sees the newly selected agent and can confirm / pick more
    } catch {
      message.error('Failed to create agent');
    } finally {
      setIsInlineAgentSaving(false);
    }
  }

  function derivePlaybookName(agentId: string, sourceId: string): string {
    const selectedAgent = agents.find((agent) => agent.id === agentId);
    const agentName = selectedAgent ? getAgentDisplayLabel(selectedAgent) : 'Agent';
    const primarySource = sources.find((source) => source.id === sourceId);
    const sourceTitle = primarySource?.metadata.title ?? primarySource?.value ?? 'Source';
    return `${agentName} · ${sourceTitle}`;
  }

  function onNextPlaybookCreateStep() {
    if (playbookCreateStep === 0 && !playbookSourceIdDraft) {
      message.warning('Pick a source first');
      return;
    }
    if (playbookCreateStep === 1 && playbookAgentIdsDraft.length === 0 && !editingPlaybookId) {
      message.warning('Pick an agent first');
      return;
    }
    setPlaybookCreateStep((current) => Math.min(current + 1, 2));
  }

  function onBackPlaybookCreateStep() {
    // When source was pre-selected, never go below step 1
    const minStep = followWizardSourcePreselected ? 1 : 0;
    setPlaybookCreateStep((current) => Math.max(current - 1, minStep));
  }

  function markSourceUpdated(sourceId: string) {
    if (updatedHighlightTimerRef.current) clearTimeout(updatedHighlightTimerRef.current);
    setRecentlyUpdatedSourceId(sourceId);
    updatedHighlightTimerRef.current = setTimeout(() => setRecentlyUpdatedSourceId(null), 4000);
  }

  async function onCreatePlaybook() {
    // In follow mode, deselecting all agents is valid — it means "remove all" (diff will delete them).
    // Only block empty selection in admin-hub create mode where you must pick at least one agent.
    const isRemoveAll = followWizardSourcePreselected && wizardAlreadyLinkedAgentIds.length > 0 && playbookAgentIdsDraft.length === 0;
    if (!editingPlaybookId && playbookAgentIdsDraft.length === 0 && !isRemoveAll) {
      message.warning(t('playbook.pickAgentFirst'));
      return;
    }
    if (!playbookSourceIdDraft) {
      message.warning(t('playbook.pickSourceFirst'));
      return;
    }
    const sourceId = playbookSourceIdDraft;
    setIsPlaybookSaving(true);
    try {
      const lang = i18n.language.startsWith('de') ? 'de' : 'en';
      // Default schedule used when the follow-source wizard does not show a schedule step
      const defaultSchedule = { mode: 'daily' as const, dailyTime: '07:30', timezone: 'UTC' };
      // Admin-hub create wizard does pass through the schedule step; follow wizard does not
      const explicitSchedule =
        scheduleDraft.mode === 'manual'
          ? { mode: 'manual' as const }
          : scheduleDraft.mode === 'interval'
            ? { mode: 'interval' as const, intervalMinutes: scheduleDraft.intervalMinutes }
            : scheduleDraft.mode === 'weekly'
              ? { mode: 'weekly' as const, daysOfWeek: scheduleDraft.daysOfWeek, dailyTime: scheduleDraft.dailyTime, timezone: scheduleDraft.timezone }
              : { mode: 'daily' as const, dailyTime: scheduleDraft.dailyTime, timezone: scheduleDraft.timezone };
      // In follow mode use advanced draft values if expanded, otherwise defaults.
      const scheduleForNew = followWizardSourcePreselected && !wizardShowAdvanced ? defaultSchedule : explicitSchedule;
      const cleanedRecipients = scheduleDraft.recipients.map((v) => v.trim()).filter(Boolean);
      // Recipients for new playbooks: advanced-mode uses draft; streamlined follow mode defaults to current user email.
      const recipientsForNew = (followWizardSourcePreselected && !wizardShowAdvanced) ? (user?.email ? [user.email] : []) : cleanedRecipients;
      if (editingPlaybookId) {
        // Admin-hub edit mode: update the explicit playbook + diff agent selection
        const agentId = wizardFocusedAgentId ?? playbookAgentIdsDraft[0] ?? '';
        await updatePlaybook(editingPlaybookId, { name: derivePlaybookName(agentId, sourceId), recipients: cleanedRecipients, schedule: explicitSchedule });
        // Diff: additions and removals relative to the originally linked set
        const toCreate = playbookAgentIdsDraft.filter((id) => !wizardAlreadyLinkedAgentIds.includes(id));
        const toDelete = wizardAlreadyLinkedAgentIds.filter((id) => !playbookAgentIdsDraft.includes(id) && id !== agentId);
        await Promise.all([
          ...toCreate.map((id) => createPlaybook({ agentId: id, name: derivePlaybookName(id, sourceId), sourceId, recipients: cleanedRecipients, schedule: explicitSchedule, language: lang })),
          ...toDelete.map((id) => {
            const pb = wizardAlreadyLinkedPlaybooks.find((p) => p.agentId === id);
            return pb ? deletePlaybook(pb.playbookId) : Promise.resolve();
          })
        ]);
      } else {
        // Create mode (follow-source or admin-hub): diff against already-linked
        const toCreate = playbookAgentIdsDraft.filter((id) => !wizardAlreadyLinkedAgentIds.includes(id));
        const toDelete = wizardAlreadyLinkedAgentIds.filter((id) => !playbookAgentIdsDraft.includes(id));
        await Promise.all([
          ...toCreate.map((id) => createPlaybook({ agentId: id, name: derivePlaybookName(id, sourceId), sourceId, recipients: recipientsForNew, schedule: scheduleForNew, language: lang })),
          ...toDelete.map((id) => {
            const pb = wizardAlreadyLinkedPlaybooks.find((p) => p.agentId === id);
            return pb ? deletePlaybook(pb.playbookId) : Promise.resolve();
          })
        ]);
      }
      await refreshPlaybooks();
      markSourceUpdated(sourceId);
      message.success(t('playbook.updatePlaybook'));
      setIsPlaybookCreateOpen(false);
      setPlaybookCreateStep(0);
      setEditingPlaybookId(null);
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to create playbook');
    } finally {
      setIsPlaybookSaving(false);
    }
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

  async function onCloneMarketplacePlaybook(publicationId: string) {
    setCloningPublicationId(publicationId);
    try {
      await cloneMarketplacePlaybook(publicationId);
      await refreshPlaybooks();
      message.success('Playbook cloned');
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to clone playbook');
    } finally {
      setCloningPublicationId(null);
    }
  }

  async function onCloneMarketplaceAgent(publicationId: string) {
    setCloningPublicationId(publicationId);
    try {
      await cloneMarketplaceAgent(publicationId);
      await refreshAgents();
      message.success('Agent cloned');
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to clone agent');
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

  function onOpenPlaybookWizard(playbook: PlaybookRecord) {
    setFollowWizardSourcePreselected(true);
    setShowInlineAgentCreate(false);
    setEditingPlaybookId(playbook.id);
    setWizardFocusedAgentId(playbook.agentId);
    setPlaybookCreateStep(1);
    setPlaybookSourceIdDraft(playbook.sourceId);
    scheduleDraft.apply(playbook.schedule);
    scheduleDraft.setRecipients(playbook.recipients);
    // Pre-fill detail level from existing agent if available
    const existingAgent = agents.find((a) => a.id === playbook.agentId);
    setInlineAgentReportDetailLevel((existingAgent?.promptConfig as { report_detail_level?: 'brief' | 'standard' | 'detailed' } | undefined)?.report_detail_level ?? 'standard');
    // Pre-select ALL linked agents for this source; track their playbook IDs for the save diff
    const linkedPbs = playbooks.filter((p) => p.sourceId === playbook.sourceId);
    const alreadyLinkedAgentIds = linkedPbs.map((p) => p.agentId);
    setWizardAlreadyLinkedAgentIds(alreadyLinkedAgentIds);
    setWizardAlreadyLinkedPlaybooks(linkedPbs.map((p) => ({ agentId: p.agentId, playbookId: p.id })));
    setPlaybookAgentIdsDraft(alreadyLinkedAgentIds);
    setIsPlaybookCreateOpen(true);
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
      message.error(err instanceof Error ? err.message : 'Failed to update playbook');
    } finally {
      setTogglingPlaybookId(null);
    }
  }

  async function onEditPlaybook(playbook: PlaybookRecord) {
    const updatedName = window.prompt('Edit playbook name', playbook.name);
    if (updatedName === null) return;
    const trimmed = updatedName.trim();
    if (!trimmed || trimmed === playbook.name) return;
    try {
      await updatePlaybook(playbook.id, { name: trimmed });
      await refreshPlaybooks();
      message.success('Playbook updated');
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to update playbook');
    }
  }

  async function onDeletePlaybook(playbook: PlaybookRecord) {
    try {
      await deletePlaybook(playbook.id);
      if (selectedPlaybookId === playbook.id) {
        setSelectedPlaybookId(null);
      }
      await refreshPlaybooks();
      message.success('Playbook removed');
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to remove playbook');
    }
  }

  async function onUnfollowFromWizard() {
    if (!editingPlaybookId) return;
    try {
      await deletePlaybook(editingPlaybookId);
      await refreshPlaybooks();
      message.success('Unfollowed');
      onCancelPlaybookCreate();
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to unfollow');
    }
  }

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? null;
  const executionAgent = executionAgentId ? agents.find((agent) => agent.id === executionAgentId) ?? null : null;
  const normalizedSourceSearch = sourcesSearch.trim().toLowerCase();
  const normalizedAgentsSearch = agentsSearch.trim().toLowerCase();
  const normalizedPlaybooksSearch = playbooksSearch.trim().toLowerCase();
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
  const filteredAgents = agents.filter((agent) => {
    if (!normalizedAgentsSearch) return true;
    const sourceValues = agent.sources.map((source) => source.value).join(' ');
    return `${getAgentDisplayLabel(agent)} ${sourceValues}`.toLowerCase().includes(normalizedAgentsSearch);
  });
  const filteredPlaybooks = playbooks.filter((playbook) => {
    if (!normalizedPlaybooksSearch) return true;
    return `${playbook.name} ${playbook.description} ${playbook.sourceId}`.toLowerCase().includes(normalizedPlaybooksSearch);
  });
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
  const hasSavedSourcesInActiveTab = sources.some(
    (source) => (sourceLibraryBySourceId[source.id] ?? DEFAULT_LIBRARY_TAB_ID) === activeLibraryTabId
  );
  const normalizedMarketplaceAgentsSearch = marketplaceAgentsSearch.trim().toLowerCase();
  const normalizedMarketplacePlaybooksSearch = marketplacePlaybooksSearch.trim().toLowerCase();
  const filteredMarketplaceAgents = marketplaceAgents.filter((item) => {
    if (!normalizedMarketplaceAgentsSearch) return true;
    return `${item.title} ${item.summary} ${getAgentDisplayLabel(item.agent)}`.toLowerCase().includes(normalizedMarketplaceAgentsSearch);
  });
  const filteredMarketplacePlaybooks = marketplacePlaybooks.filter((item) => {
    if (!normalizedMarketplacePlaybooksSearch) return true;
    return `${item.title} ${item.summary} ${item.playbook.name}`.toLowerCase().includes(normalizedMarketplacePlaybooksSearch);
  });

  function getSourceSpeakers(source: SourceRecord): string[] {
    if (source.type !== 'synthetic_discussion') return [];
    const p = source.config.participants;
    if (Array.isArray(p)) return p.filter((n): n is string => typeof n === 'string');
    return [];
  }

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

  // Resets every overlay/detail view back to the plain agent-list dashboard - used by the
  // clickable app-name header so it works as a "home" link from anywhere (agent detail, wizard,
  // symbol performance page).
  function goToDashboard() {
    setSelectedAgentId(null);
    setViewingSymbol(null);
    setAgentEditor(null);
    setActiveHub('feed');
    setSelectedPlaybookId(null);
  }

  const libraryTabCtx = {
    activeLibraryTabId, activeSourceTab, agents, autoDetectedSource, catalogLoadState, cloneMarketplaceSource, cloningPublicationId,
    closeSourceDialog, commitEditingLibraryTab, createLibraryTab, deletePlaybook, detectTimerRef, editingLibraryTabId,
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
    setIsSourceCreateOpen, setRecentlyUpdatedSourceId, setSelectedSourceId, setShowSourcesMarketplace, setSourceUrlDraft,
    shareSource, showSourcesMarketplace, sourceDetailLoading, sourceDetailReports, sourceDetailRuns, sources, sourcesLoadState,
    sourceUrlDraft, starterSources, startEditingLibraryTab, t, updatePlaybook, user
  };

  const adminWorkspaceCtx = {
    accessGrantCount, activePlaybookTab, agentEditor, agents, agentsSearch, cloningPublicationId, completeAgentCuration,
    executionAgent, filteredAgents, filteredMarketplaceAgents, filteredMarketplacePlaybooks, filteredPlaybooks, grantAgentAccess,
    highlightedReportId, isLoadingEditTarget, loadState, marketplaceAgentCount, marketplaceAgents, marketplaceAgentsSearch,
    marketplacePlaybookCount, marketplacePlaybooks, marketplacePlaybooksSearch, onCloneMarketplaceAgent, onCloneMarketplacePlaybook,
    onDeleteAgent, onDeletePlaybook, onEditAgent, onEditPlaybook, onImproveAgentWithAI, onRunNow, onTogglePause,
    onTogglePlaybookEnabled, onViewReport, openCurationCreate, openPlaybookCreate, playbooksLoadState, playbooksSearch, prompt,
    publishAgent, publishPlaybook, refreshAgents, refreshMarketplaceCounts, runningAgentId, runs, selectedAgent, selectedPlaybook,
    selectedPlaybookReports, setActiveHub, setActivePlaybookTab, setAgentEditor, setAgentsSearch, setMarketplaceAgentsSearch,
    setMarketplacePlaybooksSearch, setPlaybooksSearch, setSelectedAgentId, setSelectedPlaybookId, setShowAgentsMarketplace,
    setShowPlaybooksMarketplace, setViewingSymbol, sharePlaybook, showAgentsMarketplace, showPlaybooksMarketplace, sources, t,
    togglingAgentId, togglingPlaybookId, user
  };

  return (
    <>
      {viewingSymbol && (selectedAgent || executionAgentId) ? (
        <SymbolPerformancePage
          agentId={selectedAgent?.id ?? executionAgentId!}
          symbol={viewingSymbol}
          onBack={() => setViewingSymbol(null)}
        />
      ) : (
      <div className="mx-auto max-w-6xl space-y-4">
          <Tabs
            activeKey={activeHub}
            onChange={(key) => setActiveHub(key as HubKey)}
            renderTabBar={() => <></>}
            items={[
              {
                key: 'feed',
                label: <span><FileTextOutlined /> {t('nav.feed')}</span>,
                children: (
                  <FeedTab
                    t={t}
                    language={i18n.language}
                    feedLoading={feedLoading}
                    feedReports={feedReports}
                    feedSearch={feedSearch}
                    onFeedSearchChange={setFeedSearch}
                    agents={agents}
                    sources={sources}
                    playbooks={playbooks}
                    onGoToLibrary={() => setActiveHub('sources')}
                    onOpenFullReport={openReportDrawer}
                    onOpenSource={openSourceInLibrary}
                    onDiscuss={openDiscussionFromReport}
                    onDismiss={dismissFeedReport}
                    onResendEmail={(report) => void onResendReportEmail(report)}
                    resendingReportId={resendingReportId}
                  />
                )
              },
              {
                key: 'sources',
                label: <span><DatabaseOutlined /> {t('nav.library')}</span>,
                children: (
                  <LibraryTab ctx={libraryTabCtx} />
                )
              },
              ...(showAdminWorkspace
                ? [
                    { key: 'agents', label: t('nav.agents'), children: <AdminWorkspace ctx={adminWorkspaceCtx} tab="agents" /> },
                    { key: 'playbooks', label: 'Playbooks', children: <AdminWorkspace ctx={adminWorkspaceCtx} tab="playbooks" /> }
                  ]
                : [])
            ]}
          />
        </div>
        )}
      <ReportDrawer report={viewingFullReport} onClose={() => setViewingFullReport(null)} />
      <FollowWizardModal
        open={isPlaybookCreateOpen}
        sources={sources}
        agents={agents}
        playbooks={playbooks}
        user={user}
        scheduleDraft={scheduleDraft}
        followWizardSourcePreselected={followWizardSourcePreselected}
        playbookSourceIdDraft={playbookSourceIdDraft}
        setPlaybookSourceIdDraft={setPlaybookSourceIdDraft}
        editingPlaybookId={editingPlaybookId}
        playbookCreateStep={playbookCreateStep}
        playbookAgentIdsDraft={playbookAgentIdsDraft}
        setPlaybookAgentIdsDraft={setPlaybookAgentIdsDraft}
        wizardFocusedAgentId={wizardFocusedAgentId}
        wizardAlreadyLinkedPlaybooks={wizardAlreadyLinkedPlaybooks}
        setWizardAlreadyLinkedAgentIds={setWizardAlreadyLinkedAgentIds}
        setWizardAlreadyLinkedPlaybooks={setWizardAlreadyLinkedPlaybooks}
        wizardShowAdvanced={wizardShowAdvanced}
        setWizardShowAdvanced={setWizardShowAdvanced}
        showInlineAgentCreate={showInlineAgentCreate}
        setShowInlineAgentCreate={setShowInlineAgentCreate}
        inlineAgentCurating={inlineAgentCurating}
        setInlineAgentCurating={setInlineAgentCurating}
        inlineCurationBaseAgentVersionId={inlineCurationBaseAgentVersionId}
        inlineAgentStep={inlineAgentStep}
        inlineAgentPersonaId={inlineAgentPersonaId}
        inlineAgentCharacterId={inlineAgentCharacterId}
        inlineAgentModel={inlineAgentModel}
        setInlineAgentModel={setInlineAgentModel}
        inlineAgentSystemPrompt={inlineAgentSystemPrompt}
        setInlineAgentSystemPrompt={setInlineAgentSystemPrompt}
        inlineAgentRiskLevel={inlineAgentRiskLevel}
        setInlineAgentRiskLevel={setInlineAgentRiskLevel}
        inlineAgentReportDetailLevel={inlineAgentReportDetailLevel}
        setInlineAgentReportDetailLevel={setInlineAgentReportDetailLevel}
        inlineAgentValidationError={inlineAgentValidationError}
        isInlineAgentSaving={isInlineAgentSaving}
        isPlaybookSaving={isPlaybookSaving}
        confirmingUnfollow={confirmingUnfollow}
        setConfirmingUnfollow={setConfirmingUnfollow}
        setAgents={setAgents}
        onCancelPlaybookCreate={onCancelPlaybookCreate}
        handleAgentSelectionConnected={handleAgentSelectionConnected}
        openInlineAgentCuration={openInlineAgentCuration}
        onInlineAgentCurated={onInlineAgentCurated}
        onInlineAgentPersonaChange={onInlineAgentPersonaChange}
        onInlineAgentCharacterChange={onInlineAgentCharacterChange}
        onInlineAgentBack={onInlineAgentBack}
        onInlineAgentNext={onInlineAgentNext}
        onSaveInlineAgent={onSaveInlineAgent}
        onNextPlaybookCreateStep={onNextPlaybookCreateStep}
        onBackPlaybookCreateStep={onBackPlaybookCreateStep}
        onCreatePlaybook={onCreatePlaybook}
        onUnfollowFromWizard={onUnfollowFromWizard}
        getSourceKindLabel={getSourceKindLabel}
        getSourceEpisodeCount={getSourceEpisodeCount}
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
