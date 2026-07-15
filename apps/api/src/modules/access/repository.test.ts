import { describe, expect, it, vi } from 'vitest';
import { AccessRepository } from './repository';

describe('AccessRepository', () => {
  it('returns resource owner for each supported resource type', async () => {
    const db = {
      agent: { findUnique: vi.fn(async () => ({ ownerUserId: 'agent-owner' })) },
      source: { findUnique: vi.fn(async () => ({ ownerUserId: 'source-owner' })) },
      playbook: { findUnique: vi.fn(async () => ({ agent: { ownerUserId: 'playbook-owner' } })) }
    };
    const repo = new AccessRepository(db as never);

    await expect(repo.findOwnerUserId('agent', 'agent-1')).resolves.toBe('agent-owner');
    await expect(repo.findOwnerUserId('source', 'source-1')).resolves.toBe('source-owner');
    await expect(repo.findOwnerUserId('playbook', 'playbook-1')).resolves.toBe('playbook-owner');
  });

  it('treats wildcard grants as allowed action grants', async () => {
    const db = {
      accessGrant: {
        findFirst: vi.fn(async ({ where }: { where: { permission: { in: string[] } } }) =>
          where.permission.in.includes('*') ? { id: 'grant-1' } : null
        )
      }
    };
    const repo = new AccessRepository(db as never);

    await expect(
      repo.hasGrant({
        granteeUserId: 'shared-user',
        resourceType: 'agent',
        resourceId: 'agent-1',
        permission: 'delete'
      })
    ).resolves.toBe(true);
  });

  it('returns true only for active public publications', async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({ id: 'pub-1' })
      .mockResolvedValueOnce(null);
    const db = { marketplacePublication: { findFirst } };
    const repo = new AccessRepository(db as never);

    await expect(repo.isPubliclyPublished('source', 'source-1')).resolves.toBe(true);
    await expect(repo.isPubliclyPublished('source', 'source-2')).resolves.toBe(false);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          visibility: 'public',
          status: 'published',
          retiredAt: null
        })
      })
    );
  });
});
