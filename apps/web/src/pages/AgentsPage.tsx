import { useEffect, useMemo, useState, type ReactNode, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, Dropdown, Empty, Input, Layout, Modal, Popconfirm, Select, Steps, message, Tabs, Tag, Typography } from 'antd';
import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  AudioMutedOutlined,
  CheckCircleOutlined,
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
  NotificationOutlined,
  PlusCircleOutlined,
  PlusOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ReadOutlined,
  RocketOutlined,
  SearchOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  UserOutlined
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
  createAgent,
  deleteAgent,
  disableAgent,
  enableAgent,
  getAgent,
  listAgents,
  listAgentRuns,
  listAgentEpisodeOptions,
  publishAgent,
  runAgentNow,
  saveAgentPrompt,
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
import { getPromptCharacter, getPromptCharactersForPersona, getPromptPersona, PROMPT_PERSONAS, DEFAULT_PROMPT_CHARACTER_ID, DEFAULT_PROMPT_PERSONA_ID } from '../data/prompt-personas';

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
interface LibraryTabRecord {
  id: string;
  name: string;
}

const BrainIcon = ({ style }: { style?: CSSProperties }) => (
  <span role="img" aria-label="brain" className="anticon" style={{ fontSize: '1em', lineHeight: 1, ...style }}>
    🧠
  </span>
);

const DEFAULT_LIBRARY_TAB_ID = 'library-default';
const DEFAULT_LIBRARY_TAB_NAME = 'Library';

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

const PERSONA_ICON_MAP: Record<string, ReactNode> = {
  finance_expert: <LineChartOutlined />,
  teacher:        <ReadOutlined />,
  influencer:     <NotificationOutlined />,
  trainer:        <ThunderboltOutlined />,
  philosopher:    <CompassOutlined />,
  summarizer:     <FileTextOutlined />,
};

function getAgentCardDisplay(agent: AgentSummary, t: (key: string) => string): { intro: string; icon: ReactNode } {
  const characterId = agent.promptConfig?.personality_id ?? '';
  const personaId = agent.characterType ?? 'summarizer';
  const introKey = `personas.${personaId}.characters.${characterId}.intro`;
  const intro = t(introKey) !== introKey
    ? t(introKey)
    : `I'm a ${getAgentPersonalityLabel(agent)} in the ${getAgentCharacterLabel(agent)} family. Give me a source and I'll get to work.`;
  const icon = PERSONA_ICON_MAP[personaId] ?? <FileTextOutlined />;
  return { intro, icon };
}

/** Only podcast/YouTube sources have "episodes" to pick from - web_urls sources (single/listing
 * pages) keep the old "run now = crawl immediately" behavior with no picker. */
function hasEpisodicSource(agent: AgentSummary): boolean {
  return agent.sources.some((source) => source.type === 'podcast_feeds' || source.type === 'youtube_videos');
}

