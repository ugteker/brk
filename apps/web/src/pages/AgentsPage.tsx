import { useEffect, useState, type ReactNode } from 'react';
import { Badge, Button, Card, Empty, Input, Layout, Modal, Select, Steps, message, Popconfirm, Tabs, Tag, Typography } from 'antd';
import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  BulbOutlined,
  CaretRightOutlined,
  ClockCircleOutlined,
  CompassOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined,
  LineChartOutlined,
  LogoutOutlined,
  PlusCircleOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ReadOutlined,
  RocketOutlined,
  SearchOutlined,
  TeamOutlined,
  ToolOutlined
} from '@ant-design/icons';
import { AgentForm } from '../components/AgentForm';
import { AgentStatusCard } from '../components/AgentStatusCard';
import { ThemePicker } from '../components/ThemePicker';
import { AgentReportsBrowser } from '../components/AgentReportsBrowser';
import { AgentRunsBrowser } from '../components/AgentRunsBrowser';
import { AgentPromptEditor } from '../components/AgentPromptEditor';
import { EpisodePickerModal } from '../components/EpisodePickerModal';
import { TouchSafeTooltip } from '../components/TouchSafeTooltip';
import { AdminUsersPage } from './AdminUsersPage';
import { SymbolPerformancePage } from './SymbolPerformancePage';
import {
  deleteAgent,
  disableAgent,
  enableAgent,
  getAgent,
  listAgents,
  listAgentRuns,
  listAgentEpisodeOptions,
  publishAgent,
  runAgentNow,
  type AgentDetail,
  type AgentSummary,
  type EpisodeOptionDto,
  type ForcedEpisodeSelection,
  type RunDetailDto
} from '../api/agents';
import { getLatestAgentPrompt, listAgentReports, type PromptVersionDto, type RunReportDto } from '../api/agents';
import { grantAgentAccess, listAgentAccessGrants } from '../api/access';
import {
  cloneMarketplaceAgent,
  cloneMarketplacePlaybook,
  cloneMarketplaceSource,
  listMarketplaceAgents,
  listMarketplacePlaybooks,
  listMarketplaceSources,
  type MarketplaceAgentListItem,
  type MarketplacePlaybookListItem,
  type MarketplaceSourceListItem
} from '../api/marketplace';
import {
  createPlaybook,
  deletePlaybook,
  listPlaybooks,
  publishPlaybook,
  sharePlaybook,
  updatePlaybook,
  type PlaybookRecord
} from '../api/playbooks';
import {
  createSource,
  deleteSource,
  listSources,
  probeSource,
  publishSource,
  shareSource,
  updateSource,
  type SourceRecord,
  type SourceType
} from '../api/sources';
import { useAuth } from '../auth/AuthContext';
import { EntityActions } from '../components/EntityActions';
import { getPromptCharacter, getPromptCharactersForPersona, getPromptPersona } from '../data/prompt-personas';

const { Header, Content } = Layout;
const { Title, Text, Paragraph } = Typography;

// How often to poll for run/report updates while an agent's detail view is open - frequent
// enough that pending/running runs (from the scheduler or a manual trigger) and newly-completed
// reports show up promptly without a manual page refresh, without hammering the API.
const RUNS_POLL_INTERVAL_MS = 4000;

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TIMEZONE_OPTIONS = [
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin' },
  { value: 'Europe/London', label: 'Europe/London' },
  { value: 'America/New_York', label: 'America/New_York' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo' }
];
type HubKey = 'sources' | 'agents' | 'playbooks';
type ProbeKind = 'feed' | 'listing_page' | 'single_page' | 'unknown';

interface AutoDetectedSource {
  type: SourceType;
  url: string;
  kind: ProbeKind;
  title?: string;
  coverImageUrl?: string;
  itemCount?: number;
  previewItems: Array<{ title: string; link: string | null; pubDate: string | null }>;
}

const GHOST_CREATE_CARD_CLASS =
  'group flex min-h-[170px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-sky-300 bg-gradient-to-br from-sky-50 via-white to-blue-50 p-4 text-center text-sky-800 shadow-sm transition hover:border-sky-500 hover:shadow-md hover:from-sky-100 hover:to-blue-100 dark:border-sky-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 dark:text-sky-100 dark:hover:border-sky-600 dark:hover:from-slate-800 dark:hover:to-slate-700';

function WizardSelectableCard({
  ariaLabel,
  selected,
  onClick,
  children
}: {
  ariaLabel: string;
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={selected}
      onClick={onClick}
      className="block h-full w-full text-left"
    >
      <Card
        size="small"
        hoverable
        className={`h-full min-h-[170px] transition-shadow ${selected ? 'ring-2 ring-sky-500 dark:ring-sky-400' : ''}`}
        style={{ cursor: 'pointer' }}
      >
        {children}
      </Card>
    </button>
  );
}

function detectSourceTypeCandidates(url: string): SourceType[] {
  const lower = url.toLowerCase();
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) {
    return ['youtube_videos', 'podcast_feeds', 'web_urls'];
  }
  if (lower.endsWith('.xml') || lower.includes('/feed') || lower.includes('rss')) {
    return ['podcast_feeds', 'web_urls', 'youtube_videos'];
  }
  return ['web_urls', 'podcast_feeds', 'youtube_videos'];
}

function probeRankScore(probe: { reachable: boolean; kind: ProbeKind; confidence?: number }, type: SourceType): number {
  let score = probe.reachable ? 100 : 0;
  if (probe.kind === 'feed') score += 30;
  if (probe.kind === 'listing_page') score += 20;
  if (probe.kind === 'single_page') score += 10;
  if (typeof probe.confidence === 'number') score += Math.round(probe.confidence * 10);
  if (type === 'podcast_feeds' && probe.kind === 'feed') score += 8;
  if (type === 'youtube_videos' && probe.kind !== 'unknown') score += 5;
  return score;
}

