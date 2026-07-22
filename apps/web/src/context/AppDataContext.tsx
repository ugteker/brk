/**
 * AppDataContext — shared agent/source/playbook data for all route-level components.
 *
 * Provides agents, sources, playbooks and their load states to any descendant component.
 * AgentsPage and future hub-level components consume this context instead of managing
 * their own top-level data state.
 */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { listAgents, type AgentSummary } from '../api/agents';
import { listSources, type SourceRecord } from '../api/sources';
import { listPlaybooks, type PlaybookRecord } from '../api/playbooks';
import {
  listMarketplaceAgents,
  listMarketplaceSources,
  listMarketplacePlaybooks,
  type MarketplaceAgentListItem,
  type MarketplaceSourceListItem,
  type MarketplacePlaybookListItem
} from '../api/marketplace';

export type LoadState = 'idle' | 'loading' | 'error';

export interface FailedRunNotice {
  runId: string;
  agentId: string;
  agentName: string;
  errorMessage: string | null;
  timestamp: string;
}

export interface NewReportNotice {
  reportId: string;
  agentId: string;
  agentName: string;
  summary: string;
  timestamp: string;
}

/** Bell notices for discussion ("show") lifecycle events: started, finished, audio ready. */
export interface DiscussionEventNotice {
  /** Stable id (`${runId}:${kind}`) used for dedupe + dismissal. */
  id: string;
  kind: 'show_started' | 'show_finished' | 'audio_ready';
  discussionId: string;
  discussionName: string;
  timestamp: string;
}

