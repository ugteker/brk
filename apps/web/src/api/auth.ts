export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  role: 'user' | 'admin';
  hasPassword: boolean;
  hasGoogleLinked: boolean;
  createdAt: string;
}

export interface SignupResult {
  status: 'confirmation_required';
  email: string;
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    return typeof body?.message === 'string' ? body.message : fallback;
  } catch {
    return fallback;
  }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error('Failed to load session');
  return response.json();
}

export async function signup(email: string, password: string): Promise<SignupResult> {
  const response = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ email, password })
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to create account'));
  }
  return response.json();
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ email, password })
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Invalid email or password'));
  }
  return response.json();
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
}

export async function resendConfirmation(email: string): Promise<void> {
  await fetch('/api/auth/resend-confirmation', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ email })
  });
}

export async function forgotPassword(email: string): Promise<void> {
  await fetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ email })
  });
}

export async function resetPassword(token: string, password: string): Promise<void> {
  const response = await fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ token, password })
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'This reset link is invalid or has expired'));
  }
}

// Full-page navigation (not fetch) — the browser must follow the redirect chain
// through Google's own consent screen.
export const GOOGLE_SIGN_IN_URL = '/api/auth/google';
