import { describe, it, expect, vi } from 'vitest';
import { OpenAITtsClient } from './tts-client';

describe('OpenAITtsClient', () => {
  it('calls openai.audio.speech.create and returns a Buffer', async () => {
    const fakeAudio = new Uint8Array([1, 2, 3, 4]).buffer;
    const mockOpenAI = {
      audio: {
        speech: {
          create: vi.fn().mockResolvedValue({ arrayBuffer: async () => fakeAudio })
        }
      }
    };
    const client = new OpenAITtsClient(mockOpenAI as any);
    const result = await client.renderTurn('Hello world', 'alloy');
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBe(4);
    expect(mockOpenAI.audio.speech.create).toHaveBeenCalledWith({
      model: 'tts-1',
      voice: 'alloy',
      input: 'Hello world'
    });
  });

  it('passes the specified voice', async () => {
    const mockOpenAI = {
      audio: {
        speech: {
          create: vi.fn().mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(0) })
        }
      }
    };
    const client = new OpenAITtsClient(mockOpenAI as any);
    await client.renderTurn('test', 'nova');
    expect(mockOpenAI.audio.speech.create).toHaveBeenCalledWith(expect.objectContaining({ voice: 'nova' }));
  });
});
