import { useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, Dropdown, Empty, Input, Modal, Popconfirm, Select, Skeleton, Steps, message, Tabs, Tag, Typography } from 'antd';
import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  AudioOutlined,
  AudioMutedOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  LoadingOutlined,
  MailOutlined,
  BulbOutlined,
  CaretRightOutlined,
  ClockCircleOutlined,
  CompassOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  EditOutlined,
  FieldTimeOutlined,
  FileTextOutlined,
  GlobalOutlined,
  LinkOutlined,
  PlusCircleOutlined,
  PlusOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  RobotFilled,
  RobotOutlined,
  RocketOutlined,
  SearchOutlined,
  TeamOutlined,
  ToolOutlined
} from '@ant-design/icons';
import { AgentForm } from '../components/AgentForm';
import { AgentStatusCard } from '../components/AgentStatusCard';
import { AgentReportsBrowser } from '../components/AgentReportsBrowser';
import { AgentRunsBrowser } from '../components/AgentRunsBrowser';
import { AgentPromptEditor } from '../components/AgentPromptEditor';
import { EpisodePickerModal } from '../components/EpisodePickerModal';
import { TouchSafeTooltip } from '../components/TouchSafeTooltip';
import { ListenActiveButton, ListenIdleButton } from '../components/ListenButtons';
import { SymbolPerformancePage } from './SymbolPerformancePage';
import { seedDemoData } from '../api/admin';
import { useAgentStream } from '../hooks/useAgentStream';
import { useAppData } from '../context/AppDataContext';
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
import type { DiscussionPreselect } from '../api/discussions';
import { getCharacterTypeColor, getCharacterTypeEmoji } from '../data/character-types';
import {
  cloneMarketplaceAgent,
  cloneMarketplacePlaybook,
  cloneMarketplaceSource,
  type MarketplaceAgentListItem,
  type MarketplacePlaybookListItem,
  type MarketplaceSourceListItem
} from '../api/marketplace';
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
import { InlineDeleteButton } from '../components/InlineDeleteButton';
import { getPromptCharacter, getPromptCharactersForPersona, getPromptPersona, PROMPT_PERSONAS, DEFAULT_PROMPT_CHARACTER_ID, DEFAULT_PROMPT_PERSONA_ID } from '../data/prompt-personas';