function extractYoutubeVideoId(url?: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.replace('/', '') || null;
    }
    if (parsed.hostname.includes('youtube.com')) {
      if (parsed.pathname === '/watch') {
        return parsed.searchParams.get('v');
      }
      if (parsed.pathname.startsWith('/shorts/')) {
        return parsed.pathname.split('/')[2] ?? null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function formatPlaybookSchedule(schedule: PlaybookRecord['schedule']): string {
  if (schedule.mode === 'interval') return `Every ${schedule.intervalMinutes} min`;
  if (schedule.mode === 'daily') return `Daily ${schedule.dailyTime} (${schedule.timezone})`;
  const days = schedule.daysOfWeek.map((d) => WEEKDAY_LABELS[d] ?? d).join(', ');
  return `Weekly ${schedule.dailyTime} on ${days} (${schedule.timezone})`;
}

function getCharacterIcon(characterType?: AgentSummary['characterType']) {
  switch (characterType) {
    case 'finance_expert':
      return <LineChartOutlined />;
    case 'teacher':
      return <ReadOutlined />;
    case 'trainer':
      return <ToolOutlined />;
    case 'philosopher':
      return <BulbOutlined />;
    case 'influencer':
      return <RocketOutlined />;
    case 'summarizer':
    default:
      return <FileTextOutlined />;
  }
}

function humanizeCharacterType(characterType?: AgentSummary['characterType']): string {
  if (!characterType) return 'Summarizer';
  return characterType
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function getAgentCharacterLabel(agent: AgentSummary): string {
  return getPromptPersona(agent.characterType ?? 'summarizer')?.name ?? humanizeCharacterType(agent.characterType);
}

function getAgentPersonalityLabel(agent: AgentSummary): string {
  const personaId = agent.characterType ?? 'summarizer';
  const personalityId = agent.promptConfig?.personality_id;
  if (personalityId) {
    const mapped = getPromptCharacter(personaId, personalityId);
    if (mapped) return mapped.name;
  }
  if (agent.promptConfig?.personality_label?.trim()) {
    return agent.promptConfig.personality_label;
  }
  const defaultCharacter = getPromptCharactersForPersona(personaId)[0];
  return defaultCharacter?.name ?? 'Default Personality';
}

/** Only podcast/YouTube sources have "episodes" to pick from - web_urls sources (single/listing
 * pages) keep the old "run now = crawl immediately" behavior with no picker. */
function hasEpisodicSource(agent: AgentSummary): boolean {
  return agent.sources.some((source) => source.type === 'podcast_feeds' || source.type === 'youtube_videos');
}

export function AgentsPage() {
  const { user, isAdmin, logout } = useAuth();
  const [showAdminUsers, setShowAdminUsers] = useState(false);
  const [viewingSymbol, setViewingSymbol] = useState<string | null>(null);
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);
  const [editingAgent, setEditingAgent] = useState<{ detail: AgentDetail; prompt: PromptVersionDto | null } | null>(
    null
  );
  const [isLoadingEditTarget, setIsLoadingEditTarget] = useState(false);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [agentsSearch, setAgentsSearch] = useState('');
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [reports, setReports] = useState<RunReportDto[]>([]);
  const [runs, setRuns] = useState<RunDetailDto[]>([]);
  const [prompt, setPrompt] = useState<PromptVersionDto | null>(null);
  const [togglingAgentId, setTogglingAgentId] = useState<string | null>(null);
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);
  const [runningAgentId, setRunningAgentId] = useState<string | null>(null);
  const [episodePickerAgent, setEpisodePickerAgent] = useState<AgentSummary | null>(null);
  const [episodeOptions, setEpisodeOptions] = useState<EpisodeOptionDto[]>([]);
  const [loadingEpisodeOptions, setLoadingEpisodeOptions] = useState(false);
  const [activePlaybookTab, setActivePlaybookTab] = useState('reports');
  const [highlightedReportId, setHighlightedReportId] = useState<string | null>(null);
  const [hasAppliedSymbolDeepLink, setHasAppliedSymbolDeepLink] = useState(false);
  const [activeHub, setActiveHub] = useState<HubKey>('sources');
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [sourcesLoadState, setSourcesLoadState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [sourcesSearch, setSourcesSearch] = useState('');
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null);
  const [isSourceCreateOpen, setIsSourceCreateOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<SourceRecord | null>(null);
  const [sourceUrlDraft, setSourceUrlDraft] = useState('');
  const [isSourceDetecting, setIsSourceDetecting] = useState(false);
  const [isSourceSaving, setIsSourceSaving] = useState(false);
  const [autoDetectedSource, setAutoDetectedSource] = useState<AutoDetectedSource | null>(null);
  const [playbooks, setPlaybooks] = useState<PlaybookRecord[]>([]);
  const [playbooksLoadState, setPlaybooksLoadState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [playbooksSearch, setPlaybooksSearch] = useState('');
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string | null>(null);
  const [isPlaybookCreateOpen, setIsPlaybookCreateOpen] = useState(false);
  const [playbookCreateStep, setPlaybookCreateStep] = useState(0);
  const [isPlaybookSaving, setIsPlaybookSaving] = useState(false);
  const [playbookAgentIdDraft, setPlaybookAgentIdDraft] = useState<string | null>(null);
  const [playbookSourceIdsDraft, setPlaybookSourceIdsDraft] = useState<string[]>([]);
  const [playbookScheduleModeDraft, setPlaybookScheduleModeDraft] = useState<'interval' | 'daily' | 'weekly'>('daily');
  const [playbookIntervalMinutesDraft, setPlaybookIntervalMinutesDraft] = useState(60);
  const [playbookDailyTimeDraft, setPlaybookDailyTimeDraft] = useState('07:30');
  const [playbookTimezoneDraft, setPlaybookTimezoneDraft] = useState('UTC');
  const [playbookDaysOfWeekDraft, setPlaybookDaysOfWeekDraft] = useState<number[]>([1]);
  const [playbookRecipientsDraft, setPlaybookRecipientsDraft] = useState<string[]>([]);
  const [showSourcesMarketplace, setShowSourcesMarketplace] = useState(false);
  const [showPlaybooksMarketplace, setShowPlaybooksMarketplace] = useState(false);
  const [showAgentsMarketplace, setShowAgentsMarketplace] = useState(false);
  const [marketplaceAgents, setMarketplaceAgents] = useState<MarketplaceAgentListItem[]>([]);
  const [marketplaceSources, setMarketplaceSources] = useState<MarketplaceSourceListItem[]>([]);
  const [marketplacePlaybooks, setMarketplacePlaybooks] = useState<MarketplacePlaybookListItem[]>([]);
  const [cloningPublicationId, setCloningPublicationId] = useState<string | null>(null);
  const [marketplaceAgentCount, setMarketplaceAgentCount] = useState(0);
  const [marketplaceSourceCount, setMarketplaceSourceCount] = useState(0);
  const [marketplacePlaybookCount, setMarketplacePlaybookCount] = useState(0);
  const [accessGrantCount, setAccessGrantCount] = useState(0);

  function isSignInRequiredError(error: unknown): boolean {
    return error instanceof Error && /sign in required|unauthenticated/i.test(error.message);
  }

  async function refreshSources() {
    try {
      setSourcesLoadState('loading');
      const response = await listSources();
      setSources(response);
      setSourcesLoadState('idle');
    } catch (error) {
      if (isSignInRequiredError(error)) {
        await logout();
        return;
      }
      setSourcesLoadState('error');
    }
  }

  async function refreshPlaybooks() {
    try {
      setPlaybooksLoadState('loading');
      const response = await listPlaybooks();
      setPlaybooks(response);
      setPlaybooksLoadState('idle');
    } catch (error) {
      if (isSignInRequiredError(error)) {
        await logout();
        return;
      }
      setPlaybooksLoadState('error');
    }
  }

  async function refreshMarketplaceCounts() {
    try {
      const [sourceItems, playbookItems, agentItems] = await Promise.all([
        listMarketplaceSources().catch(() => []),
        listMarketplacePlaybooks().catch(() => []),
        listMarketplaceAgents().catch(() => [])
      ]);
      setMarketplaceAgentCount(agentItems.length);
      setMarketplaceSourceCount(sourceItems.length);
      setMarketplacePlaybookCount(playbookItems.length);
      setMarketplaceAgents(agentItems);
      setMarketplaceSources(sourceItems);
      setMarketplacePlaybooks(playbookItems);
    } catch {
      setMarketplaceAgentCount(0);
      setMarketplaceSourceCount(0);
      setMarketplacePlaybookCount(0);
    }
  }


  async function refreshAgents() {
    try {
      setLoadState('loading');
      const response = await listAgents();
      setAgents(response);
      setLoadState('idle');
    } catch (error) {
      if (isSignInRequiredError(error)) {
        await logout();
        return;
      }
      setLoadState('error');
    }
  }

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        setLoadState('loading');
        const response = await listAgents();
        if (!alive) return;
        setAgents(response);
        setLoadState('idle');
      } catch {
        if (!alive) return;
        setLoadState('error');
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    async function loadHubData() {
      try {
        setSourcesLoadState('loading');
        setPlaybooksLoadState('loading');
        const [sourcesResult, playbooksResult] = await Promise.allSettled([
          listSources(),
          listPlaybooks()
        ]);
        const [marketplaceSources, marketplacePlaybooks, marketplaceAgents] = await Promise.all([
          listMarketplaceSources().catch(() => []),
          listMarketplacePlaybooks().catch(() => []),
          listMarketplaceAgents().catch(() => [])
        ]);
        if (!alive) return;
        if (sourcesResult.status === 'fulfilled') {
          setSources(sourcesResult.value);
          setSourcesLoadState('idle');
        } else {
          if (isSignInRequiredError(sourcesResult.reason)) {
            await logout();
            return;
          }
          setSourcesLoadState('error');
        }

        if (playbooksResult.status === 'fulfilled') {
          setPlaybooks(playbooksResult.value);
          setPlaybooksLoadState('idle');
        } else {
          if (isSignInRequiredError(playbooksResult.reason)) {
            await logout();
            return;
          }
          setPlaybooksLoadState('error');
        }

        setMarketplaceAgentCount(marketplaceAgents.length);
        setMarketplaceSourceCount(marketplaceSources.length);
        setMarketplacePlaybookCount(marketplacePlaybooks.length);
        setMarketplaceAgents(marketplaceAgents);
      } catch (error) {
        if (!alive) return;
        if (isSignInRequiredError(error)) {
          await logout();
          return;
        }
        setSourcesLoadState('error');
        setPlaybooksLoadState('error');
      }
    }

    loadHubData();
    return () => {
      alive = false;
    };
  }, []);

  // Applies a symbol deep link from a report notification email (?agentId=&symbol=), which opens
  // straight into that agent's SymbolPerformancePage. Runs once agents have loaded (so we can
  // confirm the linked agent actually exists) and only once, then strips the query params from
  // the URL so refreshing/navigating afterwards doesn't repeatedly re-trigger it.
  useEffect(() => {
    if (hasAppliedSymbolDeepLink) return;
    if (agents.length === 0) return;

    const params = new URLSearchParams(window.location.search);
    const linkedAgentId = params.get('agentId');
    const linkedSymbol = params.get('symbol');
    if (linkedAgentId && linkedSymbol && agents.some((agent) => agent.id === linkedAgentId)) {
      setSelectedAgentId(linkedAgentId);
      setViewingSymbol(linkedSymbol);
    }
    setHasAppliedSymbolDeepLink(true);
    window.history.replaceState({}, '', window.location.pathname);
  }, [agents, hasAppliedSymbolDeepLink]);

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

  const selectedPlaybook = playbooks.find((playbook) => playbook.id === selectedPlaybookId) ?? null;
  const executionAgentId = selectedPlaybook?.agentId ?? null;

  useEffect(() => {
    if (!executionAgentId) return;
    let alive = true;

    async function refreshPlaybookExecution() {
      const [agentReports, agentRuns] = await Promise.all([listAgentReports(executionAgentId), listAgentRuns(executionAgentId)]);
      if (!alive) return;
      setReports(agentReports);
      setRuns(agentRuns);
    }

    refreshPlaybookExecution();
    const intervalId = setInterval(refreshPlaybookExecution, RUNS_POLL_INTERVAL_MS);
    return () => {
      alive = false;
      clearInterval(intervalId);
    };
  }, [executionAgentId]);

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
    try {
      const result = await runAgentNow(agent.id, forcedEpisode);
      if (result.status === 'failed') {
        message.error(`Run failed${result.errorCode ? `: ${result.errorCode}` : ''}`);
      } else if (result.status === 'no_run_claimed') {
        message.info('Another run is already in progress');
      } else {
        message.success('Agent run completed');
      }
      if (executionAgentId === agent.id) {
        const [agentReports] = await Promise.all([listAgentReports(agent.id)]);
        setReports(agentReports);
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
    } finally {
      setDeletingAgentId(null);
    }
  }

  async function onEditAgent(agent: AgentSummary, event?: React.MouseEvent) {
    event?.stopPropagation();
    setIsLoadingEditTarget(true);
    try {
      const [detail, latestPrompt] = await Promise.all([getAgent(agent.id), getLatestAgentPrompt(agent.id)]);
      setEditingAgent({ detail, prompt: latestPrompt });
      setIsCreatingAgent(false);
    } finally {
      setIsLoadingEditTarget(false);
    }
  }

  function openPlaybookCreate() {
    setPlaybookCreateStep(0);
    setPlaybookAgentIdDraft(agents[0]?.id ?? null);
    setPlaybookSourceIdsDraft(sources[0] ? [sources[0].id] : []);
    setPlaybookScheduleModeDraft('daily');
    setPlaybookIntervalMinutesDraft(60);
    setPlaybookDailyTimeDraft('07:30');
    setPlaybookTimezoneDraft('UTC');
    setPlaybookDaysOfWeekDraft([1]);
    setPlaybookRecipientsDraft([]);
    setIsPlaybookCreateOpen(true);
  }

  function onCancelPlaybookCreate() {
    setIsPlaybookCreateOpen(false);
    setPlaybookCreateStep(0);
  }

  function derivePlaybookName(agentId: string, sourceIds: string[]): string {
    const agentName = agents.find((agent) => agent.id === agentId)?.name ?? 'Agent';
    const primarySourceId = sourceIds[0];
    const primarySource = sources.find((source) => source.id === primarySourceId);
    const sourceTitle = primarySource?.metadata.title ?? primarySource?.value ?? 'Source';
    return `${agentName} · ${sourceTitle}`;
  }

  function onNextPlaybookCreateStep() {
    if (playbookCreateStep === 0 && playbookSourceIdsDraft.length === 0) {
      message.warning('Pick a source first');
      return;
    }
    if (playbookCreateStep === 1 && !playbookAgentIdDraft) {
      message.warning('Pick an agent first');
      return;
    }
    setPlaybookCreateStep((current) => Math.min(current + 1, 2));
  }

  function onBackPlaybookCreateStep() {
    setPlaybookCreateStep((current) => Math.max(current - 1, 0));
  }

  async function onCreatePlaybook() {
    if (!playbookAgentIdDraft) {
      message.warning('Pick an agent first');
      return;
    }
    if (playbookSourceIdsDraft.length === 0) {
      message.warning('Pick a source first');
      return;
    }
    setIsPlaybookSaving(true);
    try {
      const schedule =
        playbookScheduleModeDraft === 'interval'
          ? { mode: 'interval' as const, intervalMinutes: playbookIntervalMinutesDraft }
          : playbookScheduleModeDraft === 'weekly'
            ? {
                mode: 'weekly' as const,
                daysOfWeek: playbookDaysOfWeekDraft,
                dailyTime: playbookDailyTimeDraft,
                timezone: playbookTimezoneDraft
              }
            : { mode: 'daily' as const, dailyTime: playbookDailyTimeDraft, timezone: playbookTimezoneDraft };
      await createPlaybook({
        agentId: playbookAgentIdDraft,
        name: derivePlaybookName(playbookAgentIdDraft, playbookSourceIdsDraft),
        sourceIds: playbookSourceIdsDraft,
        recipients: playbookRecipientsDraft.map((value) => value.trim()).filter(Boolean),
        schedule,
        executionMode: 'latest_only'
      });
      await refreshPlaybooks();
      message.success('Playbook created');
      setIsPlaybookCreateOpen(false);
      setPlaybookCreateStep(0);
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
        pubDate: item.pubDate ?? null
      }))
    });
    setIsSourceCreateOpen(true);
  }

  async function onDeleteSource(source: SourceRecord) {
    try {
      await deleteSource(source.id);
      await refreshSources();
      message.success('Source removed');
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to remove source');
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

  async function onTogglePlaybookEnabled(playbook: PlaybookRecord, event: React.MouseEvent) {
    event.stopPropagation();
    try {
      await updatePlaybook(playbook.id, { enabled: !playbook.enabled });
      await refreshPlaybooks();
      message.success(playbook.enabled ? 'Playbook paused' : 'Playbook resumed');
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to update playbook status');
    }
  }

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? null;
  const executionAgent = executionAgentId ? agents.find((agent) => agent.id === executionAgentId) ?? null : null;
  const normalizedSourceSearch = sourcesSearch.trim().toLowerCase();
  const normalizedAgentsSearch = agentsSearch.trim().toLowerCase();
  const normalizedPlaybooksSearch = playbooksSearch.trim().toLowerCase();
  const filteredSources = sources.filter((source) => {
    if (!normalizedSourceSearch) return true;
    const scannedTitle = source.metadata.title ?? '';
    const preview = source.metadata.previewItems.map((item) => item.title).join(' ');
    return `${scannedTitle} ${source.value} ${preview}`.toLowerCase().includes(normalizedSourceSearch);
  });
  const filteredAgents = agents.filter((agent) => {
    if (!normalizedAgentsSearch) return true;
    const sourceValues = agent.sources.map((source) => source.value).join(' ');
    return `${agent.name} ${sourceValues}`.toLowerCase().includes(normalizedAgentsSearch);
  });
  const filteredPlaybooks = playbooks.filter((playbook) => {
    if (!normalizedPlaybooksSearch) return true;
    return `${playbook.name} ${playbook.description} ${playbook.sourceIds.join(' ')}`.toLowerCase().includes(normalizedPlaybooksSearch);
  });

  function getSourceDisplayTitle(source: SourceRecord): string {
    if (source.metadata.title?.trim()) return source.metadata.title;
    try {
      const url = new URL(source.value);
      return url.hostname;
    } catch {
      return source.value;
    }
  }

  function getSourceCoverImageUrl(source: SourceRecord): string | null {
    if (source.metadata.coverImageUrl) return source.metadata.coverImageUrl;
    if (source.type !== 'youtube_videos') return null;
    const firstPreviewVideoId = extractYoutubeVideoId(source.metadata.previewItems[0]?.link);
    if (firstPreviewVideoId) return `https://i.ytimg.com/vi/${firstPreviewVideoId}/hqdefault.jpg`;
    return null;
  }

  function getSourceKindLabel(source: SourceRecord): string {
    if (source.type === 'youtube_videos' || source.type === 'podcast_feeds') return 'Playlist';
    return 'Page';
  }

  function getSourceEpisodeCount(source: SourceRecord): number {
    return source.metadata.itemCount ?? source.metadata.previewItems.length;
  }

  async function onDetectSourceFromUrl() {
    const value = sourceUrlDraft.trim();
    if (!value) {
      message.warning('Enter a URL first');
      return;
    }
    try {
      new URL(value);
    } catch {
      message.error('Please enter a valid URL');
      return;
    }

    setIsSourceDetecting(true);
    setAutoDetectedSource(null);
    try {
      const candidates = detectSourceTypeCandidates(value);
      let best: AutoDetectedSource | null = null;
      let bestScore = -1;
      let index = 0;
      for (const candidate of candidates) {
        try {
          const probe = await probeSource({ type: candidate, value, maxItems: 5 });
          const score = probeRankScore(probe as { reachable: boolean; kind: ProbeKind; confidence?: number }, candidate);
          if (score > bestScore) {
            bestScore = score;
            best = {
              type: candidate,
              url: value,
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

      if (!best) {
        message.error('Could not detect this source yet. Please try another URL.');
        return;
      }

      setAutoDetectedSource(best);
    } finally {
      setIsSourceDetecting(false);
    }
  }

  function closeSourceDialog() {
    setIsSourceCreateOpen(false);
    setEditingSource(null);
    setAutoDetectedSource(null);
    setSourceUrlDraft('');
  }

  async function onCreateDetectedSource() {
    if (!autoDetectedSource) {
      message.warning('Detect a source first');
      return;
    }
    setIsSourceSaving(true);
    try {
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
              pubDate: item.pubDate
            }))
          }
        });
      } else {
        await createSource({
          type: autoDetectedSource.type,
          value: autoDetectedSource.url,
          metadata: {
            title: autoDetectedSource.title,
            coverImageUrl: autoDetectedSource.coverImageUrl ?? null,
            itemCount: autoDetectedSource.itemCount,
            previewItems: autoDetectedSource.previewItems.map((item) => ({
              title: item.title,
              link: item.link ?? undefined,
              pubDate: item.pubDate
            }))
          }
        });
      }
      await refreshSources();
      message.success(editingSource ? 'Source updated' : 'Source created');
      closeSourceDialog();
    } catch (err) {
      message.error(err instanceof Error ? err.message : editingSource ? 'Failed to update source' : 'Failed to create source');
    } finally {
      setIsSourceSaving(false);
    }
  }

  // Resets every overlay/detail view back to the plain agent-list dashboard - used by the
  // clickable app-name header so it works as a "home" link from anywhere (agent detail, wizard,
  // symbol performance page, admin users page).
  function goToDashboard() {
    setSelectedAgentId(null);
    setViewingSymbol(null);
    setIsCreatingAgent(false);
    setEditingAgent(null);
    setShowAdminUsers(false);
    setActiveHub('sources');
    setSelectedPlaybookId(null);
  }

  return (
    <Layout style={{ minHeight: '100vh', background: 'transparent' }}>
      <Header style={{ background: 'transparent', height: 'auto', padding: '24px 24px 0' }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div style={{ minWidth: 0 }}>
            <Title
              level={2}
              onClick={goToDashboard}
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') goToDashboard();
              }}
              style={{
                margin: 0,
                whiteSpace: 'nowrap',
                wordBreak: 'keep-all',
                overflowWrap: 'normal',
                fontSize: 'clamp(1.25rem, 5vw, 1.875rem)',
                cursor: 'pointer'
              }}
            >
              ChatTrader
            </Title>
            <Text type="secondary">Your Dashboard</Text>
          </div>
          <div className="flex items-center gap-2">
            {user ? (
              <Text type="secondary" style={{ marginRight: 4 }}>
                {user.displayName ?? user.email}
              </Text>
            ) : null}
            {isAdmin ? (
              <TouchSafeTooltip title="Manage users">
                <Button
                  icon={<TeamOutlined />}
                  onClick={() => setShowAdminUsers(true)}
                  aria-label="Manage users"
                />
              </TouchSafeTooltip>
            ) : null}
            <ThemePicker />
            <TouchSafeTooltip title="Log out">
              <Button icon={<LogoutOutlined />} onClick={() => logout()} aria-label="Log out" />
            </TouchSafeTooltip>
          </div>
        </div>
      </Header>
      <Content style={{ padding: 24 }}>
        {showAdminUsers ? (
          <AdminUsersPage onBack={() => setShowAdminUsers(false)} />
        ) : viewingSymbol && (selectedAgent || executionAgentId) ? (
          <SymbolPerformancePage
            agentId={selectedAgent?.id ?? executionAgentId!}
            symbol={viewingSymbol}
            onBack={() => setViewingSymbol(null)}
          />
        ) : (
        <div className="mx-auto max-w-6xl space-y-4">
          <Paragraph type="secondary">
            Manage your personal source library, agents, and playbooks from one dashboard.
          </Paragraph>
          <Tabs
            activeKey={activeHub}
            onChange={(key) => setActiveHub(key as HubKey)}
            items={[
              {
                key: 'sources',
                label: 'Library',
                children: (
                  <Card className="min-w-0" title={<Title level={4} style={{ margin: 0 }}>Library</Title>}>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                      <Input
                        aria-label="Search sources"
                        value={sourcesSearch}
                        onChange={(event) => setSourcesSearch(event.currentTarget.value)}
                        placeholder="Search title, URL, or preview episode"
                        prefix={<SearchOutlined />}
                        style={{ maxWidth: 420 }}
                      />
                      <Badge count={marketplaceSourceCount} size="small">
                        <Button
                          aria-label="Browse marketplace sources"
                          icon={<CompassOutlined />}
                          onClick={async () => {
                            await refreshMarketplaceCounts();
                            setShowSourcesMarketplace(true);
                          }}
                        >
                          Browse marketplace
                        </Button>
                      </Badge>
                    </div>
                    {sourcesLoadState === 'loading' ? <p className="text-sm text-gray-700">Loading sources...</p> : null}
                    {sourcesLoadState === 'error' ? <p className="text-sm text-red-700">Failed to load sources.</p> : null}
                    <div className="grid gap-3 sm:grid-cols-2">
                      {filteredSources.map((source) => (
                        <Card
                          key={source.id}
                          size="small"
                          hoverable
                          onClick={() => setExpandedSourceId((current) => (current === source.id ? null : source.id))}
                          style={{ cursor: 'pointer' }}
                          className="min-h-[170px] transition-shadow"
                          extra={
                            <div onClick={(event) => event.stopPropagation()}>
                              <EntityActions
                                entityLabel="source"
                                isOwner={source.ownerUserId === user?.id}
                                onEdit={() => onEditSource(source)}
                                onDelete={() => onDeleteSource(source)}
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
                            </div>
                          }
                        >
                          <div className="grid grid-cols-[56px_1fr] gap-3">
                            {getSourceCoverImageUrl(source) ? (
                              <img
                                src={getSourceCoverImageUrl(source)!}
                                alt={`${getSourceDisplayTitle(source)} cover`}
                                className="h-14 w-14 rounded-md object-cover"
                              />
                            ) : (
                              <div className="flex h-14 w-14 items-center justify-center rounded-md border border-dashed text-[10px] text-gray-500">
                                Cover unavailable
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="text-sm font-semibold">{getSourceDisplayTitle(source)}</div>
                              <Text type="secondary" className="text-xs">{source.value}</Text>
                              <div className="mt-1 flex flex-wrap gap-1 text-xs">
                                <Tag>{source.type === 'podcast_feeds' ? 'Podcast' : source.type === 'youtube_videos' ? 'YouTube' : 'Web'}</Tag>
                                <Tag>{getSourceKindLabel(source)}</Tag>
                                {(source.type === 'podcast_feeds' || source.type === 'youtube_videos') ? (
                                  <Tag color="blue">Episodes: {getSourceEpisodeCount(source)}</Tag>
                                ) : null}
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 text-xs text-gray-700">
                            {source.metadata.previewItems.length > 0 ? (
                              <>
                                <div className="mb-1 font-medium">
                                  {expandedSourceId === source.id ? 'Episodes preview' : 'Recent episodes preview'}
                                </div>
                                <ul className="list-inside list-disc space-y-1">
                                  {(expandedSourceId === source.id
                                    ? source.metadata.previewItems
                                    : source.metadata.previewItems.slice(0, 3)
                                  ).map((item) => (
                                    <li key={`${source.id}:${item.link ?? item.title}`}>{item.title}</li>
                                  ))}
                                </ul>
                              </>
                            ) : (
                              'No scanned episodes/items yet'
                            )}
                          </div>
                        </Card>
                      ))}
                      <button
                        type="button"
                        aria-label="Create new source"
                        onClick={() => {
                          setEditingSource(null);
                          setIsSourceCreateOpen(true);
                          setSourceUrlDraft('');
                          setAutoDetectedSource(null);
                        }}
                        className={GHOST_CREATE_CARD_CLASS}
                      >
                        <DatabaseOutlined className="text-3xl text-sky-700" />
                        <span className="mt-2 text-base font-semibold">Create new source</span>
                        <span className="mt-1 text-xs font-normal text-sky-700">URL detect + metadata preview</span>
                      </button>
                    </div>
                    <Modal
                      title={editingSource ? 'Edit source from URL' : 'Create source from URL'}
                      open={isSourceCreateOpen}
                      onCancel={closeSourceDialog}
                      onOk={onCreateDetectedSource}
                      okText={editingSource ? 'Save source' : 'Add source'}
                      okButtonProps={{ disabled: !autoDetectedSource, loading: isSourceSaving }}
                      destroyOnHidden
                    >
                      <div className="space-y-3">
                        <Input
                          aria-label="Source URL"
                          value={sourceUrlDraft}
                          placeholder="https://..."
                          onChange={(event) => setSourceUrlDraft(event.currentTarget.value)}
                        />
                        <Button onClick={onDetectSourceFromUrl} loading={isSourceDetecting}>
                          Detect source
                        </Button>
                        {autoDetectedSource ? (
                          <Card size="small" title={autoDetectedSource.title ?? autoDetectedSource.url}>
                            <div className="mb-2 flex items-center gap-2">
                              <Tag>
                                {autoDetectedSource.type === 'podcast_feeds'
                                  ? 'Podcast feed'
                                  : autoDetectedSource.type === 'youtube_videos'
                                    ? 'YouTube'
                                    : 'Web'}
                              </Tag>
                              <Tag>{autoDetectedSource.kind}</Tag>
                            </div>
                            {autoDetectedSource.coverImageUrl ? (
                              <img
                                src={autoDetectedSource.coverImageUrl}
                                alt="Detected cover"
                                className="mb-2 h-20 w-20 rounded-md object-cover"
                              />
                            ) : (
                              <div className="mb-2 inline-flex rounded border border-dashed px-2 py-1 text-xs text-gray-500">
                                No cover detected
                              </div>
                            )}
                            <div className="text-xs text-gray-700">
                              {autoDetectedSource.previewItems.length > 0 ? (
                                autoDetectedSource.previewItems.map((item) => <div key={item.link ?? item.title}>{item.title}</div>)
                              ) : (
                                <div>No episodes/items preview available</div>
                              )}
                            </div>
                          </Card>
                        ) : null}
                      </div>
                    </Modal>
                    <Modal
                      title="Marketplace sources"
                      open={showSourcesMarketplace}
                      onCancel={() => setShowSourcesMarketplace(false)}
                      footer={null}
                      destroyOnHidden
                    >
                      <div className="space-y-2">
                        {marketplaceSources.length === 0 ? <Empty description="No marketplace sources available." /> : null}
                        {marketplaceSources.map((item) => (
                          <Card key={item.publicationId} size="small">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold">{item.title}</div>
                                <div className="truncate text-xs text-gray-600">{item.summary || item.value}</div>
                              </div>
                              <Button
                                size="small"
                                loading={cloningPublicationId === item.publicationId}
                                onClick={() => onCloneMarketplaceSource(item.publicationId)}
                              >
                                Clone
                              </Button>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </Modal>
                  </Card>
                )
              },
              {
                key: 'agents',
                label: 'Agents',
                children: (
                  <div
                    className={
                      isCreatingAgent || editingAgent || selectedAgent
                        ? 'grid min-w-0 gap-4 lg:grid-cols-[2fr_1fr]'
                        : 'min-w-0'
                    }
                  >
                    {isCreatingAgent ? (
                      <AgentForm
                        onCancel={() => setIsCreatingAgent(false)}
                        onComplete={() => {
                          setIsCreatingAgent(false);
                          refreshAgents();
                        }}
                      />
                    ) : editingAgent ? (
                      <AgentForm
                        key={editingAgent.detail.id}
                        agent={editingAgent.detail}
                        initialPrompt={
                          editingAgent.prompt
                            ? { model: editingAgent.prompt.model, systemPrompt: editingAgent.prompt.systemPrompt }
                            : null
                        }
                        onCancel={() => setEditingAgent(null)}
                        onComplete={() => {
                          setEditingAgent(null);
                          refreshAgents();
                        }}
                      />
                    ) : selectedAgent ? (
                      <Card
                        className="min-w-0"
                        title={
                          <span className="flex items-center gap-2">
                            <Badge
                              status={selectedAgent.status === 'disabled' ? 'default' : 'success'}
                              text={selectedAgent.name}
                            />
                            <Tag>Access grants: {accessGrantCount}</Tag>
                          </span>
                        }
                        extra={
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <TouchSafeTooltip title="Back to dashboard">
                              <Button
                                aria-label="Back to dashboard"
                                shape="circle"
                                icon={<ArrowLeftOutlined />}
                                onClick={() => setSelectedAgentId(null)}
                              />
                            </TouchSafeTooltip>
                            <TouchSafeTooltip title="Edit agent">
                              <Button
                                aria-label="Edit agent"
                                shape="circle"
                                loading={isLoadingEditTarget}
                                icon={<EditOutlined />}
                                onClick={(event) => onEditAgent(selectedAgent, event)}
                              />
                            </TouchSafeTooltip>
                            <TouchSafeTooltip title={selectedAgent.status === 'disabled' ? 'Resume agent' : 'Pause agent'}>
                              <Button
                                aria-label={selectedAgent.status === 'disabled' ? 'Resume agent' : 'Pause agent'}
                                shape="circle"
                                loading={togglingAgentId === selectedAgent.id}
                                icon={
                                  selectedAgent.status === 'disabled' ? (
                                    <PlayCircleOutlined />
                                  ) : (
                                    <PauseCircleOutlined />
                                  )
                                }
                                onClick={(event) => onTogglePause(selectedAgent, event)}
                              />
                            </TouchSafeTooltip>
                            <Popconfirm
                              title="Remove this agent?"
                              description="This permanently deletes the agent, its schedule, prompts, and reports."
                              okText="Remove"
                              okButtonProps={{ danger: true }}
                              onConfirm={() => onDeleteAgent(selectedAgent)}
                            >
                              <TouchSafeTooltip title="Remove agent">
                                <Button
                                  aria-label="Remove agent"
                                  shape="circle"
                                  danger
                                  loading={deletingAgentId === selectedAgent.id}
                                  icon={<DeleteOutlined />}
                                  onClick={(event) => event.stopPropagation()}
                                />
                              </TouchSafeTooltip>
                            </Popconfirm>
                          </div>
                        }
                      >
                        <Card size="small" title="System prompt">
                          <AgentPromptEditor
                            agentId={selectedAgent.id}
                            initialModel={prompt?.model}
                            initialSystemPrompt={prompt?.systemPrompt}
                            initialEnabled={prompt?.enabled ?? true}
                          />
                        </Card>
                      </Card>
                    ) : (
                      <Card
                        className="min-w-0"
                        title={<Title level={4} style={{ margin: 0 }}>Agents</Title>}
                      >
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <Input
                            aria-label="Search agents"
                            value={agentsSearch}
                            onChange={(event) => setAgentsSearch(event.currentTarget.value)}
                            placeholder="Search agents by name or source URL"
                            prefix={<SearchOutlined />}
                            style={{ maxWidth: 420 }}
                          />
                          <Badge count={marketplaceAgentCount} size="small">
                            <Button
                              aria-label="Browse marketplace agents"
                              icon={<CompassOutlined />}
                              onClick={async () => {
                                await refreshMarketplaceCounts();
                                setShowAgentsMarketplace(true);
                              }}
                            >
                              Browse marketplace
                            </Button>
                          </Badge>
                        </div>
                        {loadState === 'loading' ? <p className="text-sm text-gray-700">Loading agents...</p> : null}
                        {loadState === 'error' ? <p className="text-sm text-red-700">Failed to load agents.</p> : null}
                        <div className="grid gap-3 sm:grid-cols-2">
                          {filteredAgents.map((agent) => (
                            <Card
                              key={agent.id}
                              size="small"
                              hoverable
                              onClick={() => setSelectedAgentId(agent.id)}
                              style={{ cursor: 'pointer' }}
                              className="min-h-[170px] transition-shadow"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold">
                                    <Badge
                                      status={agent.status === 'disabled' ? 'default' : 'success'}
                                      text={agent.name}
                                    />
                                  </div>
                                  <div className="mt-1 flex flex-wrap gap-1 text-xs">
                                    <Tag icon={getCharacterIcon(agent.characterType)}>Character: {getAgentCharacterLabel(agent)}</Tag>
                                    <Tag>Personality: {getAgentPersonalityLabel(agent)}</Tag>
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                                  <EntityActions
                                    entityLabel="agent"
                                    isOwner={agent.ownerUserId === user?.id}
                                    onEdit={() => onEditAgent(agent)}
                                    onDelete={() => onDeleteAgent(agent)}
                                    onShare={(payload) =>
                                      grantAgentAccess(agent.id, {
                                        granteeUserId: payload.granteeUserId,
                                        permission: payload.permission as 'read' | 'edit' | 'delete'
                                      })
                                    }
                                    sharePermissions={['read', 'edit', 'delete']}
                                    onPublish={(payload) => publishAgent(agent.id, payload)}
                                    defaultPublishTitle={agent.name}
                                  />
                                </div>
                              </div>
                              <div className="mt-2 text-xs text-gray-600">
                                <div className="inline-flex items-center gap-1">
                                  <FileTextOutlined /> Persona + prompt ready
                                </div>
                              </div>
                            </Card>
                          ))}
                          <button
                            type="button"
                            aria-label="Create agent"
                            onClick={() => {
                              setIsCreatingAgent(true);
                              setEditingAgent(null);
                              setSelectedAgentId(null);
                            }}
                            className={`${GHOST_CREATE_CARD_CLASS} w-full`}
                          >
                            <AppstoreOutlined className="text-3xl text-sky-700" />
                            <span className="mt-2 text-base font-semibold">Create agent</span>
                            <span className="mt-1 text-xs font-normal text-sky-700">Character + personality setup</span>
                          </button>
                        </div>
                        <Modal
                          title="Marketplace agents"
                          open={showAgentsMarketplace}
                          onCancel={() => setShowAgentsMarketplace(false)}
                          footer={null}
                          destroyOnHidden
                        >
                          <div className="space-y-2">
                            {marketplaceAgents.length === 0 ? <Empty description="No marketplace agents available." /> : null}
                            {marketplaceAgents.map((item) => (
                              <Card key={item.publicationId} size="small">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold">{item.title}</div>
                                    <div className="truncate text-xs text-gray-600">{item.summary || item.agent.name}</div>
                                  </div>
                                  <Button
                                    size="small"
                                    loading={cloningPublicationId === item.publicationId}
                                    onClick={() => onCloneMarketplaceAgent(item.publicationId)}
                                  >
                                    Clone
                                  </Button>
                                </div>
                              </Card>
                            ))}
                          </div>
                        </Modal>
                      </Card>
                    )}
                  </div>
                )
              },
              {
                key: 'playbooks',
                label: 'Playbooks',
                children: (
                  <div className="grid min-w-0 gap-4 lg:grid-cols-[2fr_1fr]">
                  <Card className="min-w-0" title={<Title level={4} style={{ margin: 0 }}>Playbooks</Title>}>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <Input
                        aria-label="Search playbooks"
                        value={playbooksSearch}
                        onChange={(event) => setPlaybooksSearch(event.currentTarget.value)}
                        placeholder="Search playbooks by name or description"
                        prefix={<SearchOutlined />}
                        style={{ maxWidth: 420 }}
                      />
                      <Badge count={marketplacePlaybookCount} size="small">
                        <Button
                          aria-label="Browse marketplace playbooks"
                          icon={<CompassOutlined />}
                          onClick={async () => {
                            await refreshMarketplaceCounts();
                            setShowPlaybooksMarketplace(true);
                          }}
                        >
                          Browse marketplace
                        </Button>
                      </Badge>
                    </div>
                    {selectedPlaybook ? (
                      <Card
                        size="small"
                        title={selectedPlaybook.name}
                        extra={
                          <div className="flex items-center gap-2">
                            {executionAgent ? (
                              <TouchSafeTooltip title="Run playbook now">
                                <Button
                                  aria-label="Run playbook now"
                                  shape="circle"
                                  loading={runningAgentId === executionAgent.id}
                                  disabled={executionAgent.status === 'disabled'}
                                  icon={<CaretRightOutlined />}
                                  onClick={(event) => onRunNow(executionAgent, event)}
                                />
                              </TouchSafeTooltip>
                            ) : null}
                            <TouchSafeTooltip title="Back to playbooks">
                              <Button
                                aria-label="Back to playbooks"
                                shape="circle"
                                icon={<ArrowLeftOutlined />}
                                onClick={() => setSelectedPlaybookId(null)}
                              />
                            </TouchSafeTooltip>
                          </div>
                        }
                      >
                        <p className="mb-3 text-xs text-gray-600">
                          Sources: {selectedPlaybook.sourceIds.length} · Last run:{' '}
                          {selectedPlaybook.lastRunAt ? new Date(selectedPlaybook.lastRunAt).toLocaleString() : 'Never'} · Next run:{' '}
                          {new Date(selectedPlaybook.nextRunAt).toLocaleString()}
                        </p>
                        <Tabs
                          activeKey={activePlaybookTab}
                          onChange={setActivePlaybookTab}
                          items={[
                            {
                              key: 'reports',
                              label: 'Reports',
                              children: (
                                <AgentReportsBrowser
                                  agentId={selectedPlaybook.agentId}
                                  reports={reports}
                                  highlightedReportId={highlightedReportId}
                                  onSelectSymbol={setViewingSymbol}
                                />
                              )
                            },
                            {
                              key: 'runs',
                              label: 'Runs',
                              children: (
                                <AgentRunsBrowser agentId={selectedPlaybook.agentId} runs={runs} onViewReport={onViewReport} />
                              )
                            }
                          ]}
                        />
                      </Card>
                    ) : (
                      <>
                        {playbooksLoadState === 'loading' ? <p className="text-sm text-gray-700">Loading playbooks...</p> : null}
                        {playbooksLoadState === 'error' ? <p className="text-sm text-red-700">Failed to load playbooks.</p> : null}
                        <div className="grid gap-3 sm:grid-cols-2">
                          {filteredPlaybooks.map((playbook) => (
                            <Card
                              key={playbook.id}
                              size="small"
                              className="min-h-[170px] transition-shadow"
                              hoverable
                              style={{ cursor: 'pointer' }}
                              onClick={() => {
                                setSelectedPlaybookId(playbook.id);
                                setActivePlaybookTab('reports');
                              }}
                              extra={
                                <div onClick={(event) => event.stopPropagation()}>
                                  <EntityActions
                                    entityLabel="playbook"
                                    isOwner={playbook.ownerUserId === user?.id}
                                    onEdit={() => onEditPlaybook(playbook)}
                                    onDelete={() => onDeletePlaybook(playbook)}
                                    onShare={(payload) =>
                                      sharePlaybook(playbook.id, {
                                        granteeUserId: payload.granteeUserId,
                                        permission: payload.permission as 'read' | 'edit' | 'delete' | 'execute'
                                      })
                                    }
                                    sharePermissions={['read', 'edit', 'delete', 'execute']}
                                    onPublish={(payload) => publishPlaybook(playbook.id, payload)}
                                    defaultPublishTitle={playbook.name}
                                  />
                                  {playbook.ownerUserId === user?.id ? (
                                    <TouchSafeTooltip title={playbook.enabled ? 'Pause playbook' : 'Resume playbook'}>
                                      <Button
                                        aria-label={playbook.enabled ? 'Pause playbook' : 'Resume playbook'}
                                        shape="circle"
                                        icon={playbook.enabled ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                                        onClick={(event) => onTogglePlaybookEnabled(playbook, event)}
                                      />
                                    </TouchSafeTooltip>
                                  ) : null}
                                </div>
                              }
                            >
                              <div className="text-sm font-semibold">{playbook.name}</div>
                              <div className="mt-1 flex flex-wrap gap-1 text-xs">
                                {playbook.enabled ? <Tag color="success">Active</Tag> : <Tag color="default">Paused</Tag>}
                                <Tag>Sources: {playbook.sourceIds.length}</Tag>
                                <Tag>Recipients: {playbook.recipients.length}</Tag>
                                <Tag icon={<ClockCircleOutlined />}>Schedule: {formatPlaybookSchedule(playbook.schedule)}</Tag>
                              </div>
                              <div className="mt-1 text-xs text-gray-700">{playbook.description || 'No description'}</div>
                              <div className="mt-2 text-xs text-gray-600">
                                <div>Last run: {playbook.lastRunAt ? new Date(playbook.lastRunAt).toLocaleString() : 'Never'}</div>
                                <div>Next run: {new Date(playbook.nextRunAt).toLocaleString()}</div>
                              </div>
                            </Card>
                          ))}
                          {!isPlaybookCreateOpen ? (
                            <button
                              type="button"
                              aria-label="Create new playbook"
                              onClick={openPlaybookCreate}
                              className={GHOST_CREATE_CARD_CLASS}
                            >
                              <RocketOutlined className="text-3xl text-sky-700" />
                              <span className="mt-2 text-base font-semibold">Create new playbook</span>
                              <span className="mt-1 text-xs font-normal text-sky-700">Agent + sources + schedule</span>
                            </button>
                          ) : null}
                        </div>
                      </>
                    )}
                    {isPlaybookCreateOpen ? (
                      <Card
                        className="mb-4"
                        title="Create playbook"
                      >
                        <div className="space-y-3">
                          <Steps
                            size="small"
                            current={playbookCreateStep}
                            items={[
                              { title: 'Pick source' },
                              { title: 'Pick agent' },
                              { title: 'Set schedule' }
                            ]}
                          />
                          {playbookCreateStep === 0 ? (
                            <div className="grid gap-3 sm:grid-cols-2">
                              {sources.map((source) => {
                                const selected = playbookSourceIdsDraft[0] === source.id;

                                return (
                                  <WizardSelectableCard
                                    key={source.id}
                                    ariaLabel={`Select source ${getSourceDisplayTitle(source)}`}
                                    selected={selected}
                                    onClick={() => setPlaybookSourceIdsDraft([source.id])}
                                  >
                                    <div className="grid grid-cols-[56px_1fr] gap-3">
                                      {getSourceCoverImageUrl(source) ? (
                                        <img
                                          src={getSourceCoverImageUrl(source)!}
                                          alt={`${getSourceDisplayTitle(source)} cover`}
                                          className="h-14 w-14 rounded-md object-cover"
                                        />
                                      ) : (
                                        <div className="flex h-14 w-14 items-center justify-center rounded-md border border-dashed text-[10px] text-gray-500">
                                          Cover unavailable
                                        </div>
                                      )}
                                      <div className="min-w-0">
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="text-sm font-semibold">{getSourceDisplayTitle(source)}</div>
                                          {selected ? <Tag color="blue">Selected</Tag> : null}
                                        </div>
                                        <Text type="secondary" className="text-xs">
                                          {source.value}
                                        </Text>
                                        <div className="mt-1 flex flex-wrap gap-1 text-xs">
                                          <Tag>{source.type === 'podcast_feeds' ? 'Podcast' : source.type === 'youtube_videos' ? 'YouTube' : 'Web'}</Tag>
                                          <Tag>{getSourceKindLabel(source)}</Tag>
                                          {(source.type === 'podcast_feeds' || source.type === 'youtube_videos') ? (
                                            <Tag color="blue">Episodes: {getSourceEpisodeCount(source)}</Tag>
                                          ) : null}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="mt-3 text-xs text-gray-700 dark:text-gray-300">
                                      {source.metadata.previewItems.length > 0 ? (
                                        <>
                                          <div className="mb-1 font-medium">
                                            {selected ? 'Episodes preview' : 'Recent episodes preview'}
                                          </div>
                                          <ul className="list-inside list-disc space-y-1">
                                            {(selected ? source.metadata.previewItems : source.metadata.previewItems.slice(0, 3)).map((item) => (
                                              <li key={`${source.id}:${item.link ?? item.title}`}>{item.title}</li>
                                            ))}
                                          </ul>
                                        </>
                                      ) : (
                                        'No scanned episodes/items yet'
                                      )}
                                    </div>
                                  </WizardSelectableCard>
                                );
                              })}
                              {sources.length === 0 ? <Empty description="No sources available." /> : null}
                            </div>
                          ) : null}
                          {playbookCreateStep === 1 ? (
                            <div className="grid gap-3 sm:grid-cols-2">
                              {agents.map((agent) => {
                                const selected = playbookAgentIdDraft === agent.id;

                                return (
                                  <WizardSelectableCard
                                    key={agent.id}
                                    ariaLabel={`Select agent ${agent.name}`}
                                    selected={selected}
                                    onClick={() => setPlaybookAgentIdDraft(agent.id)}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <div className="text-sm font-semibold">
                                          <Badge status={agent.status === 'disabled' ? 'default' : 'success'} text={agent.name} />
                                        </div>
                                        <div className="mt-1 flex flex-wrap gap-1 text-xs">
                                          <Tag icon={getCharacterIcon(agent.characterType)}>Character: {getAgentCharacterLabel(agent)}</Tag>
                                          <Tag>Personality: {getAgentPersonalityLabel(agent)}</Tag>
                                        </div>
                                      </div>
                                      {selected ? <Tag color="blue">Selected</Tag> : null}
                                    </div>
                                    <div className="mt-2 text-xs text-gray-600 dark:text-gray-300">
                                      <div className="inline-flex items-center gap-1">
                                        <FileTextOutlined /> Persona + prompt ready
                                      </div>
                                    </div>
                                  </WizardSelectableCard>
                                );
                              })}
                              {agents.length === 0 ? <Empty description="No agents available." /> : null}
                            </div>
                          ) : null}
                          {playbookCreateStep === 2 ? (
                            <>
                              <Select
                                aria-label="Playbook schedule mode"
                                value={playbookScheduleModeDraft}
                                onChange={(value) => setPlaybookScheduleModeDraft(value as 'interval' | 'daily' | 'weekly')}
                                options={[
                                  { value: 'interval', label: 'Interval' },
                                  { value: 'daily', label: 'Daily' },
                                  { value: 'weekly', label: 'Weekly' }
                                ]}
                              />
                              {playbookScheduleModeDraft === 'interval' ? (
                                <Input
                                  aria-label="Playbook interval minutes"
                                  value={String(playbookIntervalMinutesDraft)}
                                  onChange={(event) => setPlaybookIntervalMinutesDraft(Math.max(15, Number(event.currentTarget.value) || 60))}
                                  placeholder="Interval minutes"
                                />
                              ) : (
                                <>
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <Input
                                      aria-label="Playbook daily time"
                                      value={playbookDailyTimeDraft}
                                      onChange={(event) => setPlaybookDailyTimeDraft(event.currentTarget.value)}
                                      placeholder="HH:mm"
                                    />
                                    <Select
                                      aria-label="Playbook timezone"
                                      value={playbookTimezoneDraft}
                                      onChange={(value) => setPlaybookTimezoneDraft(value)}
                                      options={TIMEZONE_OPTIONS}
                                      placeholder="Select timezone"
                                      showSearch
                                      className="w-full"
                                    />
                                  </div>
                                  {playbookScheduleModeDraft === 'weekly' ? (
                                    <Select
                                      aria-label="Playbook days of week"
                                      mode="multiple"
                                      value={playbookDaysOfWeekDraft}
                                      onChange={(values) => setPlaybookDaysOfWeekDraft(values as number[])}
                                      options={[
                                        { value: 1, label: 'Mon' },
                                        { value: 2, label: 'Tue' },
                                        { value: 3, label: 'Wed' },
                                        { value: 4, label: 'Thu' },
                                        { value: 5, label: 'Fri' },
                                        { value: 6, label: 'Sat' },
                                        { value: 0, label: 'Sun' }
                                      ]}
                                    />
                                  ) : null}
                                </>
                              )}
                              <div className="space-y-2">
                                <div className="text-sm font-medium text-gray-800 dark:text-gray-200">Recipient emails</div>
                                <Select
                                  aria-label="Playbook recipient emails"
                                  mode="tags"
                                  value={playbookRecipientsDraft}
                                  onChange={(values) => setPlaybookRecipientsDraft(values as string[])}
                                  tokenSeparators={[',', ' ']}
                                  placeholder="Add one or more email addresses"
                                  className="w-full"
                                  style={{ minHeight: 88 }}
                                />
                              </div>
                            </>
                          ) : null}
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-2 border-t pt-3">
                          <Button onClick={onBackPlaybookCreateStep} disabled={playbookCreateStep === 0}>
                            Back
                          </Button>
                          <div className="flex items-center gap-2">
                            <Button onClick={onCancelPlaybookCreate}>Cancel</Button>
                            {playbookCreateStep < 2 ? (
                              <Button type="primary" onClick={onNextPlaybookCreateStep}>
                                Next
                              </Button>
                            ) : (
                              <Button type="primary" loading={isPlaybookSaving} onClick={onCreatePlaybook}>
                                Create playbook
                              </Button>
                            )}
                          </div>
                        </div>
                      </Card>
                    ) : null}
                    <Modal
                      title="Marketplace playbooks"
                      open={showPlaybooksMarketplace}
                      onCancel={() => setShowPlaybooksMarketplace(false)}
                      footer={null}
                      destroyOnHidden
                    >
                      <div className="space-y-2">
                        {marketplacePlaybooks.length === 0 ? <Empty description="No marketplace playbooks available." /> : null}
                        {marketplacePlaybooks.map((item) => (
                          <Card key={item.publicationId} size="small">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold">{item.title}</div>
                                <div className="truncate text-xs text-gray-600">{item.summary || item.playbook.name}</div>
                              </div>
                              <Button
                                size="small"
                                loading={cloningPublicationId === item.publicationId}
                                onClick={() => onCloneMarketplacePlaybook(item.publicationId)}
                              >
                                Clone
                              </Button>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </Modal>
                  </Card>
                  <AgentStatusCard />
                  </div>
                )
              }
            ]}
          />
        </div>
        )}
      </Content>
      <EpisodePickerModal
        open={Boolean(episodePickerAgent)}
        loading={loadingEpisodeOptions}
        episodes={episodeOptions}
        onRunNormally={onRunNormallyFromPicker}
        onSelectEpisode={onSelectEpisodeFromPicker}
        onCancel={closeEpisodePicker}
      />
    </Layout>
  );
}
