import '@testing-library/jest-dom/vitest';
import type { ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createAgent, deleteAgent, getAgent, listAgents, updateAgent } from '../api/agents';
import { saveAgentPrompt } from '../api/agents';
import { AgentForm } from './AgentForm';
import { AgentsPage } from '../pages/AgentsPage';
import { ThemeProvider } from '../theme/ThemeContext';
import { AuthProvider, useAuth } from '../auth/AuthContext';

const TOTAL_STEPS = 5;

function renderAgentsPage() {
  return render(
    <AuthProvider>
      <ThemeProvider>
        <AgentsPage />
      </ThemeProvider>
    </AuthProvider>
  );
}

// AgentForm reads the logged-in user's email (via useAuth) once, at mount, to default the
// recipients field - matching how App.tsx only mounts children after auth has resolved (it shows
// a Spin while status === 'loading'). This helper mirrors that gating so tests see the same
// "already loaded" state production code relies on.
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
    recipients: ['ops@example.com'],
    schedule: { mode: 'interval', intervalMinutes: 120 }
  }),
  listAgents: vi.fn().mockResolvedValue([]),
  enableAgent: vi.fn().mockResolvedValue(undefined),
  disableAgent: vi.fn().mockResolvedValue(undefined),
  deleteAgent: vi.fn().mockResolvedValue(undefined),
  runAgentNow: vi.fn().mockResolvedValue({ status: 'succeeded' }),
  saveAgentPrompt: vi.fn().mockResolvedValue({ id: 'prompt-1' }),
  listAgentReports: vi.fn().mockResolvedValue([]),
  listAgentRuns: vi.fn().mockResolvedValue([]),
  getLatestAgentReport: vi.fn().mockResolvedValue(null),
  getLatestAgentPrompt: vi.fn().mockResolvedValue(null)
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

it('shows complete on the last step and saves the agent from the footer button', async () => {
  await renderAgentForm();

  for (let index = 0; index < TOTAL_STEPS - 1; index += 1) {
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
  }

  const completeButtons = screen.getAllByRole('button', { name: /^complete$/i });
  expect(completeButtons.length).toBeGreaterThan(0);

  fireEvent.click(completeButtons[completeButtons.length - 1]);

  expect(await screen.findByTestId('agent-save-state', {}, { timeout: 3000 })).toHaveTextContent(/agent saved successfully/i);
  expect(createAgent).toHaveBeenCalled();
  expect(saveAgentPrompt).toHaveBeenCalledWith('agent-1', expect.objectContaining({ model: expect.any(String) }));
});

it('shows a per-source episode count input (default 1) and no longer shows a per-source frequency field', async () => {
  await renderAgentForm();
  fireEvent.click(screen.getByRole('button', { name: /next/i })); // Identity -> Sources

  expect(screen.getByLabelText(/source 1 episode count/i)).toHaveValue('1');
  expect(screen.queryByLabelText(/frequency/i)).not.toBeInTheDocument();
});

it('supports selecting a weekly schedule with specific days', async () => {
  await renderAgentForm();
  for (let index = 0; index < 3; index += 1) {
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
  }

  fireEvent.mouseDown(screen.getByLabelText(/schedule mode/i));
  fireEvent.click(await screen.findByText('Weekly'));

  expect(screen.getByLabelText(/days of week/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Wed' }));
  expect(screen.getByLabelText(/daily time/i)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /next/i }));
  fireEvent.click(screen.getByRole('button', { name: /^complete$/i }));

  expect(await screen.findByTestId('agent-save-state', {}, { timeout: 3000 })).toHaveTextContent(/agent saved successfully/i);
  expect(createAgent).toHaveBeenCalledWith(
    expect.objectContaining({
      schedule: expect.objectContaining({ mode: 'weekly', daysOfWeek: expect.arrayContaining([1, 3]) })
    })
  );
});

it('supports adding multiple recipient emails as tags', async () => {
  await renderAgentForm();
  for (let index = 0; index < 3; index += 1) {
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
  }

  const recipientsSelect = document.querySelector('.ant-select-multiple') as HTMLElement;
  const recipientsInput = recipientsSelect.querySelector('.ant-select-input') as HTMLInputElement;
  fireEvent.mouseDown(recipientsInput);
  fireEvent.focus(recipientsInput);
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )!.set!;
  nativeInputValueSetter.call(recipientsInput, 'second@example.com');
  recipientsInput.dispatchEvent(new Event('input', { bubbles: true }));
  await screen.findByTitle('second@example.com');
  fireEvent.keyDown(recipientsInput, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13 });

  await waitFor(() => {
    expect(recipientsSelect.querySelectorAll('.ant-select-selection-item')).toHaveLength(2);
  });

  fireEvent.click(screen.getByRole('button', { name: /next/i }));
  fireEvent.click(screen.getByRole('button', { name: /^complete$/i }));

  expect(await screen.findByTestId('agent-save-state', {}, { timeout: 3000 })).toHaveTextContent(/agent saved successfully/i);
  expect(createAgent).toHaveBeenCalledWith(
    expect.objectContaining({ recipients: expect.arrayContaining(['trader@example.com', 'second@example.com']) })
  );
});

it('defaults recipients to the logged-in user email for a new agent', async () => {
  await renderAgentForm();
  for (let index = 0; index < 3; index += 1) {
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
  }

  expect(screen.getByTitle('trader@example.com')).toBeInTheDocument();
});

it('sends active:false when the Active toggle is switched off', async () => {
  await renderAgentForm();

  fireEvent.click(screen.getByLabelText(/active toggle/i));

  for (let index = 0; index < TOTAL_STEPS - 1; index += 1) {
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
  }

  const completeButtons = screen.getAllByRole('button', { name: /^complete$/i });
  fireEvent.click(completeButtons[completeButtons.length - 1]);

  expect(await screen.findByTestId('agent-save-state', {}, { timeout: 3000 })).toHaveTextContent(/agent saved successfully/i);
  expect(createAgent).toHaveBeenCalledWith(expect.objectContaining({ active: false }));
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

it('runs an agent now via the run-now button', async () => {
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
  fireEvent.click(screen.getByRole('button', { name: /run agent now/i }));

  const { runAgentNow } = await import('../api/agents');
  await vi.waitFor(() => expect(runAgentNow).toHaveBeenCalledWith('agent-1'));
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

    const completeButtons = screen.getAllByRole('button', { name: /^complete$/i });
    fireEvent.click(completeButtons[completeButtons.length - 1]);

    await waitFor(() => {
      expect(updateAgent).toHaveBeenCalledWith('agent-1', expect.objectContaining({ name: 'Housing Agent' }));
    });
    expect(createAgent).not.toHaveBeenCalled();
  },
  10000
);
