import { describe, expect, it, vi } from 'vitest';
import { DomainAccessResolver } from './permissions';
import type { AccessRepositoryLike } from './repository';

function createRepo(overrides: Partial<AccessRepositoryLike> = {}): AccessRepositoryLike {
  return {
    findOwnerUserId: vi.fn(async () => 'owner-1'),
    hasGrant: vi.fn(async () => false),
    isPubliclyPublished: vi.fn(async () => false),
    ...overrides
  };
}

describe('DomainAccessResolver', () => {
  it('allows all actions for admins', async () => {
    const repo = createRepo();
    const resolver = new DomainAccessResolver(repo);

    const decision = await resolver.resolve({
      actorUserId: 'admin-1',
      actorRole: 'admin',
      resourceType: 'agent',
      resourceId: 'agent-1',
      action: 'delete'
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe('admin');
    expect(repo.findOwnerUserId).not.toHaveBeenCalled();
  });

  it('allows all actions for resource owner', async () => {
    const resolver = new DomainAccessResolver(createRepo());

    const decision = await resolver.resolve({
      actorUserId: 'owner-1',
      actorRole: 'user',
      resourceType: 'source',
      resourceId: 'source-1',
      action: 'update'
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe('owner');
  });

  it('allows only explicitly granted actions for shared users', async () => {
    const repo = createRepo({
      hasGrant: vi.fn(async ({ permission }) => permission === 'read')
    });
    const resolver = new DomainAccessResolver(repo);

    const readDecision = await resolver.resolve({
      actorUserId: 'shared-1',
      actorRole: 'user',
      resourceType: 'playbook',
      resourceId: 'playbook-1',
      action: 'read'
    });
    const updateDecision = await resolver.resolve({
      actorUserId: 'shared-1',
      actorRole: 'user',
      resourceType: 'playbook',
      resourceId: 'playbook-1',
      action: 'update'
    });

    expect(readDecision.allowed).toBe(true);
    expect(readDecision.reason).toBe('grant');
    expect(updateDecision.allowed).toBe(false);
    expect(updateDecision.reason).toBe('denied');
  });

  it('denies access for non-owner users without grant', async () => {
    const resolver = new DomainAccessResolver(createRepo());

    const decision = await resolver.resolve({
      actorUserId: 'user-2',
      actorRole: 'user',
      resourceType: 'agent',
      resourceId: 'agent-1',
      action: 'read'
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('denied');
  });
});
