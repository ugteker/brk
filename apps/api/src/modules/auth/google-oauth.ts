import { config } from '../../config';

export interface GoogleProfile {
  sub: string;
  email: string;
  name?: string;
}

export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.auth.google.clientId,
    redirect_uri: config.auth.google.callbackUrl,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account'
  });
  return `${config.auth.google.authUrl}?${params.toString()}`;
}

export interface GoogleOAuthClient {
  exchangeCodeForProfile(code: string): Promise<GoogleProfile>;
}

// Thin wrapper around Google's OAuth2 + OpenID Connect endpoints using plain fetch,
// so the app doesn't need a heavy OAuth client library.
export class GoogleOAuthHttpClient implements GoogleOAuthClient {
  async exchangeCodeForProfile(code: string): Promise<GoogleProfile> {
    const tokenResponse = await fetch(config.auth.google.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.auth.google.clientId,
        client_secret: config.auth.google.clientSecret,
        redirect_uri: config.auth.google.callbackUrl,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to exchange Google authorization code');
    }

    const tokenBody = (await tokenResponse.json()) as { access_token: string };

    const profileResponse = await fetch(config.auth.google.userInfoUrl, {
      headers: { Authorization: `Bearer ${tokenBody.access_token}` }
    });

    if (!profileResponse.ok) {
      throw new Error('Failed to fetch Google profile');
    }

    return (await profileResponse.json()) as GoogleProfile;
  }
}
