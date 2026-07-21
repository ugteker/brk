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
  listTranscriptOptions,
  triggerDiscussionRun,
  type DiscussionGroundingMode,
  type DiscussionPreselect,
  type TranscriptOptionDto
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

const LATEST_REPORT_FALLBACK_LIMIT = 3;

interface ParticipantConfig {
  agentId: string;
  role: 'speaker' | 'host';
  voiceId: Voice;
  speakerOrder: number;
  /** Explicit report IDs picked for this participant; empty means "use latest reports". */
  reportIds: string[];
}

/** Logical wizard steps; 'material' only exists in reports mode. */
type StepKey = 'topic' | 'experts' | 'setup' | 'material' | 'start';

const GROUNDING_MODES: Array<{ mode: DiscussionGroundingMode; emoji: string }> = [
  { mode: 'reports', emoji: '📄' },
  { mode: 'transcript', emoji: '🎙️' },
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
  const [groundingMode, setGroundingMode] = useState<DiscussionGroundingMode>('reports');
  const [transcriptOptions, setTranscriptOptions] = useState<TranscriptOptionDto[]>([]);
  const [loadingTranscripts, setLoadingTranscripts] = useState(false);
  const [transcriptsLoaded, setTranscriptsLoaded] = useState(false);
  const [selectedTranscriptIds, setSelectedTranscriptIds] = useState<string[]>([]);
  // Shared questions/topics. In free mode this IS the discussion topic; in the other
  // modes it's an optional steer on top of the selected material.
  const [agenda, setAgenda] = useState('');

  // Experts step
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);

  // Pre-fill support for entry points that jump in from a report or Library source
  // (rather than the default blank topic-first flow). Always implies reports mode.
  const [preselectedReportIdsByAgent, setPreselectedReportIdsByAgent] = useState<Record<string, string[]>>({});
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

  // Material step (reports mode only): per-agent report options.
  const [reportsByAgent, setReportsByAgent] = useState<Record<string, RunReportDto[]>>({});
  const [loadingReports, setLoadingReports] = useState(false);

  // Start step
  const [runNow, setRunNow] = useState(true);

  const stepKeys = useMemo<StepKey[]>(
    () =>
      groundingMode === 'reports'
        ? ['topic', 'experts', 'setup', 'material', 'start']
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
      setGroundingMode('reports');
      setSelectedAgentIds(preselect.entries.map((e) => e.agentId));
      setPreselectedReportIdsByAgent(Object.fromEntries(preselect.entries.map((e) => [e.agentId, e.reportIds])));
      setPreselectContextLabel(preselect.contextLabel ?? null);
      setCurrentKey('experts');
    }
    // Only ever applied once, from whatever state the wizard was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lazy-load transcript options the first time the transcript mode is picked.
  useEffect(() => {
    if (groundingMode !== 'transcript' || transcriptsLoaded || loadingTranscripts) return;
    setLoadingTranscripts(true);
    listTranscriptOptions()
      .then((options) => {
        setTranscriptOptions(options);
        setTranscriptsLoaded(true);
      })
      .catch(() => setTranscriptsLoaded(true))
      .finally(() => setLoadingTranscripts(false));
  }, [groundingMode, transcriptsLoaded, loadingTranscripts]);

  function clearPreselect() {
    setSelectedAgentIds([]);
    setPreselectedReportIdsByAgent({});
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
      reportIds: preselectedReportIdsByAgent[agentId] ?? []
    }));
  }

  function suggestName(agentIds: string[]): string {
    if (groundingMode === 'free' && agenda.trim()) {
      const q = agenda.trim();
      return q.length > 60 ? `${q.slice(0, 57)}…` : q;
    }
    if (groundingMode === 'transcript' && selectedTranscriptIds.length > 0) {
      const first = transcriptOptions.find((o) => o.artifactId === selectedTranscriptIds[0]);
      if (first) return first.title;
    }
    return agentIds
      .map((id) => {
        const agent = agents.find((candidate) => candidate.id === id);
        return agent ? getAgentDisplayLabel(agent) : id;
      })
      .join(' × ');
  }

  function topicStepValid(): boolean {
    if (groundingMode === 'transcript') return selectedTranscriptIds.length > 0;
    if (groundingMode === 'free') return agenda.trim().length > 0;
    return true;
  }

  function goToTopicNext() {
    if (!topicStepValid()) {
      message.warning(
        groundingMode === 'transcript' ? t('studio.transcriptRequired') : t('studio.freeQuestionRequired')
      );
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
    if (groundingMode !== 'reports') {
      setCurrentKey('start');
      return;
    }
    setCurrentKey('material');
    setLoadingReports(true);
    Promise.all(
      participants.map(async (p) => {
        try {
          const reports = await listAgentReports(p.agentId);
          return [p.agentId, reports] as const;
        } catch {
          return [p.agentId, []] as const;
        }
      })
    )
      .then((entries) => setReportsByAgent(Object.fromEntries(entries)))
      .finally(() => setLoadingReports(false));
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
          grounding: {
            mode: groundingMode,
            ...(groundingMode === 'transcript' ? { artifactIds: selectedTranscriptIds } : {})
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
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
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
        items={stepKeys.map((key) => ({ title: stepTitles[key] }))}
        style={{ marginBottom: 32 }}
      />

      {/* Topic: what should the experts talk about? */}
      {currentKey === 'topic' && (
        <Card>
          <p style={{ color: '#888', marginTop: 0 }}>{t('studio.topicStepIntro')}</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
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

          {groundingMode === 'transcript' && (
            <Form layout="vertical">
              <Form.Item label={t('studio.transcriptPickerLabel')} required>
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
            </Form>
          )}

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

          {groundingMode === 'reports' && (
            <p style={{ color: '#888', fontSize: 13 }}>{t('studio.grounding_reports_hint')}</p>
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
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
            <Button onClick={() => setCurrentKey('topic')}>{t('common.back')}</Button>
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
            {groundingMode === 'transcript' && (
              <Form.Item label={t('studio.agendaLabel')}>
                <Input.TextArea
                  value={agenda}
                  onChange={(e) => setAgenda(e.target.value)}
                  placeholder={t('studio.agendaPlaceholder')}
                  rows={2}
                />
              </Form.Item>
            )}
            <Form.Item label={t('studio.participants')}>
              {participants.map((p, i) => {
                const agent = agents.find((a) => a.id === p.agentId);
                return (
                  <div key={p.agentId} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <strong style={{ minWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {agent ? getAgentDisplayLabel(agent) : p.agentId}
                    </strong>
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
                      style={{ width: 190 }}
                      options={VOICES.map((v) => ({ value: v, label: VOICE_LABELS[v] }))}
                    />
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

      {/* Material (reports mode only): per-participant report selection + shared agenda */}
      {currentKey === 'material' && (
        <Card>
          <Form layout="vertical">
            <p style={{ color: '#888', marginTop: 0 }}>{t('studio.materialStepIntro')}</p>
            {participants.map((p, i) => {
              const agent = agents.find((a) => a.id === p.agentId);
              const reports = reportsByAgent[p.agentId] ?? [];
              return (
                <Form.Item
                  key={p.agentId}
                  label={t('studio.reportPickerLabel', { agentName: agent ? getAgentDisplayLabel(agent) : p.agentId })}
                >
                  <Select
                    mode="multiple"
                    allowClear
                    value={p.reportIds}
                    onChange={(v) => updateParticipant(i, 'reportIds', v)}
                    loading={loadingReports}
                    placeholder={t('studio.reportPickerPlaceholder')}
                    notFoundContent={loadingReports ? t('studio.reportPickerLoading') : t('studio.reportPickerEmpty')}
                    options={reports.map((r) => ({
                      value: r.id,
                      label: `${new Date(r.createdAt).toLocaleDateString()} — ${r.summary.slice(0, 80)}`
                    }))}
                  />
                  {p.reportIds.length === 0 && (
                    <div style={{ marginTop: 4, color: '#888', fontSize: 12 }}>
                      {t('studio.reportPickerFallbackHint', { limit: LATEST_REPORT_FALLBACK_LIMIT })}
                    </div>
                  )}
                </Form.Item>
              );
            })}
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
            <Button onClick={() => setCurrentKey('setup')}>{t('common.back')}</Button>
            <Button type="primary" onClick={() => setCurrentKey('start')}>
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
            <Button onClick={() => setCurrentKey(groundingMode === 'reports' ? 'material' : 'setup')}>
              {t('common.back')}
            </Button>
            <StudioPrimaryButton loading={submitting} onClick={handleSubmit}>
              {t('studio.newDiscussion')}
            </StudioPrimaryButton>
          </Space>
        </Card>
      )}
    </div>
  );
}
