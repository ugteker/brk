import { CHARACTER_TYPES, DEFAULT_CHARACTER_TYPE } from './types';
import type { CharacterType, CreateAgentInput, PromptConfig, ValidationResult } from './types';

function validateCharacterPromptRules(characterType: CharacterType, promptConfig: PromptConfig, errors: string[]): void {
  if (characterType === 'finance_expert') {
    if (typeof promptConfig.risk_level !== 'string' || promptConfig.risk_level.trim().length === 0) {
      errors.push('promptConfig.risk_level is required for finance_expert');
    }
    return;
  }

  if ('risk_level' in promptConfig) {
    errors.push('promptConfig.risk_level is only allowed for finance_expert');
  }
}

function validateCharacterTypeValue(characterType: string | undefined, errors: string[]): CharacterType {
  const resolved = (characterType ?? DEFAULT_CHARACTER_TYPE) as string;
  if (!CHARACTER_TYPES.includes(resolved as CharacterType)) {
    errors.push(`characterType must be one of: ${CHARACTER_TYPES.join(', ')}`);
    return DEFAULT_CHARACTER_TYPE;
  }
  return resolved as CharacterType;
}

export function validateCreateAgentInput(input: CreateAgentInput): ValidationResult {
  const errors: string[] = [];
  const characterType = validateCharacterTypeValue(input.characterType, errors);
  const promptConfig = input.promptConfig ?? {};
  const sources = input.sources ?? [];

  if (!input.name.trim()) errors.push('name is required');
  if (sources.length > 50) errors.push('sources per agent must be <= 50');
  if ('recipients' in input && input.recipients !== undefined) {
    errors.push('recipients are managed on playbooks');
  }
  for (const source of sources) {
    if (source.maxItems !== undefined && (!Number.isInteger(source.maxItems) || source.maxItems < 1 || source.maxItems > 10)) {
      errors.push('maxItems must be an integer between 1 and 10');
    }
  }

  if (input.schedule?.mode === 'interval' && input.schedule.intervalMinutes < 60) {
    errors.push('intervalMinutes must be >= 60');
  }

  if (input.schedule?.mode === 'weekly' && input.schedule.daysOfWeek.length === 0) {
    errors.push('weekly schedule requires at least one day of week');
  }

  validateCharacterPromptRules(characterType, promptConfig, errors);

  return { ok: errors.length === 0, errors };
}

export function validatePatchAgentInput(existing: { characterType?: CharacterType; promptConfig?: PromptConfig }, patch: Partial<CreateAgentInput>): ValidationResult {
  const errors: string[] = [];
  const characterType = validateCharacterTypeValue((patch.characterType ?? existing.characterType) as string | undefined, errors);
  const promptConfig = patch.promptConfig ?? existing.promptConfig ?? {};

  validateCharacterPromptRules(characterType, promptConfig, errors);

  return { ok: errors.length === 0, errors };
}