export interface AppDataContextValue {
  agents: AgentSummary[];
  agentsLoadState: LoadState;
  sources: SourceRecord[];
  sourcesLoadState: LoadState;
  playbooks: PlaybookRecord[];
  playbooksLoadState: LoadState;
  marketplaceAgents: MarketplaceAgentListItem[];
  marketplaceSources: MarketplaceSourceListItem[];
  marketplacePlaybooks: MarketplacePlaybookListItem[];
  marketplaceAgentCount: number;
  marketplaceSourceCount: number;
  marketplacePlaybookCount: number;
  refreshAgents: () => Promise<void>;
  refreshSources: () => Promise<void>;
  refreshPlaybooks: () => Promise<void>;
  refreshMarketplace: () => Promise<void>;
  setAgents: React.Dispatch<React.SetStateAction<AgentSummary[]>>;
  setSources: React.Dispatch<React.SetStateAction<SourceRecord[]>>;
  setPlaybooks: React.Dispatch<React.SetStateAction<PlaybookRecord[]>>;
  failedRunNotices: FailedRunNotice[];
  setFailedRunNotices: React.Dispatch<React.SetStateAction<FailedRunNotice[]>>;
  newReportNotices: NewReportNotice[];
  setNewReportNotices: React.Dispatch<React.SetStateAction<NewReportNotice[]>>;
  discussionNotices: DiscussionEventNotice[];
  setDiscussionNotices: React.Dispatch<React.SetStateAction<DiscussionEventNotice[]>>;
  bellDismissedIds: Set<string>;
  setBellDismissedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  forceShowOnboarding: boolean;
  setForceShowOnboarding: React.Dispatch<React.SetStateAction<boolean>>;
  forceShowGuidedWizard: boolean;
  setForceShowGuidedWizard: React.Dispatch<React.SetStateAction<boolean>>;
  adminMode: boolean;
  setAdminMode: React.Dispatch<React.SetStateAction<boolean>>;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider');
  return ctx;
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { logout } = useAuth();

  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [agentsLoadState, setAgentsLoadState] = useState<LoadState>('idle');
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [sourcesLoadState, setSourcesLoadState] = useState<LoadState>('idle');
  const [playbooks, setPlaybooks] = useState<PlaybookRecord[]>([]);
  const [playbooksLoadState, setPlaybooksLoadState] = useState<LoadState>('idle');
  const [marketplaceAgents, setMarketplaceAgents] = useState<MarketplaceAgentListItem[]>([]);
  const [marketplaceSources, setMarketplaceSources] = useState<MarketplaceSourceListItem[]>([]);
  const [marketplacePlaybooks, setMarketplacePlaybooks] = useState<MarketplacePlaybookListItem[]>([]);
  const [marketplaceAgentCount, setMarketplaceAgentCount] = useState(0);
  const [marketplaceSourceCount, setMarketplaceSourceCount] = useState(0);
  const [marketplacePlaybookCount, setMarketplacePlaybookCount] = useState(0);
  const [failedRunNotices, setFailedRunNotices] = useState<FailedRunNotice[]>([]);
  const [newReportNotices, setNewReportNotices] = useState<NewReportNotice[]>([]);
  const [discussionNotices, setDiscussionNotices] = useState<DiscussionEventNotice[]>([]);
  const [bellDismissedIds, setBellDismissedIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('chattrader:bell:dismissed') ?? '[]')); } catch { return new Set(); }
  });
  // In-memory only — resets on refresh, no localStorage (QA/preview tool, not a persisted preference).
  const [forceShowOnboarding, setForceShowOnboarding] = useState(false);
  const [forceShowGuidedWizard, setForceShowGuidedWizard] = useState(false);
  // Admin-only nav visibility toggle (User Management/Agents/Playbooks). Persisted so it survives
  // reloads, but only ever shown/usable for admin users.
  const [adminMode, setAdminMode] = useState(() => localStorage.getItem('chattrader:adminMode') === '1');
  const initialLoadRef = useRef(false);

  function isSignInRequiredError(error: unknown): boolean {
    return error instanceof Error && /sign in required|unauthenticated/i.test(error.message);
  }

  async function refreshAgents() {
    try {
      setAgentsLoadState('loading');
      const response = await listAgents();
      setAgents(response);
      setAgentsLoadState('idle');
    } catch (error) {
      if (isSignInRequiredError(error)) { await logout(); return; }
      setAgentsLoadState('error');
    }
  }

  async function refreshSources() {
    try {
      setSourcesLoadState('loading');
      const response = await listSources();
      setSources(response);
      setSourcesLoadState('idle');
    } catch (error) {
      if (isSignInRequiredError(error)) { await logout(); return; }
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
      if (isSignInRequiredError(error)) { await logout(); return; }
      setPlaybooksLoadState('error');
    }
  }

  // Marketplace data is best-effort and never blocks main data or triggers a sign-out —
  // failures here just leave the marketplace lists empty.
  async function refreshMarketplace() {
    const [mkAgents, mkSources, mkPlaybooks] = await Promise.all([
      listMarketplaceAgents().catch(() => [] as MarketplaceAgentListItem[]),
      listMarketplaceSources().catch(() => [] as MarketplaceSourceListItem[]),
      listMarketplacePlaybooks().catch(() => [] as MarketplacePlaybookListItem[])
    ]);
    setMarketplaceAgents(mkAgents);
    setMarketplaceSources(mkSources);
    setMarketplacePlaybooks(mkPlaybooks);
    setMarketplaceAgentCount(mkAgents.length);
    setMarketplaceSourceCount(mkSources.length);
    setMarketplacePlaybookCount(mkPlaybooks.length);
  }

  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;

    async function initialLoad() {
      try {
        setAgentsLoadState('loading');
        setSourcesLoadState('loading');
        setPlaybooksLoadState('loading');

        const [agentsResult, sourcesResult, playbooksResult] = await Promise.allSettled([
          listAgents(),
          listSources(),
          listPlaybooks()
        ]);

        if (agentsResult.status === 'fulfilled') {
          setAgents(agentsResult.value);
          setAgentsLoadState('idle');
        } else {
          if (isSignInRequiredError(agentsResult.reason)) { await logout(); return; }
          setAgentsLoadState('error');
        }

        if (sourcesResult.status === 'fulfilled') {
          setSources(sourcesResult.value);
          setSourcesLoadState('idle');
        } else {
          if (isSignInRequiredError(sourcesResult.reason)) { await logout(); return; }
          setSourcesLoadState('error');
        }

        if (playbooksResult.status === 'fulfilled') {
          setPlaybooks(playbooksResult.value);
          setPlaybooksLoadState('idle');
        } else {
          if (isSignInRequiredError(playbooksResult.reason)) { await logout(); return; }
          setPlaybooksLoadState('error');
        }

        // Load marketplace data separately — don't block main data on this
        refreshMarketplace().catch(() => { /* non-fatal */ });
      } catch (error) {
        if (isSignInRequiredError(error)) { await logout(); return; }
        setAgentsLoadState('error');
        setSourcesLoadState('error');
        setPlaybooksLoadState('error');
      }
    }

    initialLoad();
  }, []);

  useEffect(() => {
    localStorage.setItem('chattrader:adminMode', adminMode ? '1' : '0');
  }, [adminMode]);

  const value: AppDataContextValue = {
    agents, agentsLoadState,
    sources, sourcesLoadState,
    playbooks, playbooksLoadState,
    marketplaceAgents, marketplaceSources, marketplacePlaybooks,
    marketplaceAgentCount, marketplaceSourceCount, marketplacePlaybookCount,
    refreshAgents, refreshSources, refreshPlaybooks, refreshMarketplace,
    setAgents, setSources, setPlaybooks,
    failedRunNotices, setFailedRunNotices,
    newReportNotices, setNewReportNotices,
    discussionNotices, setDiscussionNotices,
    bellDismissedIds, setBellDismissedIds,
    forceShowOnboarding, setForceShowOnboarding, forceShowGuidedWizard, setForceShowGuidedWizard,
    adminMode, setAdminMode
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}
