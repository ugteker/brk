export interface AdminUserView {
  id: string;
  email: string;
  displayName: string | null;
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

export async function deleteUser(userId: string): Promise<void> {
  const response = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE', credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to remove user'));
  }
}
