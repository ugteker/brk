import { useEffect, useState } from 'react';
import { Badge, Button, Card, Empty, Layout, message, Popconfirm, Tabs, Typography } from 'antd';
import {
  ArrowLeftOutlined,
  CaretRightOutlined,
  DeleteOutlined,
  EditOutlined,
  LogoutOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  TeamOutlined
} from '@ant-design/icons';
import { AgentForm } from '../components/AgentForm';
import { AgentStatusCard } from '../components/AgentStatusCard';
import { ThemePicker } from '../components/ThemePicker';
import { AgentReportsBrowser } from '../components/AgentReportsBrowser';
import { AgentRunsBrowser } from '../components/AgentRunsBrowser';
import { AgentPromptEditor } from '../components/AgentPromptEditor';
import { TouchSafeTooltip } from '../components/TouchSafeTooltip';
import { AdminUsersPage } from './AdminUsersPage';
import { SymbolPerformancePage } from './SymbolPerformancePage';
import {
  deleteAgent,
  disableAgent,
  enableAgent,
  getAgent,
  listAgents,
  listAgentRuns,
  runAgentNow,
  type AgentDetail,
  type AgentSummary,
  type RunDetailDto
} from '../api/agents';
import { getLatestAgentPrompt, listAgentReports, type PromptVersionDto, type RunReportDto } from '../api/agents';
import { useAuth } from '../auth/AuthContext';

const { Header, Content } = Layout;
const { Title, Text, Paragraph } = Typography;

// How often to poll for run/report updates while an agent's detail view is open - frequent
// enough that pending/running runs (from the scheduler or a manual trigger) and newly-completed
// reports show up promptly without a manual page refresh, without hammering the API.
const RUNS_POLL_INTERVAL_MS = 4000;

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatAgentSchedule(schedule: AgentSummary['schedule']): string {
  if (!schedule) return 'No schedule';
  if (schedule.mode === 'interval') return `Every ${schedule.intervalMinutes} min`;
  if (schedule.mode === 'daily') return `Daily ${schedule.dailyTime} (${schedule.timezone})`;
  const days = schedule.daysOfWeek.map((d) => WEEKDAY_LABELS[d] ?? d).join(', ');
  return `Weekly ${schedule.dailyTime} on ${days} (${schedule.timezone})`;
}