const { Title, Text, Paragraph } = Typography;

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TIMEZONE_OPTIONS = [
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin' },
  { value: 'Europe/London', label: 'Europe/London' },
  { value: 'America/New_York', label: 'America/New_York' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo' }
];
type HubKey = 'feed' | 'sources' | 'agents' | 'playbooks';
type ProbeKind = 'feed' | 'listing_page' | 'single_page' | 'unknown';
interface LibraryTabRecord {
  id: string;
  name: string;
}

const BrainIcon = ({ style, className }: { style?: CSSProperties; className?: string }) => (
  <span role="img" aria-label="brain" className={`anticon${className ? ` ${className}` : ''}`} style={{ fontSize: '1em', lineHeight: 1, ...style }}>
    🧠
  </span>
);

const YouTubeLogo = () => (
  <span className="inline-flex items-center gap-1" style={{ verticalAlign: 'middle' }}>
    <svg viewBox="0 0 18 15" width="18" height="15" aria-hidden="true">
      <path d="M17.6 3.2A2.3 2.3 0 0 0 15.9 1.5C14.5 1 9 1 9 1S3.5 1 2.1 1.5A2.3 2.3 0 0 0 .4 3.2C0 4.6 0 7.5 0 7.5s0 2.9.4 4.3c.2.9.9 1.5 1.7 1.7C3.5 14 9 14 9 14s5.5 0 6.9-.5c.9-.2 1.5-.8 1.7-1.7C18 10.4 18 7.5 18 7.5s0-2.9-.4-4.3z" fill="#FF0000"/>
      <path d="M7 10.5V4.5l5.5 3-5.5 3z" fill="white"/>
    </svg>
    <span style={{ fontWeight: 700, fontSize: '0.8em', letterSpacing: '-0.2px', lineHeight: 1 }} aria-label="YouTube">YouTube</span>
  </span>
);

function SourceTypeBadge({ type }: { type: string }) {
  if (type === 'youtube_videos') return <YouTubeLogo />;
  if (type === 'podcast_feeds') return (
    <Tag icon={<AudioOutlined />} color="purple" className="m-0">Podcast</Tag>
  );
  if (type === 'synthetic_discussion') return (
    <Tag icon={<AudioOutlined />} color="geekblue" className="m-0">🎙 Synthetic</Tag>
  );
  return <Tag icon={<GlobalOutlined />} className="m-0">Web</Tag>;
}

const DEFAULT_LIBRARY_TAB_ID = 'library-default';
const DEFAULT_LIBRARY_TAB_NAME = 'My Collection';

interface AutoDetectedSource {
  type: SourceType;
  url: string;
  kind: ProbeKind;
  title?: string;
  coverImageUrl?: string;
  itemCount?: number;
  previewItems: Array<{ title: string; link: string | null; pubDate: string | null }>;
}

const GUIDED_SUGGESTED_SOURCE: AutoDetectedSource = {
  type: 'youtube_videos',
  url: 'https://www.youtube.com/playlist?list=PLdPrKDvwrog6nXguUXjQcTIw685Xa6Bg5',
  kind: 'listing_page',
  title: 'Lanz & Precht',
  previewItems: []
};

function GhostCreateCard({
  ariaLabel,
  onClick,
  icon,
  title,
  sub,
  className = ''
}: {
  ariaLabel: string;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  sub?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={`group relative flex min-h-[170px] flex-col items-center justify-center
                  rounded-lg p-4 text-center text-sky-700 transition-all
                  hover:text-sky-600 dark:text-sky-300 dark:hover:text-sky-200 ${className}`}
    >
      <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        <rect
          x="1" y="1"
          width="calc(100% - 2px)" height="calc(100% - 2px)"
          rx="9" ry="9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="6 4"
          style={{ animation: 'dash-march 14s linear infinite', opacity: 0.5 }}
          className="transition-opacity group-hover:!opacity-100"
        />
      </svg>
      <span className="relative z-10 flex flex-col items-center gap-2">
        <span className="text-3xl transition-transform group-hover:scale-110">{icon}</span>
        <span className="text-sm font-semibold">{title}</span>
        {sub !== undefined && <span className="text-xs opacity-70">{sub}</span>}
      </span>
    </button>
  );
}

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
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-pressed={selected}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className="relative block h-full w-full text-left cursor-pointer"
    >
      {selected && (
        <span
          aria-hidden
          className="absolute -top-[11px] right-2.5 z-10 flex h-[26px] w-[26px]
                     items-center justify-center rounded-full bg-sky-500 text-white text-[13px]
                     shadow-md ring-2 ring-white dark:ring-slate-900"
        >
          ✓
        </span>
      )}
      <Card
        size="small"
        hoverable={!selected}
        className={`h-full min-h-[190px] transition-all ${
          selected ? 'bg-sky-50 dark:bg-sky-950/40' : ''
        }`}
        style={{
          cursor: 'pointer',
          ...(selected ? { outline: '2px solid #38bdf8', outlineOffset: '-2px' } : {})
        }}
      >
        {children}
      </Card>
    </div>
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

const PersonaIcon = ({ personaId, style }: { personaId: string; style?: CSSProperties }) => {
  const emoji = getCharacterTypeEmoji(personaId);
  return (
    <span role="img" aria-label={personaId} className="anticon" style={{ fontSize: '1em', lineHeight: 1, ...style }}>
      {emoji}
    </span>
  );
};

function getCharacterIcon(characterType?: AgentSummary['characterType']) {
  return <PersonaIcon personaId={characterType ?? 'summarizer'} />;
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
  finance_expert: <PersonaIcon personaId="finance_expert" />,
  teacher:        <PersonaIcon personaId="teacher" />,
  influencer:     <PersonaIcon personaId="influencer" />,
  trainer:        <PersonaIcon personaId="trainer" />,
  philosopher:    <PersonaIcon personaId="philosopher" />,
  summarizer:     <PersonaIcon personaId="summarizer" />,
};

const PERSONA_ICON_BG_MAP: Record<string, string> = {
  finance_expert: 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300',
  teacher:        'bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-300',
  influencer:     'bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-300',
  trainer:        'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300',
  philosopher:    'bg-cyan-50 text-cyan-600 dark:bg-cyan-950 dark:text-cyan-300',
  summarizer:     'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
};

function getAgentCardDisplay(agent: AgentSummary, t: (key: string) => string): { intro: string; icon: ReactNode; characterLabel: string; personalityLabel: string; personaId: string } {
  const characterId = agent.promptConfig?.personality_id ?? '';
  const personaId = agent.characterType ?? 'summarizer';
  const introKey = `personas.${personaId}.characters.${characterId}.intro`;
  const intro = t(introKey) !== introKey
    ? t(introKey)
    : `I'm a ${getAgentPersonalityLabel(agent)} in the ${getAgentCharacterLabel(agent)} family. Give me a source and I'll get to work.`;
  const icon = PERSONA_ICON_MAP[personaId] ?? <FileTextOutlined />;
  const characterLabel = getAgentCharacterLabel(agent);
  const personalityLabel = getAgentPersonalityLabel(agent);
  return { intro, icon, characterLabel, personalityLabel, personaId };
}

/** Only podcast/YouTube sources have "episodes" to pick from - web_urls sources (single/listing
 * pages) keep the old "run now = crawl immediately" behavior with no picker. */
function hasEpisodicSource(agent: AgentSummary): boolean {
  return agent.sources.some((source) => source.type === 'podcast_feeds' || source.type === 'youtube_videos');
}

export function AgentsPage({ hub: initialHub }: { hub?: HubKey } = {}) {
  const { user, isAdmin, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const {
    agents, setAgents,
    sources, setSources,
    playbooks, setPlaybooks,
    agentsLoadState: loadState,
    sourcesLoadState,
    playbooksLoadState,
    marketplaceAgents, setMarketplaceAgents: _setMarketplaceAgents,
    marketplaceSources, setMarketplaceSources: _setMarketplaceSources,
    marketplacePlaybooks, setMarketplacePlaybooks: _setMarketplacePlaybooks,
    marketplaceAgentCount, marketplaceSourceCount, marketplacePlaybookCount,
    refreshAgents: _refreshAgents, refreshSources: _refreshSources, refreshPlaybooks: _refreshPlaybooks,
    failedRunNotices, setFailedRunNotices,
    newReportNotices, setNewReportNotices,
    bellDismissedIds,
    forceShowOnboarding, forceShowGuidedWizard, setForceShowGuidedWizard
  } = useAppData();
  const [viewingSymbol, setViewingSymbol] = useState<string | null>(null);
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);
  const [editingAgent, setEditingAgent] = useState<{ detail: AgentDetail; prompt: PromptVersionDto | null } | null>(
    null
  );
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
  const [hasAppliedSymbolDeepLink, setHasAppliedSymbolDeepLink] = useState(false);
  const [activeHub, setActiveHubState] = useState<HubKey>(initialHub ?? 'feed');

  // AppShell's nav buttons navigate via <Router> directly (not through setActiveHub below),
  // and React Router keeps this same AgentsPage instance mounted across "/", "/library",
  // "/agents", "/playbooks" (same component/route element). Without this sync, activeHub
  // would only ever reflect its initial mount value and clicking e.g. Library in the shell
  // would change the URL but never switch the visible panel.
  useEffect(() => {
    if (initialHub) {
      setActiveHubState((prev) => (prev === initialHub ? prev : initialHub));
    }
  }, [initialHub]);
  const [feedReports, setFeedReports] = useState<Array<RunReportDto & { agentName: string; playbookName: string }>>([]);
  const [feedLoading, setFeedLoading] = useState(false);

  const HUB_TO_PATH: Record<HubKey, string> = { feed: '/', sources: '/library', agents: '/agents', playbooks: '/playbooks' };

  function setActiveHub(hub: HubKey) {
    setActiveHubState(hub);
    navigate(HUB_TO_PATH[hub], { replace: true });
  }
  // Derived (not separate state) so navigating via AppShell's Agents/Playbooks nav buttons
  // always keeps this in sync with the active route — no manual toggle needed.
  const showAdminWorkspace = activeHub === 'agents' || activeHub === 'playbooks';
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
  const [playbooksSearch, setPlaybooksSearch] = useState('');
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [activeSourceTab, setActiveSourceTab] = useState<string>('reports');
  const [sourceDetailReports, setSourceDetailReports] = useState<RunReportDto[]>([]);
  const [sourceDetailRuns, setSourceDetailRuns] = useState<RunDetailDto[]>([]);
  const [sourceDetailLoading, setSourceDetailLoading] = useState(false);
  const [sourceDetailRefreshKey, setSourceDetailRefreshKey] = useState(0);
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
  const [playbookSourceIdsDraft, setPlaybookSourceIdsDraft] = useState<string[]>([]);
  const [playbookScheduleModeDraft, setPlaybookScheduleModeDraft] = useState<'interval' | 'daily' | 'weekly'>('daily');
  const [playbookIntervalMinutesDraft, setPlaybookIntervalMinutesDraft] = useState(60);
  const [playbookDailyTimeDraft, setPlaybookDailyTimeDraft] = useState('07:30');
  const [playbookTimezoneDraft, setPlaybookTimezoneDraft] = useState('UTC');
  const [playbookDaysOfWeekDraft, setPlaybookDaysOfWeekDraft] = useState<number[]>([1]);
  const [playbookRecipientsDraft, setPlaybookRecipientsDraft] = useState<string[]>([]);
  // Agent picker for manual runs when multiple agents are linked to the same source
  const [runPickerOpen, setRunPickerOpen] = useState(false);
  const [runPickerLinked, setRunPickerLinked] = useState<{ playbook: PlaybookRecord; agent: AgentSummary | undefined }[]>([]);
  const [runPickerEpisode, setRunPickerEpisode] = useState<{ title: string; link: string; pubDate?: string | null } | undefined>(undefined);
  // Schedule-only edit modal — opened via ✎ on individual playbook cards
  const [isScheduleEditOpen, setIsScheduleEditOpen] = useState(false);
  const [scheduleEditPlaybook, setScheduleEditPlaybook] = useState<PlaybookRecord | null>(null);
  const [isScheduleEditSaving, setIsScheduleEditSaving] = useState(false);
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
  const [inlineAgentReportDetailLevel, setInlineAgentReportDetailLevel] = useState<'brief' | 'standard' | 'detailed'>('standard');
  const [inlineAgentValidationError, setInlineAgentValidationError] = useState<string | null>(null);
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
  const [guidedWizardOpen, setGuidedWizardOpen] = useState(false);
  const [guidedWizardUrl, setGuidedWizardUrl] = useState('');
  const [guidedWizardDetecting, setGuidedWizardDetecting] = useState(false);
  const [guidedWizardSource, setGuidedWizardSource] = useState<AutoDetectedSource>(GUIDED_SUGGESTED_SOURCE);
  const [guidedWizardPersonaId, setGuidedWizardPersonaId] = useState('finance_expert');
  const [guidedWizardRunning, setGuidedWizardRunning] = useState(false);
  const [guidedWizardDismissed, setGuidedWizardDismissed] = useState(() =>
    localStorage.getItem('chattrader:guided-wizard:dismissed') === '1'
  );
  const [wizardShowAdvanced, setWizardShowAdvanced] = useState(false);

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

  async function refreshMarketplaceCounts() {
    // Marketplace counts now come from AppDataContext — no-op here
  }


  // Auto-dismiss onboarding checklist once all 4 steps are complete
  useEffect(() => {
    if (onboardingAllDone && onboardingDataLoaded && !onboardingDismissed && !forceShowOnboarding) {
      localStorage.setItem('chattrader:onboarding:dismissed', '1');
      setOnboardingDismissed(true);
    }
  }, [onboardingAllDone, onboardingDataLoaded, onboardingDismissed, forceShowOnboarding]);

  // Open guided first-run wizard for truly new users (nothing set up yet, not dismissed)
  useEffect(() => {
    if (!onboardingDataLoaded) return;
    if (forceShowGuidedWizard) {
      setGuidedWizardOpen(true);
      return;
    }
    if (guidedWizardDismissed || sources.length > 0 || agents.length > 0 || playbooks.length > 0) return;
    setGuidedWizardOpen(true);
  }, [onboardingDataLoaded, forceShowGuidedWizard, guidedWizardDismissed, sources.length, agents.length, playbooks.length]);

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

  // Load the reports feed — latest reports across all agents linked to my playbooks
  useEffect(() => {
    const agentIds = [...new Set(playbooks.map((p) => p.agentId).filter(Boolean))];
    if (agentIds.length === 0) { setFeedReports([]); return; }
    let alive = true;
    setFeedLoading(true);
    Promise.all(
      agentIds.map(async (agentId) => {
        const reps = await listAgentReports(agentId).catch(() => []);
        const agent = agents.find((a) => a.id === agentId);
        const agentName = agent?.name ?? agentId;
        const playbook = playbooks.find((p) => p.agentId === agentId);
        const playbookName = playbook?.name ?? '';
        return reps.map((r) => ({ ...r, agentName, playbookName }));
      })
    ).then((nested) => {
      if (!alive) return;
      const flat = nested.flat().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setFeedReports(flat);
      setFeedLoading(false);
    }).catch(() => { if (alive) setFeedLoading(false); });
    return () => { alive = false; };
  }, [playbooks, agents]);

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

  // SSE stream — replaces the old 4s polling interval
  const { runs, setRuns, reports, setReports } = useAgentStream(executionAgentId);

  // Accumulate failed runs into the bell notification centre (driven by SSE updates)
  useEffect(() => {
    const failedRuns = runs.filter((r) => r.status === 'failed');
    if (failedRuns.length === 0) return;
    const agentName = agents.find((a) => a.id === executionAgentId)?.name ?? executionAgentId ?? '';
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
  // same SSE stream), so users don't have to keep an agent selected/open to notice new output.
  useEffect(() => {
    if (reports.length === 0) return;
    const agentName = agents.find((a) => a.id === executionAgentId)?.name ?? executionAgentId ?? '';
    setNewReportNotices((prev) => {
      const existingIds = new Set(prev.map((n) => n.reportId));
      const newNotices = reports
        .filter((r) => !existingIds.has(r.id))
        .map((r) => ({ reportId: r.id, agentId: executionAgentId!, agentName, summary: r.summary, timestamp: r.createdAt }));
      return newNotices.length > 0 ? [...prev, ...newNotices] : prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports]);

  // Load reports + runs for the selected source (merged from all agents analyzing it)
  useEffect(() => {
    if (!selectedSourceId) {
      setSourceDetailReports([]);
      setSourceDetailRuns([]);
      return;
    }
    let alive = true;
    const linked = playbooks.filter((p) => p.sourceIds.includes(selectedSourceId));
    if (linked.length === 0) {
      setSourceDetailReports([]);
      setSourceDetailRuns([]);
      return;
    }
    setSourceDetailLoading(true);
    const reportPromises = linked.map((pb) => listAgentReports(pb.agentId));
    const runPromises = linked.map((pb) => listAgentRuns(pb.agentId));
    Promise.all([...reportPromises, ...runPromises])
      .then((results) => {
        if (!alive) return;
        const n = linked.length;
        const allReports = (results.slice(0, n) as RunReportDto[][]).flat();
        const allRuns = (results.slice(n) as RunDetailDto[][]).flat();
        allReports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        allRuns.sort((a, b) => new Date(b.scheduledFor).getTime() - new Date(a.scheduledFor).getTime());
        setSourceDetailReports(allReports);
        setSourceDetailRuns(allRuns);
      })
      .catch(() => { /* silently ignore — empty state handles this */ })
      .finally(() => { if (alive) setSourceDetailLoading(false); });
    return () => { alive = false; };
  }, [selectedSourceId, playbooks, sourceDetailRefreshKey]);

  // While a run is in progress, immediately show the queued run then poll every 5 s so
  // the Runs tab stays live without requiring a page reload.
  useEffect(() => {
    if (!runningAgentId) return;
    setSourceDetailRefreshKey((k) => k + 1);
    const id = setInterval(() => setSourceDetailRefreshKey((k) => k + 1), 5000);
    return () => clearInterval(id);
  }, [runningAgentId]);

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
    // SSE stream drives live updates; no manual polling re-arm needed
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
      setEditingAgent({ detail, prompt: latestPrompt });
      setIsCreatingAgent(false);
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
    setPlaybookSourceIdsDraft(sources[0] ? [sources[0].id] : []);
    setPlaybookScheduleModeDraft('daily');
    setPlaybookIntervalMinutesDraft(60);
    setPlaybookDailyTimeDraft('07:30');
    setPlaybookTimezoneDraft('UTC');
    setPlaybookDaysOfWeekDraft([1]);
    setPlaybookRecipientsDraft(user?.email ? [user.email] : []);
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
    setEditingPlaybookId(null);
    setWizardFocusedAgentId(null);
    setPlaybookCreateStep(1);
    setPlaybookSourceIdsDraft([source.id]);
    setPlaybookScheduleModeDraft('daily');
    setPlaybookIntervalMinutesDraft(60);
    setPlaybookDailyTimeDraft('07:30');
    setPlaybookTimezoneDraft('UTC');
    setPlaybookDaysOfWeekDraft([1]);
    setPlaybookRecipientsDraft(user?.email ? [user.email] : []);
    // Pre-select agents that already watch this source; track their playbook IDs for the
    // save diff (delete removed, create added, skip unchanged).
    const linkedPbs = playbooks.filter((p) => p.sourceIds.includes(source.id));
    const alreadyLinkedAgentIds = linkedPbs.map((p) => p.agentId);
    setWizardAlreadyLinkedAgentIds(alreadyLinkedAgentIds);
    setWizardAlreadyLinkedPlaybooks(linkedPbs.map((p) => ({ agentId: p.agentId, playbookId: p.id })));
    setPlaybookAgentIdsDraft(alreadyLinkedAgentIds);
    setIsPlaybookCreateOpen(true);
    if (agents.length === 0) {
      openInlineAgentCreate();
    }
  }

  async function onRemoveAgentFromSource(playbook: PlaybookRecord, sourceId: string) {
    try {
      const remainingSourceIds = playbook.sourceIds.filter((id) => id !== sourceId);
      if (remainingSourceIds.length === 0) {
        await deletePlaybook(playbook.id);
      } else {
        await updatePlaybook(playbook.id, { sourceIds: remainingSourceIds });
      }
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
    setInlineAgentStep(0);
    setInlineAgentValidationError(null);
    setConfirmingUnfollow(false);
    setWizardShowAdvanced(false);
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
    setInlineAgentReportDetailLevel('standard');
    setInlineAgentValidationError(null);
    setPlaybookAgentIdsDraft([]);
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
    if (playbookSourceIdsDraft.length === 0) {
      message.warning(t('playbook.pickSourceFirst'));
      return;
    }
    setIsPlaybookSaving(true);
    try {
      const lang = i18n.language.startsWith('de') ? 'de' : 'en';
      // Default schedule used when the follow-source wizard does not show a schedule step
      const defaultSchedule = { mode: 'daily' as const, dailyTime: '07:30', timezone: 'UTC' };
      // Admin-hub create wizard does pass through the schedule step; follow wizard does not
      const explicitSchedule =
        playbookScheduleModeDraft === 'interval'
          ? { mode: 'interval' as const, intervalMinutes: playbookIntervalMinutesDraft }
          : playbookScheduleModeDraft === 'weekly'
            ? { mode: 'weekly' as const, daysOfWeek: playbookDaysOfWeekDraft, dailyTime: playbookDailyTimeDraft, timezone: playbookTimezoneDraft }
            : { mode: 'daily' as const, dailyTime: playbookDailyTimeDraft, timezone: playbookTimezoneDraft };
      // In follow mode use advanced draft values if expanded, otherwise defaults.
      const scheduleForNew = followWizardSourcePreselected && !wizardShowAdvanced ? defaultSchedule : explicitSchedule;
      const cleanedRecipients = playbookRecipientsDraft.map((v) => v.trim()).filter(Boolean);
      // Recipients for new playbooks: advanced-mode uses draft; streamlined follow mode defaults to current user email.
      const recipientsForNew = (followWizardSourcePreselected && !wizardShowAdvanced) ? (user?.email ? [user.email] : []) : cleanedRecipients;
      if (editingPlaybookId) {
        // Admin-hub edit mode: update the explicit playbook + diff agent selection
        const agentId = wizardFocusedAgentId ?? playbookAgentIdsDraft[0] ?? '';
        await updatePlaybook(editingPlaybookId, { name: derivePlaybookName(agentId, playbookSourceIdsDraft), sourceIds: playbookSourceIdsDraft, recipients: cleanedRecipients, schedule: explicitSchedule });
        // Diff: additions and removals relative to the originally linked set
        const toCreate = playbookAgentIdsDraft.filter((id) => !wizardAlreadyLinkedAgentIds.includes(id));
        const toDelete = wizardAlreadyLinkedAgentIds.filter((id) => !playbookAgentIdsDraft.includes(id) && id !== agentId);
        await Promise.all([
          ...toCreate.map((id) => createPlaybook({ agentId: id, name: derivePlaybookName(id, playbookSourceIdsDraft), sourceIds: playbookSourceIdsDraft, recipients: cleanedRecipients, schedule: explicitSchedule, executionMode: 'latest_only', language: lang })),
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
          ...toCreate.map((id) => createPlaybook({ agentId: id, name: derivePlaybookName(id, playbookSourceIdsDraft), sourceIds: playbookSourceIdsDraft, recipients: recipientsForNew, schedule: scheduleForNew, executionMode: 'latest_only', language: lang })),
          ...toDelete.map((id) => {
            const pb = wizardAlreadyLinkedPlaybooks.find((p) => p.agentId === id);
            return pb ? deletePlaybook(pb.playbookId) : Promise.resolve();
          })
        ]);
      }
      await refreshPlaybooks();
      if (playbookSourceIdsDraft[0]) markSourceUpdated(playbookSourceIdsDraft[0]);
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

  function onOpenPlaybookWizard(playbook: PlaybookRecord) {
    setFollowWizardSourcePreselected(true);
    setShowInlineAgentCreate(false);
    setInlineAgentName('My Analyst');
    setEditingPlaybookId(playbook.id);
    setWizardFocusedAgentId(playbook.agentId);
    setPlaybookCreateStep(1);
    setPlaybookSourceIdsDraft(playbook.sourceIds);
    setPlaybookScheduleModeDraft(playbook.schedule.mode);
    if (playbook.schedule.mode === 'interval') {
      setPlaybookIntervalMinutesDraft(playbook.schedule.intervalMinutes);
    } else {
      setPlaybookDailyTimeDraft(playbook.schedule.dailyTime);
      setPlaybookTimezoneDraft(playbook.schedule.timezone);
      setPlaybookDaysOfWeekDraft(playbook.schedule.mode === 'weekly' ? playbook.schedule.daysOfWeek : [1]);
    }
    setPlaybookRecipientsDraft(playbook.recipients);
    // Pre-fill detail level from existing agent if available
    const existingAgent = agents.find((a) => a.id === playbook.agentId);
    setInlineAgentReportDetailLevel((existingAgent?.promptConfig as { report_detail_level?: 'brief' | 'standard' | 'detailed' } | undefined)?.report_detail_level ?? 'standard');
    // Pre-select ALL linked agents for this source; track their playbook IDs for the save diff
    const linkedPbs = playbooks.filter((p) => p.sourceIds.some((sid) => playbook.sourceIds.includes(sid)));
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
    setPlaybookScheduleModeDraft(playbook.schedule.mode);
    if (playbook.schedule.mode === 'interval') {
      setPlaybookIntervalMinutesDraft(playbook.schedule.intervalMinutes);
    } else {
      setPlaybookDailyTimeDraft(playbook.schedule.dailyTime);
      setPlaybookTimezoneDraft(playbook.schedule.timezone);
      setPlaybookDaysOfWeekDraft(playbook.schedule.mode === 'weekly' ? playbook.schedule.daysOfWeek : [1]);
    }
    setPlaybookRecipientsDraft(playbook.recipients);
    setIsScheduleEditOpen(true);
  }

  async function onSaveScheduleEdit() {
    if (!scheduleEditPlaybook) return;
    setIsScheduleEditSaving(true);
    try {
      const schedule =
        playbookScheduleModeDraft === 'interval'
          ? { mode: 'interval' as const, intervalMinutes: playbookIntervalMinutesDraft }
          : playbookScheduleModeDraft === 'weekly'
            ? { mode: 'weekly' as const, daysOfWeek: playbookDaysOfWeekDraft, dailyTime: playbookDailyTimeDraft, timezone: playbookTimezoneDraft }
            : { mode: 'daily' as const, dailyTime: playbookDailyTimeDraft, timezone: playbookTimezoneDraft };
      const cleanedRecipients = playbookRecipientsDraft.map((v) => v.trim()).filter(Boolean);
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
  const filteredMarketplaceSources = marketplaceSources.filter((item) => {
    if (!normalizedSourceSearch) return true;
    return `${item.title} ${item.value} ${item.summary}`.toLowerCase().includes(normalizedSourceSearch);
  });
  const normalizedMarketplaceAgentsSearch = marketplaceAgentsSearch.trim().toLowerCase();
  const normalizedMarketplacePlaybooksSearch = marketplacePlaybooksSearch.trim().toLowerCase();
  const filteredMarketplaceAgents = marketplaceAgents.filter((item) => {
    if (!normalizedMarketplaceAgentsSearch) return true;
    return `${item.title} ${item.summary} ${item.agent.name}`.toLowerCase().includes(normalizedMarketplaceAgentsSearch);
  });
  const filteredMarketplacePlaybooks = marketplacePlaybooks.filter((item) => {
    if (!normalizedMarketplacePlaybooksSearch) return true;
    return `${item.title} ${item.summary} ${item.playbook.name}`.toLowerCase().includes(normalizedMarketplacePlaybooksSearch);
  });

  function getSourceDisplayTitle(source: SourceRecord): string {
    if (source.metadata.title?.trim()) return source.metadata.title;
    // Synthetic discussions store the name in config (for sources created before libraryCard.title was set)
    if (source.type === 'synthetic_discussion' && typeof source.config.name === 'string' && source.config.name.trim()) {
      return source.config.name.trim();
    }
    try {
      const url = new URL(source.value);
      return url.hostname;
    } catch {
      return source.value;
    }
  }

  function getSourceSpeakers(source: SourceRecord): string[] {
    if (source.type !== 'synthetic_discussion') return [];
    const p = source.config.participants;
    if (Array.isArray(p)) return p.filter((n): n is string => typeof n === 'string');
    return [];
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
    if (source.type === 'synthetic_discussion') return 'Discussion';
    return 'Page';
  }

  function getSourceEpisodeCount(source: SourceRecord): number {
    return source.metadata.itemCount ?? source.metadata.previewItems.length;
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
    const linked = playbooks.filter((p) => p.sourceIds.includes(selectedSourceId));
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
  // symbol performance page).
  function goToDashboard() {
    setSelectedAgentId(null);
    setViewingSymbol(null);
    setIsCreatingAgent(false);
    setEditingAgent(null);
    setActiveHub('feed');
    setSelectedPlaybookId(null);
  }

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
                  <Card className="min-w-0" title={<Title level={4} style={{ margin: 0 }}><FileTextOutlined /> {t('nav.feed')}</Title>}>
                    {feedLoading ? (
                      <div className="space-y-3">
                        {[1,2,3].map(i => <Skeleton key={i} active paragraph={{ rows: 2 }} />)}
                      </div>
                    ) : feedReports.length === 0 ? (
                      <div className="flex flex-col items-center gap-4 py-12 text-center">
                        <span className="text-5xl">📊</span>
                        <div>
                          <p className="text-base font-semibold text-gray-800 dark:text-gray-100">{t('nav.feedEmpty')}</p>
                          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-xs mx-auto">{t('nav.feedEmptyDesc')}</p>
                        </div>
                        <Button type="primary" onClick={() => setActiveHub('sources')}>{t('nav.library')}</Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {feedReports.slice(0, 30).map((report) => {
                          const signals = report.signals ?? [];
                          const bullCount = signals.filter((s) => s.side === 'long').length;
                          const bearCount = signals.filter((s) => s.side === 'short').length;
                          return (
                            <div
                              key={report.id}
                              className="rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 hover:border-blue-200 dark:hover:border-blue-700 cursor-pointer transition-colors"
                              onClick={() => {
                                const pb = playbooks.find((p) => p.agentId === report.agentId);
                                if (pb) {
                                  setSelectedPlaybookId(pb.id);
                                  setActiveHub('sources');
                                  setActivePlaybookTab('reports');
                                  setHighlightedReportId(report.id);
                                }
                              }}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2 mb-1">
                                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{report.agentName}</span>
                                    {report.playbookName && <Tag className="m-0 text-xs">{report.playbookName}</Tag>}
                                  </div>
                                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2">{report.summary}</p>
                                </div>
                                <div className="flex flex-col items-end gap-1 shrink-0">
                                  <span className="text-xs text-gray-400">{new Date(report.createdAt).toLocaleDateString()}</span>
                                  <div className="flex gap-1">
                                    {bullCount > 0 && <Tag color="green" className="m-0 text-xs">▲ {bullCount}</Tag>}
                                    {bearCount > 0 && <Tag color="red" className="m-0 text-xs">▼ {bearCount}</Tag>}
                                  </div>
                                </div>
                              </div>
                              {signals.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {signals.slice(0, 6).map((s, i) => (
                                    <Tag key={i} color={s.side === 'long' ? 'green' : s.side === 'short' ? 'red' : 'default'} className="m-0 text-xs">{s.symbol}</Tag>
                                  ))}
                                  {signals.length > 6 && <Tag className="m-0 text-xs text-gray-400">+{signals.length - 6}</Tag>}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                )
              },
              {
                key: 'sources',
                label: <span><DatabaseOutlined /> {t('nav.library')}</span>,
                children: (
                  <Card
                    className="min-w-0"
                    title={<Title level={4} style={{ margin: 0 }}><DatabaseOutlined /> {t('nav.library')}</Title>}
                  >
                   {/* First-run onboarding checklist — shown until all 4 steps complete or dismissed */}
                   {(forceShowOnboarding || (!onboardingDismissed && !showAdminWorkspace && onboardingDataLoaded && !onboardingAllDone)) ? (
                     <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950 px-5 py-4">
                       <div className="flex items-start justify-between gap-3">
                         <div className="min-w-0">
                           <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">{t('onboarding.gettingStarted')}</p>
                           <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">{t('onboarding.gettingStartedDesc')}</p>
                         </div>
                         <Button
                           type="text"
                           size="small"
                           className="shrink-0 text-indigo-400 hover:text-indigo-600"
                           onClick={() => {
                             localStorage.setItem('chattrader:onboarding:dismissed', '1');
                             setOnboardingDismissed(true);
                           }}
                         >
                           {t('onboarding.dismiss')}
                         </Button>
                       </div>
                       <div className="mt-3 space-y-2">
                         {[
                           { done: sources.length > 0, label: t('onboarding.step1'), desc: t('onboarding.step1Desc'), action: () => { setEditingSource(null); setIsSourceCreateOpen(true); setSourceUrlDraft(''); setAutoDetectedSource(null); } },
                           { done: agents.length > 0, label: t('onboarding.step2'), desc: t('onboarding.step2Desc'), action: () => setActiveHub('agents') },
                           { done: playbooks.length > 0, label: t('onboarding.step3'), desc: t('onboarding.step3Desc'), action: () => openPlaybookCreate() },
                           { done: onboardingHasFirstReport, label: t('onboarding.step4'), desc: t('onboarding.step4Desc'), action: () => setActiveHub('feed') },
                         ].map((step, i) => (
                           <div key={i} className={`flex items-center gap-3 rounded-lg px-3 py-2 ${step.done ? 'opacity-50' : 'bg-white dark:bg-indigo-900'}`}>
                             <span className="text-lg shrink-0">{step.done ? '✅' : '⬜'}</span>
                             <div className="min-w-0 flex-1">
                               <p className={`text-xs font-medium ${step.done ? 'line-through text-gray-400' : 'text-indigo-900 dark:text-indigo-100'}`}>{step.label}</p>
                               <p className="text-xs text-indigo-500 dark:text-indigo-400">{step.desc}</p>
                             </div>
                             {!step.done && (
                               <Button size="small" type="primary" onClick={step.action}>
                                 {t('common.next')}
                               </Button>
                             )}
                           </div>
                         ))}
                       </div>
                     </div>
                   ) : null}
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
                         {filteredMarketplaceSources.map((item) => {
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
                                   <div className="flex h-14 w-14 items-center justify-center rounded-md border border-dashed text-[10px] text-muted-foreground">
                                     Cover unavailable
                                   </div>
                                 )}
                                 <div className="min-w-0">
                                   <div className="text-sm font-semibold">{getSourceDisplayTitle(src)}</div>
                                   <Text type="secondary" className="text-xs">{item.value}</Text>
                                   <div className="mt-1 flex flex-wrap gap-1 text-xs">
                                     <SourceTypeBadge type={item.type} />
                                     <Tag>{getSourceKindLabel(src)}</Tag>
                                     {(item.type === 'podcast_feeds' || item.type === 'youtube_videos') ? (
                                       <Tag color="blue">Episodes: {getSourceEpisodeCount(src)}</Tag>
                                     ) : null}
                                   </div>
                                 </div>
                               </div>
                               <div className="mt-3 text-xs text-muted-foreground">
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
                     const selectedSource = sources.find((s) => s.id === selectedSourceId);
                     const linkedPlaybooks = playbooks.filter((p) => p.sourceIds.includes(selectedSourceId));
                     return selectedSource ? (
                       <Card
                         className="min-w-0"
                         title={
                           <span className="flex items-center gap-2">
                             {getSourceDisplayTitle(selectedSource)}
                             <SourceTypeBadge type={selectedSource.type} />
                           </span>
                         }
                         extra={
                           <div className="flex items-center gap-2">
                             {linkedPlaybooks.length > 0 && (selectedSource.type !== 'youtube_videos' && selectedSource.type !== 'podcast_feeds') ? (
                               <TouchSafeTooltip title={t('library.runAnalysisNow')}>
                                 <Button
                                   aria-label={t('library.runAnalysisNow')}
                                   shape="circle"
                                   loading={runningAgentId === linkedPlaybooks[0]?.agentId}
                                   icon={<CaretRightOutlined />}
                                   onClick={() => void onRunSourceEpisode(undefined)}
                                 />
                               </TouchSafeTooltip>
                             ) : null}
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
                             <TouchSafeTooltip title={t('library.backToLibrary')}>
                               <Button
                                 aria-label={t('library.backToLibrary')}
                                 shape="circle"
                                 icon={<ArrowLeftOutlined />}
                                 onClick={() => setSelectedSourceId(null)}
                               />
                             </TouchSafeTooltip>
                             <TouchSafeTooltip title={t('common.edit')}>
                               <Button
                                 aria-label={t('common.edit')}
                                 shape="circle"
                                 icon={<EditOutlined />}
                                 onClick={() => onEditSource(selectedSource)}
                               />
                             </TouchSafeTooltip>
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
                             <div className="flex gap-3 mb-4 pb-4 border-b border-border">
                               {coverUrl ? (
                                 <img src={coverUrl} alt="" className="w-20 h-20 rounded-lg object-cover flex-shrink-0 bg-muted" />
                               ) : (
                                 <div className="w-20 h-20 rounded-lg flex-shrink-0 bg-muted flex items-center justify-center text-2xl">
                                   {selectedSource.type === 'youtube_videos' ? '📺' : selectedSource.type === 'podcast_feeds' ? '🎙' : '🌐'}
                                 </div>
                               )}
                               <div className="min-w-0 flex-1">
                                 <a
                                   href={selectedSource.value}
                                   target="_blank"
                                   rel="noopener noreferrer"
                                   className="text-sm text-[#9d6fe8] hover:underline flex items-center gap-1"
                                   onClick={(e) => e.stopPropagation()}
                                 >
                                   {hostname} <LinkOutlined className="text-xs" />
                                 </a>
                                 {episodeCount > 0 ? (
                                   <p className="text-xs text-muted-foreground mt-0.5">
                                     {episodeCount} {selectedSource.type === 'youtube_videos' ? 'videos' : selectedSource.type === 'podcast_feeds' ? 'episodes' : 'pages'}
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
                                     <span className="text-muted-foreground mr-1">Latest:</span>
                                     {latestItem.title}
                                     {latestItem.pubDate ? <span className="ml-1 text-muted-foreground">· {new Date(latestItem.pubDate).toLocaleDateString()}</span> : null}
                                   </a>
                                 ) : null}
                               </div>
                             </div>
                             {linkedPlaybooks.length > 0 ? (
                               <div className="mt-3 pt-3 border-t border-border">
                                 <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">🤖 {t('library.expertsWatching')}</p>
                                 <div className="flex flex-col gap-1.5">
                                   {linkedPlaybooks.map((pb) => {
                                     const agent = agents.find((a) => a.id === pb.agentId);
                                     const characterLabel = agent?.characterType ? humanizeCharacterType(agent.characterType) : null;
                                     return (
                                       <div key={pb.id} className={`flex items-start gap-2 text-xs transition-opacity ${pb.enabled ? '' : 'opacity-60'}`}>
                                         <div className="flex flex-col gap-1 flex-1 min-w-0">
                                           <div className="flex flex-wrap items-center gap-1.5">
                                             {characterLabel ? (
                                               <Tag className="m-0" color={getCharacterTypeColor(agent?.characterType)} icon={getCharacterIcon(agent?.characterType)}>{characterLabel}</Tag>
                                             ) : null}
                                             {agent?.promptConfig?.personality_label ? (
                                               <Tag className="m-0" color="magenta">{agent.promptConfig.personality_label}</Tag>
                                             ) : null}
                                           </div>
                                           <div className="flex items-center gap-1.5 text-muted-foreground">
                                             <span>{formatPlaybookSchedule(pb.schedule)}</span>
                                             <Tag color={pb.enabled ? 'green' : 'default'} className="m-0 leading-none py-0">{pb.enabled ? t('playbook.active') : t('playbook.paused')}</Tag>
                                           </div>
                                           {pb.recipients.length > 0 && (
                                             <div className="flex flex-wrap gap-1 text-muted-foreground mt-0.5">
                                               <MailOutlined className="opacity-50 mt-0.5" />
                                               {pb.recipients.slice(0, 2).map((r) => (
                                                 <span key={r} className="truncate max-w-[120px]">{r}</span>
                                               ))}
                                               {pb.recipients.length > 2 && (
                                                 <span className="text-gray-400">+{pb.recipients.length - 2}</span>
                                               )}
                                             </div>
                                           )}
                                         </div>
                                         <TouchSafeTooltip title={pb.notificationsEnabled !== false ? t('playbook.notificationsOn') : t('playbook.notificationsOff')}>
                                           <Button
                                             size="small"
                                             shape="circle"
                                             aria-label={pb.notificationsEnabled !== false ? t('playbook.notificationsOn') : t('playbook.notificationsOff')}
                                             icon={pb.notificationsEnabled !== false ? <MailOutlined /> : <MailOutlined style={{ opacity: 0.3 }} />}
                                             onClick={async (e) => {
                                               e.stopPropagation();
                                               await updatePlaybook(pb.id, { notificationsEnabled: !(pb.notificationsEnabled !== false) });
                                               await refreshPlaybooks();
                                             }}
                                           />
                                         </TouchSafeTooltip>
                                         <Dropdown
                                           trigger={['click']}
                                           menu={{
                                             selectedKeys: [pb.digestFrequency ?? 'immediate'],
                                             items: [
                                               { key: 'immediate', label: t('playbook.digestImmediate') },
                                               { key: 'daily', label: t('playbook.digestDaily') },
                                               { key: 'weekly', label: t('playbook.digestWeekly') }
                                             ],
                                             onClick: async ({ key, domEvent }) => {
                                               domEvent.stopPropagation();
                                               await updatePlaybook(pb.id, { digestFrequency: key as DigestFrequency });
                                               await refreshPlaybooks();
                                             }
                                           }}
                                         >
                                           <TouchSafeTooltip
                                             title={`${t('playbook.digestFrequency')}: ${t(
                                               (pb.digestFrequency ?? 'immediate') === 'daily'
                                                 ? 'playbook.digestDaily'
                                                 : (pb.digestFrequency ?? 'immediate') === 'weekly'
                                                   ? 'playbook.digestWeekly'
                                                   : 'playbook.digestImmediate'
                                             )}`}
                                           >
                                             <Button
                                               size="small"
                                               shape="circle"
                                               aria-label={t('playbook.digestFrequency')}
                                               icon={
                                                 <FieldTimeOutlined
                                                   style={(pb.digestFrequency ?? 'immediate') === 'immediate' ? { opacity: 0.3 } : undefined}
                                                 />
                                               }
                                               onClick={(e) => e.stopPropagation()}
                                             />
                                           </TouchSafeTooltip>
                                         </Dropdown>
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
                                         <TouchSafeTooltip title={t('common.edit')}>
                                           <Button
                                             size="small"
                                             shape="circle"
                                             aria-label={t('common.edit')}
                                             icon={<EditOutlined />}
                                          onClick={(e) => { e.stopPropagation(); onOpenScheduleEdit(pb, e); }}
                                           />
                                         </TouchSafeTooltip>
                                         <InlineDeleteButton
                                           ariaLabel={`Remove ${agents.find((a) => a.id === pb.agentId)?.name ?? 'agent'} from this source`}
                                           confirmText={t('common.delete')}
                                           onConfirm={async () => {
                                             await deletePlaybook(pb.id);
                                             await refreshPlaybooks();
                                           }}
                                         />
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
                                       const episodes = selectedSource.metadata.previewItems.filter((item) => Boolean(item.link));
                                       const linkedAgent = agents.find((a) => a.id === linkedPlaybooks[0]?.agentId);
                                       return episodes.length === 0 ? (
                                         <Empty description={<span className="text-sm text-muted-foreground">{t('library.noEpisodes')}</span>} />
                                       ) : (
                                         <ul className="divide-y divide-border">
                                           {episodes.map((ep) => {
                                             const videoId = selectedSource.type === 'youtube_videos' ? extractYoutubeVideoId(ep.link) : null;
                                             return (
                                               <li key={ep.link} className="flex items-center gap-3 py-2.5">
                                                 {videoId ? (
                                                   <img
                                                     src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`}
                                                     alt=""
                                                     className="w-16 h-11 rounded object-cover flex-shrink-0 bg-muted"
                                                   />
                                                 ) : null}
                                                 <div className="min-w-0 flex-1">
                                                   <div className="truncate text-sm font-medium">{ep.title}</div>
                                                   {ep.pubDate ? (
                                                     <div className="mt-0.5 text-xs text-muted-foreground">
                                                       {new Date(ep.pubDate).toLocaleDateString()}
                                                     </div>
                                                   ) : null}
                                                 </div>
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
                                                 {linkedAgent ? (
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
                                 ) : (
                                   <AgentReportsBrowser
                                     agentId={linkedPlaybooks[0].agentId}
                                     agentName={agents.find((a) => a.id === linkedPlaybooks[0].agentId)?.name}
                                     collapsible
                                     reports={sourceDetailReports}
                                     onSelectSymbol={setViewingSymbol}
                                   />
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
                   <div className="grid gap-3 sm:grid-cols-2">
                     {filteredSources.map((source) => {
                       const isRecentlyUpdated = recentlyUpdatedSourceId === source.id;
                       const linkedForCard = playbooks.filter((p) => p.sourceIds.includes(source.id));
                       const cardAgentLinks = linkedForCard
                         .map((playbook) => {
                           const agent = agents.find((candidate) => candidate.id === playbook.agentId);
                           return agent ? { playbook, agent } : null;
                         })
                         .filter((link): link is { playbook: PlaybookRecord; agent: AgentSummary } => Boolean(link));
                       const cardAgentIds = new Set(cardAgentLinks.map(({ agent }) => agent.id));
                       const cardReports = feedReports.filter((report) => cardAgentIds.has(report.agentId));
                       const latestCardReport = cardReports[0];
                       const coverImageUrl = getSourceCoverImageUrl(source);
                       return (
                       <Card
                         key={source.id}
                         size="small"
                         hoverable
                         onClick={() => { setRecentlyUpdatedSourceId(null); setSelectedSourceId(source.id); setActiveSourceTab(source.type === 'youtube_videos' || source.type === 'podcast_feeds' ? 'episodes' : 'reports'); }}
                         style={{ cursor: 'pointer', outline: isRecentlyUpdated ? '2px solid #722ed1' : undefined, outlineOffset: isRecentlyUpdated ? '2px' : undefined }}
                         styles={{ body: { display: 'flex', flexDirection: 'column', flex: 1, padding: 0 } }}
                         className="overflow-hidden border border-[rgba(114,46,209,0.18)] shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-[rgba(114,46,209,0.38)] hover:shadow-md dark:border-[rgba(167,139,250,0.30)] dark:hover:border-[rgba(167,139,250,0.55)] flex flex-col"
                       >
                         <div className="relative h-44 overflow-hidden bg-slate-900">
                           {source.type === 'synthetic_discussion' ? (
                             <div className="relative flex h-full items-center justify-center overflow-hidden bg-gradient-to-br from-[#1e1239] via-[#54239a] to-[#164e78]">
                               <div aria-hidden="true" className="absolute -left-12 -top-16 h-44 w-44 rounded-full bg-violet-300/30 blur-3xl" />
                               <div aria-hidden="true" className="absolute -bottom-20 -right-8 h-52 w-52 rounded-full bg-sky-300/25 blur-3xl" />
                               <div className="relative flex h-24 w-24 items-center justify-center rounded-[1.75rem] border border-white/25 bg-white/15 text-white shadow-xl shadow-violet-950/40 backdrop-blur-sm">
                                 <AudioOutlined className="text-5xl" />
                               </div>
                             </div>
                           ) : coverImageUrl ? (
                             <>
                               <img aria-hidden="true" src={coverImageUrl} className="absolute -inset-4 h-[calc(100%+2rem)] w-[calc(100%+2rem)] object-cover blur-xl opacity-60" />
                               <img src={coverImageUrl} alt={`${getSourceDisplayTitle(source)} cover`} className="relative h-full w-full object-contain" />
                             </>
                           ) : (
                             <div className="flex h-full items-center justify-center text-sm text-slate-300">{t('library.coverUnavailable')}</div>
                           )}
                           <div className="absolute left-3 top-3">
                             <SourceTypeBadge type={source.type} />
                           </div>
                           <div className="absolute right-2 top-2" onClick={(event) => event.stopPropagation()}>
                             <EntityActions
                               entityLabel="source"
                               isOwner={source.ownerUserId === user?.id}
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
                           </div>
                         </div>
                         <div className="flex flex-1 flex-col p-4">
                           <div className="min-w-0">
                             <div className="text-base font-semibold leading-snug">{getSourceDisplayTitle(source)}</div>
                             {source.type !== 'synthetic_discussion' && (
                               <Text type="secondary" className="block truncate text-xs">{source.value}</Text>
                             )}
                           </div>
                         <div className="mt-4 text-xs">
                           {source.metadata.previewItems.length > 0 ? (
                             <>
                               <div className="mb-1 font-medium text-muted-foreground">
                                 {source.type === 'synthetic_discussion' ? t('library.recentRuns') : t('library.recentItems')}
                               </div>
                               <ul className="space-y-1 text-foreground">
                                 {source.metadata.previewItems.slice(0, 2).map((item) => (
                                   <li key={`${source.id}:${item.link ?? item.title}`} className="truncate">▶ {item.title}</li>
                                 ))}
                               </ul>
                             </>
                           ) : (
                             <span className="text-muted-foreground">
                               {source.type === 'synthetic_discussion' ? t('library.noRuns') : t('library.noEpisodes')}
                             </span>
                           )}
                         </div>
                         <div className="mt-4" onClick={(event) => event.stopPropagation()}>
                           <Button
                             type="text"
                             block
                             className={`h-auto rounded-lg border px-3 py-2 text-left ${
                               latestCardReport
                                 ? 'border-violet-200 bg-violet-50/70 hover:!border-violet-300 hover:!bg-violet-100/70 dark:border-violet-500/30 dark:bg-violet-950/30 dark:hover:!border-violet-400/50 dark:hover:!bg-violet-950/50'
                                 : 'border-dashed border-border bg-muted/30 hover:!border-violet-300 hover:!bg-violet-50/50 dark:hover:!border-violet-400/50 dark:hover:!bg-violet-950/30'
                             }`}
                             aria-label={latestCardReport ? t('library.openReports', { count: cardReports.length }) : t('library.noReportsYet')}
                             onClick={() => {
                               setRecentlyUpdatedSourceId(null);
                               setSelectedSourceId(source.id);
                               setActiveSourceTab('reports');
                             }}
                           >
                             <span className="flex items-center gap-2">
                               <CheckCircleOutlined
                                 className={latestCardReport ? 'text-emerald-500 dark:text-emerald-400' : 'text-muted-foreground'}
                               />
                               <span className="min-w-0 flex-1">
                                 <span className="block text-xs font-semibold text-foreground">
                                   {latestCardReport ? t('library.reportsAvailable', { count: cardReports.length }) : t('library.noReportsYet')}
                                 </span>
                                 <span className="block truncate text-[11px] text-muted-foreground">
                                   {latestCardReport
                                     ? t('library.latestReportAt', {
                                         date: new Date(latestCardReport.createdAt).toLocaleDateString(i18n.language, {
                                           day: 'numeric',
                                           month: 'short'
                                         })
                                       })
                                     : t('library.reportsWillAppearHere')}
                                 </span>
                               </span>
                               {latestCardReport ? <span className="text-base text-violet-500 dark:text-violet-300">›</span> : null}
                             </span>
                           </Button>
                         </div>
                         <div className="mt-6 border-t border-border pt-4" onClick={(event) => event.stopPropagation()}>
                           <div className="mb-2 text-xs font-medium text-muted-foreground">{t('library.agentFollowLabel')}</div>
                           <div className="rounded-lg border border-slate-200/80 bg-slate-50/60 p-3 dark:border-slate-700/80 dark:bg-slate-800/40">
                             <div className="flex flex-wrap items-start gap-3">
                               {cardAgentLinks.map(({ agent, playbook }) => {
                                 const characterLabel = getAgentCharacterLabel(agent);
                                 const personalityLabel = getAgentPersonalityLabel(agent);
                                 const canRemove = source.ownerUserId === user?.id;
                                 return (
                                   <div key={playbook.id} className="group relative">
                                     <TouchSafeTooltip
                                       title={<div><div className="font-medium">{agent.name}</div><div>{humanizeCharacterType(agent.characterType)}</div><div>{personalityLabel}</div></div>}
                                     >
                                       <Button
                                         type="text"
                                         aria-label={`${agent.name}: ${characterLabel}, ${humanizeCharacterType(agent.characterType)}, ${personalityLabel}`}
                                         className="h-auto w-12 p-0"
                                       >
                                         <span className="flex flex-col items-center gap-1 text-center">
                                           <span className={`flex h-10 w-10 items-center justify-center rounded-full text-lg ${PERSONA_ICON_BG_MAP[agent.characterType ?? 'summarizer']}`}>
                                             {getCharacterIcon(agent.characterType)}
                                           </span>
                                           <span className="w-full truncate text-[10px] leading-tight">{characterLabel}</span>
                                         </span>
                                       </Button>
                                     </TouchSafeTooltip>
                                     {canRemove ? (
                                       <TouchSafeTooltip title={t('library.removeAgentFromSource')}>
                                         <Popconfirm
                                           title={t('library.removeAgentConfirm', { name: agent.name })}
                                           description={t('library.removeAgentConfirmDescription')}
                                           okText={t('common.remove')}
                                           cancelText={t('common.cancel')}
                                           onConfirm={() => void onRemoveAgentFromSource(playbook, source.id)}
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
                                   onClick={(event) => onFollowSource(source, event)}
                                 />
                               </TouchSafeTooltip>
                             </div>
                           </div>
                         </div>
                         </div>
                       </Card>
                       );
                     })}
                     {sources.length === 0 ? (
                       <div className="col-span-full flex flex-col items-center gap-4 rounded-xl border border-dashed border-border py-12 px-6 text-center">
                         <span className="text-5xl">📚</span>
                         <div>
                           <p className="text-base font-semibold text-foreground">{t('library.emptyHeadline')}</p>
                           <p className="mt-1 text-sm text-muted-foreground max-w-xs mx-auto">{t('library.emptyDesc')}</p>
                         </div>
                         <Button
                           type="primary"
                           size="large"
                           icon={<PlusCircleOutlined />}
                           onClick={() => {
                             setEditingSource(null);
                             setIsSourceCreateOpen(true);
                             setSourceUrlDraft('');
                             setAutoDetectedSource(null);
                           }}
                         >
                           {t('library.emptyCta')}
                         </Button>
                         <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
                           <span className="font-medium text-foreground">{t('library.howItWorks')}:</span>
                           {[
                             t('library.howStep1'),
                             t('library.howStep2'),
                             t('library.howStep3'),
                           ].map((step, i, arr) => (
                             <span key={step} className="flex items-center gap-1">
                               <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700 dark:bg-sky-950 dark:text-sky-300">{step}</span>
                               {i < arr.length - 1 ? <span className="text-muted-foreground/50">→</span> : null}
                             </span>
                           ))}
                         </div>
                       </div>
                     ) : null}
                     {sources.length > 0 && (
                       <GhostCreateCard
                         ariaLabel={t('library.addSource')}
                         onClick={() => {
                           setEditingSource(null);
                           setIsSourceCreateOpen(true);
                           setSourceUrlDraft('');
                           setAutoDetectedSource(null);
                         }}
                         icon={<DatabaseOutlined />}
                         title={t('library.addSource')}
                         sub="YouTube, podcast, or any website"
                       />
                     )}
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
                                   ? autoDetectedSource.previewItems.map((item) => (
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
                            <TouchSafeTooltip title="Remove agent">
                                <InlineDeleteButton
                                  ariaLabel="Remove agent"
                                  confirmText="Remove"
                                  onConfirm={() => onDeleteAgent(selectedAgent)}
                                />
                              </TouchSafeTooltip>
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
                        {loadState === 'loading' ? (
                          <div className="grid gap-3 sm:grid-cols-2">
                            {[1, 2, 3, 4].map((i) => (
                              <Card key={i} size="small" className="min-h-[170px]">
                                <Skeleton active paragraph={{ rows: 3 }} />
                              </Card>
                            ))}
                          </div>
                        ) : null}
                        {loadState === 'error' ? <p className="text-sm text-red-700">Failed to load agents.</p> : null}
                        {loadState !== 'loading' && filteredAgents.length === 0 && !showAgentsMarketplace ? (
                          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-gray-200 py-12 px-6 text-center dark:border-gray-700">
                            <span className="text-5xl">🤖</span>
                            <div>
                              <p className="text-base font-semibold text-gray-800 dark:text-gray-100">{t('agent.emptyHeadline')}</p>
                              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-xs mx-auto">{t('agent.emptyDesc')}</p>
                            </div>
                            <Button
                              type="primary"
                              size="large"
                              icon={<PlusCircleOutlined />}
                              onClick={() => {
                                setIsCreatingAgent(true);
                                setEditingAgent(null);
                                setSelectedAgentId(null);
                              }}
                            >
                              {t('agent.emptyCta')}
                            </Button>
                            {sources.length === 0 ? (
                              <p className="text-xs text-amber-600 dark:text-amber-400 max-w-xs">{t('agent.emptySourceHint')}</p>
                            ) : null}
                          </div>
                        ) : null}
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
                          <GhostCreateCard
                           ariaLabel={t('agent.emptyCta')}
                           onClick={() => {
                             setIsCreatingAgent(true);
                             setEditingAgent(null);
                             setSelectedAgentId(null);
                           }}
                           icon={<AppstoreOutlined />}
                           title={t('agent.createNew')}
                           sub={t('agent.createNewSub')}
                           className="w-full"
                          />
                        </div>
                        <Modal
                          title={<span className="flex items-center gap-2"><CompassOutlined className="text-sky-500" />{t('marketplace.heading')} — {t('nav.agents')}</span>}
                          open={showAgentsMarketplace}
                          onCancel={() => { setShowAgentsMarketplace(false); setMarketplaceAgentsSearch(''); }}
                          footer={null}
                          destroyOnHidden
                        >
                          <div className="space-y-3">
                            <Input
                              aria-label="Search marketplace agents"
                              value={marketplaceAgentsSearch}
                              onChange={(e) => setMarketplaceAgentsSearch(e.currentTarget.value)}
                              placeholder="Search by name or description"
                              prefix={<SearchOutlined />}
                              allowClear
                            />
                            {filteredMarketplaceAgents.length === 0 ? (
                              <div className="flex flex-col items-center gap-3 py-8 text-center">
                                <span className="text-4xl">🧭</span>
                                <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">{marketplaceAgentsSearch ? t('marketplace.noItems') : t('marketplace.emptyHeadline')}</p>
                              </div>
                            ) : null}
                            {filteredMarketplaceAgents.map((item) => (
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
                        title={
                          <span className="flex items-center gap-2">
                            {selectedPlaybook.name}
                            {runningAgentId === selectedPlaybook.agentId ? (
                              <Tag color="processing" icon={<LoadingOutlined spin />} className="m-0">Running</Tag>
                            ) : null}
                          </span>
                        }
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
                              label: t('library.runsTab'),
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
                        {playbooksLoadState !== 'loading' && filteredPlaybooks.length === 0 ? (
                          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-gray-200 py-12 px-6 text-center dark:border-gray-700">
                            <span className="text-5xl">📅</span>
                            <div>
                              <p className="text-base font-semibold text-gray-800 dark:text-gray-100">{t('playbook.emptyHeadline')}</p>
                              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-xs mx-auto">{t('playbook.emptyDesc')}</p>
                            </div>
                            {sources.length === 0 ? (
                              <Button
                                size="large"
                                onClick={() => setActiveHub('sources')}
                              >
                                {t('playbook.emptyCtaNoSources')}
                              </Button>
                            ) : agents.length === 0 ? (
                              <Button
                                size="large"
                                onClick={() => setActiveHub('agents')}
                              >
                                {t('playbook.emptyCtaNoAgents')}
                              </Button>
                            ) : (
                              <Button
                                type="primary"
                                size="large"
                                icon={<PlusCircleOutlined />}
                                onClick={openPlaybookCreate}
                              >
                                {t('playbook.emptyCtaReady')}
                              </Button>
                            )}
                          </div>
                        ) : null}
                        {/* Marketplace quick-start strip — shown when empty and marketplace has items */}
                        {playbooksLoadState !== 'loading' && filteredPlaybooks.length === 0 && marketplacePlaybooks.length > 0 ? (
                          <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 dark:border-sky-800 dark:bg-sky-950 px-5 py-4">
                            <div className="flex items-center gap-2 mb-3">
                              <CompassOutlined className="text-sky-500" />
                              <p className="text-sm font-semibold text-sky-800 dark:text-sky-200">{t('marketplace.quickStartHeading')}</p>
                            </div>
                            <p className="text-xs text-sky-600 dark:text-sky-400 mb-3">{t('marketplace.quickStartDesc')}</p>
                            <div className="space-y-2">
                              {marketplacePlaybooks.slice(0, 3).map((item) => (
                                <div key={item.publicationId} className="flex items-center justify-between gap-3 rounded-lg bg-white dark:bg-sky-900 px-3 py-2">
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">{item.title}</p>
                                    <p className="text-xs text-gray-500 truncate">{item.summary || item.playbook.name}</p>
                                  </div>
                                  <Button
                                    size="small"
                                    type="primary"
                                    loading={cloningPublicationId === item.publicationId}
                                    onClick={() => onCloneMarketplacePlaybook(item.publicationId)}
                                  >
                                    {t('marketplace.followPlaybook')}
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
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
                                    <TouchSafeTooltip title={playbook.enabled ? t('playbook.pause') : t('playbook.resume')}>
                                      <Button
                                        aria-label={playbook.enabled ? `${t('playbook.pause')} playbook` : `${t('playbook.resume')} playbook`}
                                        shape="circle"
                                        loading={togglingPlaybookId === playbook.id}
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
                                {runningAgentId === playbook.agentId ? (
                                  <Tag color="processing" icon={<LoadingOutlined spin />}>Running</Tag>
                                ) : playbook.enabled ? (
                                  <Tag color="success">{t('playbook.active')}</Tag>
                                ) : (
                                  <Tag color="default">{t('playbook.paused')}</Tag>
                                )}
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
                          {filteredPlaybooks.length > 0 && (
                           <GhostCreateCard
                            ariaLabel={t('playbook.emptyCtaReady')}
                            onClick={openPlaybookCreate}
                            icon={<RocketOutlined />}
                            title={t('playbook.createNew')}
                            sub={t('playbook.createNewSub')}
                           />
                          )}
                        </div>
                      </>
                    )}
                    <Modal
                      title={<span className="flex items-center gap-2"><CompassOutlined className="text-sky-500" />{t('marketplace.heading')} — {t('nav.playbooks')}</span>}
                      open={showPlaybooksMarketplace}
                      onCancel={() => { setShowPlaybooksMarketplace(false); setMarketplacePlaybooksSearch(''); }}
                      footer={null}
                      destroyOnHidden
                    >
                      <div className="space-y-3">
                        <Input
                          aria-label="Search marketplace playbooks"
                          value={marketplacePlaybooksSearch}
                          onChange={(e) => setMarketplacePlaybooksSearch(e.currentTarget.value)}
                          placeholder="Search by name or description"
                          prefix={<SearchOutlined />}
                          allowClear
                        />
                        {filteredMarketplacePlaybooks.length === 0 ? (
                          <div className="flex flex-col items-center gap-3 py-8 text-center">
                            <span className="text-4xl">🧭</span>
                            <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">{marketplacePlaybooksSearch ? t('marketplace.noItems') : t('marketplace.emptyHeadline')}</p>
                          </div>
                        ) : null}
                        {filteredMarketplacePlaybooks.map((item) => (
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
                                {cloningPublicationId === item.publicationId ? t('marketplace.cloningButton') : t('marketplace.cloneButton')}
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
        width="min(720px, 95vw)"
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
                          <SourceTypeBadge type={source.type} />
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
            <>
            <div className="space-y-3">
              {/* Hide agent selection grid when the inline creation sub-wizard is active */}
              {!showInlineAgentCreate ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {agents.map((agent) => {
                  const selected = playbookAgentIdsDraft.includes(agent.id);
                  const anySelected = playbookAgentIdsDraft.length > 0;
                  const isFocused = wizardFocusedAgentId === agent.id;
                  const { intro, icon, characterLabel, personalityLabel, personaId } = getAgentCardDisplay(agent, t);
                  const iconBgClass = PERSONA_ICON_BG_MAP[personaId] ?? PERSONA_ICON_BG_MAP['summarizer'];
                  const tagColor = getCharacterTypeColor(personaId);

                  const linkedPlaybookEntry = wizardAlreadyLinkedPlaybooks.find((p) => p.agentId === agent.id);
                  // If this agent is already linked to the current source, show that playbook's schedule.
                  // Otherwise fall back to any playbook the agent owns (as a hint of their typical schedule).
                  const linkedPlaybook = linkedPlaybookEntry
                    ? playbooks.find((p) => p.id === linkedPlaybookEntry.playbookId)
                    : playbooks.find((p) => p.agentId === agent.id);
                  const linkedToThisSource = Boolean(linkedPlaybookEntry);

                  return (
                    <div
                      key={agent.id}
                      className={`transition-opacity ${anySelected && !selected ? 'opacity-40' : 'opacity-100'}`}
                    >
                    <WizardSelectableCard
                      ariaLabel={`Select agent ${agent.name}`}
                      selected={selected}
                      onClick={() => {
                        // Always toggle — works in both create and edit modes
                        setPlaybookAgentIdsDraft((prev) =>
                          prev.includes(agent.id) ? prev.filter((id) => id !== agent.id) : [...prev, agent.id]
                        );
                        setShowInlineAgentCreate(false);
                      }}
                    >
                      {/* Row 1: icon pill + agent name + controls */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`shrink-0 rounded-md p-1.5 text-base leading-none ${iconBgClass}`}>
                            {icon}
                          </span>
                          <span className="text-sm font-semibold truncate">
                            <Badge status={agent.status === 'disabled' ? 'default' : 'success'} text={agent.name} />
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {isFocused ? (
                            <Tag color="blue" className="m-0 text-xs">{t('common.editing') || 'Editing'}</Tag>
                          ) : (
                            <InlineDeleteButton
                                ariaLabel={`Delete agent ${agent.name}`}
                                confirmText={t('common.delete')}
                                onConfirm={async () => {
                                  setPlaybookAgentIdsDraft((prev) => prev.filter((id) => id !== agent.id));
                                  setWizardAlreadyLinkedAgentIds((prev) => prev.filter((id) => id !== agent.id));
                                  setWizardAlreadyLinkedPlaybooks((prev) => prev.filter((p) => p.agentId !== agent.id));
                                  setAgents((prev) => prev.filter((candidate) => candidate.id !== agent.id));
                                }}
                              />
                          )}
                        </div>
                      </div>
                      {/* Row 2: character + personality identity tags */}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Tag color={tagColor}>{characterLabel}</Tag>
                        <Tag color="magenta">{personalityLabel}</Tag>
                      </div>
                      {/* Row 3: greeting intro — quoted and italic */}
                      <p className="mt-2 text-xs italic text-gray-500 dark:text-gray-400 leading-relaxed">
                        &ldquo;{intro}&rdquo;
                      </p>
                      {/* Row 4: schedule + recipients — current source if linked, otherwise from agent's other playbooks as a hint */}
                      {linkedPlaybook && (
                        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                          {!linkedToThisSource && (
                            <span className="w-full text-gray-300 dark:text-gray-600 italic">{t('playbook.scheduleHint') || 'typical:'}</span>
                          )}
                          <span className="flex items-center gap-1">
                            <ClockCircleOutlined />
                            {formatPlaybookSchedule(linkedPlaybook.schedule)}
                          </span>
                          {linkedPlaybook.recipients.length > 0 && (
                            <span className="flex items-center gap-1">
                              <MailOutlined />
                              {linkedPlaybook.recipients.slice(0, 2).join(', ')}
                              {linkedPlaybook.recipients.length > 2 && ` +${linkedPlaybook.recipients.length - 2}`}
                            </span>
                          )}
                        </div>
                      )}
                    </WizardSelectableCard>
                    </div>
                  );
                })}
                {/* "Create new agent" ghost card — shown only when not in sub-wizard */}
                <GhostCreateCard
                  ariaLabel={t('agent.createNew')}
                  onClick={openInlineAgentCreate}
                  icon={<PlusOutlined />}
                  title={t('agent.createNew')}
                  sub={t('agent.createNewSub')}
                />
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
                        <div className="flex items-center gap-2 rounded-md bg-[rgba(114,46,209,0.12)] px-3 py-2 text-sm font-medium text-[#9d6fe8]">
                          <BulbOutlined />
                          {t('agent.chooseCharacter')}
                        </div>
                        <div className="grid gap-2 md:grid-cols-3">
                          {PROMPT_PERSONAS.map((persona) => (
                            <button
                              key={persona.id}
                              type="button"
                              onClick={() => onInlineAgentPersonaChange(persona.id)}
                              className={`relative rounded-md border-2 p-3 text-left text-foreground transition-all !bg-card ${inlineAgentPersonaId === persona.id ? 'border-[#722ed1] shadow-[0_0_0_3px_rgba(114,46,209,0.18)]' : 'border-border hover:border-[#9d6fe8]'}`}
                              aria-label={`Inline character ${t(`personas.${persona.id}.name`)}`}
                            >
                              {inlineAgentPersonaId === persona.id ? (
                                <span className="absolute top-1 right-1 text-sm leading-none text-[#9d6fe8]"><RobotFilled /></span>
                              ) : null}
                              <p className="font-semibold text-sm">{t(`personas.${persona.id}.name`)}</p>
                              <p className="text-xs text-muted-foreground">{t(`personas.${persona.id}.tagline`)}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {/* Step 1: Personality style + model + system prompt */}
                    {inlineAgentStep === 1 ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{t('agent.character')}:</span>
                          <Tag color="purple">{inlinePersonaLabel}</Tag>
                        </div>
                        {/* Personality section */}
                        <div className="flex items-center gap-2 rounded-md bg-[rgba(114,46,209,0.12)] px-3 py-2 text-sm font-medium text-[#9d6fe8]">
                          <ToolOutlined />
                          {t('agent.choosePersonality')}
                          <span className="ml-1 font-normal text-muted-foreground">{t('agent.forCharacter', { character: inlinePersonaLabel })}</span>
                        </div>
                        <div className="grid gap-2 md:grid-cols-3">
                          {inlineChars.map((char) => (
                            <button
                              key={char.id}
                              type="button"
                              onClick={() => onInlineAgentCharacterChange(char.id)}
                              className={`relative rounded-md border-2 p-3 text-left text-foreground transition-all !bg-card ${inlineAgentCharacterId === char.id ? 'border-[#722ed1] shadow-[0_0_0_3px_rgba(114,46,209,0.18)]' : 'border-border hover:border-[#9d6fe8]'}`}
                              aria-label={`Inline personality ${t(`personas.${inlineAgentPersonaId}.characters.${char.id}.name`)}`}
                            >
                              {inlineAgentCharacterId === char.id ? (
                                <span className="absolute top-1 right-1 text-sm leading-none text-[#9d6fe8]"><RobotFilled /></span>
                              ) : null}
                              <p className="font-semibold text-sm">{t(`personas.${inlineAgentPersonaId}.characters.${char.id}.name`)}</p>
                              <p className="text-xs text-muted-foreground">{t(`personas.${inlineAgentPersonaId}.characters.${char.id}.tagline`)}</p>
                            </button>
                          ))}
                        </div>
                        <div className="border-t pt-3 space-y-3">
                          {/* Report detail level picker */}
                          <div>
                            <p className="mb-2 text-xs text-muted-foreground">{t('report.detail.label')}</p>
                            <div className="grid grid-cols-3 gap-2">
                              {([
                                { id: 'brief' as const, label: t('report.detail.brief'), desc: t('report.detail.briefDesc'), icon: '⚡' },
                                { id: 'standard' as const, label: t('report.detail.standard'), desc: t('report.detail.standardDesc'), icon: '📊' },
                                { id: 'detailed' as const, label: t('report.detail.detailed'), desc: t('report.detail.detailedDesc'), icon: '🔬' },
                              ]).map((opt) => (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() => setInlineAgentReportDetailLevel(opt.id)}
                                  className={`relative rounded-md border-2 p-3 text-left text-foreground transition-all !bg-card ${inlineAgentReportDetailLevel === opt.id ? 'border-[#722ed1] shadow-[0_0_0_3px_rgba(114,46,209,0.18)]' : 'border-border hover:border-[#9d6fe8]'}`}
                                >
                                  <div className="text-base mb-1">{opt.icon}</div>
                                  <p className="font-semibold text-sm">{opt.label}</p>
                                  <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                                </button>
                              ))}
                            </div>
                          </div>
                          {inlineAgentPersonaId === 'finance_expert' ? (
                            <div>
                              <p className="mb-1 text-xs text-muted-foreground">{t('agent.riskLevel')}</p>
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
                            <p className="mb-1 text-xs text-muted-foreground">{t('agent.model')}</p>
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
                            <p className="mb-1 text-xs text-muted-foreground">{t('agent.systemPrompt')}</p>
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
                            aria-label={t('schedule.intervalAriaLabel')}
                            value={String(playbookIntervalMinutesDraft)}
                            onChange={(event) => setPlaybookIntervalMinutesDraft(Math.max(15, Number(event.currentTarget.value) || 60))}
                            placeholder={t('schedule.intervalPlaceholder')}
                          />
                        ) : (
                          <div className="space-y-2">
                            <div className="grid gap-2 md:grid-cols-2">
                              <Input
                                aria-label={t('schedule.dailyTimeAriaLabel')}
                                value={playbookDailyTimeDraft}
                                onChange={(event) => setPlaybookDailyTimeDraft(event.currentTarget.value)}
                                placeholder="HH:mm"
                              />
                              <Select
                                aria-label={t('schedule.timezoneAriaLabel')}
                                value={playbookTimezoneDraft}
                                onChange={(value) => setPlaybookTimezoneDraft(value)}
                                options={TIMEZONE_OPTIONS}
                                placeholder={t('schedule.timezonePlaceholder')}
                                showSearch
                                className="w-full"
                              />
                            </div>
                            {playbookScheduleModeDraft === 'weekly' ? (
                              <Select
                                aria-label={t('schedule.daysOfWeekAriaLabel')}
                                mode="multiple"
                                value={playbookDaysOfWeekDraft}
                                onChange={(values) => setPlaybookDaysOfWeekDraft(values as number[])}
                                options={[
                                  { value: 1, label: t('schedule.days.mon') }, { value: 2, label: t('schedule.days.tue') },
                                  { value: 3, label: t('schedule.days.wed') }, { value: 4, label: t('schedule.days.thu') },
                                  { value: 5, label: t('schedule.days.fri') }, { value: 6, label: t('schedule.days.sat') },
                                  { value: 0, label: t('schedule.days.sun') }
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

            {/* Advanced settings for follow-source mode (replaces the separate step 2) */}
            {playbookCreateStep === 1 && followWizardSourcePreselected && !showInlineAgentCreate ? (
              <div className="border-t pt-3">
                <button
                  type="button"
                  className="flex w-full items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                  onClick={() => setWizardShowAdvanced((v) => !v)}
                >
                  <span>{wizardShowAdvanced ? '▾' : '▸'}</span>
                  <span>{t('listen.advancedSettings')}</span>
                </button>
                {wizardShowAdvanced ? (
                  <div className="mt-3 space-y-3">
                    <div className="text-xs text-gray-500 mb-1">{t('schedule.scheduleLabel')}</div>
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
                        aria-label={t('schedule.intervalAriaLabel')}
                        value={String(playbookIntervalMinutesDraft)}
                        onChange={(event) => setPlaybookIntervalMinutesDraft(Math.max(15, Number(event.currentTarget.value) || 60))}
                        placeholder={t('schedule.intervalPlaceholder')}
                      />
                    ) : (
                      <>
                        <div className="grid gap-3 md:grid-cols-2">
                          <Input
                            aria-label={t('schedule.dailyTimeAriaLabel')}
                            value={playbookDailyTimeDraft}
                            onChange={(event) => setPlaybookDailyTimeDraft(event.currentTarget.value)}
                            placeholder="HH:mm"
                          />
                          <Select
                            aria-label={t('schedule.timezoneAriaLabel')}
                            value={playbookTimezoneDraft}
                            onChange={(value) => setPlaybookTimezoneDraft(value)}
                            options={TIMEZONE_OPTIONS}
                            placeholder={t('schedule.timezonePlaceholder')}
                            showSearch
                            className="w-full"
                          />
                        </div>
                        {playbookScheduleModeDraft === 'weekly' ? (
                          <Select
                            aria-label={t('schedule.daysOfWeekAriaLabel')}
                            mode="multiple"
                            value={playbookDaysOfWeekDraft}
                            onChange={(values) => setPlaybookDaysOfWeekDraft(values as number[])}
                            options={[
                              { value: 1, label: t('schedule.days.mon') },
                              { value: 2, label: t('schedule.days.tue') },
                              { value: 3, label: t('schedule.days.wed') },
                              { value: 4, label: t('schedule.days.thu') },
                              { value: 5, label: t('schedule.days.fri') },
                              { value: 6, label: t('schedule.days.sat') },
                              { value: 0, label: t('schedule.days.sun') }
                            ]}
                          />
                        ) : null}
                      </>
                    )}
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-gray-700 dark:text-gray-300">{t('schedule.recipients')}</div>
                      <Select
                        aria-label={t('schedule.recipients')}
                        mode="tags"
                        value={playbookRecipientsDraft}
                        onChange={(values) => setPlaybookRecipientsDraft(values as string[])}
                        tokenSeparators={[',', ' ']}
                        placeholder={t('schedule.recipientsPlaceholder')}
                        className="w-full"
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            </>
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
                  aria-label={t('schedule.intervalAriaLabel')}
                  value={String(playbookIntervalMinutesDraft)}
                  onChange={(event) => setPlaybookIntervalMinutesDraft(Math.max(15, Number(event.currentTarget.value) || 60))}
                  placeholder={t('schedule.intervalPlaceholder')}
                />
              ) : (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Input
                      aria-label={t('schedule.dailyTimeAriaLabel')}
                      value={playbookDailyTimeDraft}
                      onChange={(event) => setPlaybookDailyTimeDraft(event.currentTarget.value)}
                      placeholder="HH:mm"
                    />
                    <Select
                      aria-label={t('schedule.timezoneAriaLabel')}
                      value={playbookTimezoneDraft}
                      onChange={(value) => setPlaybookTimezoneDraft(value)}
                      options={TIMEZONE_OPTIONS}
                      placeholder={t('schedule.timezonePlaceholder')}
                      showSearch
                      className="w-full"
                    />
                  </div>
                  {playbookScheduleModeDraft === 'weekly' ? (
                    <Select
                      aria-label={t('schedule.daysOfWeekAriaLabel')}
                      mode="multiple"
                      value={playbookDaysOfWeekDraft}
                      onChange={(values) => setPlaybookDaysOfWeekDraft(values as number[])}
                      options={[
                        { value: 1, label: t('schedule.days.mon') },
                        { value: 2, label: t('schedule.days.tue') },
                        { value: 3, label: t('schedule.days.wed') },
                        { value: 4, label: t('schedule.days.thu') },
                        { value: 5, label: t('schedule.days.fri') },
                        { value: 6, label: t('schedule.days.sat') },
                        { value: 0, label: t('schedule.days.sun') }
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
            ) : playbookCreateStep < 2 && !followWizardSourcePreselected ? (
              <Button type="primary" onClick={onNextPlaybookCreateStep}>
                  {t('common.next')}
              </Button>
            ) : playbookCreateStep === 1 && followWizardSourcePreselected ? (
              <Button type="primary" loading={isPlaybookSaving} onClick={() => void onCreatePlaybook()}>
                  {t('common.save')}
              </Button>
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
      {/* Agent picker: shown when multiple agents watch the same source and user clicks ▶ */}
      <Modal
        title="Which agent should run?"
        open={runPickerOpen}
        onCancel={() => setRunPickerOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <div className="space-y-2 py-1">
          {runPickerLinked.map(({ playbook, agent }) => {
            const emoji = getCharacterTypeEmoji(agent?.characterType);
            const characterLabel = agent?.characterType ? humanizeCharacterType(agent.characterType) : null;
            const tagColor = getCharacterTypeColor(agent?.characterType);
            return (
              <Button
                key={playbook.id}
                block
                size="large"
                className="text-left h-auto py-3"
                onClick={() => void onRunPickerSelect(playbook, agent)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{emoji}</span>
                  <div className="flex flex-col items-start gap-0.5 min-w-0">
                    <span className="font-semibold text-sm">{agent?.name ?? playbook.name}</span>
                    <div className="flex items-center gap-1.5">
                      {characterLabel ? <Tag color={tagColor} className="m-0 text-xs">{characterLabel}</Tag> : null}
                      {agent?.promptConfig?.personality_label ? <Tag color="magenta" className="m-0 text-xs">{agent.promptConfig.personality_label}</Tag> : null}
                    </div>
                  </div>
                </div>
              </Button>
            );
          })}
        </div>
      </Modal>
      {/* Schedule-only edit modal — opened via ✎ on individual playbook cards in the detail panel */}
      <Modal
        title={scheduleEditPlaybook ? `${agents.find((a) => a.id === scheduleEditPlaybook.agentId)?.name ?? t('common.edit')} — ${t('playbook.schedule')}` : t('common.edit')}
        open={isScheduleEditOpen}
        onCancel={() => { setIsScheduleEditOpen(false); setScheduleEditPlaybook(null); }}
        footer={null}
        destroyOnHidden
        width="min(480px, 95vw)"
      >
        <div className="space-y-4 pt-2">
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
              aria-label={t('schedule.intervalAriaLabel')}
              value={String(playbookIntervalMinutesDraft)}
              onChange={(event) => setPlaybookIntervalMinutesDraft(Math.max(15, Number(event.currentTarget.value) || 60))}
              placeholder={t('schedule.intervalPlaceholder')}
            />
          ) : (
            <>
              <div className="grid gap-3 grid-cols-2">
                <Input
                  aria-label={t('schedule.dailyTimeAriaLabel')}
                  value={playbookDailyTimeDraft}
                  onChange={(event) => setPlaybookDailyTimeDraft(event.currentTarget.value)}
                  placeholder="HH:mm"
                />
                <Select
                  aria-label={t('schedule.timezoneAriaLabel')}
                  value={playbookTimezoneDraft}
                  onChange={(value) => setPlaybookTimezoneDraft(value)}
                  options={TIMEZONE_OPTIONS}
                  placeholder={t('schedule.timezonePlaceholder')}
                  showSearch
                  className="w-full"
                />
              </div>
              {playbookScheduleModeDraft === 'weekly' && (
                <Select
                  aria-label={t('schedule.daysOfWeekAriaLabel')}
                  mode="multiple"
                  value={playbookDaysOfWeekDraft}
                  onChange={(values) => setPlaybookDaysOfWeekDraft(values as number[])}
                  options={[
                    { value: 1, label: t('schedule.days.mon') },
                    { value: 2, label: t('schedule.days.tue') },
                    { value: 3, label: t('schedule.days.wed') },
                    { value: 4, label: t('schedule.days.thu') },
                    { value: 5, label: t('schedule.days.fri') },
                    { value: 6, label: t('schedule.days.sat') },
                    { value: 0, label: t('schedule.days.sun') }
                  ]}
                  className="w-full"
                />
              )}
            </>
          )}
          <div className="space-y-2">
            <p className="text-sm font-medium">{t('playbook.recipients')}</p>
            {playbookRecipientsDraft.map((recipient, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  value={recipient}
                  onChange={(e) => {
                    const updated = [...playbookRecipientsDraft];
                    updated[index] = e.target.value;
                    setPlaybookRecipientsDraft(updated);
                  }}
                  placeholder="email@example.com"
                />
                <Button
                  size="small"
                  danger
                  onClick={() => setPlaybookRecipientsDraft((prev) => prev.filter((_, i) => i !== index))}
                >
                  ✕
                </Button>
              </div>
            ))}
            <Button size="small" onClick={() => setPlaybookRecipientsDraft((prev) => [...prev, ''])}>
              + {t('playbook.addRecipient')}
            </Button>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button onClick={() => { setIsScheduleEditOpen(false); setScheduleEditPlaybook(null); }}>
              {t('common.cancel')}
            </Button>
            <Button type="primary" loading={isScheduleEditSaving} onClick={() => void onSaveScheduleEdit()}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Guided first-report wizard — shown to brand-new users with zero setup */}
      <Modal
        title={<span className="flex items-center gap-2"><RocketOutlined className="text-blue-500" /> {t('guided.title')}</span>}
        open={guidedWizardOpen}
        onCancel={() => {
          setGuidedWizardOpen(false);
          setForceShowGuidedWizard(false);
          localStorage.setItem('chattrader:guided-wizard:dismissed', '1');
          setGuidedWizardDismissed(true);
        }}
        footer={null}
        destroyOnHidden
        width="min(600px, 95vw)"
      >
        <div className="space-y-5">
          <section className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">{t('guided.step1Desc')}</p>
            <Button
              block
              size="large"
              aria-pressed={guidedWizardSource.url === GUIDED_SUGGESTED_SOURCE.url}
              className={`h-auto py-3 text-left ${guidedWizardSource.url === GUIDED_SUGGESTED_SOURCE.url
                ? 'border-[#722ed1] bg-[#f9f0ff] dark:bg-[#2a1645]'
                : 'border-[#722ed1]/30 bg-[#f9f0ff] hover:!border-[#722ed1] dark:bg-[#2a1645]'}`}
              onClick={() => {
                setGuidedWizardUrl('');
                setGuidedWizardSource(GUIDED_SUGGESTED_SOURCE);
              }}
            >
              <span className="font-semibold">{t('guided.suggestedSource')}</span>
              <span className="ml-2 text-xs text-muted-foreground">{t('guided.suggestedSourceDescription')}</span>
            </Button>
            <Input
              size="large"
              placeholder="https://www.youtube.com/watch?v=..."
              value={guidedWizardUrl}
              onChange={(e) => setGuidedWizardUrl(e.currentTarget.value)}
              prefix={<LinkOutlined />}
              onPressEnter={async () => {
                const url = guidedWizardUrl.trim();
                if (!url) return;
                setGuidedWizardDetecting(true);
                try {
                  const candidates = detectSourceTypeCandidates(url);
                  let best: AutoDetectedSource | null = null;
                  let bestScore = -1;
                  for (const candidate of candidates) {
                    try {
                      const probe = await probeSource({ type: candidate, value: url, maxItems: 5 });
                      const score = probeRankScore(probe as { reachable: boolean; kind: ProbeKind; confidence?: number }, candidate);
                      if (score > bestScore) { bestScore = score; best = { type: candidate, url, kind: probe.kind, title: probe.title, coverImageUrl: probe.coverImageUrl, itemCount: probe.itemCount, previewItems: (probe.previewItems ?? []).slice(0, 5) }; }
                      if (probe.reachable && probe.kind !== 'unknown') break;
                    } catch { /* try next */ }
                  }
                  if (!best) { message.error(t('source.probeError')); return; }
                  setGuidedWizardSource(best);
                } catch { message.error(t('source.probeError')); }
                finally { setGuidedWizardDetecting(false); }
              }}
            />
            <Button
              type="primary"
              block
              loading={guidedWizardDetecting}
              disabled={!guidedWizardUrl.trim()}
              onClick={async () => {
                const url = guidedWizardUrl.trim();
                if (!url) return;
                setGuidedWizardDetecting(true);
                try {
                  const candidates = detectSourceTypeCandidates(url);
                  let best: AutoDetectedSource | null = null;
                  let bestScore = -1;
                  for (const candidate of candidates) {
                    try {
                      const probe = await probeSource({ type: candidate, value: url, maxItems: 5 });
                      const score = probeRankScore(probe as { reachable: boolean; kind: ProbeKind; confidence?: number }, candidate);
                      if (score > bestScore) { bestScore = score; best = { type: candidate, url, kind: probe.kind, title: probe.title, coverImageUrl: probe.coverImageUrl, itemCount: probe.itemCount, previewItems: (probe.previewItems ?? []).slice(0, 5) }; }
                      if (probe.reachable && probe.kind !== 'unknown') break;
                    } catch { /* try next */ }
                  }
                  if (!best) { message.error(t('source.probeError')); return; }
                  setGuidedWizardSource(best);
                } catch { message.error(t('source.probeError')); }
                finally { setGuidedWizardDetecting(false); }
              }}
            >
              {t('guided.detectSource')}
            </Button>
            {guidedWizardSource.url !== GUIDED_SUGGESTED_SOURCE.url && (
              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-800 dark:bg-green-950">
                <p className="text-sm font-semibold text-green-800 dark:text-green-200">✅ {guidedWizardSource.title ?? guidedWizardSource.url}</p>
                <p className="mt-0.5 text-xs text-green-600 dark:text-green-400">{guidedWizardSource.type}</p>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">{t('guided.step2Desc')}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {PROMPT_PERSONAS.map((persona) => (
                <div
                  key={persona.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={guidedWizardPersonaId === persona.id}
                  onClick={() => setGuidedWizardPersonaId(persona.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setGuidedWizardPersonaId(persona.id); } }}
                  className={`cursor-pointer rounded-lg border-2 px-3 py-2 text-foreground transition-all !bg-card ${guidedWizardPersonaId === persona.id ? 'border-[#722ed1] shadow-[0_0_0_3px_rgba(114,46,209,0.18)]' : 'border-border hover:border-[#9d6fe8]'}`}
                >
                  <p className="text-sm font-semibold">{persona.name}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{persona.description}</p>
                </div>
              ))}
            </div>
          </section>

          <Button
            type="primary"
            block
            size="large"
            icon={<CaretRightOutlined />}
            loading={guidedWizardRunning}
            onClick={async () => {
              setGuidedWizardRunning(true);
              try {
                const newSource = await createSource({
                  type: guidedWizardSource.type,
                  value: guidedWizardSource.url,
                  metadata: {
                    title: guidedWizardSource.title,
                    coverImageUrl: guidedWizardSource.coverImageUrl ?? null,
                    itemCount: guidedWizardSource.itemCount,
                    previewItems: guidedWizardSource.previewItems.map((item) => ({ title: item.title, link: item.link ?? undefined, pubDate: item.pubDate }))
                  }
                });
                const newAgent = await createAgent({
                  name: PROMPT_PERSONAS.find(p => p.id === guidedWizardPersonaId)?.name ?? guidedWizardPersonaId,
                  characterType: guidedWizardPersonaId as import('../api/agents').CharacterType,
                  preferences: {},
                }) as import('../api/agents').AgentSummary;
                await createPlaybook({
                  name: `${guidedWizardSource.title ?? 'My Source'} — ${newAgent.name}`,
                  agentId: newAgent.id,
                  sourceIds: [newSource.id],
                  recipients: user?.email ? [user.email] : [],
                  schedule: { mode: 'daily', dailyTime: '08:00', timezone: 'UTC' },
                  language: 'en',
                });
                await Promise.all([refreshAgents()]);
                const [newSources, newPlaybooks] = await Promise.all([listSources(), listPlaybooks()]);
                setSources(newSources);
                setPlaybooks(newPlaybooks);
                await runAgentNow(newAgent.id).catch(() => null);
                message.success(t('guided.success'));
                setGuidedWizardOpen(false);
                setForceShowGuidedWizard(false);
                localStorage.setItem('chattrader:guided-wizard:dismissed', '1');
                setGuidedWizardDismissed(true);
                setActiveHub('feed');
              } catch (err) {
                message.error(err instanceof Error ? err.message : t('guided.error'));
              } finally {
                setGuidedWizardRunning(false);
              }
            }}
          >
            {t('guided.runNow')}
          </Button>
        </div>
      </Modal>
    </>
  );
}
