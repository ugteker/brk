export interface DiscussionTtsLike {
  renderTurn(text: string, voice: string, language?: 'en' | 'de'): Promise<Buffer>;
}

export interface DiscussionTtsClients {
  google?: DiscussionTtsLike;
  openai?: DiscussionTtsLike;
}

export interface DiscussionTtsStorageLike {
  save(key: string, buffer: Buffer): Promise<string>;
}

export interface TurnAudioUrlRepository {
  updateTurnAudioUrl(turnId: string, audioUrl: string): Promise<void>;
}

export function resolveDiscussionTtsClient(
  clients: DiscussionTtsClients | undefined,
  fallback: DiscussionTtsLike | undefined,
  provider?: 'auto' | 'google' | 'openai'
): DiscussionTtsLike | null {
  if (provider === 'google' || provider === 'openai') return clients?.[provider] ?? null;
  return clients?.openai ?? clients?.google ?? fallback ?? null;
}

export async function renderDiscussionTurnAudio({
  runId,
  turn,
  voice,
  language,
  ttsClient,
  ttsStorage,
  repository
}: {
  runId: string;
  turn: { id: string; turnIndex: number; content: string };
  voice: string;
  language: 'en' | 'de';
  ttsClient: DiscussionTtsLike;
  ttsStorage: DiscussionTtsStorageLike;
  repository: TurnAudioUrlRepository;
}): Promise<Buffer> {
  const buffer = await ttsClient.renderTurn(turn.content, voice, language);
  const audioUrl = await ttsStorage.save(`${runId}-turn-${turn.turnIndex}`, buffer);
  await repository.updateTurnAudioUrl(turn.id, audioUrl);
  return buffer;
}
