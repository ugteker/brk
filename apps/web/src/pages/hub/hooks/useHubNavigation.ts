import { useCallback, useEffect, useState } from 'react';
import type { AgentSummary } from '../../../api/agents';
import type { HubKey } from '../types';

const HUB_TO_PATH: Record<HubKey, string> = { feed: '/', sources: '/library', agents: '/agents', playbooks: '/playbooks' };

interface UseHubNavigationParams {
  initialHub?: HubKey;
  navigate: (to: string, options?: { replace?: boolean }) => void;
  agents: AgentSummary[];
  setSelectedAgentId: (id: string | null) => void;
  setViewingSymbol: (symbol: string | null) => void;
}

export function useHubNavigation({
  initialHub,
  navigate,
  agents,
  setSelectedAgentId,
  setViewingSymbol
}: UseHubNavigationParams) {
  const [activeHub, setActiveHubState] = useState<HubKey>(initialHub ?? 'feed');
  const [selectedSourceId, setSelectedSourceIdState] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('source')
  );
  const [hasAppliedSymbolDeepLink, setHasAppliedSymbolDeepLink] = useState(false);

  // AppShell's nav buttons navigate via <Router> directly (not through setActiveHub below),
  // and React Router keeps this same HubPage instance mounted across "/", "/library",
  // "/agents", "/playbooks" (same component/route element). Without this sync, activeHub
  // would only ever reflect its initial mount value and clicking e.g. Library in the shell
  // would change the URL but never switch the visible panel.
  useEffect(() => {
    if (initialHub) {
      setActiveHubState((prev) => (prev === initialHub ? prev : initialHub));
    }
  }, [initialHub]);

  const setActiveHub = useCallback((hub: HubKey) => {
    setActiveHubState(hub);
    navigate(HUB_TO_PATH[hub], { replace: true });
  }, [navigate]);

  const setSelectedSourceId = useCallback((id: string | null) => {
    setSelectedSourceIdState(id);
    const params = new URLSearchParams(window.location.search);
    if (id) params.set('source', id);
    else params.delete('source');
    const query = params.toString();
    window.history.pushState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setSelectedSourceIdState(new URLSearchParams(window.location.search).get('source'));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
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
  }, [agents, hasAppliedSymbolDeepLink, setSelectedAgentId, setViewingSymbol]);

  return {
    activeHub,
    setActiveHub,
    showAdminWorkspace: activeHub === 'agents' || activeHub === 'playbooks',
    selectedSourceId,
    setSelectedSourceId
  };
}
