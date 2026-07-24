import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Empty, message } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { getLatestAgentPrompt, type AgentSummary } from '../../api/agents';
import { updateSavedAgentVersion, useAgentForSource, type UseAgentForSourceInput } from '../../api/agent-selection';
import type { PlaybookRecord } from '../../api/playbooks';
import type { SourceRecord } from '../../api/sources';
import { getAgentDisplayLabel } from '../../utils/agent-label';
import { GhostCreateCard } from '../library/GhostCreateCard';
import { AgentDetailsDrawer } from './AgentDetailsDrawer';
import { CompactAgentCard, type AgentMatchDto } from './CompactAgentCard';

export interface AgentSelectionViewProps {
  source: SourceRecord | null;
  ownedAgents: AgentSummary[];
  onAgentConnected: (playbook: PlaybookRecord) => Promise<void> | void;
  onCurate: (baseAgentVersionId?: string) => void;
}

const BEST_MATCHES_PAGE_SIZE = 4;

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    return typeof body?.message === 'string' ? body.message : fallback;
  } catch {
    return fallback;
  }
}

async function listAgentMatches(sourceId: string): Promise<AgentMatchDto[]> {
  const response = await fetch(`/api/catalog/agent-matches?sourceId=${encodeURIComponent(sourceId)}`);
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to load agent matches'));
  }
  return response.json();
}

