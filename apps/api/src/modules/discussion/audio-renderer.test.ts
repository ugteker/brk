import { describe, expect, it, vi } from 'vitest';
import { renderDiscussionTurnAudio } from './audio-renderer';

describe('renderDiscussionTurnAudio', () => {
  it('renders and persists one turn using its stable per-turn storage key', async () => {
    const ttsClient = { renderTurn: vi.fn().mockResolvedValue(Buffer.from('audio')) };
    const ttsStorage = { save: vi.fn().mockResolvedValue('/api/discussions/audio/r1-turn-2.mp3') };
    const repository = { updateTurnAudioUrl: vi.fn().mockResolvedValue(undefined) };

    await renderDiscussionTurnAudio({
      runId: 'r1',
      turn: { id: 't2', turnIndex: 2, content: 'Hello there' },
      voice: 'nova',
      language: 'de',
      ttsClient,
      ttsStorage,
      repository
    });

    expect(ttsClient.renderTurn).toHaveBeenCalledWith('Hello there', 'nova', 'de');
    expect(ttsStorage.save).toHaveBeenCalledWith('r1-turn-2', Buffer.from('audio'));
    expect(repository.updateTurnAudioUrl).toHaveBeenCalledWith('t2', '/api/discussions/audio/r1-turn-2.mp3');
  });
});
