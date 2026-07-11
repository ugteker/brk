import { useEffect, useState } from 'react';
import { Badge, Button, Card, Empty, Layout, Popconfirm, Tabs, Tooltip, Typography } from 'antd';
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  EditOutlined,
  LogoutOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined
} from '@ant-design/icons';
import { AgentForm } from '../components/AgentForm';
import { AgentStatusCard } from '../components/AgentStatusCard';
import { ThemePicker } from '../components/ThemePicker';
import { AgentReportsBrowser } from '../components/AgentReportsBrowser';
import { AgentPromptEditor } from '../components/AgentPromptEditor';
import {
  deleteAgent,
  disableAgent,
  enableAgent,
  getAgent,
  listAgents,
  type AgentDetail,
  type AgentSummary
} from '../api/agents';
import { getLatestAgentPrompt, listAgentReports, type PromptVersionDto, type RunReportDto } from '../api/agents';
import { useAuth } from '../auth/AuthContext';

const { Header, Content } = Layout;
const { Title, Text, Paragraph } = Typography;

export function AgentsPage() {
  const { user, logout } = useAuth();
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);
  const [editingAgent, setEditingAgent] = useState<{ detail: AgentDetail; prompt: PromptVersionDto | null } | null>(
    null
  );
  const [isLoadingEditTarget, setIsLoadingEditTarget] = useState(false);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [reports, setReports] = useState<RunReportDto[]>([]);
  const [prompt, setPrompt] = useState<PromptVersionDto | null>(null);
  const [togglingAgentId, setTogglingAgentId] = useState<string | null>(null);
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);


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
    async function loadAgentDetail() {
      const [agentReports, agentPrompt] = await Promise.all([
        listAgentReports(selectedAgentId as string),
        getLatestAgentPrompt(selectedAgentId as string)
      ]);
      if (!alive) return;
      setReports(agentReports);
      setPrompt(agentPrompt);
    }
    loadAgentDetail();
    return () => {
      alive = false;
    };
  }, [selectedAgentId]);

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
            <Title level={2} style={{ margin: 0, whiteSpace: 'nowrap' }}>
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
            <ThemePicker />
            <Tooltip title="Log out">
              <Button icon={<LogoutOutlined />} onClick={() => logout()} aria-label="Log out" />
            </Tooltip>
          </div>
        </div>
      </Header>
      <Content style={{ padding: 24 }}>
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
                    <Tooltip title="Back to dashboard">
                      <Button
                        aria-label="Back to dashboard"
                        shape="circle"
                        icon={<ArrowLeftOutlined />}
                        onClick={() => setSelectedAgentId(null)}
                      />
                    </Tooltip>
                    <Tooltip title="Edit agent">
                      <Button
                        aria-label="Edit agent"
                        shape="circle"
                        loading={isLoadingEditTarget}
                        icon={<EditOutlined />}
                        onClick={(event) => onEditAgent(selectedAgent, event)}
                      />
                    </Tooltip>
                    <Tooltip title={selectedAgent.status === 'disabled' ? 'Resume agent' : 'Pause agent'}>
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
                    </Tooltip>
                    <Popconfirm
                      title="Remove this agent?"
                      description="This permanently deletes the agent, its schedule, prompts, and reports."
                      okText="Remove"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => onDeleteAgent(selectedAgent)}
                    >
                      <Tooltip title="Remove agent">
                        <Button
                          aria-label="Remove agent"
                          shape="circle"
                          danger
                          loading={deletingAgentId === selectedAgent.id}
                          icon={<DeleteOutlined />}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </Tooltip>
                    </Popconfirm>
                  </div>
                }
              >
                <Tabs
                  items={[
                    {
                      key: 'reports',
                      label: 'Reports',
                      children: <AgentReportsBrowser reports={reports} />
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
                  <Tooltip title="Create agent">
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
                  </Tooltip>
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
                          <p className="text-sm text-gray-700">Sources: {agent.sources.length}</p>
                        </div>
                        <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                          <Tooltip title={agent.status === 'disabled' ? 'Resume agent' : 'Pause agent'}>
                            <Button
                              aria-label={agent.status === 'disabled' ? 'Resume agent' : 'Pause agent'}
                              shape="circle"
                              loading={togglingAgentId === agent.id}
                              icon={agent.status === 'disabled' ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
                              onClick={(event) => onTogglePause(agent, event)}
                            />
                          </Tooltip>
                          <Popconfirm
                            title="Remove this agent?"
                            description="This permanently deletes the agent, its schedule, prompts, and reports."
                            okText="Remove"
                            okButtonProps={{ danger: true }}
                            onConfirm={() => onDeleteAgent(agent)}
                          >
                            <Tooltip title="Remove agent">
                              <Button
                                aria-label="Remove agent"
                                shape="circle"
                                danger
                                loading={deletingAgentId === agent.id}
                                icon={<DeleteOutlined />}
                              />
                            </Tooltip>
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
      </Content>
    </Layout>
  );
}
