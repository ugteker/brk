import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildGoogleAuthUrl, GoogleOAuthHttpClient } from './google-oauth';

describe('google-oauth URL config wiring', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('uses configured auth URL when building Google sign-in link', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'client-1');
    vi.stubEnv('GOOGLE_CALLBACK_URL', 'http://localhost:3000/api/auth/google/callback');
    vi.stubEnv('GOOGLE_OAUTH_AUTH_URL', 'https://google-auth-proxy.local/oauth2/auth');

    const url = buildGoogleAuthUrl('state-1');
    expect(url.startsWith('https://google-auth-proxy.local/oauth2/auth?')).toBe(true);
    expect(url).toContain('client_id=client-1');
    expect(url).toContain('state=state-1');
  });

  it('uses configured token and userinfo URLs when exchanging code', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'client-1');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'secret-1');
    vi.stubEnv('GOOGLE_CALLBACK_URL', 'http://localhost:3000/api/auth/google/callback');
    vi.stubEnv('GOOGLE_OAUTH_TOKEN_URL', 'https://google-auth-proxy.local/token');
    vi.stubEnv('GOOGLE_OAUTH_USERINFO_URL', 'https://google-auth-proxy.local/userinfo');

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'token-1' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sub: 'sub-1', email: 'u@example.com', name: 'User' })
      });
    vi.stubGlobal('fetch', fetchMock);

    const client = new GoogleOAuthHttpClient();
    const profile = await client.exchangeCodeForProfile('code-1');

    expect(profile.email).toBe('u@example.com');
    expect(fetchMock.mock.calls[0][0]).toBe('https://google-auth-proxy.local/token');
    expect(fetchMock.mock.calls[1][0]).toBe('https://google-auth-proxy.local/userinfo');
  });
});

