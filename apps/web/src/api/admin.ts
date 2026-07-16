export interface AdminUserView {
  id: string;
  email: string;
  displayName: string | null;
  role: 'user' | 'admin';
  hasPassword: boolean;
  hasGoogleLinked: boolean;
  createdAt: string;
  locked: boolean;
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    return typeof body?.message === 'string' ? body.message : fallback;
  } catch {
    return fallback;
  }
}

export async function listUsers(): Promise<AdminUserView[]> {
  const response = await fetch('/api/admin/users', { credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to load users'));
  }
  return response.json();
}

export async function lockUser(userId: string): Promise<AdminUserView> {
  const response = await fetch(`/api/admin/users/${userId}/lock`, { method: 'POST', credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to lock user'));
  }
  return response.json();
}

export async function unlockUser(userId: string): Promise<AdminUserView> {
  const response = await fetch(`/api/admin/users/${userId}/unlock`, { method: 'POST', credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to unlock user'));
  }
  return response.json();
}

export async function promoteUser(userId: string): Promise<AdminUserView> {
  const response = await fetch(`/api/admin/users/${userId}/promote`, { method: 'POST', credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to promote user'));
  }
  return response.json();
}

export async function demoteUser(userId: string): Promise<AdminUserView> {
  const response = await fetch(`/api/admin/users/${userId}/demote`, { method: 'POST', credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to demote user'));
  }
  return response.json();
}

export async function deleteUser(userId: string): Promise<void> {
  const response = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE', credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to remove user'));
  }
}

export async function seedDemoData(): Promise<void> {
  const response = await fetch('/api/admin/seed-demo', { method: 'POST', credentials: 'same-origin' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (body?.code === 'already_exists') throw new Error('already_exists');
    throw new Error(await parseErrorMessage(response, 'Failed to seed demo data'));
  }
}
