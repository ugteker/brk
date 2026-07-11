import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildServer } from '../../server';
import { InMemoryUserRepository } from './in-memory-user-repository';
import type { GoogleOAuthClient, GoogleProfile } from './google-oauth';
import type { AgentRepositoryLike } from '../agents/routes';
import type { Agent } from '../agents/types';

class FakeGoogleOAuthClient implements GoogleOAuthClient {
  async exchangeCodeForProfile(): Promise<GoogleProfile> {
    return { sub: 'google-sub-1', email: 'google-user@example.com', name: 'Google User' };
  }
}

function createFakeAgentRepo(): AgentRepositoryLike {
  return {
    async createAgent(): Promise<Agent> {
      throw new Error('unused');
    },
    async updateAgent(): Promise<Agent> {
      throw new Error('unused');
    },
    async disableAgent(): Promise<void> {},
    async enableAgent(): Promise<void> {},
    async deleteAgent(): Promise<void> {},
    async listAgents(): Promise<Agent[]> {
      return [];
    },
    async getAgent(): Promise<Agent | null> {
      return null;
    }
  };
}

function createApp(googleOAuthClient: GoogleOAuthClient = new FakeGoogleOAuthClient()) {
  return buildServer({
    agentRepository: createFakeAgentRepo(),
    agents: {
      promptRepository: { savePromptVersion: async () => { throw new Error('unused'); }, getLatestPromptVersion: async () => null },
      reportRepository: { getLatestRunReport: async () => null, listReportsForAgent: async () => [] }
    },
    auth: { userRepository: new InMemoryUserRepository(), googleOAuthClient }
  });
}

describe('auth routes', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('signs up with email/password and returns a session cookie', async () => {
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'trader@example.com', password: 'super-secret-1' }
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().email).toBe('trader@example.com');
    expect(res.cookies.some((c) => c.name === 'brokerino_session')).toBe(true);
  });

  it('rejects signup with a weak password', async () => {
    const app = await createApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'trader@example.com', password: 'short' }
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects signup when the email is already registered', async () => {
    const app = await createApp();
    await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'trader@example.com', password: 'super-secret-1' }
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'trader@example.com', password: 'another-secret' }
    });

    expect(res.statusCode).toBe(409);
  });

  it('logs in with correct credentials and rejects incorrect ones', async () => {
    const app = await createApp();
    await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'trader@example.com', password: 'super-secret-1' }
    });

    const goodLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'trader@example.com', password: 'super-secret-1' }
    });
    expect(goodLogin.statusCode).toBe(200);

    const badLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'trader@example.com', password: 'wrong-password' }
    });
    expect(badLogin.statusCode).toBe(401);
  });

  it('returns the current user from /api/auth/me using the session cookie', async () => {
    const app = await createApp();
    const signup = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'trader@example.com', password: 'super-secret-1' }
    });
    const cookieHeader = signup.cookies.map((c) => `${c.name}=${c.value}`).join('; ');

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: cookieHeader } });
    expect(me.statusCode).toBe(200);
    expect(me.json().email).toBe('trader@example.com');
  });

  it('returns 401 from /api/auth/me without a session cookie', async () => {
    const app = await createApp();
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('logs out by clearing the session cookie', async () => {
    const app = await createApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/logout' });
    expect(res.statusCode).toBe(204);
  });

  it('signs up and logs in via Google, creating a new user on first sign-in', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test-client-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-client-secret');
    const app = await createApp();

    const callback = await app.inject({ method: 'GET', url: '/api/auth/google/callback?code=fake-code' });
    expect(callback.statusCode).toBe(302);
    const cookieHeader = callback.cookies.map((c) => `${c.name}=${c.value}`).join('; ');

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: cookieHeader } });
    expect(me.statusCode).toBe(200);
    expect(me.json().email).toBe('google-user@example.com');
    expect(me.json().hasGoogleLinked).toBe(true);
  });

  it('redirects to Google when Google sign-in is configured', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test-client-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-client-secret');
    const app = await createApp();

    const res = await app.inject({ method: 'GET', url: '/api/auth/google' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('accounts.google.com');
  });

  it('returns 503 for Google routes when Google sign-in is not configured', async () => {
    const app = await createApp();
    const res = await app.inject({ method: 'GET', url: '/api/auth/google' });
    expect(res.statusCode).toBe(503);
  });

  it('blocks unauthenticated access to protected agent routes', async () => {
    const app = await createApp();
    const res = await app.inject({ method: 'GET', url: '/api/agents' });
    expect(res.statusCode).toBe(401);
  });
});
