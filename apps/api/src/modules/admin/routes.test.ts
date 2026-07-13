import { describe, expect, it } from 'vitest';
import { buildServer } from '../../server';
import { InMemoryUserRepository } from '../auth/in-memory-user-repository';
import { authCookieHeader, createTestAuthDeps } from '../../test-utils/auth';

async function createApp() {
  const userRepository = new InMemoryUserRepository();
  const admin = await userRepository.createWithPassword('admin@example.com', 'hash', 'Admin', 'admin');
  await userRepository.setEmailVerified(admin.id, true);
  const user = await userRepository.createWithPassword('trader@example.com', 'hash', 'Trader');
  await userRepository.setEmailVerified(user.id, true);

  const app = await buildServer({
    agentRepository: {
      createAgent: async () => {
        throw new Error('unused');
      },
      updateAgent: async () => {
        throw new Error('unused');
      },
      disableAgent: async () => {},
      enableAgent: async () => {},
      deleteAgent: async () => {},
      listAgents: async () => [],
      getAgent: async () => null,
      listRecentRuns: async () => []
    },
    agents: {
      promptRepository: { savePromptVersion: async () => ({ id: 'prompt-1' } as never), getLatestPromptVersion: async () => null },
      reportRepository: { getLatestRunReport: async () => null, listReportsForAgent: async () => [] }
    },
    auth: { ...createTestAuthDeps(), userRepository }
  });

  return { app, admin, user, userRepository };
}

describe('admin routes', () => {
  it('promotes and demotes a user role', async () => {
    const { app, admin, user } = await createApp();

    const promote = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${user.id}/promote`,
      headers: authCookieHeader(admin.id)
    });

    expect(promote.statusCode).toBe(200);
    expect(promote.json().role).toBe('admin');

    const demote = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${user.id}/demote`,
      headers: authCookieHeader(admin.id)
    });

    expect(demote.statusCode).toBe(200);
    expect(demote.json().role).toBe('user');
  });
});
