import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AdminUsersPage } from './AdminUsersPage';
import { deleteUser, lockUser, listUsers, unlockUser } from '../api/admin';

vi.mock('../api/admin', () => ({
  listUsers: vi.fn(),
  lockUser: vi.fn(),
  unlockUser: vi.fn(),
  deleteUser: vi.fn()
}));

const baseUser = {
  id: 'user-1',
  email: 'trader@example.com',
  displayName: 'Trader',
  hasPassword: true,
  hasGoogleLinked: false,
  createdAt: new Date('2024-01-01').toISOString(),
  locked: false
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('lists users and locks an active user', async () => {
  vi.mocked(listUsers).mockResolvedValue([baseUser]);
  vi.mocked(lockUser).mockResolvedValue({ ...baseUser, locked: true });

  render(<AdminUsersPage onBack={vi.fn()} />);

  expect(await screen.findByText('trader@example.com')).toBeInTheDocument();
  expect(screen.getByText('Active')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /lock trader@example.com/i }));

  await waitFor(() => expect(lockUser).toHaveBeenCalledWith('user-1'));
  expect(await screen.findByText('Locked')).toBeInTheDocument();
});

it('unlocks a locked user', async () => {
  vi.mocked(listUsers).mockResolvedValue([{ ...baseUser, locked: true }]);
  vi.mocked(unlockUser).mockResolvedValue({ ...baseUser, locked: false });

  render(<AdminUsersPage onBack={vi.fn()} />);

  const unlockButton = await screen.findByRole('button', { name: /unlock trader@example.com/i });
  fireEvent.click(unlockButton);

  await waitFor(() => expect(unlockUser).toHaveBeenCalledWith('user-1'));
  expect(await screen.findByText('Active')).toBeInTheDocument();
});

it('deletes a user after confirming the popconfirm', async () => {
  vi.mocked(listUsers).mockResolvedValue([baseUser]);
  vi.mocked(deleteUser).mockResolvedValue(undefined);

  render(<AdminUsersPage onBack={vi.fn()} />);

  fireEvent.click(await screen.findByRole('button', { name: /delete trader@example.com/i }));
  fireEvent.click(await screen.findByText('Delete'));

  await waitFor(() => expect(deleteUser).toHaveBeenCalledWith('user-1'));
  await waitFor(() => expect(screen.queryByText('trader@example.com')).not.toBeInTheDocument());
});

it('calls onBack when the back button is clicked', async () => {
  vi.mocked(listUsers).mockResolvedValue([]);
  const onBack = vi.fn();

  render(<AdminUsersPage onBack={onBack} />);

  fireEvent.click(await screen.findByRole('button', { name: /back to dashboard/i }));
  expect(onBack).toHaveBeenCalled();
});
