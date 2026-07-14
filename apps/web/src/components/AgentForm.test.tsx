import '@testing-library/jest-dom/vitest';
import type { ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createAgent, deleteAgent, getAgent, listAgents, updateAgent, listAgentEpisodeOptions, runAgentNow } from '../api/agents';
import { saveAgentPrompt } from '../api/agents';
import { listPlaybooks } from '../api/playbooks';
import { AgentForm } from './AgentForm';
import { AgentsPage } from '../pages/AgentsPage';
import { ThemeProvider } from '../theme/ThemeContext';
import { AuthProvider, useAuth } from '../auth/AuthContext';

const TOTAL_STEPS = 3;

function renderAgentsPage(options?: { openAgentsHub?: boolean }) {
  const utils = render(
    <AuthProvider>
      <ThemeProvider>
        <AgentsPage />
      </ThemeProvider>
    </AuthProvider>
  );
  if (options?.openAgentsHub ?? true) {
    fireEvent.click(screen.getByRole('tab', { name: /agents/i }));
  }
  return utils;
}

// App.tsx mounts children only after auth resolves (Spin while status === 'loading').
// This helper mirrors that gating so tests run against the same ready state.
function AgentFormWhenReady(props: ComponentProps<typeof AgentForm>) {
  const { status } = useAuth();
  if (status === 'loading') return null;
  return <AgentForm {...props} />;
}

async function renderAgentForm(props: ComponentProps<typeof AgentForm> = {}) {
  const utils = render(
    <AuthProvider>
      <AgentFormWhenReady {...props} />
    </AuthProvider>
  );
  await screen.findByLabelText(/agent name/i);
  return utils;
}

vi.mock('../api/auth', () => ({
  getCurrentUser: vi.fn().mockResolvedValue({
    id: 'user-1',
    email: 'trader@example.com',
    displayName: 'Trader',
    hasPassword: true,
    hasGoogleLinked: false,
    createdAt: new Date().toISOString()
  }),
  login: vi.fn(),
  signup: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
  GOOGLE_SIGN_IN_URL: '/api/auth/google'
}));

vi.mock('../api/agents', () => ({
  createAgent: vi.fn().mockResolvedValue({ id: 'agent-1' }),
  updateAgent: vi.fn().mockResolvedValue({ id: 'agent-1' }),
  getAgent: vi.fn().mockResolvedValue({
    id: 'agent-1',
    name: 'Housing Agent',
    description: 'Watches housing market blogs',
    status: 'active',
    sources: [{ type: 'web_urls', value: 'https://example.com', frequencyMinutes: 90 }],
    preferences: { risk_level: ['high'] },
    schedule: { mode: 'interval', intervalMinutes: 120 }
  }),
  listAgents: vi.fn().mockResolvedValue([]),
  enableAgent: vi.fn().mockResolvedValue(undefined),
  disableAgent: vi.fn().mockResolvedValue(undefined),
  deleteAgent: vi.fn().mockResolvedValue(undefined),
  runAgentNow: vi.fn().mockResolvedValue({ status: 'succeeded' }),
  listAgentEpisodeOptions: vi.fn().mockResolvedValue([]),
  saveAgentPrompt: vi.fn().mockResolvedValue({ id: 'prompt-1' }),
  listAgentReports: vi.fn().mockResolvedValue([]),
  listAgentRuns: vi.fn().mockResolvedValue([]),
  getLatestAgentReport: vi.fn().mockResolvedValue(null),
  getLatestAgentPrompt: vi.fn().mockResolvedValue(null)
}));

vi.mock('../api/sources', () => ({
  listSources: vi.fn().mockResolvedValue([])
}));

vi.mock('../api/playbooks', () => ({
  listPlaybooks: vi.fn().mockResolvedValue([])
}));

vi.mock('../api/marketplace', () => ({
  listMarketplaceAgents: vi.fn().mockResolvedValue([]),
  cloneMarketplaceAgent: vi.fn(),
  listMarketplaceSources: vi.fn().mockResolvedValue([]),
  cloneMarketplaceSource: vi.fn(),
  listMarketplacePlaybooks: vi.fn().mockResolvedValue([]),
  cloneMarketplacePlaybook: vi.fn()
}));

