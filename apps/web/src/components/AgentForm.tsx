import { useMemo, useState } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Select,
  Steps,
  Switch,
  Tag,
  Typography,
  message
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  LinkOutlined,
  MessageOutlined,
  SafetyCertificateOutlined,
  UserOutlined
} from '@ant-design/icons';
import { createAgent, updateAgent, type AgentDetail } from '../api/agents';
import { saveAgentPrompt } from '../api/agents';
import { DEFAULT_PROMPT_PERSONA_ID, PROMPT_PERSONAS, getPromptPersona } from '../data/prompt-personas';

const { TextArea } = Input;
const { Title, Paragraph, Text } = Typography;

type SourceType = 'web_urls' | 'podcast_feeds';
type RiskLevel = 'low' | 'medium' | 'high';
type NotificationCadence = 'on_every_run' | 'daily_digest' | 'weekly_digest';
type ReportDetailLevel = 'summary' | 'detailed';

interface SourceConfig {
  id: string;
  type: SourceType;
  value: string;
  frequencyMinutes: number;
  enabled: boolean;
}

interface AgentFormProps {
  onCancel?: () => void;
  onComplete?: () => void;
  agent?: AgentDetail;
  initialPrompt?: { model: string; systemPrompt: string } | null;
}

const STEPS = [
  { title: 'Identity', icon: <UserOutlined /> },
  { title: 'Sources', icon: <LinkOutlined /> },
  { title: 'Prompt', icon: <MessageOutlined /> },
  { title: 'Policy', icon: <SafetyCertificateOutlined /> },
  { title: 'Schedule', icon: <ClockCircleOutlined /> },
  { title: 'Review', icon: <CheckCircleOutlined /> }
] as const;

const DEFAULT_SYSTEM_PROMPT = getPromptPersona(DEFAULT_PROMPT_PERSONA_ID)?.systemPrompt ?? '';

function preference(agent: AgentDetail | undefined, key: string, fallback: string): string {
  return agent?.preferences?.[key]?.[0] ?? fallback;
}

