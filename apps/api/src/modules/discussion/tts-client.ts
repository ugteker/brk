export interface OpenAIAudioClient {
  audio: {
    speech: {
      create(params: { model: string; voice: string; input: string }): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;
    };
  };
}

export class OpenAITtsClient {
  constructor(private readonly openai: OpenAIAudioClient) {}

  async renderTurn(text: string, voice: string): Promise<Buffer> {
    const response = await this.openai.audio.speech.create({ model: 'tts-1', voice, input: text });
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
