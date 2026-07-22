// Pure decision logic for the multi-process runtime: how many processes to
// fork and what each role is responsible for. Kept free of node:cluster /
// Fastify imports so it is trivially unit-testable.

export type Role = 'web' | 'worker' | 'all';

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
