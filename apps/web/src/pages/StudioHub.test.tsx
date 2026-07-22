import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StudioHub } from './StudioHub';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

vi.mock('../utils/useSafeNavigate', () => ({
  useSafeNavigate: () => vi.fn()
}));

vi.mock('../api/discussions', () => ({
  deleteDiscussion: vi.fn(),
  listDiscussions: vi.fn().mockResolvedValue([
    {
      id: 'discussion-1',
      name: 'Long discussion title that must remain readable on a narrow mobile screen',
      format: 'structured',
      participants: [{ id: 'participant-1', speakerOrder: 0 }]
    }
  ]),
  triggerDiscussionRun: vi.fn()
}));

describe('StudioHub mobile cards', () => {
  it('places discussion actions below readable card content on mobile', async () => {
    render(<StudioHub />);

    const title = await screen.findByText(/long discussion title/i);
    const card = title.closest('.ct-animate-enter');

    expect(card).toHaveClass('flex-col', 'sm:flex-row');
    expect(title).toHaveClass('break-words');
  });
});
