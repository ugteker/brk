import { describe, expect, it } from 'vitest';
import { validateCreateAgentInput } from './validation';

describe('validateCreateAgentInput', () => {
  it('rejects interval below 60 minutes', () => {
    const result = validateCreateAgentInput({
      name: 'Tech Agent',
      sources: [{ type: 'web_urls', value: 'https://example.com' }],
      schedule: { mode: 'interval', intervalMinutes: 30 },
      preferences: { sector: ['tech'] }
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('intervalMinutes must be >= 60');
  });

  it('rejects a source maxItems outside the 1-10 range', () => {
    const result = validateCreateAgentInput({
      name: 'Tech Agent',
      sources: [{ type: 'web_urls', value: 'https://example.com', maxItems: 25 }],
      schedule: { mode: 'interval', intervalMinutes: 60 },
      preferences: { sector: ['tech'] }
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('maxItems must be an integer between 1 and 10');
  });

  it('accepts a valid source maxItems', () => {
    const result = validateCreateAgentInput({
      name: 'Tech Agent',
      sources: [{ type: 'web_urls', value: 'https://example.com', maxItems: 5 }],
      schedule: { mode: 'interval', intervalMinutes: 60 },
      preferences: { sector: ['tech'] }
    });

    expect(result.ok).toBe(true);
  });

  it('rejects unsupported character types', () => {
    const result = validateCreateAgentInput({
      name: 'Tech Agent',
      characterType: 'comedian' as never,
      promptConfig: {},
      sources: [{ type: 'web_urls', value: 'https://example.com' }],
      schedule: { mode: 'interval', intervalMinutes: 60 },
      preferences: { sector: ['tech'] }
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('characterType must be one of: finance_expert, teacher, trainer, philosopher, influencer, summarizer');
  });

  it('requires risk_level for finance_expert', () => {
    const result = validateCreateAgentInput({
      name: 'Finance Agent',
      characterType: 'finance_expert',
      promptConfig: { tone: 'professional' },
      sources: [{ type: 'web_urls', value: 'https://example.com' }],
      schedule: { mode: 'interval', intervalMinutes: 60 },
      preferences: { sector: ['finance'] }
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('promptConfig.risk_level is required for finance_expert');
  });

  it('rejects risk_level for non-finance characters', () => {
    const result = validateCreateAgentInput({
      name: 'Teacher Agent',
      characterType: 'teacher',
      promptConfig: { risk_level: 'moderate' },
      sources: [{ type: 'web_urls', value: 'https://example.com' }],
      schedule: { mode: 'interval', intervalMinutes: 60 },
      preferences: { sector: ['education'] }
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('promptConfig.risk_level is only allowed for finance_expert');
  });

  it('accepts risk_level for finance_expert', () => {
    const result = validateCreateAgentInput({
      name: 'Finance Agent',
      characterType: 'finance_expert',
      promptConfig: { risk_level: 'moderate' },
      sources: [{ type: 'web_urls', value: 'https://example.com' }],
      schedule: { mode: 'interval', intervalMinutes: 60 },
      preferences: { sector: ['finance'] }
    });

    expect(result.ok).toBe(true);
  });

  it('rejects recipients in agent payload because recipients are playbook-owned', () => {
    const result = validateCreateAgentInput({
      name: 'Tech Agent',
      sources: [{ type: 'web_urls', value: 'https://example.com' }],
      schedule: { mode: 'interval', intervalMinutes: 60 },
      recipients: ['ops@example.com'],
      preferences: { sector: ['tech'] }
    } as any);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('recipients are managed on playbooks');
  });
});