vi.mock('../api/access', () => ({
  listAgentAccessGrants: vi.fn().mockResolvedValue([]),
  grantAgentAccess: vi.fn()
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('renders wizard stepper controls and key fields', async () => {
  await renderAgentForm();
  expect(screen.getByLabelText(/wizard progress/i)).toHaveTextContent(new RegExp(`step 1 of ${TOTAL_STEPS}`, 'i'));
  expect(screen.getByLabelText(/agent name/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
});

it('uses a concise three-step character-first wizard flow', async () => {
  await renderAgentForm();
  expect(screen.getByLabelText(/wizard progress/i)).toHaveTextContent(new RegExp(`step 1 of ${TOTAL_STEPS}`, 'i'));
  expect(screen.getAllByText(/choose character/i).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/configure personality/i).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/save agent/i).length).toBeGreaterThan(0);
});

it('shows character cards first and derives personality options from selected character', async () => {
  await renderAgentForm();
  expect(screen.getByRole('button', { name: /character finance expert/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /personality balanced analyst/i })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /character teacher/i }));

  expect(screen.getByRole('button', { name: /personality mentor/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /personality classroom instructor/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /personality practical coach/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /personality balanced analyst/i })).not.toBeInTheDocument();
});

it('keeps risk level control finance-character only in personality configuration', async () => {
  await renderAgentForm();
  fireEvent.click(screen.getByRole('button', { name: /character teacher/i }));
  fireEvent.click(screen.getByRole('button', { name: /next/i }));

  expect(screen.queryByLabelText(/risk level/i)).not.toBeInTheDocument();
  expect(screen.getByText(/risk level is only used for finance expert personality/i)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /back/i }));
  fireEvent.click(screen.getByRole('button', { name: /character finance expert/i }));
  fireEvent.click(screen.getByRole('button', { name: /next/i }));
  expect(screen.getByLabelText(/risk level/i)).toBeInTheDocument();
});

it('shows inline guidance when trying to continue without an agent name', async () => {
  await renderAgentForm();
  fireEvent.change(screen.getByLabelText(/agent name/i), { target: { value: ' ' } });
  fireEvent.click(screen.getByRole('button', { name: /next/i }));
  expect(screen.getAllByText(/give this agent a short name to continue/i).length).toBeGreaterThan(0);
  expect(screen.getByLabelText(/wizard progress/i)).toHaveTextContent(new RegExp(`step 1 of ${TOTAL_STEPS}`, 'i'));
});

it('shows save agent on the last step and saves from the footer button', async () => {
  await renderAgentForm();

  for (let index = 0; index < TOTAL_STEPS - 1; index += 1) {
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
  }

  fireEvent.click(screen.getByRole('button', { name: /^save agent$/i }));

  expect(await screen.findByTestId('agent-save-state', {}, { timeout: 3000 })).toHaveTextContent(/agent saved successfully/i);
  expect(createAgent).toHaveBeenCalled();
  expect(createAgent).toHaveBeenCalledWith(expect.not.objectContaining({ sources: expect.anything() }));
  expect(saveAgentPrompt).toHaveBeenCalledWith('agent-1', expect.objectContaining({ model: expect.any(String) }));
});

it('sends finance risk preference only for finance personality', async () => {
  await renderAgentForm();
  fireEvent.click(screen.getByRole('button', { name: /character teacher/i }));

  for (let index = 0; index < TOTAL_STEPS - 1; index += 1) {
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
  }
  fireEvent.click(screen.getByRole('button', { name: /^save agent$/i }));

  expect(await screen.findByTestId('agent-save-state', {}, { timeout: 3000 })).toHaveTextContent(/agent saved successfully/i);
  expect(createAgent).toHaveBeenCalledWith(expect.objectContaining({ preferences: {} }));
  expect(createAgent).toHaveBeenCalledWith(expect.not.objectContaining({ sources: expect.anything() }));
});

it('does not render source controls in the wizard', async () => {
  await renderAgentForm();
  fireEvent.click(screen.getByRole('button', { name: /next/i })); // Choose Character -> Configure Personality

  expect(screen.queryByText(/^sources$/i)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /create new source/i })).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/source 1/i)).not.toBeInTheDocument();
});

it('does not render recipient emails in agent wizard anymore', async () => {
  await renderAgentForm();
  fireEvent.click(screen.getByRole('button', { name: /next/i }));

  expect(screen.queryByLabelText(/recipient emails/i)).not.toBeInTheDocument();
});