async function hydrateOwnedAgents(ownedAgents: AgentSummary[]): Promise<AgentMatchDto[]> {
  const prompts = await Promise.allSettled(ownedAgents.map((agent) => getLatestAgentPrompt(agent.id)));

  return ownedAgents
    .map((agent, index) => {
      const prompt = prompts[index];
      if (prompt?.status !== 'fulfilled' || !prompt.value?.id) {
        return null;
      }

      return {
        agentVersionId: prompt.value.id,
        publicationId: null,
        ownership: 'owned' as const,
        name: agent.name,
        purpose: getAgentDisplayLabel(agent),
        iconAssetKey: null,
        reasons: [],
        score: -1,
        agentId: agent.id,
        characterType: agent.characterType ?? null
      } satisfies AgentMatchDto;
    })
    .filter((agent): agent is AgentMatchDto => agent !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function createLoadingMatch(agentVersionId: string): AgentMatchDto {
  return {
    agentVersionId,
    publicationId: null,
    ownership: 'curated',
    name: '',
    purpose: '',
    iconAssetKey: null,
    reasons: [],
    score: 0
  };
}

export function AgentSelectionView({ source, ownedAgents, onAgentConnected, onCurate }: AgentSelectionViewProps) {
  const { t } = useTranslation();
  const [matches, setMatches] = useState<AgentMatchDto[]>([]);
  const [ownedAgentMatches, setOwnedAgentMatches] = useState<AgentMatchDto[]>([]);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(BEST_MATCHES_PAGE_SIZE);
  const [retryKey, setRetryKey] = useState(0);
  const [activeDrawerMatch, setActiveDrawerMatch] = useState<AgentMatchDto | null>(null);
  const [loadingAgentVersionId, setLoadingAgentVersionId] = useState<string | null>(null);
  const [focusAgentVersionId, setFocusAgentVersionId] = useState<string | null>(null);

  useEffect(() => {
    if (!source) {
      setMatches([]);
      setOwnedAgentMatches([]);
      setLoadState('idle');
      setErrorMessage(null);
      return;
    }

    let cancelled = false;
    setLoadState('loading');
    setErrorMessage(null);
    setVisibleLimit(BEST_MATCHES_PAGE_SIZE);

    void Promise.all([listAgentMatches(source.id), hydrateOwnedAgents(ownedAgents)])
      .then(([nextMatches, nextOwnedAgentMatches]) => {
        if (cancelled) return;
        setMatches(nextMatches);
        setOwnedAgentMatches(nextOwnedAgentMatches);
        setLoadState('ready');
      })
      .catch((error) => {
        if (cancelled) return;
        setMatches([]);
        setOwnedAgentMatches([]);
        setLoadState('error');
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load agent matches');
      });

    return () => {
      cancelled = true;
    };
  }, [ownedAgents, retryKey, source]);

  useEffect(() => {
    if (!focusAgentVersionId) return;
    const frame = window.requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(`[data-agent-version-id="${focusAgentVersionId}"]`);
      target?.focus();
      setFocusAgentVersionId(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusAgentVersionId, matches, visibleLimit]);

  const visibleMatches = useMemo(() => matches.slice(0, visibleLimit), [matches, visibleLimit]);

  const matchedOwnedVersionIds = useMemo(
    () => new Set(matches.filter((match) => match.ownership === 'owned').map((match) => match.agentVersionId)),
    [matches]
  );

  const remainingOwnedMatches = useMemo(
    () => ownedAgentMatches.filter((match) => !matchedOwnedVersionIds.has(match.agentVersionId)),
    [matchedOwnedVersionIds, ownedAgentMatches]
  );

  const loadingMatches = useMemo(
    () => Array.from({ length: BEST_MATCHES_PAGE_SIZE }, (_, index) => createLoadingMatch(`loading-${index}`)),
    []
  );

  const isEmpty = loadState === 'ready' && visibleMatches.length === 0 && remainingOwnedMatches.length === 0;

  async function handleUse(match: AgentMatchDto) {
    if (!source) return;
    setLoadingAgentVersionId(match.agentVersionId);
    try {
      const input: UseAgentForSourceInput = { sourceId: source.id };
      const result = await useAgentForSource(match.agentVersionId, input.sourceId);
      setActiveDrawerMatch(null);
      await onAgentConnected(result.playbook);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to use agent');
    } finally {
      setLoadingAgentVersionId(null);
    }

    async function handleUpdate(match: AgentMatchDto) {
      if (!match.latestAgentVersionId) return;
      try {
        await updateSavedAgentVersion(match.latestAgentVersionId, {
          fromAgentVersionId: match.agentVersionId,
          updateManualPlaybooks: false
        });
        setRetryKey((current) => current + 1);
        message.success(t('agentSelection.updateSuccess'));
      } catch (error) {
        message.error(error instanceof Error ? error.message : t('agentSelection.updateFailed'));
      }
    }
  }

  function handleShowMore() {
    const nextMatch = matches[visibleLimit];
    setVisibleLimit((current) => current + BEST_MATCHES_PAGE_SIZE);
    if (nextMatch) {
      setFocusAgentVersionId(nextMatch.agentVersionId);
    }
  }

  if (!source) {
    return <Empty description={t('agentSelection.empty')} />;
  }

  return (
    <div className="space-y-5">
      {loadState === 'error' ? (
        <Alert
          type="warning"
          showIcon
          message={errorMessage ?? t('agentSelection.empty')}
          action={
            <Button size="small" onClick={() => setRetryKey((current) => current + 1)}>
              {t('agentSelection.retry')}
            </Button>
          }
        />
      ) : null}

      {loadState === 'loading' ? (
        <section className="space-y-3" aria-labelledby="agent-selection-best-matches">
          <div className="space-y-1">
            <h3 id="agent-selection-best-matches" className="text-sm font-semibold text-foreground">
              {t('agentSelection.bestMatches')}
            </h3>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {loadingMatches.map((match) => (
              <CompactAgentCard
                key={match.agentVersionId}
                match={match}
                loading
                onUse={() => undefined}
                onDetails={() => undefined}
              />
            ))}
          </div>
        </section>
      ) : null}

      {loadState === 'ready' ? (
        <>
          {visibleMatches.length > 0 ? (
            <section className="space-y-3" aria-labelledby="agent-selection-best-matches">
              <div className="flex items-center justify-between gap-3">
                <h3 id="agent-selection-best-matches" className="text-sm font-semibold text-foreground">
                  {t('agentSelection.bestMatches')}
                </h3>
                {matches.length > visibleLimit ? (
                  <Button type="link" className="px-0" onClick={handleShowMore}>
                    {t('agentSelection.showMore')}
                  </Button>
                ) : null}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {visibleMatches.map((match) => (
                  <CompactAgentCard
                    key={match.agentVersionId}
                    match={match}
                    loading={loadingAgentVersionId === match.agentVersionId}
                    onUse={handleUse}
                    onDetails={setActiveDrawerMatch}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {remainingOwnedMatches.length > 0 ? (
            <section className="space-y-3" aria-labelledby="agent-selection-your-agents">
              <h3 id="agent-selection-your-agents" className="text-sm font-semibold text-foreground">
                {t('agentSelection.yourAgents')}
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {remainingOwnedMatches.map((match) => (
                  <CompactAgentCard
                    key={match.agentVersionId}
                    match={match}
                    loading={loadingAgentVersionId === match.agentVersionId}
                    onUse={handleUse}
                    onDetails={setActiveDrawerMatch}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {isEmpty ? (
            <Empty description={t('agentSelection.empty')} />
          ) : null}
        </>
      ) : null}

      <section aria-labelledby="agent-selection-curate" className="space-y-3">
        <h3 id="agent-selection-curate" className="text-sm font-semibold text-foreground">
          {t('agentSelection.curateYourOwn')}
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <GhostCreateCard
            ariaLabel={t('agentSelection.curateYourOwn')}
            onClick={onCurate}
            icon={<RobotOutlined />}
            title={t('agentSelection.curateYourOwn')}
          />
        </div>
      </section>

      <AgentDetailsDrawer
        open={Boolean(activeDrawerMatch)}
        loading={activeDrawerMatch ? loadingAgentVersionId === activeDrawerMatch.agentVersionId : false}
        match={activeDrawerMatch}
        source={source}
        onClose={() => setActiveDrawerMatch(null)}
        onUse={handleUse}
        onUpdateAgent={handleUpdate}
        onCreateVariant={(agentVersionId) => {
          setActiveDrawerMatch(null);
          onCurate(agentVersionId);
        }}
      />
    </div>
  );
}
