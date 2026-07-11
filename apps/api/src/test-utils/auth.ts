import { InMemoryUserRepository } from '../modules/auth/in-memory-user-repository';
import { signSessionToken } from '../modules/auth/jwt';
import { config } from '../config';
import type { AuthRoutesDeps } from '../modules/auth/routes';
import type { GoogleOAuthClient, GoogleProfile } from '../modules/auth/google-oauth';

class FakeGoogleOAuthClient implements GoogleOAuthClient {
  async exchangeCodeForProfile(): Promise<GoogleProfile> {
    return { sub: 'google-test-sub', email: 'google-user@example.com', name: 'Google User' };
  }
}

// Shared helper so route tests protected by the auth guard can build a server with a
// working (in-memory) auth stack and generate a valid session cookie header without
// going through a real HTTP signup/login round trip.
export function createTestAuthDeps(): AuthRoutesDeps {
  return {
    userRepository: new InMemoryUserRepository(),
    googleOAuthClient: new FakeGoogleOAuthClient()
  };
}

export function authCookieHeader(userId = 'test-user'): { cookie: string } {
  const token = signSessionToken({ userId });
  return { cookie: `${config.auth.cookieName}=${token}` };
}