export function AgentsPage() {
  const { user, isAdmin, logout } = useAuth();
  const [showAdminUsers, setShowAdminUsers] = useState(false);
  const [viewingSymbol, setViewingSymbol] = useState<string | null>(null);
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);
  const [editingAgent, setEditingAgent] = useState<{ detail: AgentDetail; prompt: PromptVersionDto | null } | null>(
    null
  );
  const [isLoadingEditTarget, setIsLoadingEditTarget] = useState(false);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [reports, setReports] = useState<RunReportDto[]>([]);
  const [runs, setRuns] = useState<RunDetailDto[]>([]);
  const [prompt, setPrompt] = useState<PromptVersionDto | null>(null);
  const [togglingAgentId, setTogglingAgentId] = useState<string | null>(null);
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);
  const [runningAgentId, setRunningAgentId] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState('reports');
  const [highlightedReportId, setHighlightedReportId] = useState<string | null>(null);


  async function refreshAgents() {
    try {
      setLoadState('loading');
      const response = await listAgents();
      setAgents(response);
      setLoadState('idle');
    } catch {
      setLoadState('error');
    }
  }

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        setLoadState('loading');
        const response = await listAgents();
        if (!alive) return;
        setAgents(response);
        setLoadState('idle');
      } catch {
        if (!alive) return;
        setLoadState('error');
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedAgentId) return;
    let alive = true;

    async function refreshAgentDetail() {
      const [agentReports, agentRuns] = await Promise.all([
        listAgentReports(selectedAgentId as string),
        listAgentRuns(selectedAgentId as string)
      ]);
      if (!alive) return;
      setReports(agentReports);
      setRuns(agentRuns);
    }

    async function loadAgentDetail() {
      const agentPrompt = await getLatestAgentPrompt(selectedAgentId as string);
      if (!alive) return;
      setPrompt(agentPrompt);
      await refreshAgentDetail();
    }

    loadAgentDetail();
    // Poll runs/reports while this agent's detail view is open, so a scheduler-triggered run
    // (or a manual run triggered from elsewhere) and any newly-completed report show up live,
    // without requiring the user to reselect the agent or refresh the page.
    const intervalId = setInterval(refreshAgentDetail, RUNS_POLL_INTERVAL_MS);
    return () => {
      alive = false;
      clearInterval(intervalId);
    };
  }, [selectedAgentId]);

  function onViewReport(reportId: string) {
    setHighlightedReportId(reportId);
    setActiveDetailTab('reports');
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

  async function onRunNow(agent: AgentSummary, event?: React.MouseEvent) {
    event?.stopPropagation();
    setRunningAgentId(agent.id);
    try {
      const result = await runAgentNow(agent.id);
      if (result.status === 'failed') {
        message.error(`Run failed${result.errorCode ? `: ${result.errorCode}` : ''}`);
      } else if (result.status === 'no_run_claimed') {
        message.info('Another run is already in progress');
      } else {
        message.success('Agent run completed');
      }
      if (selectedAgentId === agent.id) {
        const [agentReports] = await Promise.all([listAgentReports(agent.id)]);
        setReports(agentReports);
      }
      await refreshAgents();
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to run agent');
    } finally {
      setRunningAgentId(null);
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
    } finally {
      setDeletingAgentId(null);
    }
  }

  async function onEditAgent(agent: AgentSummary, event?: React.MouseEvent) {
    event?.stopPropagation();
    setIsLoadingEditTarget(true);
    try {
      const [detail, latestPrompt] = await Promise.all([getAgent(agent.id), getLatestAgentPrompt(agent.id)]);
      setEditingAgent({ detail, prompt: latestPrompt });
      setIsCreatingAgent(false);
    } finally {
      setIsLoadingEditTarget(false);
    }
  }

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? null;

  return (
    <Layout style={{ minHeight: '100vh', background: 'transparent' }}>
      <Header style={{ background: 'transparent', height: 'auto', padding: '24px 24px 0' }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div style={{ minWidth: 0 }}>
            <Title
              level={2}
              style={{
                margin: 0,
                whiteSpace: 'nowrap',
                wordBreak: 'keep-all',
                overflowWrap: 'normal',
                fontSize: 'clamp(1.25rem, 5vw, 1.875rem)'
              }}
            >
              Brokerino
            </Title>
            <Text type="secondary">Agent Dashboard</Text>
          </div>
          <div className="flex items-center gap-2">
            {user ? (
              <Text type="secondary" style={{ marginRight: 4 }}>
                {user.displayName ?? user.email}
              </Text>
            ) : null}
            {isAdmin ? (
              <TouchSafeTooltip title="Manage users">
                <Button
                  icon={<TeamOutlined />}
                  onClick={() => setShowAdminUsers(true)}
                  aria-label="Manage users"
                />
              </TouchSafeTooltip>
            ) : null}
            <ThemePicker />
            <TouchSafeTooltip title="Log out">
              <Button icon={<LogoutOutlined />} onClick={() => logout()} aria-label="Log out" />
            </TouchSafeTooltip>
          </div>
        </div>
      </Header>
      <Content style={{ padding: 24 }}>
        {showAdminUsers ? (
          <AdminUsersPage onBack={() => setShowAdminUsers(false)} />
        ) : viewingSymbol && selectedAgent ? (
          <SymbolPerformancePage agentId={selectedAgent.id} symbol={viewingSymbol} onBack={() => setViewingSymbol(null)} />
        ) : (
        <div className="mx-auto max-w-6xl space-y-4">
          <Paragraph type="secondary">
            Create and manage AI agents that crawl sources and produce long/short stock signal reports.
          </Paragraph>
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            {isCreatingAgent ? (
              <AgentForm
                onCancel={() => setIsCreatingAgent(false)}
                onComplete={() => {
                  setIsCreatingAgent(false);
                  refreshAgents();
                }}
              />
            ) : editingAgent ? (
              <AgentForm
                key={editingAgent.detail.id}
                agent={editingAgent.detail}
                initialPrompt={
                  editingAgent.prompt
                    ? { model: editingAgent.prompt.model, systemPrompt: editingAgent.prompt.systemPrompt }
                    : null
                }
                onCancel={() => setEditingAgent(null)}
                onComplete={() => {
                  setEditingAgent(null);
                  refreshAgents();
                }}
              />
            ) : selectedAgent ? (
              <Card
                title={
                  <span className="flex items-center gap-2">
                    <Badge
                      status={selectedAgent.status === 'disabled' ? 'default' : 'success'}
                      text={selectedAgent.name}
                    />
                  </span>
                }
                extra={
                  <div className="flex items-center gap-2">
                    <TouchSafeTooltip title="Back to dashboard">
                      <Button
                        aria-label="Back to dashboard"
                        shape="circle"
                        icon={<ArrowLeftOutlined />}
                        onClick={() => setSelectedAgentId(null)}
                      />
                    </TouchSafeTooltip>
                    <TouchSafeTooltip title="Edit agent">
                      <Button
                        aria-label="Edit agent"
                        shape="circle"
                        loading={isLoadingEditTarget}
                        icon={<EditOutlined />}
                        onClick={(event) => onEditAgent(selectedAgent, event)}
                      />
                    </TouchSafeTooltip>
                    <TouchSafeTooltip title="Run agent now">
                      <Button
                        aria-label="Run agent now"
                        shape="circle"
                        loading={runningAgentId === selectedAgent.id}
                        disabled={selectedAgent.status === 'disabled'}
                        icon={<CaretRightOutlined />}
                        onClick={(event) => onRunNow(selectedAgent, event)}
                      />
                    </TouchSafeTooltip>
                    <TouchSafeTooltip title={selectedAgent.status === 'disabled' ? 'Resume agent' : 'Pause agent'}>
                      <Button
                        aria-label={selectedAgent.status === 'disabled' ? 'Resume agent' : 'Pause agent'}
                        shape="circle"
                        loading={togglingAgentId === selectedAgent.id}
                        icon={
                          selectedAgent.status === 'disabled' ? (
                            <PlayCircleOutlined />
                          ) : (
                            <PauseCircleOutlined />
                          )
                        }
                        onClick={(event) => onTogglePause(selectedAgent, event)}
                      />
                    </TouchSafeTooltip>
                    <Popconfirm
                      title="Remove this agent?"
                      description="This permanently deletes the agent, its schedule, prompts, and reports."
                      okText="Remove"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => onDeleteAgent(selectedAgent)}
                    >
                      <TouchSafeTooltip title="Remove agent">
                        <Button
                          aria-label="Remove agent"
                          shape="circle"
                          danger
                          loading={deletingAgentId === selectedAgent.id}
                          icon={<DeleteOutlined />}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </TouchSafeTooltip>
                    </Popconfirm>
                  </div>
                }
              >
                <Tabs
                  activeKey={activeDetailTab}
                  onChange={setActiveDetailTab}
                  items={[
                    {
                      key: 'reports',
                      label: 'Reports',
                      children: (
                        <AgentReportsBrowser
                          agentId={selectedAgent.id}
                          reports={reports}
                          highlightedReportId={highlightedReportId}
                          onSelectSymbol={setViewingSymbol}
                        />
                      )
                    },
                    {
                      key: 'runs',
                      label: 'Runs',
                      children: (
                        <AgentRunsBrowser agentId={selectedAgent.id} runs={runs} onViewReport={onViewReport} />
                      )
                    },
                    {
                      key: 'prompt',
                      label: 'System prompt',
                      children: (
                        <AgentPromptEditor
                          agentId={selectedAgent.id}
                          initialModel={prompt?.model}
                          initialSystemPrompt={prompt?.systemPrompt}
                          initialEnabled={prompt?.enabled ?? true}
                        />
                      )
                    }
                  ]}
                />
              </Card>
            ) : (
              <Card
                title={<Title level={4} style={{ margin: 0 }}>Agent dashboard</Title>}
                extra={
                  <TouchSafeTooltip title="Create agent">
                    <Button
                      type="primary"
                      shape="circle"
                      aria-label="Create agent"
                      icon={<PlusOutlined />}
                      onClick={() => {
                        setIsCreatingAgent(true);
                        setEditingAgent(null);
                        setSelectedAgentId(null);
                      }}
                    />
                  </TouchSafeTooltip>
                }
              >
                {loadState === 'loading' ? <p className="text-sm text-gray-700">Loading agents...</p> : null}
                {loadState === 'error' ? <p className="text-sm text-red-700">Failed to load agents.</p> : null}
                {loadState === 'idle' && agents.length === 0 ? (
                  <Empty description='Use "Create Agent" to start the setup wizard.' />
                ) : null}
                <div className="space-y-3">
                  {agents.map((agent) => (
                    <Card
                      key={agent.id}
                      size="small"
                      hoverable
                      onClick={() => setSelectedAgentId(agent.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <h3 className="text-base font-semibold">
                            <Badge
                              status={agent.status === 'disabled' ? 'default' : 'success'}
                              text={agent.name}
                            />
                          </h3>
                          <p className="text-sm text-gray-700">
                            Sources: {agent.sources.length} · Runs: {agent.runCount ?? 0} · Reports: {agent.reportCount ?? 0}
                            {agent.latestReportAt ? ` (latest ${new Date(agent.latestReportAt).toLocaleDateString()})` : ''}
                          </p>
                          <p className="text-xs text-gray-500">
                            Schedule: {formatAgentSchedule(agent.schedule)} · Emails:{' '}
                            {agent.recipients && agent.recipients.length > 0 ? agent.recipients.join(', ') : 'none'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                          <TouchSafeTooltip title="Run agent now">
                            <Button
                              aria-label="Run agent now"
                              shape="circle"
                              loading={runningAgentId === agent.id}
                              disabled={agent.status === 'disabled'}
                              icon={<CaretRightOutlined />}
                              onClick={(event) => onRunNow(agent, event)}
                            />
                          </TouchSafeTooltip>
                          <TouchSafeTooltip title={agent.status === 'disabled' ? 'Resume agent' : 'Pause agent'}>
                            <Button
                              aria-label={agent.status === 'disabled' ? 'Resume agent' : 'Pause agent'}
                              shape="circle"
                              loading={togglingAgentId === agent.id}
                              icon={agent.status === 'disabled' ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
                              onClick={(event) => onTogglePause(agent, event)}
                            />
                          </TouchSafeTooltip>
                          <Popconfirm
                            title="Remove this agent?"
                            description="This permanently deletes the agent, its schedule, prompts, and reports."
                            okText="Remove"
                            okButtonProps={{ danger: true }}
                            onConfirm={() => onDeleteAgent(agent)}
                          >
                            <TouchSafeTooltip title="Remove agent">
                              <Button
                                aria-label="Remove agent"
                                shape="circle"
                                danger
                                loading={deletingAgentId === agent.id}
                                icon={<DeleteOutlined />}
                              />
                            </TouchSafeTooltip>
                          </Popconfirm>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </Card>
            )}
            <AgentStatusCard />
          </div>
        </div>
        )}
      </Content>
    </Layout>
  );
}
