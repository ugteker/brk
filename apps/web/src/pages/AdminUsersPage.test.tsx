import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AdminUsersPage } from './AdminUsersPage';
import { deleteUser, lockUser, listUsers, promoteUser, demoteUser, unlockUser } from '../api/admin';

vi.mock('../api/admin', () => ({
  listUsers: vi.fn(),
  lockUser: vi.fn(),
  promoteUser: vi.fn(),
  demoteUser: vi.fn(),
  unlockUser: vi.fn(),
  deleteUser: vi.fn()
}));

const baseUser = {
  id: 'user-1',
  email: 'trader@example.com',
  displayName: 'Trader',
  role: 'user',
  hasPassword: true,
  hasGoogleLinked: false,
  createdAt: new Date('2024-01-01').toISOString(),
  locked: false
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
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

it('shows the current build stamp in the admin header', async () => {
  vi.mocked(listUsers).mockResolvedValue([]);
  vi.stubEnv('VITE_BUILD_TIMESTAMP', '2026-07-13T12:34:00Z');
  vi.stubEnv('VITE_BUILD_COMMIT_SHA', 'abc1234');

  render(<AdminUsersPage onBack={vi.fn()} />);

  expect(await screen.findByText(/Build: 2026-07-13 12:34 UTC · abc1234/i)).toBeInTheDocument();
});

it('can promote and demote users from the admin table', async () => {
  vi.mocked(listUsers).mockResolvedValue([{ ...baseUser, role: 'user' }, { ...baseUser, id: 'user-2', role: 'admin', email: 'admin@example.com' }]);
  vi.mocked(promoteUser).mockResolvedValue({ ...baseUser, role: 'admin' });
  vi.mocked(demoteUser).mockResolvedValue({ ...baseUser, id: 'user-2', email: 'admin@example.com', role: 'user' });

  render(<AdminUsersPage onBack={vi.fn()} />);

  fireEvent.click(await screen.findByRole('button', { name: /make admin trader@example.com/i }));
  await waitFor(() => expect(promoteUser).toHaveBeenCalledWith('user-1'));

  fireEvent.click(await screen.findByRole('button', { name: /make user admin@example.com/i }));
  await waitFor(() => expect(demoteUser).toHaveBeenCalledWith('user-2'));
});
