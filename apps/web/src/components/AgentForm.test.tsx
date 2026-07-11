import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createAgent, deleteAgent, getAgent, listAgents, updateAgent } from '../api/agents';
import { saveAgentPrompt } from '../api/agents';
import { AgentForm } from './AgentForm';
import { AgentsPage } from '../pages/AgentsPage';
import { ThemeProvider } from '../theme/ThemeContext';
import { AuthProvider } from '../auth/AuthContext';

const TOTAL_STEPS = 6;

function renderAgentsPage() {
  return render(
    <AuthProvider>
      <ThemeProvider>
        <AgentsPage />
      </ThemeProvider>
    </AuthProvider>
  );
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
    recipients: ['ops@example.com'],
    schedule: { mode: 'interval', intervalMinutes: 120 }
  }),
  listAgents: vi.fn().mockResolvedValue([]),
  enableAgent: vi.fn().mockResolvedValue(undefined),
  disableAgent: vi.fn().mockResolvedValue(undefined),
  deleteAgent: vi.fn().mockResolvedValue(undefined),
  saveAgentPrompt: vi.fn().mockResolvedValue({ id: 'prompt-1' }),
  listAgentReports: vi.fn().mockResolvedValue([]),
  getLatestAgentReport: vi.fn().mockResolvedValue(null),
  getLatestAgentPrompt: vi.fn().mockResolvedValue(null)
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('renders wizard stepper controls and key fields', () => {
  render(<AgentForm />);
  expect(screen.getByLabelText(/wizard progress/i)).toHaveTextContent(new RegExp(`step 1 of ${TOTAL_STEPS}`, 'i'));
  expect(screen.getByLabelText(/agent name/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
});

it('shows complete on the last step and saves the agent from the footer button', async () => {
  render(<AgentForm />);

  for (let index = 0; index < TOTAL_STEPS - 1; index += 1) {
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
  }

  const completeButtons = screen.getAllByRole('button', { name: /^complete$/i });
  expect(completeButtons.length).toBeGreaterThan(0);

  fireEvent.click(completeButtons[completeButtons.length - 1]);

  expect(await screen.findByText(/agent saved successfully/i)).toBeInTheDocument();
  expect(createAgent).toHaveBeenCalled();
  expect(saveAgentPrompt).toHaveBeenCalledWith('agent-1', expect.objectContaining({ model: expect.any(String) }));
});

it('cancels the wizard and returns to the dashboard', () => {
  renderAgentsPage();

  fireEvent.click(screen.getByRole('button', { name: /create agent/i }));
  expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

  expect(screen.getByRole('heading', { name: 'Brokerino' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /create agent/i })).toBeInTheDocument();
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

it('renders brokerino dashboard by default', () => {
  renderAgentsPage();
  expect(screen.getByRole('heading', { name: 'Brokerino' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /^agent dashboard$/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /create agent/i })).toBeInTheDocument();
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
  expect(await screen.findByText(/use "create agent" to start the setup wizard/i)).toBeInTheDocument();
});

it('toggles between light and dark theme', () => {
  renderAgentsPage();
  const picker = screen.getAllByLabelText(/theme picker/i)[0];

  fireEvent.click(picker);
  expect(document.documentElement.classList.contains('dark')).toBe(true);

  fireEvent.click(picker);
  expect(document.documentElement.classList.contains('dark')).toBe(false);
});

it('opens the edit wizard prefilled with the agent settings and saves via updateAgent', async () => {
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

  const completeButtons = screen.getAllByRole('button', { name: /^complete$/i });
  fireEvent.click(completeButtons[completeButtons.length - 1]);

  expect(await screen.findByText(/agent saved successfully/i)).toBeInTheDocument();
  expect(updateAgent).toHaveBeenCalledWith('agent-1', expect.objectContaining({ name: 'Housing Agent' }));
  expect(createAgent).not.toHaveBeenCalled();
});