export function AgentsPage() {
  const { user, isAdmin, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const [showAdminWorkspace, setShowAdminWorkspace] = useState(false);
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
  const [playbooks, setPlaybooks] = useState<PlaybookRecord[]>([]);
  const [playbooksLoadState, setPlaybooksLoadState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [playbooksSearch, setPlaybooksSearch] = useState('');
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string | null>(null);
  const [isPlaybookCreateOpen, setIsPlaybookCreateOpen] = useState(false);
  // When true the wizard was opened via "Follow this source" on a specific card;
  // step 0 (Pick source) is skipped because the source is already known.
  const [followWizardSourcePreselected, setFollowWizardSourcePreselected] = useState(false);
  const [playbookCreateStep, setPlaybookCreateStep] = useState(0);
  const [isPlaybookSaving, setIsPlaybookSaving] = useState(false);
  const [confirmingUnfollow, setConfirmingUnfollow] = useState(false);
  const [editingPlaybookId, setEditingPlaybookId] = useState<string | null>(null);
  const [playbookAgentIdDraft, setPlaybookAgentIdDraft] = useState<string | null>(null);
  const [playbookSourceIdsDraft, setPlaybookSourceIdsDraft] = useState<string[]>([]);
  const [playbookScheduleModeDraft, setPlaybookScheduleModeDraft] = useState<'interval' | 'daily' | 'weekly'>('daily');
  const [playbookIntervalMinutesDraft, setPlaybookIntervalMinutesDraft] = useState(60);
  const [playbookDailyTimeDraft, setPlaybookDailyTimeDraft] = useState('07:30');
  const [playbookTimezoneDraft, setPlaybookTimezoneDraft] = useState('UTC');
  const [playbookDaysOfWeekDraft, setPlaybookDaysOfWeekDraft] = useState<number[]>([1]);
  const [playbookRecipientsDraft, setPlaybookRecipientsDraft] = useState<string[]>([]);
  // Inline agent creation inside the follow wizard (step: pick agent) — full 4-step sub-wizard
  const [showInlineAgentCreate, setShowInlineAgentCreate] = useState(false);
  const [isInlineAgentSaving, setIsInlineAgentSaving] = useState(false);
  const [inlineAgentStep, setInlineAgentStep] = useState(0); // 0=character+personality, 1=model+prompt, 2=schedule+recipients
  const [inlineAgentName, setInlineAgentName] = useState('My Analyst');
  const [inlineAgentDescription, setInlineAgentDescription] = useState('');
  const [inlineAgentPersonaId, setInlineAgentPersonaId] = useState(DEFAULT_PROMPT_PERSONA_ID);
  const [inlineAgentCharacterId, setInlineAgentCharacterId] = useState(DEFAULT_PROMPT_CHARACTER_ID);
  const [inlineAgentModel, setInlineAgentModel] = useState('claude-sonnet-4-5');
  const [inlineAgentSystemPrompt, setInlineAgentSystemPrompt] = useState(
    () => getPromptCharacter(DEFAULT_PROMPT_PERSONA_ID, DEFAULT_PROMPT_CHARACTER_ID)?.systemPrompt ?? ''
  );
  const [inlineAgentRiskLevel, setInlineAgentRiskLevel] = useState<'low' | 'medium' | 'high'>('medium');
  const [inlineAgentValidationError, setInlineAgentValidationError] = useState<string | null>(null);
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

  /** Set of source IDs the current user already has an active playbook for. */
  const followedSourceIds = useMemo(
    () => new Set(playbooks.flatMap((pb) => pb.sourceIds)),
    [playbooks]
  );

  function isSignInRequiredError(error: unknown): boolean {
    return error instanceof Error && /sign in required|unauthenticated/i.test(error.message);
  }

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
    if (tab.id === DEFAULT_LIBRARY_TAB_ID) return;
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
      message.warning('Tab name cannot be empty');
      return;
    }
    setLibraryTabs((current) => current.map((tab) => (tab.id === tabId ? { ...tab, name: trimmed } : tab)));
    setEditingLibraryTabId(null);
    setEditingLibraryTabName('');
  }

  async function refreshSources() {
    try {
      setSourcesLoadState('loading');
      const response = await listSources();
      setSources(response);
      reconcileSourceLibraries(response);
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
      }, [user?.id]);

      useEffect(() => {
        try {
          window.localStorage.setItem(libraryTabsStorageKey(), JSON.stringify(libraryTabs));
          window.localStorage.setItem(libraryAssignmentsStorageKey(), JSON.stringify(sourceLibraryBySourceId));
        } catch {
          // ignore storage failures
        }
      }, [libraryTabs, sourceLibraryBySourceId, user?.id]);
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
          reconcileSourceLibraries(sourcesResult.value);
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
    setEditingPlaybookId(null);
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

  function onFollowSource(source: SourceRecord, event?: React.MouseEvent) {
    event?.stopPropagation();
    // Opening the follow wizard must never expose the admin-only Agents/Playbooks
    // tabs to non-admin users. The wizard is a standalone Modal reachable regardless
    // of tab state. Source is already known so we skip step 0 (Pick source).
    setFollowWizardSourcePreselected(true);
    setShowInlineAgentCreate(false);
    setInlineAgentName('My Analyst');
    const existingFollowPlaybook = playbooks.find((playbook) => playbook.sourceIds.includes(source.id));
    if (existingFollowPlaybook) {
      setEditingPlaybookId(existingFollowPlaybook.id);
      // Start at step 1 (Pick agent) because source is pre-selected
      setPlaybookCreateStep(1);
      setPlaybookAgentIdDraft(existingFollowPlaybook.agentId);
      setPlaybookSourceIdsDraft(existingFollowPlaybook.sourceIds);
      setPlaybookScheduleModeDraft(existingFollowPlaybook.schedule.mode);
      if (existingFollowPlaybook.schedule.mode === 'interval') {
        setPlaybookIntervalMinutesDraft(existingFollowPlaybook.schedule.intervalMinutes);
      } else {
        setPlaybookDailyTimeDraft(existingFollowPlaybook.schedule.dailyTime);
        setPlaybookTimezoneDraft(existingFollowPlaybook.schedule.timezone);
        setPlaybookDaysOfWeekDraft(existingFollowPlaybook.schedule.mode === 'weekly' ? existingFollowPlaybook.schedule.daysOfWeek : [1]);
      }
      setPlaybookRecipientsDraft(existingFollowPlaybook.recipients);
      setIsPlaybookCreateOpen(true);
      return;
    }
    setEditingPlaybookId(null);
    // Start at step 1 (Pick agent) because source is already known from the card
    setPlaybookCreateStep(1);
    setPlaybookAgentIdDraft(null);
    setPlaybookSourceIdsDraft([source.id]);
    setPlaybookScheduleModeDraft('daily');
    setPlaybookIntervalMinutesDraft(60);
    setPlaybookDailyTimeDraft('07:30');
    setPlaybookTimezoneDraft('UTC');
    setPlaybookDaysOfWeekDraft([1]);
    setPlaybookRecipientsDraft([]);
    setIsPlaybookCreateOpen(true);
    if (agents.length === 0) {
      openInlineAgentCreate();
    }
  }

  function onCancelPlaybookCreate() {
    setIsPlaybookCreateOpen(false);
    setPlaybookCreateStep(0);
    setEditingPlaybookId(null);
    setFollowWizardSourcePreselected(false);
    setShowInlineAgentCreate(false);
    setInlineAgentStep(0);
    setInlineAgentValidationError(null);
    setConfirmingUnfollow(false);
  }

  function openInlineAgentCreate() {
    setInlineAgentStep(0);
    setInlineAgentName('My Analyst');
    setInlineAgentDescription('');
    setInlineAgentPersonaId(DEFAULT_PROMPT_PERSONA_ID);
    setInlineAgentCharacterId(DEFAULT_PROMPT_CHARACTER_ID);
    setInlineAgentModel('claude-sonnet-4-5');
    setInlineAgentSystemPrompt(getPromptCharacter(DEFAULT_PROMPT_PERSONA_ID, DEFAULT_PROMPT_CHARACTER_ID)?.systemPrompt ?? '');
    setInlineAgentRiskLevel('medium');
    setInlineAgentValidationError(null);
    setPlaybookAgentIdDraft(null);
    setShowInlineAgentCreate(true);
  }

  function closeInlineAgentCreate() {
    setShowInlineAgentCreate(false);
    setInlineAgentValidationError(null);
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
    if (step === 0) {
      if (!inlineAgentName.trim()) {
        setInlineAgentValidationError('Give the agent a name to continue.');
        return false;
      }
    }
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
    const name = inlineAgentName.trim();
    if (!name) {
      setInlineAgentValidationError('Give the agent a name.');
      return;
    }
    setIsInlineAgentSaving(true);
    try {
      const inlinePersona = getPromptPersona(inlineAgentPersonaId);
      const inlineChar = getPromptCharacter(inlineAgentPersonaId, inlineAgentCharacterId);
      const payload = {
        name,
        description: inlineAgentDescription,
        active: true,
        characterType: inlineAgentPersonaId,
        promptConfig: {
          personality_id: inlineAgentCharacterId,
          personality_label: inlineChar?.name ?? inlineAgentCharacterId,
          ...(inlineAgentPersonaId === 'finance_expert' ? { risk_level: inlineAgentRiskLevel } : {})
        },
        preferences: inlineAgentPersonaId === 'finance_expert' ? { risk_level: [inlineAgentRiskLevel] } : {}
      };
      const newAgent = await createAgent(payload) as AgentSummary;
      await saveAgentPrompt(newAgent.id, { model: inlineAgentModel, systemPrompt: inlineAgentSystemPrompt, enabled: true });
      setAgents((prev) => [...prev, newAgent]);
      setPlaybookAgentIdDraft(newAgent.id);
      void inlinePersona;
      // Auto-create playbook and close modal — schedule was already set in step 2
      const created = await doCreatePlaybook(newAgent.id);
      if (!created) {
        // fallback: let user review schedule and try again
        setShowInlineAgentCreate(false);
        setPlaybookCreateStep(2);
      }
    } catch {
      message.error('Failed to create agent');
    } finally {
      setIsInlineAgentSaving(false);
    }
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
    // When source was pre-selected, never go below step 1
    const minStep = followWizardSourcePreselected ? 1 : 0;
    setPlaybookCreateStep((current) => Math.max(current - 1, minStep));
  }

  async function doCreatePlaybook(agentId: string): Promise<boolean> {
    if (playbookSourceIdsDraft.length === 0) {
      message.warning(t('playbook.pickSourceFirst'));
      return false;
    }
    setIsPlaybookSaving(true);
    try {
      const schedule =
        playbookScheduleModeDraft === 'interval'
          ? { mode: 'interval' as const, intervalMinutes: playbookIntervalMinutesDraft }
          : playbookScheduleModeDraft === 'weekly'
            ? { mode: 'weekly' as const, daysOfWeek: playbookDaysOfWeekDraft, dailyTime: playbookDailyTimeDraft, timezone: playbookTimezoneDraft }
            : { mode: 'daily' as const, dailyTime: playbookDailyTimeDraft, timezone: playbookTimezoneDraft };
      const cleanedRecipients = playbookRecipientsDraft.map((v) => v.trim()).filter(Boolean);
      await createPlaybook({ agentId, name: derivePlaybookName(agentId, playbookSourceIdsDraft), sourceIds: playbookSourceIdsDraft, recipients: cleanedRecipients, schedule, executionMode: 'latest_only', language: i18n.language.startsWith('de') ? 'de' : 'en' });
      await refreshPlaybooks();
      setIsPlaybookCreateOpen(false);
      setPlaybookCreateStep(0);
      setEditingPlaybookId(null);
      setShowInlineAgentCreate(false);
      return true;
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to create playbook');
      return false;
    } finally {
      setIsPlaybookSaving(false);
    }
  }

  async function onCreatePlaybook() {
    if (!playbookAgentIdDraft) {
      message.warning(t('playbook.pickAgentFirst'));
      return;
    }
    if (playbookSourceIdsDraft.length === 0) {
      message.warning(t('playbook.pickSourceFirst'));
      return;
    }
    setIsPlaybookSaving(true);
    try {
      const schedule =
        playbookScheduleModeDraft === 'interval'
          ? { mode: 'interval' as const, intervalMinutes: playbookIntervalMinutesDraft }
          : playbookScheduleModeDraft === 'weekly'
            ? { mode: 'weekly' as const, daysOfWeek: playbookDaysOfWeekDraft, dailyTime: playbookDailyTimeDraft, timezone: playbookTimezoneDraft }
            : { mode: 'daily' as const, dailyTime: playbookDailyTimeDraft, timezone: playbookTimezoneDraft };
      const cleanedRecipients = playbookRecipientsDraft.map((v) => v.trim()).filter(Boolean);
      if (editingPlaybookId) {
        await updatePlaybook(editingPlaybookId, { name: derivePlaybookName(playbookAgentIdDraft, playbookSourceIdsDraft), sourceIds: playbookSourceIdsDraft, recipients: cleanedRecipients, schedule });
      } else {
        await createPlaybook({ agentId: playbookAgentIdDraft, name: derivePlaybookName(playbookAgentIdDraft, playbookSourceIdsDraft), sourceIds: playbookSourceIdsDraft, recipients: cleanedRecipients, schedule, executionMode: 'latest_only', language: i18n.language.startsWith('de') ? 'de' : 'en' });
      }
      await refreshPlaybooks();
      message.success(editingPlaybookId ? t('playbook.updatePlaybook') : t('playbook.createPlaybook'));
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
      closePlaybookCreate();
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to unfollow');
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
    if ((sourceLibraryBySourceId[source.id] ?? DEFAULT_LIBRARY_TAB_ID) !== activeLibraryTabId) {
      return false;
    }
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
        const created = await createSource({
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
        setSourceLibraryBySourceId((current) => ({ ...current, [created.id]: activeLibraryTabId }));
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
    setShowAdminWorkspace(false);
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
          </div>
          <div className="flex items-center gap-2">
            <ThemePicker />
            {/* User / account menu — admins get extra admin entries */}
            <Button
              size="small"
              type="text"
              onClick={() => i18n.changeLanguage(i18n.language.startsWith('de') ? 'en' : 'de')}
              title={t('language.switchTo')}
              style={{ fontWeight: 600, minWidth: 32 }}
            >
              {t('language.current')}
            </Button>
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  ...(user ? [{ key: 'user-label', label: <span className="font-medium">{user.displayName ?? user.email}</span>, disabled: true }] : []),
                  ...(user ? [{ type: 'divider' as const }] : []),
                  ...(isAdmin ? [
                    {
                      key: 'admin-agents-playbooks',
                      label: showAdminWorkspace ? t('common.back') : t('nav.agentsAndPlaybooks'),
                      icon: showAdminWorkspace ? <ArrowLeftOutlined /> : <RocketOutlined />,
                      onClick: () => {
                        if (showAdminWorkspace) {
                          setShowAdminWorkspace(false);
                          setShowAdminUsers(false);
                          setActiveHub('sources');
                        } else {
                          setShowAdminWorkspace(true);
                          setActiveHub('agents');
                        }
                      }
                    },
                    {
                      key: 'admin-users',
                      label: t('nav.userManagement'),
                      icon: <TeamOutlined />,
                      onClick: () => {
                        setShowAdminWorkspace(true);
                        setShowAdminUsers(true);
                      }
                    },
                    { type: 'divider' as const }
                  ] : []),
                  {
                    key: 'logout',
                    label: t('nav.logOut'),
                    icon: <LogoutOutlined />,
                    onClick: () => logout()
                  }
                ]
              }}
            >
              <Button
                shape="circle"
                icon={<UserOutlined />}
                aria-label={t('nav.accountMenu')}
              />
            </Dropdown>
          </div>
        </div>
      </Header>
      <Content style={{ padding: 24 }}>
        {showAdminWorkspace && showAdminUsers ? (
          <AdminUsersPage onBack={() => setShowAdminUsers(false)} />
        ) : viewingSymbol && (selectedAgent || executionAgentId) ? (
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
            tabBarStyle={showAdminWorkspace ? undefined : { display: 'none' }}
            items={[
              {
                key: 'sources',
                label: t('nav.dashboard'),
                children: (
                  <Card
                    className="min-w-0"
                    title={<Title level={4} style={{ margin: 0 }}>{t('nav.dashboard')}</Title>}
                  >
                   {/* Unified inner tab bar: user library tabs + fixed Marketplace tab */}
                   <div
                     onDoubleClick={() => {
                       const tab = libraryTabs.find((candidate) => candidate.id === activeLibraryTabId);
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
                       items={libraryTabs.map((tab) => ({
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
                               {tab.id !== DEFAULT_LIBRARY_TAB_ID && tab.id === activeLibraryTabId ? (
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
                   <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                     <Input
                       aria-label="Search sources"
                       value={sourcesSearch}
                       onChange={(event) => setSourcesSearch(event.currentTarget.value)}
                       placeholder="Search title, URL, or preview episode"
                       prefix={<SearchOutlined />}
                       style={{ maxWidth: 420 }}
                     />
                     {showSourcesMarketplace ? (
                       <Button
                         aria-label={t('library.backToLibrary')}
                         icon={<ArrowLeftOutlined />}
                         size="small"
                         onClick={() => setShowSourcesMarketplace(false)}
                       >
                         {t('library.backToLibrary')}
                       </Button>
                     ) : (
                       <Badge count={marketplaceSourceCount} size="small">
                         <Button
                           aria-label={t('library.browseMarketplace')}
                           icon={<CompassOutlined />}
                           onClick={async () => {
                             await refreshMarketplaceCounts();
                             setShowSourcesMarketplace(true);
                           }}
                         >
                           {t('library.browseMarketplace')}
                         </Button>
                       </Badge>
                     )}
                   </div>

                   {/* Marketplace grid — same rich card layout as library, Clone button only */}
                   {showSourcesMarketplace ? (
                     <div>
                       {marketplaceSources.length === 0 ? <Empty description="No marketplace sources available." /> : null}
                       <div className="grid gap-3 sm:grid-cols-2">
                         {marketplaceSources.map((item) => {
                           const src = item as unknown as import('../api/sources').SourceRecord;
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
                                   <div className="flex h-14 w-14 items-center justify-center rounded-md border border-dashed text-[10px] text-gray-500">
                                     Cover unavailable
                                   </div>
                                 )}
                                 <div className="min-w-0">
                                   <div className="text-sm font-semibold">{getSourceDisplayTitle(src)}</div>
                                   <Text type="secondary" className="text-xs">{item.value}</Text>
                                   <div className="mt-1 flex flex-wrap gap-1 text-xs">
                                     <Tag>{item.type === 'podcast_feeds' ? 'Podcast' : item.type === 'youtube_videos' ? 'YouTube' : 'Web'}</Tag>
                                     <Tag>{getSourceKindLabel(src)}</Tag>
                                     {(item.type === 'podcast_feeds' || item.type === 'youtube_videos') ? (
                                       <Tag color="blue">Episodes: {getSourceEpisodeCount(src)}</Tag>
                                     ) : null}
                                   </div>
                                 </div>
                               </div>
                               <div className="mt-3 text-xs text-gray-700">
                                 {item.metadata.previewItems.length > 0 ? (
                                   <>
                                     <div className="mb-1 font-medium">Recent episodes preview</div>
                                     <ul className="list-inside list-disc space-y-1">
                                       {item.metadata.previewItems.slice(0, 3).map((pi) => (
                                         <li key={`${item.publicationId}:${pi.link ?? pi.title}`}>{pi.title}</li>
                                       ))}
                                     </ul>
                                   </>
                                 ) : (
                                   'No scanned episodes/items yet'
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
                   {sourcesLoadState === 'loading' ? <p className="text-sm text-gray-700">{t('library.loadingSources')}</p> : null}
                   {sourcesLoadState === 'error' ? <p className="text-sm text-red-700">{t('library.failedSources')}</p> : null}
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
                           <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                             {/* Listen/Listening toggle — primary action on the card */}
                             {followedSourceIds.has(source.id) ? (
                               <Button
                                 type="default"
                                 aria-label={t('listen.listeningAriaLabel')}
                                 size="small"
                                 icon={<BrainIcon style={{ color: '#fff' }} />}
                                 style={{ backgroundColor: '#389e0d', borderColor: '#389e0d', color: '#fff' }}
                                 onClick={(event) => onFollowSource(source, event)}
                               >
                                 {t('listen.listening')}
                               </Button>
                             ) : (
                               <Button
                                 type="default"
                                 aria-label={t('listen.listenAriaLabel')}
                                 size="small"
                                 icon={<BrainIcon />}
                                 onClick={(event) => onFollowSource(source, event)}
                               >
                                 {t('listen.listen')}
                               </Button>
                             )}
                             {/* Edit + Share/Publish — Delete moved into Edit view */}
                             <EntityActions
                               entityLabel="source"
                               isOwner={source.ownerUserId === user?.id}
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
                   </>
                   ) : null}
                   <Modal
                     title={editingSource ? 'Edit source from URL' : 'Create source from URL'}
                     open={isSourceCreateOpen}
                     onCancel={closeSourceDialog}
                     onOk={onCreateDetectedSource}
                     okText={editingSource ? 'Save source' : 'Add source'}
                     okButtonProps={{ disabled: !autoDetectedSource, loading: isSourceSaving }}
                     footer={(_, { OkBtn, CancelBtn }) => (
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
                         <div className="flex gap-2">
                           <CancelBtn />
                           <OkBtn />
                         </div>
                       </div>
                     )}
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
                               autoDetectedSource.previewItems.map((previewItem) => <div key={previewItem.link ?? previewItem.title}>{previewItem.title}</div>)
                             ) : (
                               <div>No episodes/items preview available</div>
                             )}
                           </div>
                        </Card>
                       ) : null}
                     </div>
                   </Modal>
                  </Card>
                )
              },
              ...(showAdminWorkspace
                ? [{
                    key: 'agents',
                    label: t('nav.agents'),
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
                        title={<Title level={4} style={{ margin: 0 }}>{t('nav.agents')}</Title>}
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
                            aria-label="Create follower"
                            onClick={() => {
                              setIsCreatingAgent(true);
                              setEditingAgent(null);
                              setSelectedAgentId(null);
                            }}
                            className={`${GHOST_CREATE_CARD_CLASS} w-full`}
                          >
                            <AppstoreOutlined className="text-3xl text-sky-700" />
                            <span className="mt-2 text-base font-semibold">Create follower</span>
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
                        </div>
                      </>
                    )}
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
              }]
                : [])
            ]}
          />
        </div>
        )}
      </Content>
      <Modal
        title={(() => {
          if (followWizardSourcePreselected) {
            const src = sources.find((s) => s.id === playbookSourceIdsDraft[0]);
            const srcTitle = src ? getSourceDisplayTitle(src) : null;
            return editingPlaybookId
              ? t('listen.dialogTitleEdit', { title: srcTitle ?? t('listen.thisSource') })
              : t('listen.dialogTitleNew', { title: srcTitle ?? t('listen.thisSource') });
          }
          return editingPlaybookId ? t('listen.dialogTitleGenericEdit') : t('listen.dialogTitleGenericNew');
        })()}
        open={isPlaybookCreateOpen}
        onCancel={onCancelPlaybookCreate}
        footer={null}
        destroyOnHidden
        width={720}
      >
        <div className="space-y-3">
          {/* Unified steps indicator — morphs between pick-agent path and create-agent path */}
          {showInlineAgentCreate ? (
            <Steps
                size="small"
                current={inlineAgentStep}
                items={[
                  { title: t('agent.stepCharacter') },
                  { title: t('agent.stepPersonality') },
                  { title: t('agent.stepSchedule') }
                ]}
              />
          ) : (
            <Steps
              size="small"
              current={followWizardSourcePreselected ? playbookCreateStep - 1 : playbookCreateStep}
              items={[
                ...(followWizardSourcePreselected ? [] : [{ title: t('listen.stepPickSource') }]),
                { title: t('listen.stepChooseAgent') },
                { title: t('listen.stepSetSchedule') }
              ]}
            />
          )}
          {/* Step 1 subtitle — shown when picking an agent (not inside sub-wizard) */}
          {playbookCreateStep === 1 && !showInlineAgentCreate ? (
            <p className="text-sm text-gray-500">
              {t('listen.stepSubtitle')}
            </p>
          ) : null}
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
            <div className="space-y-3">
              {/* Hide agent selection grid when the inline creation sub-wizard is active */}
              {!showInlineAgentCreate ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {agents.map((agent) => {
                  const selected = playbookAgentIdDraft === agent.id;
                  const anySelected = playbookAgentIdDraft !== null;
                  const { intro, icon } = getAgentCardDisplay(agent, t);

                  return (
                    <div
                      key={agent.id}
                      className={`transition-opacity ${anySelected && !selected ? 'opacity-40' : 'opacity-100'}`}
                    >
                    <WizardSelectableCard
                      ariaLabel={`Select agent ${agent.name}`}
                      selected={selected}
                      onClick={() => {
                        setPlaybookAgentIdDraft(agent.id);
                        setShowInlineAgentCreate(false);
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 shrink-0 text-xl text-gray-500">
                          {icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-sm font-semibold">
                              <Badge status={agent.status === 'disabled' ? 'default' : 'success'} text={agent.name} />
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {selected ? <BrainIcon style={{ fontSize: '1.1em' }} /> : null}
                              <Popconfirm
                                title={t('agent.deleteConfirmTitle')}
                                description={t('agent.deleteConfirmDesc')}
                                okText={t('common.delete')}
                                okButtonProps={{ danger: true }}
                                onConfirm={async (e) => {
                                  e?.stopPropagation();
                                  await deleteAgent(agent.id);
                                  if (playbookAgentIdDraft === agent.id) setPlaybookAgentIdDraft(null);
                                  const refreshed = await listAgents();
                                  setAgents(refreshed);
                                }}
                                onPopupClick={(e) => e.stopPropagation()}
                              >
                                <Button
                                  size="small"
                                  type="text"
                                  danger
                                  icon={<DeleteOutlined />}
                                  aria-label={`Delete agent ${agent.name}`}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </Popconfirm>
                            </div>
                          </div>
                          <p className="mt-1 text-xs text-gray-500 italic">{intro}</p>
                        </div>
                      </div>
                    </WizardSelectableCard>
                    </div>
                  );
                })}
                {/* "Create new agent" ghost card — shown only when not in sub-wizard */}
                <button
                  type="button"
                  aria-label={t('agent.createNew')}
                  onClick={openInlineAgentCreate}
                  className={GHOST_CREATE_CARD_CLASS}
                >
                  <PlusOutlined className="text-2xl text-sky-700" />
                  <span className="mt-1 text-sm font-semibold">{t('agent.createNew')}</span>
                  <span className="mt-0.5 text-xs font-normal text-sky-700">{t('agent.createNewSub')}</span>
                </button>
              </div>
              ) : null}
              {showInlineAgentCreate ? (() => {
                const inlinePersonaData = getPromptPersona(inlineAgentPersonaId);
                const inlineChars = getPromptCharactersForPersona(inlineAgentPersonaId);
                const inlineCharData = getPromptCharacter(inlineAgentPersonaId, inlineAgentCharacterId) ?? inlineChars[0];
                const inlinePersonaLabel = inlinePersonaData?.name ?? inlineAgentPersonaId;
                return (
                  <Card
                    size="small"
                    title={t('agent.createNew')}
                  >
                    {inlineAgentValidationError ? (
                      <p className="mb-3 text-sm text-red-600">{inlineAgentValidationError}</p>
                    ) : null}

                    {/* Step 0: Name + Character type only */}
                    {inlineAgentStep === 0 ? (
                      <div className="space-y-3">
                        {/* Name first */}
                        <Input
                          aria-label={t('agent.namePlaceholder')}
                          placeholder={t('agent.namePlaceholder')}
                          value={inlineAgentName}
                          onChange={(e) => setInlineAgentName(e.currentTarget.value)}
                        />
                        {/* Character section */}
                        <div className="flex items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">
                          <BulbOutlined />
                          {t('agent.chooseCharacter')}
                        </div>
                        <div className="grid gap-2 md:grid-cols-3">
                          {PROMPT_PERSONAS.map((persona) => (
                            <button
                              key={persona.id}
                              type="button"
                              onClick={() => onInlineAgentPersonaChange(persona.id)}
                              className={`relative rounded-md border p-3 text-left transition ${inlineAgentPersonaId === persona.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                              aria-label={`Inline character ${t(`personas.${persona.id}.name`)}`}
                            >
                              {inlineAgentPersonaId === persona.id ? (
                                <span className="absolute top-1 right-1 text-base leading-none"><BrainIcon /></span>
                              ) : null}
                              <p className="font-medium text-sm">{t(`personas.${persona.id}.name`)}</p>
                              <p className="text-xs text-gray-500">{t(`personas.${persona.id}.tagline`)}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {/* Step 1: Personality style + model + system prompt */}
                    {inlineAgentStep === 1 ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">{t('agent.character')}:</span>
                          <Tag color="blue">{inlinePersonaLabel}</Tag>
                        </div>
                        {/* Personality section */}
                        <div className="flex items-center gap-2 rounded-md bg-violet-50 px-3 py-2 text-sm font-medium text-violet-700">
                          <ToolOutlined />
                          {t('agent.choosePersonality')}
                          <span className="ml-1 font-normal text-violet-500">{t('agent.forCharacter', { character: inlinePersonaLabel })}</span>
                        </div>
                        <div className="grid gap-2 md:grid-cols-3">
                          {inlineChars.map((char) => (
                            <button
                              key={char.id}
                              type="button"
                              onClick={() => onInlineAgentCharacterChange(char.id)}
                              className={`relative rounded-md border p-3 text-left transition ${inlineAgentCharacterId === char.id ? 'border-violet-500 bg-violet-50' : 'border-gray-200 hover:border-gray-300'}`}
                              aria-label={`Inline personality ${t(`personas.${inlineAgentPersonaId}.characters.${char.id}.name`)}`}
                            >
                              {inlineAgentCharacterId === char.id ? (
                                <span className="absolute top-1 right-1 text-base leading-none"><BrainIcon /></span>
                              ) : null}
                              <p className="font-medium text-sm">{t(`personas.${inlineAgentPersonaId}.characters.${char.id}.name`)}</p>
                              <p className="text-xs text-gray-500">{t(`personas.${inlineAgentPersonaId}.characters.${char.id}.tagline`)}</p>
                            </button>
                          ))}
                        </div>
                        <div className="border-t pt-3 space-y-3">
                          {inlineAgentPersonaId === 'finance_expert' ? (
                            <div>
                              <p className="mb-1 text-xs text-gray-500">{t('agent.riskLevel')}</p>
                              <Select
                                  aria-label={t('agent.riskLevel')}
                                value={inlineAgentRiskLevel}
                                onChange={(v) => setInlineAgentRiskLevel(v as 'low' | 'medium' | 'high')}
                                options={[
                                    { value: 'low', label: t('agent.riskLow') },
                                    { value: 'medium', label: t('agent.riskMedium') },
                                    { value: 'high', label: t('agent.riskHigh') }
                                ]}
                                className="w-full"
                              />
                            </div>
                          ) : null}
                          <div>
                            <p className="mb-1 text-xs text-gray-500">{t('agent.model')}</p>
                            <Select
                              aria-label={t('agent.model')}
                              value={inlineAgentModel}
                              onChange={setInlineAgentModel}
                              options={[
                                { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
                                { value: 'claude-sonnet-4', label: 'Claude Sonnet 4' }
                              ]}
                              className="w-full"
                            />
                          </div>
                          <div>
                            <p className="mb-1 text-xs text-gray-500">{t('agent.systemPrompt')}</p>
                            <Input.TextArea
                              aria-label={t('agent.systemPrompt')}
                              rows={5}
                              value={inlineAgentSystemPrompt}
                              onChange={(e) => setInlineAgentSystemPrompt(e.currentTarget.value)}
                            />
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {/* Step 2: Schedule + Recipients */}
                    {inlineAgentStep === 2 ? (
                      <div className="space-y-3">
                        <p className="text-sm text-gray-600">
                          {t('schedule.intro')}
                        </p>
                        <Select
                          aria-label={t('schedule.mode')}
                          value={playbookScheduleModeDraft}
                          onChange={(value) => setPlaybookScheduleModeDraft(value as 'interval' | 'daily' | 'weekly')}
                          options={[
                            { value: 'interval', label: t('schedule.interval') },
                            { value: 'daily', label: t('schedule.daily') },
                            { value: 'weekly', label: t('schedule.weekly') }
                          ]}
                          className="w-full"
                        />
                        {playbookScheduleModeDraft === 'interval' ? (
                          <Input
                            aria-label="Playbook interval minutes"
                            value={String(playbookIntervalMinutesDraft)}
                            onChange={(event) => setPlaybookIntervalMinutesDraft(Math.max(15, Number(event.currentTarget.value) || 60))}
                            placeholder="Interval in minutes"
                          />
                        ) : (
                          <div className="space-y-2">
                            <div className="grid gap-2 md:grid-cols-2">
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
                                  { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' },
                                  { value: 3, label: 'Wed' }, { value: 4, label: 'Thu' },
                                  { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' },
                                  { value: 0, label: 'Sun' }
                                ]}
                                className="w-full"
                              />
                            ) : null}
                          </div>
                        )}
                        <div className="border-t pt-3">
                          <p className="mb-1 text-xs text-gray-500">{t('schedule.recipients')}</p>
                          <Select
                           aria-label={t('schedule.recipients')}
                            mode="tags"
                            value={playbookRecipientsDraft}
                            onChange={(values) => setPlaybookRecipientsDraft(values as string[])}
                            tokenSeparators={[',', ' ']}
                           placeholder={t('schedule.recipientsPlaceholder')}
                            className="w-full"
                          />
                          <p className="mt-1 text-xs text-gray-400">{t('schedule.recipientsHint')}</p>
                        </div>
                      </div>
                    ) : null}

                  </Card>
                );
              })() : null}
            </div>
          ) : null}
          {playbookCreateStep === 2 ? (
            <>
              <Select
                aria-label={t('schedule.mode')}
                value={playbookScheduleModeDraft}
                onChange={(value) => setPlaybookScheduleModeDraft(value as 'interval' | 'daily' | 'weekly')}
                options={[
                  { value: 'interval', label: t('schedule.interval') },
                  { value: 'daily', label: t('schedule.daily') },
                  { value: 'weekly', label: t('schedule.weekly') }
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
                <div className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('schedule.recipients')}</div>
                <Select
                  aria-label={t('schedule.recipients')}
                  mode="tags"
                  value={playbookRecipientsDraft}
                  onChange={(values) => setPlaybookRecipientsDraft(values as string[])}
                  tokenSeparators={[',', ' ']}
                  placeholder={t('schedule.recipientsPlaceholder')}
                  className="w-full"
                  style={{ minHeight: 88 }}
                />
              </div>
            </>
          ) : null}
        </div>
        <div className="mt-4 flex items-center justify-between gap-2 border-t pt-3">
          <div className="flex items-center gap-2">
            <Button
              onClick={showInlineAgentCreate ? onInlineAgentBack : onBackPlaybookCreateStep}
              disabled={showInlineAgentCreate ? false : (followWizardSourcePreselected ? playbookCreateStep <= 1 : playbookCreateStep === 0)}
            >
                {showInlineAgentCreate && inlineAgentStep === 0 ? `← ${t('listen.stepChooseAgent')}` : t('common.back')}
            </Button>
            {/* Stop listening — only shown when editing a playbook and NOT inside the agent sub-wizard */}
            {editingPlaybookId && !showInlineAgentCreate ? (
              confirmingUnfollow ? (
                <div className="flex items-center gap-2">
                    <span className="text-sm text-red-600">{t('listen.stopListeningConfirm')}</span>
                  <Button
                    danger
                    size="small"
                    loading={false}
                    onClick={() => void onUnfollowFromWizard()}
                  >
                      {t('common.yes')}
                  </Button>
                  <Button size="small" onClick={() => setConfirmingUnfollow(false)}>
                      {t('common.cancel')}
                  </Button>
                </div>
              ) : (
                <Button
                  danger
                  icon={<AudioMutedOutlined />}
                  onClick={() => setConfirmingUnfollow(true)}
                >
                    {t('listen.stopListening')}
                </Button>
              )
            ) : null}
          </div>
          <div className="flex items-center gap-2">
              <Button onClick={onCancelPlaybookCreate}>{t('common.cancel')}</Button>
            {showInlineAgentCreate ? (
              inlineAgentStep < 2 ? (
                <Button type="primary" onClick={onInlineAgentNext}>
                    {t('common.next')}
                </Button>
              ) : (
                <Button type="primary" loading={isInlineAgentSaving} onClick={() => void onSaveInlineAgent()}>
                    {t('agent.create')}
                </Button>
              )
            ) : playbookCreateStep < 2 ? (
              <Button type="primary" onClick={onNextPlaybookCreateStep}>
                  {t('common.next')}
              </Button>
            ) : (
              <Button type="primary" loading={isPlaybookSaving} onClick={onCreatePlaybook}>
                  {editingPlaybookId ? t('playbook.updatePlaybook') : t('playbook.createPlaybook')}
              </Button>
            )}
          </div>
        </div>
      </Modal>
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
