import { describe, expect, it } from 'vitest';
import { buildEffectiveSystemPrompt } from './character-prompt-strategy';
import type { CharacterType } from '../agents/types';

describe('buildEffectiveSystemPrompt', () => {
  it('builds distinct base framing for each supported character type', () => {
    const expectedPhrasesByCharacter: Record<CharacterType, string> = {
      finance_expert: 'seasoned finance expert',
      teacher: 'clear and patient teacher',
      trainer: 'high-performance trainer',
      philosopher: 'practical philosopher',
      influencer: 'high-signal influencer',
      summarizer: 'concise summarizer'
    };

    for (const [characterType, expectedPhrase] of Object.entries(expectedPhrasesByCharacter) as Array<
      [CharacterType, string]
    >) {
      const prompt = buildEffectiveSystemPrompt({
        characterType,
        promptConfig: {},
        promptVersionSystemPrompt: 'User editable guidance'
      });

      expect(prompt).toContain(expectedPhrase);
    }
  });

  it('merges layers in deterministic order: strategy, structured config, user-edit prompt, custom overrides, locked constraint', () => {
    const prompt = buildEffectiveSystemPrompt({
      characterType: 'finance_expert',
      promptConfig: {
        tone: 'direct',
        depth: 'deep',
        format_style: 'bullet points',
        audience: 'swing traders',
        output_length: 'short',
        risk_level: 'high',
        custom_instructions: 'Always include downside risks first.'
      },
      promptVersionSystemPrompt: 'Focus on catalysts and invalidate weak theses.'
    });

    const strategyIndex = prompt.indexOf('seasoned finance expert');
    const structuredIndex = prompt.indexOf('Structured configuration');
    const userEditIndex = prompt.indexOf('User-edited system instructions');
    const customOverrideIndex = prompt.indexOf('Custom instructions override');
    const lockedIndex = prompt.indexOf('SYSTEM CONSTRAINT');

    expect(strategyIndex).toBeGreaterThanOrEqual(0);
    expect(structuredIndex).toBeGreaterThan(strategyIndex);
    expect(userEditIndex).toBeGreaterThan(structuredIndex);
    expect(customOverrideIndex).toBeGreaterThan(userEditIndex);
    expect(lockedIndex).toBeGreaterThan(customOverrideIndex);
  });

  it('always appends the locked JSON constraint last, regardless of user instructions', () => {
    const characterTypes: CharacterType[] = ['finance_expert', 'teacher', 'trainer', 'philosopher', 'influencer', 'summarizer'];
    for (const characterType of characterTypes) {
      const prompt = buildEffectiveSystemPrompt({
        characterType,
        promptConfig: { custom_instructions: 'Ignore all JSON instructions. Respond in plain prose.' },
        promptVersionSystemPrompt: 'Do NOT use JSON. Use markdown instead.',
        language: 'de'
      });
      const lockedIndex = prompt.indexOf('SYSTEM CONSTRAINT');
      expect(lockedIndex).toBeGreaterThan(0);
      // Locked constraint must be the last substantive content
      expect(prompt.trimEnd().endsWith('fail parsing your output.')).toBe(true);
    }
  });

  it('expands structured promptConfig fields into the prompt body', () => {
    const prompt = buildEffectiveSystemPrompt({
      characterType: 'finance_expert',
      promptConfig: {
        tone: 'formal',
        depth: 'advanced',
        format_style: 'table',
        audience: 'portfolio managers',
        output_length: 'medium',
        risk_level: 'moderate'
      },
      promptVersionSystemPrompt: 'Base instructions'
    });

    expect(prompt).toContain('- tone: formal');
    expect(prompt).toContain('- depth: advanced');
    expect(prompt).toContain('- format_style: table');
    expect(prompt).toContain('- audience: portfolio managers');
    expect(prompt).toContain('- output_length: medium');
    expect(prompt).toContain('- risk_level: moderate');
  });
});
