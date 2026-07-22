import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  Select,
  Space,
  Steps,
  Tag,
  message
} from 'antd';
import { AudioOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { useSafeNavigate } from '../utils/useSafeNavigate';
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
import { StudioPrimaryButton } from '../components/StudioPrimaryButton';
import { getAgentDisplayLabel } from '../utils/agent-label';

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
      : capabilities.ttsProviders.includes('google')
        ? 'google'
        : capabilities.ttsProviders.includes('openai')
          ? 'openai'
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

  useEffect(() => {
    listAgents()
      .then(setAgents)
      .catch(() => {})
      .finally(() => setLoadingAgents(false));
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

  function goToSetup() {
    if (selectedAgentIds.length < 2) {
      message.warning(t('studio.minParticipants'));
      return;
    }
    setParticipants(buildInitialParticipants(selectedAgentIds));
    setDiscussionName(suggestName(selectedAgentIds));
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
          <Form.Item label={t('studio.expertsStepLabel')}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
              {loadingAgents ? (
                <span>Loading agents…</span>
              ) : (
                agents.map((agent) => (
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
                    <Checkbox checked={selectedAgentIds.includes(agent.id)} style={{ marginRight: 8 }} />
                    <strong>{getAgentDisplayLabel(agent)}</strong>
                    {agent.characterType && (
                      <Tag style={{ marginLeft: 6 }} color="default">
                        {agent.characterType}
                      </Tag>
                    )}
                  </Card>
                ))
              )}
            </div>
          </Form.Item>
          <Space style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button onClick={() => setCurrentKey(groundingMode === 'material' ? 'material' : 'topic')}>
              {t('common.back')}
            </Button>
            <Button type="primary" onClick={goToSetup} disabled={selectedAgentIds.length < 2}>
              {t('common.next')}
            </Button>
          </Space>
        </Card>
      )}

      {/* Setup: name, format, turns, language, participants */}
      {currentKey === 'setup' && (
        <Card>
          <Form layout="vertical">
            <Form.Item label="Discussion name" required>
              <Input
                value={discussionName}
                onChange={(e) => setDiscussionName(e.target.value)}
                placeholder="e.g. Weekly Market Roundtable"
              />
            </Form.Item>
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
            <Form.Item label="Total turns (depth of discussion)">
              <Select
                value={totalTurnTarget}
                onChange={setTotalTurnTarget}
                options={[6, 8, 10, 12, 16, 20].map((n) => ({ value: n, label: `${n} turns` }))}
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
              <Checkbox checked={runNow} onChange={(e) => setRunNow(e.target.checked)}>
                {t('studio.runNow')} (run the discussion immediately after creating)
              </Checkbox>
            </Form.Item>
          </Form>
          <Space>
            <Button onClick={() => setCurrentKey('setup')}>{t('common.back')}</Button>
            <StudioPrimaryButton loading={submitting} onClick={handleSubmit}>
              {t('studio.newDiscussion')}
            </StudioPrimaryButton>
          </Space>
        </Card>
      )}
    </div>
  );
}