it('sends active:false when the Active toggle is switched off', async () => {
  await renderAgentForm();

  fireEvent.click(screen.getByLabelText(/active toggle/i));

  for (let index = 0; index < TOTAL_STEPS - 1; index += 1) {
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
  }

  fireEvent.click(screen.getByRole('button', { name: /^save agent$/i }));

  expect(await screen.findByTestId('agent-save-state', {}, { timeout: 3000 })).toHaveTextContent(/agent saved successfully/i);
  expect(createAgent).toHaveBeenCalledWith(expect.objectContaining({ active: false }));
});

it('cancels the wizard and returns to the dashboard', () => {
  renderAgentsPage();

  fireEvent.click(screen.getByRole('button', { name: /create agent/i }));
  expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

  expect(screen.getByRole('heading', { name: 'ChatTrader' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /create agent/i })).toBeInTheDocument();
});

it('clicking the app name returns to the sources hub from an agent detail view', async () => {
  vi.mocked(listAgents).mockResolvedValueOnce([
    {
      id: 'agent-1',
      name: 'Housing Agent',
      status: 'active',
      sources: [{ type: 'web_urls', value: 'https://example.com' }]
    }
  ]);

  renderAgentsPage();

  fireEvent.click(await screen.findByText(/housing agent/i));
  expect(await screen.findByRole('button', { name: /back to dashboard/i })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('heading', { name: 'ChatTrader' }));

  expect(await screen.findByRole('tab', { name: /library/i })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /library/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /back to dashboard/i })).not.toBeInTheDocument();
});

it('loads agents from the backend when the dashboard opens', async () => {
  vi.mocked(listAgents).mockResolvedValueOnce([
    {
      id: 'agent-1',
      name: 'Housing Agent',
      status: 'active',
      sources: [{ type: 'web_urls', value: 'https://example.com' }]
    }
  ]);

  renderAgentsPage();

  expect(listAgents).toHaveBeenCalled();
  expect(await screen.findByText(/housing agent/i)).toBeInTheDocument();
});

it('renders ChatTrader dashboard with three hubs by default', () => {
  renderAgentsPage({ openAgentsHub: false });
  expect(screen.getByRole('heading', { name: 'ChatTrader' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /library/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /agents/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /playbooks/i })).toBeInTheDocument();
});

it('removes an agent after confirming the popconfirm', async () => {
  vi.mocked(listAgents).mockResolvedValueOnce([
    {
      id: 'agent-1',
      name: 'Housing Agent',
      status: 'active',
      sources: [{ type: 'web_urls', value: 'https://example.com' }]
    }
  ]);

  renderAgentsPage();

  expect(await screen.findByText(/housing agent/i)).toBeInTheDocument();
  vi.mocked(listAgents).mockResolvedValueOnce([]);

  fireEvent.click(screen.getByRole('button', { name: /remove agent/i }));
  fireEvent.click(await screen.findByRole('button', { name: /^remove$/i }));

  expect(deleteAgent).toHaveBeenCalledWith('agent-1');
  expect(await screen.findByRole('button', { name: /create agent/i })).toBeInTheDocument();
});

