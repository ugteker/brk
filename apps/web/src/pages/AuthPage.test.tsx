import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthPage } from './AuthPage';
import { AuthProvider } from '../auth/AuthContext';

const loginMock = vi.fn();
const signupMock = vi.fn();

vi.mock('../api/auth', () => ({
  getCurrentUser: vi.fn().mockResolvedValue(null),
  login: (...args: unknown[]) => loginMock(...args),
  signup: (...args: unknown[]) => signupMock(...args),
  logout: vi.fn(),
  GOOGLE_SIGN_IN_URL: '/api/auth/google'
}));

afterEach(() => {
  cleanup();
  loginMock.mockReset();
  signupMock.mockReset();
});

function renderAuthPage() {
  return render(
    <AuthProvider>
      <AuthPage />
    </AuthProvider>
  );
}

it('logs in with email and password', async () => {
  loginMock.mockResolvedValue({ id: 'u1', email: 'a@b.com', displayName: null, hasPassword: true, hasGoogleLinked: false, createdAt: '' });
  renderAuthPage();

  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

  await waitFor(() => expect(loginMock).toHaveBeenCalledWith('a@b.com', 'password123'));
});

it('switches to signup mode and creates an account', async () => {
  signupMock.mockResolvedValue({ id: 'u2', email: 'c@d.com', displayName: null, hasPassword: true, hasGoogleLinked: false, createdAt: '' });
  renderAuthPage();

  fireEvent.click(screen.getByText('Sign up'));
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'c@d.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

  await waitFor(() => expect(signupMock).toHaveBeenCalledWith('c@d.com', 'password123'));
});

it('shows an error message when login fails', async () => {
  loginMock.mockRejectedValue(new Error('Invalid email or password'));
  renderAuthPage();

  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

  expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();
});

it('offers Google sign in linking to the OAuth start route', () => {
  renderAuthPage();
  const googleLink = screen.getByRole('link', { name: /Sign in with Google/i });
  expect(googleLink).toHaveAttribute('href', '/api/auth/google');
});