export function AgentForm({ onCancel, onComplete, agent, initialPrompt }: AgentFormProps) {
  const isEditing = Boolean(agent);
  const [currentStep, setCurrentStep] = useState(0);
  const [name, setName] = useState(agent?.name ?? 'Brokerino Agent');
  const [description, setDescription] = useState(agent?.description ?? '');
  const [active, setActive] = useState(agent ? agent.status === 'active' : true);

  const [sources, setSources] = useState<SourceConfig[]>(
    agent && agent.sources.length > 0
      ? agent.sources.map((s, index) => ({
          id: `src-${index + 1}`,
          type: s.type,
          value: s.value,
          frequencyMinutes: s.frequencyMinutes ?? 60,
          enabled: true
        }))
      : [{ id: 'src-1', type: 'web_urls', value: 'https://example.com', frequencyMinutes: 60, enabled: true }]
  );

  const [model, setModel] = useState(initialPrompt?.model ?? 'claude-sonnet-4-5');
  const [personaId, setPersonaId] = useState(DEFAULT_PROMPT_PERSONA_ID);
  const [systemPrompt, setSystemPrompt] = useState(initialPrompt?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT);

  const [confidenceThreshold, setConfidenceThreshold] = useState(
    Number.parseInt(preference(agent, 'confidence_threshold', '70'), 10) || 70
  );
  const [riskLevel, setRiskLevel] = useState<RiskLevel>(preference(agent, 'risk_level', 'medium') as RiskLevel);
  const [notificationCadence, setNotificationCadence] = useState<NotificationCadence>(
    preference(agent, 'notification_cadence', 'daily_digest') as NotificationCadence
  );
  const [reportDetailLevel, setReportDetailLevel] = useState<ReportDetailLevel>(
    preference(agent, 'report_detail_level', 'summary') as ReportDetailLevel
  );

  const [mode, setMode] = useState<'interval' | 'daily'>(agent?.schedule?.mode ?? 'interval');
  const [intervalMinutes, setIntervalMinutes] = useState(
    agent?.schedule?.mode === 'interval' ? agent.schedule.intervalMinutes : 60
  );
  const [dailyTime, setDailyTime] = useState(agent?.schedule?.mode === 'daily' ? agent.schedule.dailyTime : '07:30');
  const [timezone, setTimezone] = useState(agent?.schedule?.mode === 'daily' ? agent.schedule.timezone : 'UTC');
  const [recipientsInput, setRecipientsInput] = useState(agent?.recipients?.join(', ') ?? 'team@example.com');

  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');


  const enabledSourceCount = useMemo(() => sources.filter((s) => s.enabled).length, [sources]);

  function updateSource(sourceId: string, patch: Partial<SourceConfig>) {
    setSources((current) => current.map((s) => (s.id === sourceId ? { ...s, ...patch } : s)));
  }

  function addSource() {
    const nextIndex = sources.length + 1;
    setSources((current) => [
      ...current,
      { id: `src-${nextIndex}`, type: 'web_urls', value: '', frequencyMinutes: 60, enabled: true }
    ]);
  }

  function removeSource(sourceId: string) {
    if (sources.length <= 1) return;
    setSources((current) => current.filter((s) => s.id !== sourceId));
  }

  function onPersonaChange(nextPersonaId: string) {
    setPersonaId(nextPersonaId);
    const persona = getPromptPersona(nextPersonaId);
    if (persona) {
      setSystemPrompt(persona.systemPrompt);
      setRiskLevel(persona.riskLevel);
    }
  }

  function nextStep() {
    setCurrentStep((prev) => Math.min(STEPS.length - 1, prev + 1));
  }

  function backStep() {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  }

  async function onSave() {
    try {
      setSaveState('saving');
      const recipients = recipientsInput
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean);
      const validSources = sources
        .filter((s) => s.enabled && s.value.trim())
        .map((s) => ({ type: s.type, value: s.value.trim(), frequencyMinutes: s.frequencyMinutes }));

      const payload = {
        name,
        description,
        sources: validSources,
        preferences: {
          active: [String(active)],
          confidence_threshold: [String(confidenceThreshold)],
          risk_level: [riskLevel],
          notification_cadence: [notificationCadence],
          report_detail_level: [reportDetailLevel]
        },
        recipients,
        schedule: mode === 'interval' ? { mode: 'interval' as const, intervalMinutes } : { mode: 'daily' as const, dailyTime, timezone }
      };

      const savedAgent = isEditing && agent ? await updateAgent(agent.id, payload) : await createAgent(payload);

      await saveAgentPrompt(savedAgent.id, { model, systemPrompt, enabled: true });

      setSaveState('saved');
      message.success('Agent saved successfully.');
      onComplete?.();
    } catch {
      setSaveState('error');
      message.error('Failed to save agent configuration.');
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[3fr_1.2fr]">
      <div className="space-y-4">
        <Card>
          <div className="flex items-center justify-between">
            <Title level={4} style={{ margin: 0 }}>
              {isEditing ? 'Edit agent' : 'Agent setup wizard'}
            </Title>
            <Text aria-label="Wizard progress" type="secondary">
              Step {currentStep + 1} of {STEPS.length}
            </Text>
          </div>
          <Steps
            current={currentStep}
            size="small"
            titlePlacement="vertical"
            items={STEPS.map((step) => ({ title: step.title, icon: step.icon }))}
            onChange={setCurrentStep}
            style={{ marginTop: 16 }}
          />
        </Card>

        {currentStep === 0 && (
          <Card title="Agent identity">
            <Form layout="vertical">
              <Form.Item label="Agent name">
                <Input aria-label="Agent name" value={name} onChange={(e) => setName(e.currentTarget.value)} />
              </Form.Item>
              <Form.Item label="Description">
                <TextArea
                  aria-label="Description"
                  value={description}
                  onChange={(e) => setDescription(e.currentTarget.value)}
                />
              </Form.Item>
              <Form.Item label="Active">
                <Switch aria-label="Active toggle" checked={active} onChange={setActive} />
              </Form.Item>
            </Form>
          </Card>
        )}

        {currentStep === 1 && (
          <Card
            title="Sources & ingestion rules"
            extra={
              <Button type="primary" onClick={addSource}>
                Add source
              </Button>
            }
          >
            <div className="space-y-3">
              {sources.map((source, index) => (
                <div key={source.id} className="grid gap-2 rounded-md border border-gray-200 p-3 md:grid-cols-4">
                  <label className="space-y-1">
                    <span>Type</span>
                    <Select
                      aria-label={`Source ${index + 1} type`}
                      value={source.type}
                      onChange={(value) => updateSource(source.id, { type: value as SourceType })}
                      options={[
                        { value: 'web_urls', label: 'Web URL' },
                        { value: 'podcast_feeds', label: 'Podcast feed' }
                      ]}
                      style={{ width: '100%' }}
                    />
                  </label>
                  <label className="space-y-1 md:col-span-2">
                    <span>Source URL/feed</span>
                    <Input
                      aria-label={`Source ${index + 1} value`}
                      value={source.value}
                      onChange={(e) => updateSource(source.id, { value: e.currentTarget.value })}
                    />
                  </label>
                  <label className="space-y-1">
                    <span>Frequency (min)</span>
                    <InputNumber
                      aria-label={`Source ${index + 1} frequency`}
                      min={60}
                      value={source.frequencyMinutes}
                      onChange={(value) => updateSource(source.id, { frequencyMinutes: value ?? 60 })}
                      style={{ width: '100%' }}
                    />
                  </label>
                  <div className="flex items-center justify-between md:col-span-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        aria-label={`Source ${index + 1} enabled`}
                        checked={source.enabled}
                        onChange={(enabled) => updateSource(source.id, { enabled })}
                      />
                      <span>Enabled</span>
                    </div>
                    <Button danger type="text" onClick={() => removeSource(source.id)}>
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {currentStep === 2 && (
          <Card title="System prompt">
            <Paragraph type="secondary">
              This prompt is sent to Claude along with the crawled evidence. Pick a trading persona to start from a
              full, ready-to-use prompt with a matching risk profile, then customize it freely.
            </Paragraph>
            <Form layout="vertical">
              <Form.Item label="Persona">
                <Select
                  aria-label="Prompt persona"
                  value={personaId}
                  onChange={onPersonaChange}
                  options={PROMPT_PERSONAS.map((persona) => ({
                    value: persona.id,
                    label: `${persona.name} — ${persona.tagline}`
                  }))}
                />
              </Form.Item>
              <Form.Item label="Model">
                <Select
                  aria-label="Claude model"
                  value={model}
                  onChange={setModel}
                  options={[
                    { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
                    { value: 'claude-sonnet-4', label: 'Claude Sonnet 4' }
                  ]}
                />
              </Form.Item>
              <Form.Item label="System prompt">
                <TextArea
                  aria-label="System prompt"
                  rows={10}
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.currentTarget.value)}
                />
              </Form.Item>
            </Form>
          </Card>
        )}

        {currentStep === 3 && (
          <Card title="Signal policy & publish rules">
            <Form layout="vertical">
              <Form.Item label="Minimum confidence to publish a signal (%)">
                <InputNumber
                  aria-label="Confidence threshold"
                  min={0}
                  max={100}
                  value={confidenceThreshold}
                  onChange={(value) => setConfidenceThreshold(value ?? 70)}
                  style={{ width: '100%' }}
                />
              </Form.Item>
              <Form.Item label="Risk level">
                <Select
                  aria-label="Risk level"
                  value={riskLevel}
                  onChange={(value) => setRiskLevel(value as RiskLevel)}
                  options={[
                    { value: 'low', label: 'Low' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'high', label: 'High' }
                  ]}
                />
              </Form.Item>
              <Form.Item label="Notification cadence">
                <Select
                  aria-label="Notification cadence"
                  value={notificationCadence}
                  onChange={(value) => setNotificationCadence(value as NotificationCadence)}
                  options={[
                    { value: 'on_every_run', label: 'On every run' },
                    { value: 'daily_digest', label: 'Daily digest' },
                    { value: 'weekly_digest', label: 'Weekly digest' }
                  ]}
                />
              </Form.Item>
              <Form.Item label="Report detail level">
                <Select
                  aria-label="Report detail level"
                  value={reportDetailLevel}
                  onChange={(value) => setReportDetailLevel(value as ReportDetailLevel)}
                  options={[
                    { value: 'summary', label: 'Summary' },
                    { value: 'detailed', label: 'Detailed' }
                  ]}
                />
              </Form.Item>
            </Form>
          </Card>
        )}

        {currentStep === 4 && (
          <Card title="Schedule & recipients">
            <Form layout="vertical">
              <Form.Item label="Schedule mode">
                <Select
                  aria-label="Schedule mode"
                  value={mode}
                  onChange={(value) => setMode(value as 'interval' | 'daily')}
                  options={[
                    { value: 'interval', label: 'Interval' },
                    { value: 'daily', label: 'Daily' }
                  ]}
                />
              </Form.Item>
              {mode === 'interval' ? (
                <Form.Item label="Interval minutes">
                  <InputNumber
                    aria-label="Interval minutes"
                    min={60}
                    value={intervalMinutes}
                    onChange={(value) => setIntervalMinutes(value ?? 60)}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  <Form.Item label="Daily time">
                    <Input aria-label="Daily time" value={dailyTime} onChange={(e) => setDailyTime(e.currentTarget.value)} />
                  </Form.Item>
                  <Form.Item label="Timezone">
                    <Input aria-label="Timezone" value={timezone} onChange={(e) => setTimezone(e.currentTarget.value)} />
                  </Form.Item>
                </div>
              )}
              <Form.Item label="Recipient emails">
                <Input
                  aria-label="Recipient emails"
                  value={recipientsInput}
                  onChange={(e) => setRecipientsInput(e.currentTarget.value)}
                />
              </Form.Item>
            </Form>
          </Card>
        )}

        {currentStep === 5 && (
          <Card title="Review & run">
            <Paragraph>
              Sources: {sources.length} · Enabled: {enabledSourceCount} · Mode: {mode}
            </Paragraph>
            <Paragraph>
              Persona: <Tag>{getPromptPersona(personaId)?.name ?? personaId}</Tag> Model: <Tag>{model}</Tag>{' '}
              Confidence threshold: <Tag>{confidenceThreshold}%</Tag>
            </Paragraph>
            {saveState === 'saved' ? <p className="text-sm text-green-700">Agent saved successfully.</p> : null}
            {saveState === 'error' ? <p className="text-sm text-red-700">Save failed. Please check inputs.</p> : null}
          </Card>
        )}

        <div className="flex justify-between">
          <div className="flex gap-2">
            <Button onClick={backStep}>Back</Button>
            <Button onClick={onCancel}>Cancel</Button>
          </div>
          <Button
            type="primary"
            onClick={currentStep === STEPS.length - 1 ? onSave : nextStep}
            loading={saveState === 'saving' && currentStep === STEPS.length - 1}
          >
            {currentStep === STEPS.length - 1 ? 'Complete' : 'Next'}
          </Button>
        </div>
      </div>

      <Card className="lg:sticky lg:top-4 lg:h-fit" title="Live summary">
        <p className="text-sm">Agent: {name}</p>
        <p className="text-sm">Active: {active ? 'Yes' : 'No'}</p>
        <p className="text-sm">Sources: {sources.length}</p>
        <p className="text-sm">Enabled sources: {enabledSourceCount}</p>
        <p className="text-sm">
          Schedule: {mode === 'interval' ? `Every ${intervalMinutes} min` : `${dailyTime} (${timezone})`}
        </p>
        <p className="text-sm">Persona: {getPromptPersona(personaId)?.name ?? personaId}</p>
        <p className="text-sm">Risk: {riskLevel}</p>
        <p className="text-sm">Cadence: {notificationCadence}</p>
      </Card>
    </div>
  );
}
