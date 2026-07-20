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

/**
 * Tailwind classes for the small persona "icon chip" (rounded square behind the emoji)
 * shown on report/feed cards. Kept next to the color/emoji maps so a character's whole
 * visual identity lives in one place. Full literal class strings (not composed) so
 * Tailwind's JIT scanner picks them up.
 */
export const CHARACTER_TYPE_ICON_BG: Record<CharacterType, string> = {
  finance_expert: 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300',
  teacher: 'bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-300',
  influencer: 'bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-300',
  trainer: 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300',
  philosopher: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-950 dark:text-cyan-300',
  summarizer: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
};

const DEFAULT_CHARACTER_TYPE_COLOR = 'default';
const DEFAULT_CHARACTER_TYPE_EMOJI = '🤖';
const DEFAULT_CHARACTER_TYPE_ICON_BG = 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400';

export function getCharacterTypeColor(characterType?: string | null): string {
  if (!characterType || !(characterType in CHARACTER_TYPE_COLORS)) return DEFAULT_CHARACTER_TYPE_COLOR;
  return CHARACTER_TYPE_COLORS[characterType as CharacterType];
}

export function getCharacterTypeEmoji(characterType?: string | null): string {
  if (!characterType || !(characterType in CHARACTER_TYPE_EMOJI)) return DEFAULT_CHARACTER_TYPE_EMOJI;
  return CHARACTER_TYPE_EMOJI[characterType as CharacterType];
}

export function getCharacterTypeIconBg(characterType?: string | null): string {
  if (!characterType || !(characterType in CHARACTER_TYPE_ICON_BG)) return DEFAULT_CHARACTER_TYPE_ICON_BG;
  return CHARACTER_TYPE_ICON_BG[characterType as CharacterType];
}