it('runs an agent now via the run-now button', async () => {
  vi.mocked(listAgents).mockResolvedValueOnce([
    {
      id: 'agent-1',
      name: 'Housing Agent',
      status: 'active',
      sources: [{ type: 'web_urls', value: 'https://example.com' }]
    }
  ]);
  vi.mocked(listPlaybooks).mockResolvedValueOnce([
    {
      id: 'playbook-1',
      agentId: 'agent-1',
      name: 'Execution Playbook',
      description: '',
      enabled: true,
      schedule: { mode: 'daily', dailyTime: '07:30', timezone: 'UTC' },
      sourceIds: ['source-1'],
      recipients: [],
      executionMode: 'latest_only',
      maxSourcesPerRun: 5,
      maxItemsPerSource: 2,
      lastRunAt: null,
      nextRunAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ]);

  renderAgentsPage();

  fireEvent.click(await screen.findByRole('tab', { name: /playbooks/i }));
  fireEvent.click(await screen.findByText(/execution playbook/i));
  fireEvent.click(await screen.findByRole('button', { name: /run playbook now/i }));

  const { runAgentNow } = await import('../api/agents');
  await vi.waitFor(() => expect(runAgentNow).toHaveBeenCalledWith('agent-1', undefined));
});

it('shows an episode picker for an agent with a podcast source, and runs the selected episode', async () => {
  vi.mocked(listAgents).mockResolvedValueOnce([
    {
      id: 'agent-1',
      name: 'Podcast Agent',
      status: 'active',
      sources: [{ type: 'podcast_feeds', value: 'https://example.com/feed.xml' }]
    }
  ]);
  vi.mocked(listPlaybooks).mockResolvedValueOnce([
    {
      id: 'playbook-1',
      agentId: 'agent-1',
      name: 'Podcast Playbook',
      description: '',
      enabled: true,
      schedule: { mode: 'daily', dailyTime: '07:30', timezone: 'UTC' },
      sourceIds: ['source-1'],
      recipients: [],
      executionMode: 'latest_only',
      maxSourcesPerRun: 5,
      maxItemsPerSource: 2,
      lastRunAt: null,
      nextRunAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ]);
  vi.mocked(listAgentEpisodeOptions).mockResolvedValueOnce([
    { sourceType: 'podcast_feeds', sourceValue: 'https://example.com/feed.xml', title: 'Episode 2', link: 'https://example.com/ep-2', pubDate: null }
  ]);

  renderAgentsPage();

  fireEvent.click(await screen.findByRole('tab', { name: /playbooks/i }));
  fireEvent.click(await screen.findByText(/podcast playbook/i));
  fireEvent.click(await screen.findByRole('button', { name: /run playbook now/i }));

  expect(await screen.findByText(/run against a specific episode/i)).toBeInTheDocument();
  expect(await screen.findByText(/episode 2/i)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /run this episode/i }));

  await vi.waitFor(() =>
    expect(runAgentNow).toHaveBeenCalledWith('agent-1', {
      sourceType: 'podcast_feeds',
      sourceValue: 'https://example.com/feed.xml',
      itemLink: 'https://example.com/ep-2'
    })
  );
});

it('runs normally from the episode picker without a forced episode', async () => {
  vi.mocked(listAgents).mockResolvedValueOnce([
    {
      id: 'agent-1',
      name: 'Podcast Agent',
      status: 'active',
      sources: [{ type: 'podcast_feeds', value: 'https://example.com/feed.xml' }]
    }
  ]);
  vi.mocked(listPlaybooks).mockResolvedValueOnce([
    {
      id: 'playbook-1',
      agentId: 'agent-1',
      name: 'Podcast Playbook',
      description: '',
      enabled: true,
      schedule: { mode: 'daily', dailyTime: '07:30', timezone: 'UTC' },
      sourceIds: ['source-1'],
      recipients: [],
      executionMode: 'latest_only',
      maxSourcesPerRun: 5,
      maxItemsPerSource: 2,
      lastRunAt: null,
      nextRunAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ]);
  vi.mocked(listAgentEpisodeOptions).mockResolvedValueOnce([]);

  renderAgentsPage();

  fireEvent.click(await screen.findByRole('tab', { name: /playbooks/i }));
  fireEvent.click(await screen.findByText(/podcast playbook/i));
  fireEvent.click(await screen.findByRole('button', { name: /run playbook now/i }));

  fireEvent.click(await screen.findByRole('button', { name: /run normally/i }));

  await vi.waitFor(() => expect(runAgentNow).toHaveBeenCalledWith('agent-1', undefined));
});

it('shows only the first 5 episodes in the picker, revealing the rest via "Show more"', async () => {
  vi.mocked(listAgents).mockResolvedValueOnce([
    {
      id: 'agent-1',
      name: 'Podcast Agent',
      status: 'active',
      sources: [{ type: 'podcast_feeds', value: 'https://example.com/feed.xml' }]
    }
  ]);
  vi.mocked(listPlaybooks).mockResolvedValueOnce([
    {
      id: 'playbook-1',
      agentId: 'agent-1',
      name: 'Podcast Playbook',
      description: '',
      enabled: true,
      schedule: { mode: 'daily', dailyTime: '07:30', timezone: 'UTC' },
      sourceIds: ['source-1'],
      recipients: [],
      executionMode: 'latest_only',
      maxSourcesPerRun: 5,
      maxItemsPerSource: 2,
      lastRunAt: null,
      nextRunAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ]);
  const episodes = Array.from({ length: 8 }, (_, i) => ({
    sourceType: 'podcast_feeds' as const,
    sourceValue: 'https://example.com/feed.xml',
    title: `Episode ${i + 1}`,
    link: `https://example.com/ep-${i + 1}`,
    pubDate: null
  }));
  vi.mocked(listAgentEpisodeOptions).mockResolvedValueOnce(episodes);

  renderAgentsPage();

  fireEvent.click(await screen.findByRole('tab', { name: /playbooks/i }));
  fireEvent.click(await screen.findByText(/podcast playbook/i));
  fireEvent.click(await screen.findByRole('button', { name: /run playbook now/i }));

  expect(await screen.findByText(/episode 1$/i)).toBeInTheDocument();
  expect(screen.getByText(/episode 5$/i)).toBeInTheDocument();
  expect(screen.queryByText(/episode 6$/i)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /show more/i }));

  expect(await screen.findByText(/episode 6$/i)).toBeInTheDocument();
  expect(screen.getByText(/episode 8$/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /show more/i })).not.toBeInTheDocument();
});

