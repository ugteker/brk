import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Collapse,
  Form,
  Input,
  Progress,
  Select,
  Space,
  Steps,
  Tag,
  message
} from 'antd';
import { ArrowLeftOutlined, ArrowRightOutlined, AudioOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { useSafeNavigate } from '../utils/useSafeNavigate';
import { useAuth } from '../auth/AuthContext';
import { listAgents, listAgentReports, type AgentSummary, type RunReportDto } from '../api/agents';
import {
  createDiscussion,
  getDiscussionCapabilities,
  listTranscriptOptions,
  triggerDiscussionRun,
  type DiscussionCapabilities,
  type DiscussionGroundingMode,
  type DiscussionPreselect,
  type TranscriptOptionDto,
  type TtsProviderDto
} from '../api/discussions';
import { cloneMarketplaceAgent, listMarketplaceAgents, type MarketplaceAgentListItem } from '../api/marketplace';
import { StudioPrimaryButton } from '../components/StudioPrimaryButton';
import { getAgentDisplayLabel } from '../utils/agent-label';

const PUBLIC_AGENTS_PAGE_SIZE = 4;

type Format = 'free_form' | 'structured' | 'hosted' | 'hybrid';
type Voice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

const VOICES: Voice[] = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

/** Human-readable voice labels: the stored IDs are provider-neutral - the backend maps
 * them to OpenAI voices or Google Neural2 voices (EN/DE) depending on which TTS provider
 * is configured, so labels describe the voice character rather than a provider name. */
const VOICE_LABELS: Record<Voice, string> = {
  alloy: 'Alloy · neutral',
  echo: 'Echo · male',
  fable: 'Fable · warm',
  onyx: 'Onyx · deep male',
  nova: 'Nova · female',
  shimmer: 'Shimmer · bright female'
};

/** Mirrors the backend's Google voice mapping (google-tts-client.ts VOICE_MAP) so the picker
 * can show which actual Google voice a character maps to when Google renders the audio. */
const GOOGLE_VOICE_NAMES: Record<'en' | 'de', Record<Voice, string>> = {
  en: {
    alloy: 'en-US-Neural2-C',
    echo: 'en-US-Neural2-D',
    fable: 'en-US-Neural2-F',
    onyx: 'en-US-Neural2-J',
    nova: 'en-US-Neural2-E',
    shimmer: 'en-US-Neural2-G'
  },
  de: {
    alloy: 'de-DE-Neural2-C',
    echo: 'de-DE-Neural2-D',
    fable: 'de-DE-Neural2-F',
    onyx: 'de-DE-Neural2-B',
    nova: 'de-DE-Neural2-A',
    shimmer: 'de-DE-Neural2-C'
  }
};

interface ParticipantConfig {
  agentId: string;
  role: 'speaker' | 'host';
  voiceId: Voice;
  speakerOrder: number;
  /** Explicit report IDs picked for this participant; empty means "use latest reports". */
  reportIds: string[];
}

/** Logical wizard steps; the shared 'material' picker step only exists in material mode. */
type StepKey = 'topic' | 'material' | 'experts' | 'setup' | 'start';

const GROUNDING_MODES: Array<{ mode: DiscussionGroundingMode; emoji: string }> = [
  { mode: 'material', emoji: '📚' },
  { mode: 'free', emoji: '💬' }
];

export function NewDiscussionWizard() {
  const { t, i18n } = useTranslation();
  const navigate = useSafeNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Topic step: what grounds the discussion.
  const [groundingMode, setGroundingMode] = useState<DiscussionGroundingMode>('material');
  const [transcriptOptions, setTranscriptOptions] = useState<TranscriptOptionDto[]>([]);
  const [loadingTranscripts, setLoadingTranscripts] = useState(false);
  const [transcriptsLoaded, setTranscriptsLoaded] = useState(false);
  const [selectedTranscriptIds, setSelectedTranscriptIds] = useState<string[]>([]);
  // Shared questions/topics. In free mode this IS the discussion topic; in material
  // mode it's an optional steer on top of the selected material.
  const [agenda, setAgenda] = useState('');

  // Experts step
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [marketplaceAgents, setMarketplaceAgents] = useState<MarketplaceAgentListItem[]>([]);
  const [loadingMarketplaceAgents, setLoadingMarketplaceAgents] = useState(true);
  const [selectedPublicationIds, setSelectedPublicationIds] = useState<string[]>([]);
  const [publicAgentsPage, setPublicAgentsPage] = useState(0);
  // Publication -> already-cloned owned agent id, so re-visiting the experts step and going
  // back to setup doesn't re-clone (and doesn't lose track of) the same public agent.
  const [clonedAgentIdByPublication, setClonedAgentIdByPublication] = useState<Record<string, string>>({});
  const [cloningAgents, setCloningAgents] = useState(false);

  // Pre-fill support for entry points that jump in from a report or Library source
  // (rather than the default blank topic-first flow). The preselected reports land in
  // the shared material pool; the agents are pre-checked.
  const [preselectContextLabel, setPreselectContextLabel] = useState<string | null>(null);

  // Setup step
  const [discussionName, setDiscussionName] = useState('');
  const [format, setFormat] = useState<Format>('free_form');
  const [participants, setParticipants] = useState<ParticipantConfig[]>([]);
  const [totalTurnTarget, setTotalTurnTarget] = useState(12);
  // Defaults to the current UI language, but is independently editable - the discussion
  // language doesn't have to match the app's display language.
  const [language, setLanguage] = useState<'en' | 'de'>(i18n.language.startsWith('de') ? 'de' : 'en');
  // How long each spoken turn should be; maps to a token budget + brevity instruction in the
  // backend orchestrator (formatConfig.turnLength). Default 'medium' = original behavior.
  const [turnLength, setTurnLength] = useState<'short' | 'medium' | 'long'>('medium');
  // Which voice API renders the audio podcast. 'auto' keeps the server default. Only offered
  // when the server reports more than one configured provider.
  const [ttsProvider, setTtsProvider] = useState<TtsProviderDto>('auto');
  const [capabilities, setCapabilities] = useState<DiscussionCapabilities>({ tts: false, ttsProviders: [] });

  useEffect(() => {
    getDiscussionCapabilities().then(setCapabilities).catch(() => undefined);
  }, []);

  // The provider that will actually render audio given the current choice - drives the
  // Google voice-name hints on the voice picker so users see what the API will use.
  const effectiveTtsProvider: 'google' | 'openai' | null =
    ttsProvider !== 'auto' && capabilities.ttsProviders.includes(ttsProvider)
      ? ttsProvider
      : capabilities.ttsProviders.includes('openai')
        ? 'openai'
        : capabilities.ttsProviders.includes('google')
          ? 'google'
          : null;

  // Material step: the shared, agent-independent pool - any report from any agent plus
  // any downloaded transcript can be picked; every participant discusses the same pool.
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);
  const [allReports, setAllReports] = useState<Array<RunReportDto & { agentName: string }>>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [reportsLoaded, setReportsLoaded] = useState(false);

  // Start step
  const [runNow, setRunNow] = useState(true);

  const stepKeys = useMemo<StepKey[]>(
    () =>
      groundingMode === 'material'
        ? ['topic', 'material', 'experts', 'setup', 'start']
        : ['topic', 'experts', 'setup', 'start'],
    [groundingMode]
  );
  const [currentKey, setCurrentKey] = useState<StepKey>('topic');
  const currentIndex = stepKeys.indexOf(currentKey);
  const stepProgress = ((currentIndex + 1) / stepKeys.length) * 100;

  useEffect(() => {
    listAgents()
      .then(setAgents)
      .catch(() => {})
      .finally(() => setLoadingAgents(false));
    listMarketplaceAgents()
      .then(setMarketplaceAgents)
      .catch(() => {})
      .finally(() => setLoadingMarketplaceAgents(false));
  }, []);

  useEffect(() => {
    const preselect = (location.state as { preselect?: DiscussionPreselect } | null)?.preselect;
    if (preselect && preselect.entries.length > 0) {
      setGroundingMode('material');
      setSelectedAgentIds(preselect.entries.map((e) => e.agentId));
      setSelectedReportIds([...new Set(preselect.entries.flatMap((e) => e.reportIds))]);
      setPreselectContextLabel(preselect.contextLabel ?? null);
      setCurrentKey('material');
    }
    // Only ever applied once, from whatever state the wizard was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lazy-load the material pool options (all reports across all agents + transcripts) the
  // first time the material step is shown.
  useEffect(() => {
    if (currentKey !== 'material') return;
    if (!reportsLoaded && !loadingReports && !loadingAgents) {
      setLoadingReports(true);
      Promise.all(
        agents.map(async (agent) => {
          try {
            const reports = await listAgentReports(agent.id);
            return reports.map((r) => ({ ...r, agentName: getAgentDisplayLabel(agent) }));
          } catch {
            return [];
          }
        })
      )
        .then((nested) => {
          const flat = nested.flat().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setAllReports(flat);
          setReportsLoaded(true);
        })
        .finally(() => setLoadingReports(false));
    }
    if (!transcriptsLoaded && !loadingTranscripts) {
      setLoadingTranscripts(true);
      listTranscriptOptions()
        .then((options) => {
          setTranscriptOptions(options);
          setTranscriptsLoaded(true);
        })
        .catch(() => setTranscriptsLoaded(true))
        .finally(() => setLoadingTranscripts(false));
    }
  }, [currentKey, reportsLoaded, loadingReports, loadingAgents, agents, transcriptsLoaded, loadingTranscripts]);

  function clearPreselect() {
    setSelectedAgentIds([]);
    setSelectedReportIds([]);
    setPreselectContextLabel(null);
  }

  function handleAgentToggle(agentId: string, checked: boolean) {
    setSelectedAgentIds((prev) =>
      checked ? [...prev, agentId] : prev.filter((id) => id !== agentId)
    );
  }

  function handlePublicAgentToggle(publicationId: string, checked: boolean) {
    setSelectedPublicationIds((prev) =>
      checked ? [...prev, publicationId] : prev.filter((id) => id !== publicationId)
    );
  }

  // GET /api/agents returns every agent platform-wide for admins (needed for admin management
  // views), not just the caller's own - narrow it down here so an admin account doesn't see
  // every other user's agent listed as their own in this picker.
  const ownedAgents = useMemo(
    () => agents.filter((agent) => agent.ownerUserId === user?.id),
    [agents, user]
  );
  const ownedAgentIds = useMemo(() => new Set(ownedAgents.map((agent) => agent.id)), [ownedAgents]);
  // Also drop marketplace listings for agents the user already owns/published, so they aren't
  // offered twice (once as "yours", once as "public").
  const publicAgents = useMemo(
    () => marketplaceAgents.filter((item) => !ownedAgentIds.has(item.agent.id)),
    [marketplaceAgents, ownedAgentIds]
  );

  const totalPublicAgentPages = Math.max(1, Math.ceil(publicAgents.length / PUBLIC_AGENTS_PAGE_SIZE));
  const visiblePublicAgents = publicAgents.slice(
    publicAgentsPage * PUBLIC_AGENTS_PAGE_SIZE,
    publicAgentsPage * PUBLIC_AGENTS_PAGE_SIZE + PUBLIC_AGENTS_PAGE_SIZE
  );

  const totalSelectedExperts = selectedAgentIds.length + selectedPublicationIds.length;

  /** Clones any newly selected public agents into the user's own library (skipping ones already
   * cloned in this session) so every discussion participant ends up backed by an agent the
   * current user actually owns - discussions can't reference someone else's agent directly. */
  async function resolveSelectedAgentIds(): Promise<string[]> {
    const toClone = selectedPublicationIds.filter((id) => !clonedAgentIdByPublication[id]);
    let clonedThisRun: Record<string, string> = {};
    if (toClone.length > 0) {
      setCloningAgents(true);
      try {
        const results = await Promise.all(toClone.map((id) => cloneMarketplaceAgent(id)));
        clonedThisRun = Object.fromEntries(toClone.map((id, index) => [id, results[index].agent.id]));
        setClonedAgentIdByPublication((prev) => ({ ...prev, ...clonedThisRun }));
        // Refresh so name/character-type lookups (suggestName, the participants list) resolve
        // for the newly cloned agents instead of falling back to a raw id.
        setAgents(await listAgents());
      } finally {
        setCloningAgents(false);
      }
    }
    const merged = { ...clonedAgentIdByPublication, ...clonedThisRun };
    return [...selectedAgentIds, ...selectedPublicationIds.map((id) => merged[id])];
  }

  function buildInitialParticipants(agentIds: string[]): ParticipantConfig[] {
    return agentIds.map((agentId, i) => ({
      agentId,
      role: (format === 'hosted' && i === 0 ? 'host' : 'speaker') as 'host' | 'speaker',
      voiceId: VOICES[i % VOICES.length],
      speakerOrder: i,
      // Material lives in the shared pool (formatConfig.grounding), not per participant.
      reportIds: []
    }));
  }

  function suggestName(agentIds: string[]): string {
    if (groundingMode === 'free' && agenda.trim()) {
      const q = agenda.trim();
      return q.length > 60 ? `${q.slice(0, 57)}…` : q;
    }
    if (groundingMode === 'material') {
      const firstTranscript = transcriptOptions.find((o) => selectedTranscriptIds.includes(o.artifactId));
      if (firstTranscript) return firstTranscript.title;
      const firstReport = allReports.find((r) => selectedReportIds.includes(r.id));
      if (firstReport) {
        const s = firstReport.summary.trim();
        return s.length > 60 ? `${s.slice(0, 57)}…` : s;
      }
    }
    return agentIds
      .map((id) => {
        const agent = agents.find((candidate) => candidate.id === id);
        return agent ? getAgentDisplayLabel(agent) : id;
      })
      .join(' × ');
  }

  function topicStepValid(): boolean {
    if (groundingMode === 'free') return agenda.trim().length > 0;
    return true;
  }

  function materialStepValid(): boolean {
    return selectedReportIds.length + selectedTranscriptIds.length > 0;
  }

  function goToTopicNext() {
    if (!topicStepValid()) {
      message.warning(t('studio.freeQuestionRequired'));
      return;
    }
    setCurrentKey(groundingMode === 'material' ? 'material' : 'experts');
  }

  function goToMaterialNext() {
    if (!materialStepValid()) {
      message.warning(t('studio.materialRequired'));
      return;
    }
    setCurrentKey('experts');
  }

  async function goToSetup() {
    if (totalSelectedExperts < 2) {
      message.warning(t('studio.minParticipants'));
      return;
    }
    let agentIds: string[];
    try {
      agentIds = await resolveSelectedAgentIds();
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to add selected public agents');
      return;
    }
    setParticipants(buildInitialParticipants(agentIds));
    setDiscussionName(suggestName(agentIds));
    setCurrentKey('setup');
  }

  function goAfterSetup() {
    setCurrentKey('start');
  }

  function updateParticipant(index: number, field: keyof ParticipantConfig, value: unknown) {
    setParticipants((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  async function handleSubmit() {
    if (!discussionName.trim()) {
      message.warning('Please enter a discussion name');
      return;
    }
    setSubmitting(true);
    try {
      const disc = await createDiscussion({
        name: discussionName.trim(),
        description: agenda.trim() || undefined,
        format,
        formatConfig: {
          totalTurnTarget,
          language,
          turnLength,
          ...(ttsProvider !== 'auto' ? { ttsProvider } : {}),
          grounding: {
            mode: groundingMode,
            ...(groundingMode === 'material'
              ? { reportIds: selectedReportIds, artifactIds: selectedTranscriptIds }
              : {})
          }
        },
        participants
      });

      if (runNow) {
        const run = await triggerDiscussionRun(disc.id);
        navigate(`/studio/${disc.id}`, { state: { liveRunId: run.id } });
      } else {
        navigate(`/studio/${disc.id}`);
      }
    } catch {
      message.error('Failed to create discussion');
    } finally {
      setSubmitting(false);
    }
  }

  const stepTitles: Record<StepKey, string> = {
    topic: t('studio.wizardStepTopic'),
    experts: t('studio.wizardStep1'),
    setup: t('studio.wizardStep2'),
    material: t('studio.wizardStepMaterial'),
    start: t('studio.wizardStep3')
  };

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '0 clamp(8px, 4vw, 16px)' }}>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>
          <AudioOutlined style={{ marginRight: 8 }} />
          {t('studio.newDiscussion')}
        </h2>
        <Button type="text" onClick={() => navigate('/studio')}>
          {t('common.cancel')}
        </Button>
      </div>

      <Steps
        current={currentIndex}
        size="small"
        items={stepKeys.map((key) => ({ title: stepTitles[key] }))}
        style={{ marginBottom: 32 }}
        className="hidden sm:flex"
      />
      <Progress
        percent={stepProgress}
        showInfo={false}
        size="small"
        style={{ marginBottom: 24 }}
        className="sm:hidden"
      />

      {/* Topic: what should the experts talk about? */}
      {currentKey === 'topic' && (
        <Card>
          <p style={{ color: '#888', marginTop: 0 }}>{t('studio.topicStepIntro')}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
            {GROUNDING_MODES.map(({ mode, emoji }) => {
              const selected = groundingMode === mode;
              return (
                <Card
                  key={mode}
                  size="small"
                  hoverable
                  style={{
                    cursor: 'pointer',
                    borderColor: selected ? '#722ed1' : undefined,
                    background: selected ? 'rgba(114,46,209,0.08)' : undefined
                  }}
                  onClick={() => setGroundingMode(mode)}
                >
                  <div style={{ fontSize: 22, marginBottom: 4 }}>{emoji}</div>
                  <div style={{ fontWeight: 600 }}>{t(`studio.grounding_${mode}_title`)}</div>
                  <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>
                    {t(`studio.grounding_${mode}_desc`)}
                  </div>
                </Card>
              );
            })}
          </div>

          {groundingMode === 'free' && (
            <Form layout="vertical">
              <Form.Item label={t('studio.freeQuestionLabel')} required>
                <Input.TextArea
                  value={agenda}
                  onChange={(e) => setAgenda(e.target.value)}
                  placeholder={t('studio.freeQuestionPlaceholder')}
                  rows={3}
                />
              </Form.Item>
            </Form>
          )}

          {groundingMode === 'material' && (
            <p style={{ color: '#888', fontSize: 13 }}>{t('studio.grounding_material_hint')}</p>
          )}

          <div style={{ textAlign: 'right' }}>
            <Button type="primary" onClick={goToTopicNext} disabled={!topicStepValid()}>
              {t('common.next')}
            </Button>
          </div>
        </Card>
      )}

      {/* Experts: pick agents */}
      {currentKey === 'experts' && (
        <Card>
          {preselectContextLabel && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message={t('studio.preselectBanner', { context: preselectContextLabel })}
              action={
                <Button size="small" type="text" onClick={clearPreselect}>
                  {t('studio.startFromScratch')}
                </Button>
              }
            />
          )}
          <div className="space-y-2">
            <p className="m-0 text-sm font-medium">{t('studio.expertsStepLabel')}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {loadingAgents ? (
                <span>Loading agents…</span>
              ) : (
                ownedAgents.map((agent) => (
                  <Card
                    key={agent.id}
                    size="small"
                    hoverable
                    style={{
                      cursor: 'pointer',
                      borderColor: selectedAgentIds.includes(agent.id) ? '#722ed1' : undefined,
                      background: selectedAgentIds.includes(agent.id) ? 'rgba(114,46,209,0.08)' : undefined
                    }}
                    onClick={() => handleAgentToggle(agent.id, !selectedAgentIds.includes(agent.id))}
                  >
                    <div
                      data-testid={`studio-expert-card-meta-${agent.id}`}
                      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}
                    >
                      <Checkbox checked={selectedAgentIds.includes(agent.id)} />
                      <strong style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{getAgentDisplayLabel(agent)}</strong>
                      {agent.characterType && (
                        <Tag color="default">
                          {agent.characterType}
                        </Tag>
                      )}
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>

          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="m-0 text-sm font-medium">{t('studio.publicAgents')}</p>
              {totalPublicAgentPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    size="small"
                    aria-label={t('common.back')}
                    icon={<ArrowLeftOutlined />}
                    onClick={() => setPublicAgentsPage((p) => (p - 1 < 0 ? totalPublicAgentPages - 1 : p - 1))}
                  />
                  <span className="text-xs text-muted-foreground">
                    {publicAgentsPage + 1} / {totalPublicAgentPages}
                  </span>
                  <Button
                    size="small"
                    aria-label={t('common.next')}
                    icon={<ArrowRightOutlined />}
                    onClick={() => setPublicAgentsPage((p) => (p + 1 >= totalPublicAgentPages ? 0 : p + 1))}
                  />
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {loadingMarketplaceAgents ? (
                <span>Loading agents…</span>
              ) : (
                visiblePublicAgents.map((item) => (
                  <Card
                    key={item.publicationId}
                    size="small"
                    hoverable
                    style={{
                      cursor: 'pointer',
                      borderColor: selectedPublicationIds.includes(item.publicationId) ? '#722ed1' : undefined,
                      background: selectedPublicationIds.includes(item.publicationId) ? 'rgba(114,46,209,0.08)' : undefined
                    }}
                    onClick={() => handlePublicAgentToggle(item.publicationId, !selectedPublicationIds.includes(item.publicationId))}
                  >
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                      <Checkbox checked={selectedPublicationIds.includes(item.publicationId)} />
                      <strong style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{item.agent.name}</strong>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
            <Button onClick={() => setCurrentKey(groundingMode === 'material' ? 'material' : 'topic')}>
              {t('common.back')}
            </Button>
            <Button type="primary" loading={cloningAgents} onClick={goToSetup} disabled={totalSelectedExperts < 2}>
              {cloningAgents ? t('studio.cloningAgents') : t('common.next')}
            </Button>
          </div>
        </Card>
      )}

      {/* Setup: name, format, turns, language, participants */}
      {currentKey === 'setup' && (
        <Card>
          <Form layout="vertical">
            <Form.Item label={t('studio.discussionNameLabel')} required>
              <Input
                value={discussionName}
                onChange={(e) => setDiscussionName(e.target.value)}
                placeholder={t('studio.discussionNamePlaceholder')}
              />
            </Form.Item>
            <Form.Item label={t('studio.totalTurnsLabel')}>
              <Select
                value={totalTurnTarget}
                onChange={setTotalTurnTarget}
                options={[6, 8, 10, 12, 16, 20].map((n) => ({ value: n, label: t('studio.turnsCount', { count: n }) }))}
              />
            </Form.Item>
            <Form.Item label={t('studio.turnLengthLabel')}>
              <Select
                value={turnLength}
                onChange={(v) => setTurnLength(v as 'short' | 'medium' | 'long')}
                options={[
                  { value: 'short', label: t('studio.turnLengthShort') },
                  { value: 'medium', label: t('studio.turnLengthMedium') },
                  { value: 'long', label: t('studio.turnLengthLong') }
                ]}
              />
            </Form.Item>
            <Collapse
              ghost
              className="mb-4"
              items={[
                {
                  key: 'more',
                  label: t('studio.moreOptions'),
                  children: (
                    <>
                      <Form.Item label={t('studio.formatLabel')}>
                        <Select
                          value={format}
                          onChange={(v) => setFormat(v as Format)}
                          options={[
                            { value: 'free_form', label: t('studio.format_free_form') },
                            { value: 'structured', label: t('studio.format_structured') },
                            { value: 'hosted', label: t('studio.format_hosted') },
                            { value: 'hybrid', label: t('studio.format_hybrid') }
                          ]}
                        />
                      </Form.Item>
                      <Form.Item label={t('studio.languageLabel')}>
                        <Select
                          value={language}
                          onChange={(v) => setLanguage(v as 'en' | 'de')}
                          options={[
                            { value: 'en', label: t('studio.languageEnglish') },
                            { value: 'de', label: t('studio.languageGerman') }
                          ]}
                        />
                      </Form.Item>
                      {capabilities.ttsProviders.length > 1 && (
                        <Form.Item label={t('studio.voiceApiLabel')} extra={t('studio.voiceApiHint')}>
                          <Select
                            value={ttsProvider}
                            onChange={(v) => setTtsProvider(v as TtsProviderDto)}
                            options={[
                              { value: 'auto', label: t('studio.voiceApiAuto') },
                              ...capabilities.ttsProviders.map((provider) => ({
                                value: provider,
                                label: provider === 'google' ? t('studio.voiceApiGoogle') : t('studio.voiceApiOpenai')
                              }))
                            ]}
                          />
                        </Form.Item>
                      )}
                      <Form.Item label={t('studio.participants')}>
                        {participants.map((p, i) => {
                          const agent = agents.find((a) => a.id === p.agentId);
                          return (
                            <div key={p.agentId} style={{ marginBottom: 8 }}>
                              <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>
                                {agent ? getAgentDisplayLabel(agent) : p.agentId}
                              </strong>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                <Select
                                  value={p.role}
                                  onChange={(v) => updateParticipant(i, 'role', v)}
                                  style={{ width: 110 }}
                                  options={[
                                    { value: 'speaker', label: t('studio.roleSpeaker') },
                                    { value: 'host', label: t('studio.roleHost') }
                                  ]}
                                />
                                <Select
                                  value={p.voiceId}
                                  onChange={(v) => updateParticipant(i, 'voiceId', v)}
                                  style={{ flex: '1 1 160px', minWidth: 160, maxWidth: 230 }}
                                  options={VOICES.map((v) => ({
                                    value: v,
                                    // When Google renders the audio, show the actual Google voice each
                                    // character maps to so the picker matches the underlying API.
                                    label:
                                      effectiveTtsProvider === 'google'
                                        ? `${VOICE_LABELS[v]} · ${GOOGLE_VOICE_NAMES[language][v]}`
                                        : VOICE_LABELS[v]
                                  }))}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </Form.Item>
                    </>
                  )
                }
              ]}
            />
          </Form>
          <Space>
            <Button onClick={() => setCurrentKey('experts')}>{t('common.back')}</Button>
            <Button type="primary" onClick={goAfterSetup}>
              {t('common.next')}
            </Button>
          </Space>
        </Card>
      )}

      {/* Material: shared, agent-independent pool of reports + transcripts + optional agenda */}
      {currentKey === 'material' && (
        <Card>
          {preselectContextLabel && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message={t('studio.preselectBanner', { context: preselectContextLabel })}
              action={
                <Button size="small" type="text" onClick={clearPreselect}>
                  {t('studio.startFromScratch')}
                </Button>
              }
            />
          )}
          <Form layout="vertical">
            <p style={{ color: '#888', marginTop: 0 }}>{t('studio.materialStepIntro')}</p>
            <Form.Item label={t('studio.materialReportsLabel')}>
              <Select
                mode="multiple"
                allowClear
                value={selectedReportIds}
                onChange={setSelectedReportIds}
                loading={loadingReports}
                placeholder={t('studio.reportPickerPlaceholder')}
                notFoundContent={loadingReports ? t('studio.reportPickerLoading') : t('studio.reportPickerEmpty')}
                optionFilterProp="label"
                options={allReports.map((r) => ({
                  value: r.id,
                  label: `${r.agentName} · ${new Date(r.createdAt).toLocaleDateString()} — ${r.summary.slice(0, 80)}`
                }))}
              />
            </Form.Item>
            <Form.Item label={t('studio.materialTranscriptsLabel')}>
              <Select
                mode="multiple"
                allowClear
                value={selectedTranscriptIds}
                onChange={setSelectedTranscriptIds}
                loading={loadingTranscripts}
                placeholder={t('studio.transcriptPickerPlaceholder')}
                notFoundContent={
                  loadingTranscripts ? t('studio.transcriptPickerLoading') : t('studio.transcriptPickerEmpty')
                }
                optionLabelProp="label"
                options={transcriptOptions.map((o) => ({
                  value: o.artifactId,
                  label: o.title,
                  // Rendered inside the dropdown row for extra context.
                  desc: o.preview
                }))}
                optionRender={(option) => (
                  <div>
                    <div style={{ fontWeight: 500 }}>{option.data.label}</div>
                    <div style={{ color: '#888', fontSize: 12, whiteSpace: 'normal' }}>{option.data.desc}</div>
                  </div>
                )}
              />
            </Form.Item>
            <Form.Item label={t('studio.agendaLabel')}>
              <Input.TextArea
                value={agenda}
                onChange={(e) => setAgenda(e.target.value)}
                placeholder={t('studio.agendaPlaceholder')}
                rows={3}
              />
            </Form.Item>
          </Form>
          <Space>
            <Button onClick={() => setCurrentKey('topic')}>{t('common.back')}</Button>
            <Button type="primary" onClick={goToMaterialNext} disabled={!materialStepValid()}>
              {t('common.next')}
            </Button>
          </Space>
        </Card>
      )}

      {/* Start: run now toggle */}
      {currentKey === 'start' && (
        <Card>
          <Form layout="vertical">
            <Form.Item>
              <Checkbox
                checked={runNow}
                onChange={(e) => setRunNow(e.target.checked)}
                className="flex items-start leading-5 [&_.ant-checkbox]:mt-0.5"
              >
                {t('studio.runNow')} (run the discussion immediately after creating)
              </Checkbox>
            </Form.Item>
          </Form>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button className="w-full sm:w-auto" onClick={() => setCurrentKey('setup')}>
              {t('common.back')}
            </Button>
            <StudioPrimaryButton className="w-full sm:w-auto" loading={submitting} onClick={handleSubmit}>
              {t('studio.newDiscussion')}
            </StudioPrimaryButton>
          </div>
        </Card>
      )}
    </div>
  );
}
