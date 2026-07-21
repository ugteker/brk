import { describe, expect, it } from 'vitest';
import { CHARACTER_TYPE_COLORS, CHARACTER_TYPE_EMOJI, getCharacterTypeColor, getCharacterTypeEmoji } from './character-types';

describe('character-types', () => {
  it('has exactly one color and one emoji per known character type', () => {
    const types = ['finance_expert', 'teacher', 'influencer', 'trainer', 'philosopher', 'summarizer'] as const;
    for (const type of types) {
      expect(CHARACTER_TYPE_COLORS[type]).toBeTruthy();
      expect(CHARACTER_TYPE_EMOJI[type]).toBeTruthy();
    }
  });

  it('getCharacterTypeColor returns the canonical color for a known type', () => {
    expect(getCharacterTypeColor('finance_expert')).toBe('blue');
    expect(getCharacterTypeColor('teacher')).toBe('purple');
  });

  it('getCharacterTypeColor falls back to "default" for an unknown/missing type', () => {
    expect(getCharacterTypeColor('not_a_real_type')).toBe('default');
    expect(getCharacterTypeColor(undefined)).toBe('default');
    expect(getCharacterTypeColor(null)).toBe('default');
  });

  it('getCharacterTypeEmoji returns the canonical emoji for a known type', () => {
    expect(getCharacterTypeEmoji('finance_expert')).toBe('📈');
    expect(getCharacterTypeEmoji('summarizer')).toBe('📋');
  });

  it('getCharacterTypeEmoji falls back to the robot emoji for an unknown/missing type', () => {
    expect(getCharacterTypeEmoji('not_a_real_type')).toBe('🤖');
    expect(getCharacterTypeEmoji(undefined)).toBe('🤖');
  });
});
