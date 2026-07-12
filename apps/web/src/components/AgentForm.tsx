import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Progress,
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
  UserOutlined
} from '@ant-design/icons';
import { createAgent, updateAgent, probeSource, type AgentDetail, type SourceProbeResult } from '../api/agents';
import { saveAgentPrompt } from '../api/agents';
import { DEFAULT_PROMPT_PERSONA_ID, PROMPT_PERSONAS, getPromptPersona } from '../data/prompt-personas';
import { useAuth } from '../auth/AuthContext';

const { TextArea } = Input;
const { Title, Paragraph, Text } = Typography;

type SourceType = 'web_urls' | 'podcast_feeds' | 'youtube_videos';

interface SourceConfig {
  id: string;
  type: SourceType;
  value: string;
  frequencyMinutes: number;
  maxItems: number;
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
  { title: 'Schedule', icon: <ClockCircleOutlined /> },
  { title: 'Review', icon: <CheckCircleOutlined /> }
] as const;

// Matches JS Date#getUTCDay() (0=Sunday..6=Saturday), which is what compute-next-run.ts (backend)
// uses to match weekly schedule days against the current day.
const DAY_OF_WEEK_OPTIONS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' }
];

// Mirrors the backend's DEFAULT_MAX_ITEMS_PER_RUN / ABSOLUTE_MAX_ITEMS_PER_RUN constants
// (apps/api/.../smart-crawler.ts) - default 1, editable up to 10 per source.
const DEFAULT_MAX_ITEMS = 1;
const MAX_ITEMS_UPPER_BOUND = 10;

const DEFAULT_SYSTEM_PROMPT = getPromptPersona(DEFAULT_PROMPT_PERSONA_ID)?.systemPrompt ?? '';

const PROBE_KIND_LABELS: Record<SourceProbeResult['kind'], string> = {
  feed: 'Feed',
  listing_page: 'Listing page',
  single_page: 'Single page',
  unknown: 'Unknown'
};

