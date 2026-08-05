import { useEffect, useState } from 'react';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import { type CuratedAgent } from '../../components/AgentCurator';
import { EpisodePickerModal } from '../../components/EpisodePickerModal';
import {
  createAgent,
  deleteAgent,
  disableAgent,
  enableAgent,
  getAgent,
  getLatestAgentPrompt,
  listAgentEpisodeOptions,
  publishAgent,
  runAgentNow,
  saveAgentPrompt,
  type AgentSummary,
  type EpisodeOptionDto,
  type ForcedEpisodeSelection,
  type PromptVersionDto,
  type RunReportDto
} from '../../api/agents';
import { grantAgentAccess, listAgentAccessGrants } from '../../api/access';
import { cloneMarketplaceAgent, cloneMarketplacePlaybook } from '../../api/marketplace';
import {
  createPlaybook,
  deletePlaybook,
  publishPlaybook,
  sharePlaybook,
  updatePlaybook,
  type PlaybookRecord
} from '../../api/playbooks';
import { useAuth } from '../../auth/AuthContext';
import { useAppData } from '../../context/AppDataContext';
import { getPromptCharacter, getPromptCharactersForPersona, getPromptPersona, DEFAULT_PROMPT_CHARACTER_ID, DEFAULT_PROMPT_PERSONA_ID } from '../../data/prompt-personas';
import { useSymbolView } from '../../hooks/useSymbolView';
import { getAgentDisplayLabel } from '../../utils/agent-label';
import { useSafeNavigate } from '../../utils/useSafeNavigate';
import { SymbolPerformancePage } from '../SymbolPerformancePage';
import { AdminWorkspace } from './AdminWorkspace';
import { FollowWizardModal } from '../shared/FollowWizardModal';
import { ReportDrawer } from '../shared/ReportDrawer';
import { hasEpisodicSource, getSourceDisplayTitle } from '../shared/helpers';
import { useReportsFeed } from '../shared/useReportsFeed';
import { useScheduleDraft } from '../shared/useScheduleDraft';
import { type AgentEditor, type HubKey } from '../shared/types';

