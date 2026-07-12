import { describe, expect, it } from 'vitest';
import { validateCreateAgentInput } from './validation';

describe('validateCreateAgentInput', () => {
  it('rejects interval below 60 minutes', () => {
    const result = validateCreateAgentInput({
      name: 'Tech Agent',
      sources: [{ type: 'web_urls', value: 'https://example.com' }],
      schedule: { mode: 'interval', intervalMinutes: 30 },
      recipients: ['ops@example.com'],
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
      recipients: ['ops@example.com'],
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
      recipients: ['ops@example.com'],
      preferences: { sector: ['tech'] }
    });

    expect(result.ok).toBe(true);
  });
});
