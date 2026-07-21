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

export interface GoogleTtsClientOptions {
  apiKey: string;
  /** Default language for voice selection when a call doesn't specify one. */
  defaultLanguage?: 'en' | 'de';
  fetchImpl?: FetchLike;
}

/**
 * Google Cloud Text-to-Speech client using the plain REST API with an API key -
 * no service-account JSON or gcloud SDK needed (works in restricted corporate
 * environments where the OpenAI API is blocked). Implements the same
 * DiscussionTtsLike shape as OpenAITtsClient.
 */
export class GoogleTtsClient {
  private readonly apiKey: string;
  private readonly defaultLanguage: 'en' | 'de';
  private readonly fetchImpl: FetchLike;

  constructor(options: GoogleTtsClientOptions) {
    this.apiKey = options.apiKey;
    this.defaultLanguage = options.defaultLanguage ?? 'en';
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init) as any);
  }

  async renderTurn(text: string, voice: string, language?: 'en' | 'de'): Promise<Buffer> {
    const lang = language ?? this.defaultLanguage;
    const voiceName = VOICE_MAP[lang][voice] ?? VOICE_MAP[lang].alloy;

    const response = await this.fetchImpl(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: LANGUAGE_CODES[lang], name: voiceName },
          audioConfig: { audioEncoding: 'MP3' }
        })
      }
    );

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
}
