export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  hasPassword: boolean;
  hasGoogleLinked: boolean;
  createdAt: string;
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

export async function signup(email: string, password: string): Promise<AuthUser> {
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

// Full-page navigation (not fetch) — the browser must follow the redirect chain
// through Google's own consent screen.
export const GOOGLE_SIGN_IN_URL = '/api/auth/google';
