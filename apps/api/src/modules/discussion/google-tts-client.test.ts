import { describe, it, expect, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { GoogleTtsClient } from './google-tts-client';

function makeFetch(body: unknown = { audioContent: Buffer.from([1, 2, 3, 4]).toString('base64') }, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  });
}

describe('GoogleTtsClient', () => {
  it('calls the Google TTS REST endpoint with the API key and returns a decoded Buffer', async () => {
    const fetchImpl = makeFetch();
    const client = new GoogleTtsClient({ apiKey: 'test-key', fetchImpl });
    const result = await client.renderTurn('Hello world', 'alloy');

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBe(4);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://texttospeech.googleapis.com/v1/text:synthesize?key=test-key',
      expect.objectContaining({ method: 'POST' })
    );
    const payload = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(payload.input.text).toBe('Hello world');
    expect(payload.voice.languageCode).toBe('en-US');
    expect(payload.audioConfig.audioEncoding).toBe('MP3');
  });

  it('maps stored OpenAI voice IDs to Google voice names (en)', async () => {
    const fetchImpl = makeFetch();
    const client = new GoogleTtsClient({ apiKey: 'k', fetchImpl });
    await client.renderTurn('test', 'nova');
    const payload = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(payload.voice.name).toBe('en-US-Neural2-E');
  });

  it('uses German voices when language is de', async () => {
    const fetchImpl = makeFetch();
    const client = new GoogleTtsClient({ apiKey: 'k', fetchImpl });
    await client.renderTurn('Hallo zusammen', 'onyx', 'de');
    const payload = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(payload.voice.languageCode).toBe('de-DE');
    expect(payload.voice.name).toBe('de-DE-Neural2-B');
  });

  it('respects a de defaultLanguage when no per-call language is given', async () => {
    const fetchImpl = makeFetch();
    const client = new GoogleTtsClient({ apiKey: 'k', defaultLanguage: 'de', fetchImpl });
    await client.renderTurn('Hallo', 'alloy');
    const payload = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(payload.voice.languageCode).toBe('de-DE');
  });

  it('falls back to the alloy mapping for unknown voice IDs', async () => {
    const fetchImpl = makeFetch();
    const client = new GoogleTtsClient({ apiKey: 'k', fetchImpl });
    await client.renderTurn('test', 'not-a-voice');
    const payload = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(payload.voice.name).toBe('en-US-Neural2-C');
  });

  it('throws a descriptive error on a non-OK response', async () => {
    const fetchImpl = makeFetch({ error: { message: 'API key not valid' } }, false, 403);
    const client = new GoogleTtsClient({ apiKey: 'bad', fetchImpl });
    await expect(client.renderTurn('x', 'alloy')).rejects.toThrow(/Google TTS request failed \(403\)/);
  });

  it('throws when the response has no audioContent', async () => {
    const fetchImpl = makeFetch({});
    const client = new GoogleTtsClient({ apiKey: 'k', fetchImpl });
    await expect(client.renderTurn('x', 'alloy')).rejects.toThrow(/no audioContent/);
  });
});

describe('GoogleTtsClient with service account (OAuth2, no user sign-in)', () => {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' }
  });
  const serviceAccount = { client_email: 'tts@my-project.iam.gserviceaccount.com', private_key: privateKey as unknown as string };
  const audio = { audioContent: Buffer.from([9, 9]).toString('base64') };

  function makeSaFetch() {
    return vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('oauth2.googleapis.com/token')) {
        return { ok: true, status: 200, json: async () => ({ access_token: 'tok-123', expires_in: 3600 }), text: async () => '' };
      }
      return { ok: true, status: 200, json: async () => audio, text: async () => '' };
    });
  }

  it('exchanges a self-signed JWT for an access token and calls TTS with a Bearer header (no ?key=)', async () => {
    const fetchImpl = makeSaFetch();
    const client = new GoogleTtsClient({ serviceAccount, fetchImpl });
    const result = await client.renderTurn('Hello', 'alloy');

    expect(result.length).toBe(2);
    const tokenCall = fetchImpl.mock.calls.find((c) => (c[0] as string).includes('oauth2.googleapis.com'))!;
    expect(tokenCall[1].body).toContain('urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer');
    const ttsCall = fetchImpl.mock.calls.find((c) => (c[0] as string).includes('texttospeech.googleapis.com'))!;
    expect(ttsCall[0]).not.toContain('?key=');
    expect(ttsCall[1].headers.authorization).toBe('Bearer tok-123');
  });

  it('caches the access token across calls until expiry', async () => {
    let nowMs = 1_000_000;
    const fetchImpl = makeSaFetch();
    const client = new GoogleTtsClient({ serviceAccount, fetchImpl, now: () => nowMs });

    await client.renderTurn('one', 'alloy');
    await client.renderTurn('two', 'alloy');
    const tokenCalls = () => fetchImpl.mock.calls.filter((c) => (c[0] as string).includes('oauth2.googleapis.com')).length;
    expect(tokenCalls()).toBe(1);

    nowMs += 3600 * 1000; // past expiry
    await client.renderTurn('three', 'alloy');
    expect(tokenCalls()).toBe(2);
  });

  it('accepts the service account as a raw JSON string', async () => {
    const fetchImpl = makeSaFetch();
    const client = new GoogleTtsClient({ serviceAccount: JSON.stringify(serviceAccount), fetchImpl });
    const result = await client.renderTurn('Hello', 'nova');
    expect(result.length).toBe(2);
  });

  it('prefers the service account over an API key when both are configured', async () => {
    const fetchImpl = makeSaFetch();
    const client = new GoogleTtsClient({ apiKey: 'also-set', serviceAccount, fetchImpl });
    await client.renderTurn('Hello', 'alloy');
    const ttsCall = fetchImpl.mock.calls.find((c) => (c[0] as string).includes('texttospeech.googleapis.com'))!;
    expect(ttsCall[0]).not.toContain('?key=');
    expect(ttsCall[1].headers.authorization).toBe('Bearer tok-123');
  });

  it('throws a descriptive error when the token exchange fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false, status: 400, json: async () => ({}), text: async () => 'invalid_grant'
    });
    const client = new GoogleTtsClient({ serviceAccount, fetchImpl });
    await expect(client.renderTurn('x', 'alloy')).rejects.toThrow(/token exchange failed \(400\)/);
  });

  it('rejects construction without any credentials', () => {
    expect(() => new GoogleTtsClient({} as any)).toThrow(/apiKey or a serviceAccount/);
  });
});
