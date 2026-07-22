import { describe, expect, it } from 'vitest';
import { createCrashLoopGuard, parseWebConcurrency, planClusterProcesses, resolveRole, rolePlan } from './roles';

describe('parseWebConcurrency', () => {
  it('defaults to 1 when unset', () => {
    expect(parseWebConcurrency(undefined)).toBe(1);
  });

  it('parses a positive integer', () => {
    expect(parseWebConcurrency('4')).toBe(4);
  });

  it('falls back to 1 for garbage, zero and negatives', () => {
    expect(parseWebConcurrency('banana')).toBe(1);
    expect(parseWebConcurrency('0')).toBe(1);
    expect(parseWebConcurrency('-2')).toBe(1);
    expect(parseWebConcurrency('2.7')).toBe(1);
  });
});

describe('resolveRole', () => {
  it('defaults to all', () => {
    expect(resolveRole(undefined)).toBe('all');
  });

  it('accepts web and worker', () => {
    expect(resolveRole('web')).toBe('web');
    expect(resolveRole('worker')).toBe('worker');
  });

  it('treats unknown values as all', () => {
    expect(resolveRole('bogus')).toBe('all');
  });
});

describe('planClusterProcesses', () => {
  it('returns no children for concurrency 1 (single-process mode)', () => {
    expect(planClusterProcesses(1)).toEqual([]);
  });

  it('returns n web children plus exactly one worker', () => {
    expect(planClusterProcesses(3)).toEqual(['web', 'web', 'web', 'worker']);
  });
});

describe('rolePlan', () => {
  it('web starts http only', () => {
    expect(rolePlan('web')).toEqual({ startHttp: true, startSchedulers: false });
  });

  it('worker starts schedulers only', () => {
    expect(rolePlan('worker')).toEqual({ startHttp: false, startSchedulers: true });
  });

  it('all starts both', () => {
    expect(rolePlan('all')).toEqual({ startHttp: true, startSchedulers: true });
  });
});

describe('createCrashLoopGuard', () => {
  it('allows up to maxExits within the window', () => {
    const guard = createCrashLoopGuard(5, 60_000);
    for (let i = 0; i < 5; i++) {
      expect(guard.recordExit(0)).toBe(true);
    }
  });

  it('returns false on the exit after maxExits within the window', () => {
    const guard = createCrashLoopGuard(5, 60_000);
    for (let i = 0; i < 5; i++) {
      guard.recordExit(0);
    }
    expect(guard.recordExit(0)).toBe(false);
  });

  it('forgets exits older than the window and allows respawn again', () => {
    const guard = createCrashLoopGuard(5, 60_000);
    for (let i = 0; i < 6; i++) {
      guard.recordExit(0);
    }
    // Advance well past the window so all prior exits fall outside it
    expect(guard.recordExit(60_001)).toBe(true);
  });
});
