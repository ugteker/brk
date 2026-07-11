import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AgentPromptEditor } from './AgentPromptEditor';
import { saveAgentPrompt } from '../api/agents';

vi.mock('../api/agents', () => ({
  saveAgentPrompt: vi.fn().mockResolvedValue({ id: 'prompt-1' })
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('renders the system prompt editor with model, prompt and enabled controls', () => {
  render(<AgentPromptEditor agentId="agent-1" />);

  expect(screen.getByLabelText(/claude model/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/system prompt/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/prompt enabled/i)).toBeInTheDocument();
});

it('saves the system prompt when the save button is clicked', async () => {
  render(<AgentPromptEditor agentId="agent-1" initialSystemPrompt="Find long/short signals" />);

  fireEvent.click(screen.getByRole('button', { name: /save system prompt/i }));

  expect(await screen.findByText(/save system prompt/i)).toBeInTheDocument();
  expect(saveAgentPrompt).toHaveBeenCalledWith('agent-1', expect.objectContaining({ systemPrompt: 'Find long/short signals' }));
});
