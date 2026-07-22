// Pure decision logic for the multi-process runtime: how many processes to
// fork and what each role is responsible for. Kept free of node:cluster /
// Fastify imports so it is trivially unit-testable.

export type Role = 'web' | 'worker' | 'all';

export interface CrashLoopGuard {
  /** Record an exit at nowMs. Returns true if a respawn is allowed, false if
   *  the process is crash-looping and the primary should give up. */
  recordExit(nowMs: number): boolean;
}

/**
 * Keeps a sliding window of recent exit timestamps. If more than maxExits
 * exits are recorded within windowMs milliseconds, recordExit returns false
 * to signal that the primary should stop respawning.
 */
export function createCrashLoopGuard(maxExits = 5, windowMs = 60_000): CrashLoopGuard {
  const exitTimestamps: number[] = [];
  return {
    recordExit(nowMs: number): boolean {
      const cutoff = nowMs - windowMs;
      while (exitTimestamps.length > 0 && exitTimestamps[0] < cutoff) {
        exitTimestamps.shift();
      }
      exitTimestamps.push(nowMs);
      return exitTimestamps.length <= maxExits;
    }
  };
}

export function parseWebConcurrency(raw: string | undefined): number {
  if (!raw) return 1;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return 1;
  return n;
}

export function resolveRole(raw: string | undefined): Role {
  if (raw === 'web' || raw === 'worker') return raw;
  return 'all';
}

export function planClusterProcesses(concurrency: number): Role[] {
  if (concurrency <= 1) return [];
  return [...Array<Role>(concurrency).fill('web'), 'worker'];
}

export function rolePlan(role: Role): { startHttp: boolean; startSchedulers: boolean } {
  return {
    startHttp: role === 'web' || role === 'all',
    startSchedulers: role === 'worker' || role === 'all'
  };
}
