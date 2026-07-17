import React, { useEffect, useState } from 'react';
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
import { useLocation, useNavigate } from 'react-router-dom';
import { listAgents, listAgentReports, type AgentSummary, type RunReportDto } from '../api/agents';
import { createDiscussion, triggerDiscussionRun, type DiscussionPreselect } from '../api/discussions';
import { StudioPrimaryButton } from '../components/StudioPrimaryButton';

type Format = 'free_form' | 'structured' | 'hosted' | 'hybrid';
type Voice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

const VOICES: Voice[] = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
const LATEST_REPORT_FALLBACK_LIMIT = 3;

interface ParticipantConfig {
  agentId: string;
  role: 'speaker' | 'host';
  voiceId: Voice;
  speakerOrder: number;
  /** Explicit report IDs picked for this participant; empty means "use latest reports". */
  reportIds: string[];
}

export function NewDiscussionWizard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const [currentStep, setCurrentStep] = useState(0);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Step 1 state
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);

  // Pre-fill support for entry points that jump in from a report or Library source
  // (rather than the default blank agent-first flow).
  const [preselectedReportIdsByAgent, setPreselectedReportIdsByAgent] = useState<Record<string, string[]>>({});
  const [preselectContextLabel, setPreselectContextLabel] = useState<string | null>(null);

  // Step 2 state
  const [discussionName, setDiscussionName] = useState('');
  const [format, setFormat] = useState<Format>('free_form');
  const [participants, setParticipants] = useState<ParticipantConfig[]>([]);
  const [totalTurnTarget, setTotalTurnTarget] = useState(12);

  // Material step state: per-agent report options and the shared questions/topics agenda.
  const [reportsByAgent, setReportsByAgent] = useState<Record<string, RunReportDto[]>>({});
  const [loadingReports, setLoadingReports] = useState(false);
  const [agenda, setAgenda] = useState('');

  // Step 3 state
  const [runNow, setRunNow] = useState(true);

  useEffect(() => {
    listAgents()
      .then(setAgents)
      .catch(() => {})
      .finally(() => setLoadingAgents(false));
  }, []);

  useEffect(() => {
    const preselect = (location.state as { preselect?: DiscussionPreselect } | null)?.preselect;
    if (preselect && preselect.entries.length > 0) {
      setSelectedAgentIds(preselect.entries.map((e) => e.agentId));
      setPreselectedReportIdsByAgent(Object.fromEntries(preselect.entries.map((e) => [e.agentId, e.reportIds])));
      setPreselectContextLabel(preselect.contextLabel ?? null);
    }
    // Only ever applied once, from whatever state the wizard was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  function goToStep2() {
    if (selectedAgentIds.length < 2) {
      message.warning(t('studio.minParticipants'));
      return;
    }
    const p = buildInitialParticipants(selectedAgentIds);
    setParticipants(p);
    const names = selectedAgentIds
      .map((id) => agents.find((a) => a.id === id)?.name ?? id)
      .join(' × ');
    setDiscussionName(names);
    setCurrentStep(1);
  }

  function goToMaterialStep() {
    setCurrentStep(2);
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
        formatConfig: { totalTurnTarget },
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

  const steps = [
    { title: t('studio.wizardStep1') },
    { title: t('studio.wizardStep2') },
    { title: t('studio.wizardStepMaterial') },
    { title: t('studio.wizardStep3') }
  ];

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

      <Steps current={currentStep} items={steps} style={{ marginBottom: 32 }} />

      {/* Step 1: Pick agents */}
      {currentStep === 0 && (
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
          <Form.Item label={t('studio.wizardStep1')}>
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
                    <strong>{agent.name}</strong>
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
          <div style={{ textAlign: 'right' }}>
            <Button type="primary" onClick={goToStep2} disabled={selectedAgentIds.length < 2}>
              {t('common.next')}
            </Button>
          </div>
        </Card>
      )}

      {/* Step 2: Configure */}
      {currentStep === 1 && (
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
            <Form.Item label={t('studio.participants')}>
              {participants.map((p, i) => {
                const agent = agents.find((a) => a.id === p.agentId);
                return (
                  <div key={p.agentId} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <strong style={{ minWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {agent?.name ?? p.agentId}
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
                      style={{ width: 110 }}
                      options={VOICES.map((v) => ({ value: v, label: v }))}
                    />
                  </div>
                );
              })}
            </Form.Item>
          </Form>
          <Space>
            <Button onClick={() => setCurrentStep(0)}>{t('common.back')}</Button>
            <Button type="primary" onClick={goToMaterialStep}>
              {t('common.next')}
            </Button>
          </Space>
        </Card>
      )}

      {/* Step 3: Material - per-participant report selection + shared agenda */}
      {currentStep === 2 && (
        <Card>
          <Form layout="vertical">
            <p style={{ color: '#888', marginTop: 0 }}>{t('studio.materialStepIntro')}</p>
            {participants.map((p, i) => {
              const agent = agents.find((a) => a.id === p.agentId);
              const reports = reportsByAgent[p.agentId] ?? [];
              return (
                <Form.Item
                  key={p.agentId}
                  label={t('studio.reportPickerLabel', { agentName: agent?.name ?? p.agentId })}
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
            <Button onClick={() => setCurrentStep(1)}>{t('common.back')}</Button>
            <Button type="primary" onClick={() => setCurrentStep(3)}>
              {t('common.next')}
            </Button>
          </Space>
        </Card>
      )}

      {/* Step 4: Schedule */}
      {currentStep === 3 && (
        <Card>
          <Form layout="vertical">
            <Form.Item>
              <Checkbox checked={runNow} onChange={(e) => setRunNow(e.target.checked)}>
                {t('studio.runNow')} (run the discussion immediately after creating)
              </Checkbox>
            </Form.Item>
          </Form>
          <Space>
            <Button onClick={() => setCurrentStep(2)}>{t('common.back')}</Button>
            <StudioPrimaryButton loading={submitting} onClick={handleSubmit}>
              {t('studio.newDiscussion')}
            </StudioPrimaryButton>
          </Space>
        </Card>
      )}
    </div>
  );
}
