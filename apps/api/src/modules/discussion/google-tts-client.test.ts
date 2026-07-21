import { describe, it, expect, vi } from 'vitest';
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