export function AdminPage({ tab }: { tab: 'agents' | 'playbooks' }) {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const { message } = App.useApp();
  const navigate = useSafeNavigate();
  const {
    agents, setAgents,
    sources,
    playbooks,
    agentsLoadState: loadState,
    playbooksLoadState,
    marketplaceAgents,
    marketplacePlaybooks,
    marketplaceAgentCount,
    marketplacePlaybookCount,
    refreshAgents,
    refreshPlaybooks,
    failedRunNotices: _failedRunNotices,
    setFailedRunNotices,
    newReportNotices: _newReportNotices,
    setNewReportNotices
  } = useAppData();
  const { symbolView, setSymbolView } = useSymbolView(agents);
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
  const [playbookAgentIdsDraft, setPlaybookAgentIdsDraft] = useState<string[]>([]);
  // Tracks which agents already watch the source when the wizard opens — used for save diff
  // (create new playbooks for additions, delete playbooks for removals, skip unchanged).
  const [wizardAlreadyLinkedAgentIds, setWizardAlreadyLinkedAgentIds] = useState<string[]>([]);
  const [wizardAlreadyLinkedPlaybooks, setWizardAlreadyLinkedPlaybooks] = useState<{ agentId: string; playbookId: string }[]>([]);
  // The agent whose playbook settings are shown in the schedule step (edit mode via ✎ button)
  const [wizardFocusedAgentId, setWizardFocusedAgentId] = useState<string | null>(null);
  const [playbookSourceIdDraft, setPlaybookSourceIdDraft] = useState<string | null>(null);
  const scheduleDraft = useScheduleDraft();
  // Inline agent creation inside the follow wizard (step: pick agent) — full 4-step sub-wizard
  const [showInlineAgentCreate, setShowInlineAgentCreate] = useState(false);
  const [isInlineAgentSaving, setIsInlineAgentSaving] = useState(false);
  const [inlineAgentStep, setInlineAgentStep] = useState(0); // 0=character+personality, 1=model+prompt, 2=schedule+recipients
  const [inlineAgentDescription] = useState('');
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
  const [showPlaybooksMarketplace, setShowPlaybooksMarketplace] = useState(false);
  const [showAgentsMarketplace, setShowAgentsMarketplace] = useState(false);
  const [cloningPublicationId, setCloningPublicationId] = useState<string | null>(null);
  const [marketplaceAgentsSearch, setMarketplaceAgentsSearch] = useState('');
  const [marketplacePlaybooksSearch, setMarketplacePlaybooksSearch] = useState('');
  const [accessGrantCount, setAccessGrantCount] = useState(0);

  const selectedPlaybook = playbooks.find((playbook) => playbook.id === selectedPlaybookId) ?? null;
  const executionAgentId = selectedPlaybook?.agentId ?? null;
  const {
    runs,
    reports,
    selectedPlaybookReports,
    reloadExecutionAgentData,
    markFeedReportRead
  } = useReportsFeed({ agents, playbooks, selectedPlaybook, executionAgentId, message, t });

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

  useEffect(() => {
    if (!selectedAgentId) {
      setAccessGrantCount(0);
      return;
    }
    let alive = true;
    async function loadAccessGrants() {
      try {
        const grants = await listAgentAccessGrants(selectedAgentId as string);
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

  function setActiveHub(next: HubKey) {
    if (next === 'feed') navigate('/');
    if (next === 'sources') navigate('/library');
    if (next === 'agents') navigate('/agents');
    if (next === 'playbooks') navigate('/playbooks');
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
      const newAgent = await createAgent(payload as Parameters<typeof createAgent>[0]) as AgentSummary;
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
      const scheduleForNew = followWizardSourcePreselected ? defaultSchedule : explicitSchedule;
      const cleanedRecipients = scheduleDraft.recipients.map((v) => v.trim()).filter(Boolean);
      // Recipients for new playbooks: advanced-mode uses draft; streamlined follow mode defaults to current user email.
      const recipientsForNew = followWizardSourcePreselected ? (user?.email ? [user.email] : []) : cleanedRecipients;
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

  function getSourceKindLabel(source: { type: string }): string {
    if (source.type === 'youtube_videos' || source.type === 'podcast_feeds') return 'Playlist';
    if (source.type === 'synthetic_discussion') return 'Discussion';
    return 'Page';
  }

  function getSourceEpisodeCount(source: { metadata: { itemCount?: number | null; previewItems: unknown[] } }): number {
    return source.metadata.itemCount ?? source.metadata.previewItems.length;
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

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? null;
  const executionAgent = executionAgentId ? agents.find((agent) => agent.id === executionAgentId) ?? null : null;
  const normalizedAgentsSearch = agentsSearch.trim().toLowerCase();
  const normalizedPlaybooksSearch = playbooksSearch.trim().toLowerCase();
  const filteredAgents = agents.filter((agent) => {
    if (!normalizedAgentsSearch) return true;
    const sourceValues = agent.sources.map((source) => source.value).join(' ');
    return `${getAgentDisplayLabel(agent)} ${sourceValues}`.toLowerCase().includes(normalizedAgentsSearch);
  });
  const filteredPlaybooks = playbooks.filter((playbook) => {
    if (!normalizedPlaybooksSearch) return true;
    return `${playbook.name} ${playbook.description} ${playbook.sourceId}`.toLowerCase().includes(normalizedPlaybooksSearch);
  });
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

  const adminWorkspaceCtx = {
    accessGrantCount, activePlaybookTab, agentEditor, agents, agentsSearch, cloningPublicationId, completeAgentCuration,
    executionAgent, filteredAgents, filteredMarketplaceAgents, filteredMarketplacePlaybooks, filteredPlaybooks, grantAgentAccess,
    highlightedReportId, isLoadingEditTarget, loadState, marketplaceAgentCount, marketplaceAgents, marketplaceAgentsSearch,
    marketplacePlaybookCount, marketplacePlaybooks, marketplacePlaybooksSearch, onCloneMarketplaceAgent, onCloneMarketplacePlaybook,
    onDeleteAgent, onDeletePlaybook, onEditAgent, onEditPlaybook, onImproveAgentWithAI, onRunNow, onTogglePause,
    onTogglePlaybookEnabled, onViewReport, openCurationCreate, openPlaybookCreate, openReportDrawer, playbooksLoadState, playbooksSearch, prompt,
    publishAgent, publishPlaybook, refreshAgents, refreshMarketplaceCounts, runningAgentId, runs, selectedAgent, selectedPlaybook,
    selectedPlaybookReports, setActiveHub, setActivePlaybookTab, setAgentEditor, setAgentsSearch, setMarketplaceAgentsSearch,
    setMarketplacePlaybooksSearch, setPlaybooksSearch, setSelectedAgentId, setSelectedPlaybookId, setShowAgentsMarketplace,
    setShowPlaybooksMarketplace, setViewingSymbol, sharePlaybook, showAgentsMarketplace, showPlaybooksMarketplace, sources, t,
    togglingAgentId, togglingPlaybookId, deletingAgentId, user
  };

  const inlineSymbolView = viewingSymbol && (selectedAgent || executionAgentId)
    ? { agentId: selectedAgent?.id ?? executionAgentId!, symbol: viewingSymbol }
    : null;
  const activeSymbolView = symbolView ?? inlineSymbolView;

  if (activeSymbolView) {
    return (
      <SymbolPerformancePage
        agentId={activeSymbolView.agentId}
        symbol={activeSymbolView.symbol}
        onBack={() => {
          setSymbolView(null);
          setViewingSymbol(null);
        }}
      />
    );
  }

  return (
    <>
      <div className="mx-auto max-w-6xl space-y-4">
        <AdminWorkspace ctx={adminWorkspaceCtx} tab={tab} />
        <ReportDrawer report={viewingFullReport} onClose={() => setViewingFullReport(null)} />
      </div>
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
        wizardShowAdvanced={false}
        setWizardShowAdvanced={() => undefined}
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
        handleAgentSelectionConnected={() => undefined}
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
    </>
  );
}
