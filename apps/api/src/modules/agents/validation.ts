import type { CreateAgentInput, ValidationResult } from './types';

export function validateCreateAgentInput(input: CreateAgentInput): ValidationResult {
  const errors: string[] = [];

  if (!input.name.trim()) errors.push('name is required');
  if (input.sources.length === 0) errors.push('at least one source is required');
  if (input.sources.length > 50) errors.push('sources per agent must be <= 50');
  for (const source of input.sources) {
    if (source.maxItems !== undefined && (!Number.isInteger(source.maxItems) || source.maxItems < 1 || source.maxItems > 10)) {
      errors.push('maxItems must be an integer between 1 and 10');
    }
  }
  if (input.recipients.length === 0) errors.push('at least one recipient is required');

  if (input.schedule.mode === 'interval' && input.schedule.intervalMinutes < 60) {
    errors.push('intervalMinutes must be >= 60');
  }

  if (input.schedule.mode === 'weekly' && input.schedule.daysOfWeek.length === 0) {
    errors.push('weekly schedule requires at least one day of week');
  }

  return { ok: errors.length === 0, errors };
}
