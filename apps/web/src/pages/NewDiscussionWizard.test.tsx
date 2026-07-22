import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { NewDiscussionWizard } from './NewDiscussionWizard';

vi.mock('../api/agents', () => ({
  listAgents: vi.fn().mockResolvedValue([
    { id: 'a1', name: 'Very Long Expert Agent Name To Stress Mobile Layout', characterType: 'finance_expert' },
    { id: 'a2', name: 'Second Expert', characterType: 'teacher' }
  ]),
  listAgentReports: vi.fn().mockResolvedValue([])
}));

vi.mock('../api/discussions', () => ({
  createDiscussion: vi.fn(),
  getDiscussionCapabilities: vi.fn().mockResolvedValue({ tts: true, ttsProviders: [] }),
  listTranscriptOptions: vi.fn().mockResolvedValue([]),
  triggerDiscussionRun: vi.fn()
}));

function renderWizard() {
  return render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: '/studio/new',
          state: {
            preselect: {
              entries: [{ agentId: 'a1', reportIds: ['report-1'] }],
              contextLabel: 'Report context'
            }
          }
        }
      ]}
    >
      <NewDiscussionWizard />
    </MemoryRouter>
  );
}

describe('NewDiscussionWizard mobile layout', () => {
  it('renders expert-card metadata in a wrapping container for narrow screens', async () => {
    renderWizard();

    fireEvent.click(await screen.findByRole('button', { name: /next/i }));
    const heading = await screen.findByText(/pick at least 2 experts/i);
    const meta = await screen.findByTestId('studio-expert-card-meta-a1');
    expect(meta).toBeInTheDocument();
    expect(heading.compareDocumentPosition(meta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
