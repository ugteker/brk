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
});