it('does not show a "Show more" button in the picker when there are 5 or fewer episodes', async () => {
  vi.mocked(listAgents).mockResolvedValueOnce([
    {
      id: 'agent-1',
      name: 'Podcast Agent',
      status: 'active',
      sources: [{ type: 'podcast_feeds', value: 'https://example.com/feed.xml' }]
    }
  ]);
  vi.mocked(listPlaybooks).mockResolvedValueOnce([
    {
      id: 'playbook-1',
      agentId: 'agent-1',
      name: 'Podcast Playbook',
      description: '',
      enabled: true,
      schedule: { mode: 'daily', dailyTime: '07:30', timezone: 'UTC' },
      sourceIds: ['source-1'],
      recipients: [],
      executionMode: 'latest_only',
      maxSourcesPerRun: 5,
      maxItemsPerSource: 2,
      lastRunAt: null,
      nextRunAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ]);
  vi.mocked(listAgentEpisodeOptions).mockResolvedValueOnce([
    { sourceType: 'podcast_feeds', sourceValue: 'https://example.com/feed.xml', title: 'Episode 1', link: 'https://example.com/ep-1', pubDate: null }
  ]);

  renderAgentsPage();

  fireEvent.click(await screen.findByRole('tab', { name: /playbooks/i }));
  fireEvent.click(await screen.findByText(/podcast playbook/i));
  fireEvent.click(await screen.findByRole('button', { name: /run playbook now/i }));

  expect(await screen.findByText(/episode 1$/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /show more/i })).not.toBeInTheDocument();
});

it('toggles between light and dark theme', () => {
  renderAgentsPage();
  const picker = screen.getAllByLabelText(/theme picker/i)[0];

  fireEvent.click(picker);
  expect(document.documentElement.classList.contains('dark')).toBe(true);

  fireEvent.click(picker);
  expect(document.documentElement.classList.contains('dark')).toBe(false);
});

it(
  'opens the edit wizard prefilled with the agent settings and saves via updateAgent',
  async () => {
    vi.mocked(listAgents).mockResolvedValueOnce([
      {
        id: 'agent-1',
        name: 'Housing Agent',
        status: 'active',
        sources: [{ type: 'web_urls', value: 'https://example.com' }]
      }
    ]);

    renderAgentsPage();

    fireEvent.click(await screen.findByText(/housing agent/i));
    fireEvent.click(await screen.findByRole('button', { name: /edit agent/i }));

    expect(getAgent).toHaveBeenCalledWith('agent-1');
    expect(await screen.findByRole('heading', { name: /edit agent/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/agent name/i)).toHaveValue('Housing Agent');
    expect(screen.getByLabelText(/description/i)).toHaveValue('Watches housing market blogs');

    for (let index = 0; index < TOTAL_STEPS - 1; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
    }

    fireEvent.click(screen.getByRole('button', { name: /^save agent$/i }));

    await waitFor(() => {
      expect(updateAgent).toHaveBeenCalledWith('agent-1', expect.objectContaining({ name: 'Housing Agent' }));
    });
    expect(updateAgent).toHaveBeenCalledWith('agent-1', expect.not.objectContaining({ sources: expect.anything() }));
    expect(createAgent).not.toHaveBeenCalled();
  },
  10000
);
