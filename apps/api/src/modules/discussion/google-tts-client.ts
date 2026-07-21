import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** Minimal fetch-shaped dependency so tests can inject a mock without network access. */
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

/**
 * Maps the app's stored OpenAI voice IDs (see discussion/types.ts OpenAIVoice - already
 * persisted on every DiscussionParticipant row) to Google Cloud TTS voice names per
 * language, so existing discussions keep working without a schema migration or remapping.
 * Gender/character intent is preserved roughly: alloy/nova/shimmer lean female,
 * echo/onyx lean male, fable neutral-warm.
 */
const VOICE_MAP: Record<'en' | 'de', Record<string, string>> = {
  en: {
    alloy: 'en-US-Neural2-C',
    echo: 'en-US-Neural2-D',
    fable: 'en-US-Neural2-F',
    onyx: 'en-US-Neural2-J',
    nova: 'en-US-Neural2-E',
    shimmer: 'en-US-Neural2-G'
  },
  de: {
    alloy: 'de-DE-Neural2-C',
    echo: 'de-DE-Neural2-D',
    fable: 'de-DE-Neural2-F',
    onyx: 'de-DE-Neural2-B',
    nova: 'de-DE-Neural2-A',
    shimmer: 'de-DE-Neural2-C'
  }
};

const LANGUAGE_CODES: Record<'en' | 'de', string> = { en: 'en-US', de: 'de-DE' };

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TTS_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

export interface GoogleServiceAccountKey {
  client_email: string;
  private_key: string;
}

export interface GoogleTtsClientOptions {
  /** Plain REST API key. Sufficient when the Google Cloud org allows API-key auth for TTS. */
  apiKey?: string;
  /** Service-account JSON key - either the parsed object, a raw JSON string, or a file path.
   * Required when the org policy rejects API keys ("API keys are not supported by this API").
   * This is machine-to-machine auth: the server signs a JWT with the service account's
   * private key and exchanges it for a short-lived OAuth2 access token. No user sign-in,
   * no browser interaction, no gcloud SDK or googleapis dependency. */
  serviceAccount?: GoogleServiceAccountKey | string;
  /** Default language for voice selection when a call doesn't specify one. */
  defaultLanguage?: 'en' | 'de';
  fetchImpl?: FetchLike;
  /** Injectable clock for token-expiry tests. */
  now?: () => number;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function loadServiceAccount(input: GoogleServiceAccountKey | string): GoogleServiceAccountKey {
  if (typeof input !== 'string') return input;
  const raw = input.trim().startsWith('{') ? input : readFileSync(input, 'utf8');
  const parsed = JSON.parse(raw) as GoogleServiceAccountKey;
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('Google service account JSON is missing client_email or private_key');
  }
  return parsed;
}

/**
 * Google Cloud Text-to-Speech client using the plain REST API - no gcloud SDK or
 * googleapis dependency (works in restricted corporate environments where the OpenAI
 * API is blocked). Supports two auth modes:
 *   1. API key (?key=...) - simplest, but some org policies reject it.
 *   2. Service account - self-signed JWT exchanged for an OAuth2 access token
 *      (cached until shortly before expiry). Use this when the API responds with
 *      401 "API keys are not supported by this API". Fully server-side; the user
 *      never authenticates against Google.
 * Implements the same DiscussionTtsLike shape as OpenAITtsClient.
 */
export class GoogleTtsClient {
  private readonly apiKey?: string;
  private readonly serviceAccount?: GoogleServiceAccountKey;
  private readonly defaultLanguage: 'en' | 'de';
  private readonly fetchImpl: FetchLike;
  private readonly now: () => number;

  private cachedToken: { token: string; expiresAtMs: number } | null = null;

  constructor(options: GoogleTtsClientOptions) {
    if (!options.apiKey && !options.serviceAccount) {
      throw new Error('GoogleTtsClient requires an apiKey or a serviceAccount');
    }
    this.apiKey = options.apiKey || undefined;
    this.serviceAccount = options.serviceAccount ? loadServiceAccount(options.serviceAccount) : undefined;
    this.defaultLanguage = options.defaultLanguage ?? 'en';
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init) as any);
    this.now = options.now ?? Date.now;
  }

  async renderTurn(text: string, voice: string, language?: 'en' | 'de'): Promise<Buffer> {
    const lang = language ?? this.defaultLanguage;
    const voiceName = VOICE_MAP[lang][voice] ?? VOICE_MAP[lang].alloy;

    // Prefer service-account OAuth2 when configured - API keys are rejected outright by
    // some Google Cloud org policies ("API keys are not supported by this API").
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    let url = 'https://texttospeech.googleapis.com/v1/text:synthesize';
    if (this.serviceAccount) {
      headers.authorization = `Bearer ${await this.getAccessToken()}`;
    } else {
      url += `?key=${this.apiKey}`;
    }

    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: LANGUAGE_CODES[lang], name: voiceName },
        audioConfig: { audioEncoding: 'MP3' }
      })
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Google TTS request failed (${response.status}): ${detail.slice(0, 300)}`);
    }

    const body = (await response.json()) as { audioContent?: string };
    if (!body.audioContent) {
      throw new Error('Google TTS response contained no audioContent');
    }
    return Buffer.from(body.audioContent, 'base64');
  }

  /** Self-signed JWT (RS256) → OAuth2 access token, cached until ~1 minute before expiry. */
  private async getAccessToken(): Promise<string> {
    const sa = this.serviceAccount!;
    if (this.cachedToken && this.cachedToken.expiresAtMs > this.now() + 60_000) {
      return this.cachedToken.token;
    }

    const nowSec = Math.floor(this.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(
      JSON.stringify({
        iss: sa.client_email,
        scope: TTS_SCOPE,
        aud: TOKEN_URL,
        iat: nowSec,
        exp: nowSec + 3600
      })
    );
    const signingInput = `${header}.${claims}`;
    const signature = createSign('RSA-SHA256').update(signingInput).sign(sa.private_key);
    const assertion = `${signingInput}.${base64url(signature)}`;

    const response = await this.fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(assertion)}`
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Google OAuth token exchange failed (${response.status}): ${detail.slice(0, 300)}`);
    }

    const body = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) {
      throw new Error('Google OAuth token response contained no access_token');
    }
    this.cachedToken = {
      token: body.access_token,
      expiresAtMs: this.now() + (body.expires_in ?? 3600) * 1000
    };
    return body.access_token;
  }
}