function formatPreviewDate(pubDate: string | null): string | null {
  if (!pubDate) return null;
  const parsed = new Date(pubDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleDateString();
}

function SourceProbeSummary({ result }: { result: SourceProbeResult }) {
  if (!result.reachable) {
    return <Alert type="error" showIcon message="Source unreachable" description={result.warning} />;
  }

  const tagColor = result.warning ? 'orange' : 'green';
  const details: string[] = [];
  if (typeof result.itemCount === 'number') details.push(`${result.itemCount} item(s) detected`);
  if (typeof result.confidence === 'number') details.push(`${Math.round(result.confidence * 100)}% confidence`);
  if (typeof result.maxItemsPerRun === 'number') details.push(`up to ${result.maxItemsPerRun} processed per run`);

  return (
    <div className="space-y-1">
      <div>
        <Tag color={tagColor}>{PROBE_KIND_LABELS[result.kind]}</Tag>
        {details.length > 0 && <Text type="secondary">{details.join(' · ')}</Text>}
      </div>
      {result.warning && <Alert type="warning" showIcon message={result.warning} />}
      {result.previewItems && result.previewItems.length > 0 && (
        <div className="mt-1">
          <Text type="secondary" className="text-xs">
            Sneak preview — last {result.previewItems.length} item(s) found (the source's "per run" setting still
            controls how many are actually crawled each run):
          </Text>
          <ul className="list-disc pl-5 text-sm">
            {result.previewItems.map((item, index) => {
              const date = formatPreviewDate(item.pubDate);
              return (
                <li key={`${item.link ?? item.title}-${index}`}>
                  {item.link ? (
                    <a href={item.link} target="_blank" rel="noreferrer">
                      {item.title}
                    </a>
                  ) : (
                    item.title
                  )}
                  {date && <Text type="secondary"> — {date}</Text>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export function AgentForm({ onCancel, onComplete, agent, initialPrompt }: AgentFormProps) {
  const { user } = useAuth();
  const isEditing = Boolean(agent);
  const [currentStep, setCurrentStep] = useState(0);
  const [name, setName] = useState(agent?.name ?? 'ChatTrader Agent');
  const [description, setDescription] = useState(agent?.description ?? '');
  const [active, setActive] = useState(agent ? agent.status === 'active' : true);

  const [sources, setSources] = useState<SourceConfig[]>(
    agent && agent.sources.length > 0
      ? agent.sources.map((s, index) => ({
          id: `src-${index + 1}`,
          type: s.type,
          value: s.value,
          frequencyMinutes: s.frequencyMinutes ?? 60,
          maxItems: s.maxItems ?? DEFAULT_MAX_ITEMS,
          enabled: true
        }))
      : [
          {
            id: 'src-1',
            type: 'youtube_videos',
            value: 'https://www.youtube.com/playlist?list=PL6P5rY8mrhqrhVgc_pkSOlRLpuGW3CpJ3',
            frequencyMinutes: 60,
            maxItems: DEFAULT_MAX_ITEMS,
            enabled: true
          }
        ]
  );

  const [model, setModel] = useState(initialPrompt?.model ?? 'claude-sonnet-4-5');
  const [personaId, setPersonaId] = useState(DEFAULT_PROMPT_PERSONA_ID);
  const [systemPrompt, setSystemPrompt] = useState(initialPrompt?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT);

  // Global crawl cadence for all sources, edited from the Schedule step. Seeded from the first
  // existing source's frequencyMinutes when editing an agent (all sources share one value going
  // forward), falling back to 60 minutes for new agents.
  const [crawlIntervalMinutes, setCrawlIntervalMinutes] = useState(
    agent && agent.sources.length > 0 ? agent.sources[0].frequencyMinutes ?? 60 : 60
  );

  const [mode, setMode] = useState<'interval' | 'daily' | 'weekly'>(agent?.schedule?.mode ?? 'daily');
  const [intervalMinutes, setIntervalMinutes] = useState(
    agent?.schedule?.mode === 'interval' ? agent.schedule.intervalMinutes : 60
  );
  const [dailyTime, setDailyTime] = useState(
    agent?.schedule?.mode === 'daily' || agent?.schedule?.mode === 'weekly' ? agent.schedule.dailyTime : '07:30'
  );
  const [timezone, setTimezone] = useState(
    agent?.schedule?.mode === 'daily' || agent?.schedule?.mode === 'weekly' ? agent.schedule.timezone : 'UTC'
  );
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(
    agent?.schedule?.mode === 'weekly' ? agent.schedule.daysOfWeek : [1]
  );
  const [recipients, setRecipients] = useState<string[]>(
    agent?.recipients ?? (user?.email ? [user.email] : ['team@example.com'])
  );

  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');


  const [probeResults, setProbeResults] = useState<Record<string, SourceProbeResult | undefined>>({});
  const [probingSourceId, setProbingSourceId] = useState<string | null>(null);

  const enabledSourceCount = useMemo(() => sources.filter((s) => s.enabled).length, [sources]);

  function updateSource(sourceId: string, patch: Partial<SourceConfig>) {
    setSources((current) => current.map((s) => (s.id === sourceId ? { ...s, ...patch } : s)));
    if (patch.value !== undefined || patch.type !== undefined || patch.maxItems !== undefined) {
      setProbeResults((current) => ({ ...current, [sourceId]: undefined }));
    }
  }

  async function testSource(sourceId: string) {
    const source = sources.find((s) => s.id === sourceId);
    if (!source || !source.value.trim()) return;

    setProbingSourceId(sourceId);
    try {
      const result = await probeSource({ type: source.type, value: source.value, maxItems: source.maxItems });
      setProbeResults((current) => ({ ...current, [sourceId]: result }));
    } catch {
      setProbeResults((current) => ({
        ...current,
        [sourceId]: { reachable: false, kind: 'unknown', warning: 'Could not reach the probe service. Please try again.' }
      }));
    } finally {
      setProbingSourceId(null);
    }
  }

  function addSource() {
    const nextIndex = sources.length + 1;
    setSources((current) => [
      ...current,
      { id: `src-${nextIndex}`, type: 'youtube_videos', value: '', frequencyMinutes: 60, maxItems: DEFAULT_MAX_ITEMS, enabled: true }
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
      const cleanRecipients = recipients.map((r) => r.trim()).filter(Boolean);
      const validSources = sources
        .filter((s) => s.enabled && s.value.trim())
        .map((s) => ({ type: s.type, value: s.value.trim(), frequencyMinutes: crawlIntervalMinutes, maxItems: s.maxItems }));

      const schedule =
        mode === 'interval'
          ? { mode: 'interval' as const, intervalMinutes }
          : mode === 'weekly'
            ? { mode: 'weekly' as const, daysOfWeek, dailyTime, timezone }
            : { mode: 'daily' as const, dailyTime, timezone };

      const payload = {
        name,
        description,
        active,
        sources: validSources,
        preferences: {},
        recipients: cleanRecipients,
        schedule
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
          {/* Compact progress bar on mobile keeps the stepper from eating the whole screen;
              the full icon+title Steps component is restored on sm+ where there's room. */}
          <Progress
            percent={((currentStep + 1) / STEPS.length) * 100}
            showInfo={false}
            size="small"
            className="sm:hidden"
            style={{ marginTop: 16 }}
          />
          <Steps
            current={currentStep}
            size="small"
            titlePlacement="vertical"
            items={STEPS.map((step) => ({ title: step.title, icon: step.icon }))}
            onChange={setCurrentStep}
            style={{ marginTop: 16 }}
            className="hidden sm:flex"
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
                <div key={source.id} className="grid gap-2 rounded-md border border-gray-200 p-3 md:grid-cols-3">
                  <label className="space-y-1">
                    <span>Type</span>
                    <Select
                      aria-label={`Source ${index + 1} type`}
                      value={source.type}
                      onChange={(value) => updateSource(source.id, { type: value as SourceType })}
                      options={[
                        { value: 'web_urls', label: 'Web URL' },
                        { value: 'podcast_feeds', label: 'Podcast feed' },
                        { value: 'youtube_videos', label: 'YouTube (video/playlist/channel)' }
                      ]}
                      style={{ width: '100%' }}
                    />
                  </label>
                  <label className="space-y-1 md:col-span-2">
                    <span>Source URL/feed</span>
                    <Input
                      aria-label={`Source ${index + 1} value`}
                      value={source.value}
                      placeholder={
                        source.type === 'youtube_videos'
                          ? 'YouTube video, playlist, or channel URL'
                          : undefined
                      }
                      onChange={(e) => updateSource(source.id, { value: e.currentTarget.value })}
                    />
                  </label>
                  <label className="space-y-1">
                    <span>{source.type === 'youtube_videos' ? 'Videos per run' : 'Episodes/items per run'}</span>
                    <InputNumber
                      aria-label={`Source ${index + 1} episode count`}
                      min={1}
                      max={MAX_ITEMS_UPPER_BOUND}
                      value={source.maxItems}
                      onChange={(value) => updateSource(source.id, { maxItems: value ?? DEFAULT_MAX_ITEMS })}
                      style={{ width: '100%' }}
                    />
                  </label>
                  <div className="flex items-center justify-between md:col-span-2">
                    <div className="flex items-center gap-2">
                      <Switch
                        aria-label={`Source ${index + 1} enabled`}
                        checked={source.enabled}
                        onChange={(enabled) => updateSource(source.id, { enabled })}
                      />
                      <span>Enabled</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => testSource(source.id)}
                        loading={probingSourceId === source.id}
                        disabled={!source.value.trim()}
                      >
                        Test source
                      </Button>
                      <Button danger type="text" onClick={() => removeSource(source.id)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                  {probeResults[source.id] && (
                    <div className="md:col-span-3">
                      <SourceProbeSummary result={probeResults[source.id]!} />
                    </div>
                  )}
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
          <Card title="Schedule & recipients">
            <Form layout="vertical">
              <Form.Item
                label="Crawl interval"
                extra="How often each source is checked for new content. Applies to every source in this agent."
              >
                <InputNumber
                  aria-label="Crawl interval minutes"
                  min={15}
                  value={crawlIntervalMinutes}
                  onChange={(value) => setCrawlIntervalMinutes(value ?? 60)}
                  addonAfter="minutes"
                  style={{ width: '100%' }}
                />
              </Form.Item>
              <Form.Item
                label="Notification interval"
                extra="How often ChatTrader analyzes the newly crawled evidence and emails a report."
              >
                <Select
                  aria-label="Schedule mode"
                  value={mode}
                  onChange={(value) => setMode(value as 'interval' | 'daily' | 'weekly')}
                  options={[
                    { value: 'interval', label: 'Interval' },
                    { value: 'daily', label: 'Daily' },
                    { value: 'weekly', label: 'Weekly' }
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
                <>
                  {mode === 'weekly' ? (
                    <Form.Item label="Days of week">
                      <Checkbox.Group
                        aria-label="Days of week"
                        value={daysOfWeek}
                        onChange={(values) => setDaysOfWeek(values as number[])}
                        options={DAY_OF_WEEK_OPTIONS}
                      />
                    </Form.Item>
                  ) : null}
                  <div className="grid gap-2 md:grid-cols-2">
                    <Form.Item label="Daily time">
                      <Input aria-label="Daily time" value={dailyTime} onChange={(e) => setDailyTime(e.currentTarget.value)} />
                    </Form.Item>
                    <Form.Item label="Timezone">
                      <Input aria-label="Timezone" value={timezone} onChange={(e) => setTimezone(e.currentTarget.value)} />
                    </Form.Item>
                  </div>
                </>
              )}
              <Form.Item label="Recipient emails">
                <Select
                  aria-label="Recipient emails"
                  mode="tags"
                  value={recipients}
                  onChange={(values) => setRecipients(values as string[])}
                  tokenSeparators={[',', ' ']}
                  placeholder="Add one or more recipient emails"
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Form>
          </Card>
        )}

        {currentStep === 4 && (
          <Card title="Review & run">
            <Paragraph>
              Sources: {sources.length} · Enabled: {enabledSourceCount} · Mode: {mode}
            </Paragraph>
            <Paragraph>
              Persona: <Tag>{getPromptPersona(personaId)?.name ?? personaId}</Tag> Model: <Tag>{model}</Tag>
            </Paragraph>
            {saveState === 'saved' ? (
              <p data-testid="agent-save-state" className="text-sm text-green-700">
                Agent saved successfully.
              </p>
            ) : null}
            {saveState === 'error' ? (
              <p data-testid="agent-save-state" className="text-sm text-red-700">
                Save failed. Please check inputs.
              </p>
            ) : null}
          </Card>
        )}

        <div className="sticky bottom-0 z-10 -mx-4 flex justify-between border-t border-gray-200 bg-background px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
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

      <Card className="hidden lg:sticky lg:top-4 lg:block lg:h-fit" title="Live summary">
        <p className="text-sm">Agent: {name}</p>
        <p className="text-sm">Active: {active ? 'Yes' : 'No'}</p>
        <p className="text-sm">Sources: {sources.length}</p>
        <p className="text-sm">Enabled sources: {enabledSourceCount}</p>
        <p className="text-sm">
          Crawl interval: every {crawlIntervalMinutes} min
        </p>
        <p className="text-sm">
          Notifications: {mode === 'interval' ? `Every ${intervalMinutes} min` : `${dailyTime} (${timezone})`}
        </p>
        <p className="text-sm">Persona: {getPromptPersona(personaId)?.name ?? personaId}</p>
      </Card>
    </div>
  );
}
