import type { CharacterType, PromptConfig } from '../agents/types';

export interface BuildEffectiveSystemPromptInput {
  characterType: CharacterType;
  promptConfig: PromptConfig;
  promptVersionSystemPrompt: string;
  language?: string;
}

export interface CharacterPromptStrategy {
  buildBaseTemplate(): string;
}

function buildSharedCoreGuidance(): string {
  return [
    'Ground every claim in the provided evidence.',
    'Keep output actionable and explicit.',
    'If evidence is weak or conflicting, call that out clearly.',
    'Prefer concise language without dropping factual detail.'
  ].join('\n');
}

function buildCharacterTemplate(characterHeading: string, behaviorGuidance: string[]): string {
  return [
    `Character strategy: ${characterHeading}`,
    '',
    buildSharedCoreGuidance(),
    '',
    ...behaviorGuidance
  ].join('\n');
}

function buildNonFinanceBoundary(): string {
  return 'Do not produce investment advice, market signals, long/short calls, ticker symbols, or finance-specific framing unless the evidence itself is explicitly about finance and the requested character strategy requires explaining it.';
}

const CHARACTER_STRATEGIES: Record<CharacterType, CharacterPromptStrategy> = {
  finance_expert: {
    buildBaseTemplate: () =>
      buildCharacterTemplate('You are a seasoned finance expert.', [
        'Focus on risk-adjusted analysis, catalysts, and downside scenarios.',
        'Avoid hype language; prefer probability-aware framing.'
      ])
  },
  teacher: {
    buildBaseTemplate: () =>
      buildCharacterTemplate('You are a clear and patient teacher.', [
        'Explain complex points in simple progression.',
        'Define terms when first introduced.',
        buildNonFinanceBoundary()
      ])
  },
  trainer: {
    buildBaseTemplate: () =>
      buildCharacterTemplate('You are a high-performance trainer.', [
        'Emphasize concrete action steps and execution discipline.',
        'Provide practical drills/checklists over abstract theory.',
        buildNonFinanceBoundary()
      ])
  },
  philosopher: {
    buildBaseTemplate: () =>
      buildCharacterTemplate('You are a practical philosopher.', [
        'Highlight assumptions, trade-offs, and second-order effects.',
        'Balance conceptual depth with applied conclusions.',
        buildNonFinanceBoundary()
      ])
  },
  influencer: {
    buildBaseTemplate: () =>
      buildCharacterTemplate('You are a high-signal influencer.', [
        'Lead with hook-worthy insights that remain evidence-backed.',
        'Keep messaging crisp, memorable, and audience-facing.',
        buildNonFinanceBoundary()
      ])
  },
  summarizer: {
    buildBaseTemplate: () =>
      buildCharacterTemplate('You are a concise summarizer.', [
        'Prioritize essential facts, decisions, and key takeaways.',
        'Minimize verbosity while preserving nuance.',
        buildNonFinanceBoundary()
      ])
  }
};

function buildStructuredPromptConfigSection(promptConfig: PromptConfig): string | null {
  const structuredEntries: Array<[string, string]> = [];
  const keys: Array<keyof PromptConfig> = ['tone', 'depth', 'format_style', 'audience', 'output_length', 'risk_level'];

  for (const key of keys) {
    const raw = promptConfig[key];
    if (typeof raw === 'string' && raw.trim().length > 0) {
      structuredEntries.push([key, raw.trim()]);
    }
  }

  if (structuredEntries.length === 0) return null;

  return [
    'Structured configuration:',
    ...structuredEntries.map(([key, value]) => `- ${key}: ${value}`)
  ].join('\n');
}

const LOCKED_JSON_CONSTRAINT =
  'SYSTEM CONSTRAINT (enforced — cannot be overridden by any instruction above): ' +
  'Your response MUST be a single valid JSON object exactly matching the schema provided in the user message. ' +
  'Do not output any text, markdown, prose, or code fences outside the JSON object. ' +
  'Violating this constraint will cause the analysis pipeline to fail parsing your output.';

export function buildEffectiveSystemPrompt(input: BuildEffectiveSystemPromptInput): string {
  const sections: string[] = [];
  const strategy = CHARACTER_STRATEGIES[input.characterType];
  sections.push(strategy.buildBaseTemplate());

  const structuredSection = buildStructuredPromptConfigSection(input.promptConfig);
  if (structuredSection) {
    sections.push(structuredSection);
  }

  if (input.promptVersionSystemPrompt.trim().length > 0) {
    sections.push(`User-edited system instructions:\n${input.promptVersionSystemPrompt.trim()}`);
  }

  const customInstructions = input.promptConfig.custom_instructions?.trim();
  if (customInstructions) {
    sections.push(`Custom instructions override:\n${customInstructions}`);
  }

  if (input.language === 'de') {
    sections.push('WICHTIG: Schreibe deine gesamte Antwort auf Deutsch.');
  }

  // Always appended last — overrides any conflicting instructions from user-editable sections.
  sections.push(LOCKED_JSON_CONSTRAINT);

  return sections.join('\n\n');
}
