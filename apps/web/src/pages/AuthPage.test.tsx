import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthPage } from './AuthPage';
import { AuthProvider } from '../auth/AuthContext';

const loginMock = vi.fn();
const signupMock = vi.fn();
const resendConfirmationMock = vi.fn();
const forgotPasswordMock = vi.fn();
const resetPasswordMock = vi.fn();

vi.mock('../api/auth', () => ({
  getCurrentUser: vi.fn().mockResolvedValue(null),
  login: (...args: unknown[]) => loginMock(...args),
  signup: (...args: unknown[]) => signupMock(...args),
  logout: vi.fn(),
  resendConfirmation: (...args: unknown[]) => resendConfirmationMock(...args),
  forgotPassword: (...args: unknown[]) => forgotPasswordMock(...args),
  resetPassword: (...args: unknown[]) => resetPasswordMock(...args),
  GOOGLE_SIGN_IN_URL: '/api/auth/google'
}));

vi.mock('../api/admin', () => ({
  listUsers: vi.fn().mockRejectedValue(new Error('forbidden'))
}));

afterEach(() => {
  cleanup();
  loginMock.mockReset();
  signupMock.mockReset();
  resendConfirmationMock.mockReset();
  forgotPasswordMock.mockReset();
  resetPasswordMock.mockReset();
  window.history.replaceState({}, '', '/');
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

it('switches to signup mode and shows a confirmation-sent screen', async () => {
  signupMock.mockResolvedValue({ status: 'confirmation_required', email: 'c@d.com' });
  renderAuthPage();

  fireEvent.click(screen.getByText('Sign up'));
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'c@d.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

  await waitFor(() => expect(signupMock).toHaveBeenCalledWith('c@d.com', 'password123'));
  expect(await screen.findByText('Check your email')).toBeInTheDocument();
  expect(screen.getByText(/c@d.com/)).toBeInTheDocument();
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

it('requests a password reset link via the forgot-password form', async () => {
  forgotPasswordMock.mockResolvedValue(undefined);
  renderAuthPage();

  fireEvent.click(screen.getByText('Forgot password?'));
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

  await waitFor(() => expect(forgotPasswordMock).toHaveBeenCalledWith('a@b.com'));
  expect(await screen.findByText(/reset link is on its way/)).toBeInTheDocument();
});

it('shows the reset-password form when a resetToken query param is present', async () => {
  window.history.replaceState({}, '', '/?resetToken=abc123');
  resetPasswordMock.mockResolvedValue(undefined);
  renderAuthPage();

  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'brand-new-secret' } });
  fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));

  await waitFor(() => expect(resetPasswordMock).toHaveBeenCalledWith('abc123', 'brand-new-secret'));
});

it('shows a success banner when redirected with emailConfirmed=1', () => {
  window.history.replaceState({}, '', '/?emailConfirmed=1');
  renderAuthPage();

  expect(screen.getByText(/Your email has been confirmed/)).toBeInTheDocument();
});

it('shows a warning banner when redirected with accountLocked=1', () => {
  window.history.replaceState({}, '', '/?accountLocked=1');
  renderAuthPage();

  expect(screen.getByText(/This account has been locked/)).toBeInTheDocument();
});
