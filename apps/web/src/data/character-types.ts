import type { CharacterType } from '../api/agents';

/**
 * Single source of truth for a character type's pill/tag color and emoji, so the same
 * persona always renders with the same identity across every view (Agents hub, Reports,
 * Studio, etc). Previously `AgentsPage.tsx` and `AgentReportsBrowser.tsx` each maintained
 * their own copy of this map and had drifted out of sync (every color disagreed except
 * `summarizer`) - this is now the only place either should be defined.
 */
export const CHARACTER_TYPE_COLORS: Record<CharacterType, string> = {
  finance_expert: 'blue',
  teacher: 'purple',
  influencer: 'orange',
  trainer: 'volcano',
  philosopher: 'cyan',
  summarizer: 'default'
};

export const CHARACTER_TYPE_EMOJI: Record<CharacterType, string> = {
  finance_expert: '📈',
  teacher: '🎓',
  influencer: '📣',
  trainer: '💪',
  philosopher: '🦉',
  summarizer: '📋'
};

const DEFAULT_CHARACTER_TYPE_COLOR = 'default';
const DEFAULT_CHARACTER_TYPE_EMOJI = '🤖';

export function getCharacterTypeColor(characterType?: string | null): string {
  if (!characterType || !(characterType in CHARACTER_TYPE_COLORS)) return DEFAULT_CHARACTER_TYPE_COLOR;
  return CHARACTER_TYPE_COLORS[characterType as CharacterType];
}

export function getCharacterTypeEmoji(characterType?: string | null): string {
  if (!characterType || !(characterType in CHARACTER_TYPE_EMOJI)) return DEFAULT_CHARACTER_TYPE_EMOJI;
  return CHARACTER_TYPE_EMOJI[characterType as CharacterType];
}
