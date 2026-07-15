import type { PrismaClient } from '@prisma/client';
import type { AccessAction, ResourceType } from './types';

type AccessDb = Pick<PrismaClient, 'agent' | 'source' | 'playbook' | 'accessGrant' | 'marketplacePublication'>;

export interface GrantLookup {
  granteeUserId: string;
  resourceType: ResourceType;
  resourceId: string;
  permission: AccessAction;
}

export interface AccessRepositoryLike {
  findOwnerUserId(resourceType: ResourceType, resourceId: string): Promise<string | null>;
  hasGrant(input: GrantLookup): Promise<boolean>;
  isPubliclyPublished(resourceType: ResourceType, resourceId: string): Promise<boolean>;
}

export class AccessRepository implements AccessRepositoryLike {
  constructor(private readonly db: AccessDb) {}

  async findOwnerUserId(resourceType: ResourceType, resourceId: string): Promise<string | null> {
    if (resourceType === 'agent') {
      const row = await this.db.agent.findUnique({ where: { id: resourceId }, select: { ownerUserId: true } });
      return row?.ownerUserId ?? null;
    }

    if (resourceType === 'source') {
      const row = await this.db.source.findUnique({ where: { id: resourceId }, select: { ownerUserId: true } });
      return row?.ownerUserId ?? null;
    }

    const row = await this.db.playbook.findUnique({
      where: { id: resourceId },
      select: { agent: { select: { ownerUserId: true } } }
    });
    return row?.agent.ownerUserId ?? null;
  }

  async hasGrant(input: GrantLookup): Promise<boolean> {
    const row = await this.db.accessGrant.findFirst({
      where: {
        granteeUserId: input.granteeUserId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        permission: { in: [input.permission, '*'] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
      },
      select: { id: true }
    });

    return Boolean(row);
  }

  async isPubliclyPublished(resourceType: ResourceType, resourceId: string): Promise<boolean> {
    const row = await this.db.marketplacePublication.findFirst({
      where: {
        resourceType,
        resourceId,
        visibility: 'public',
        status: 'published',
        retiredAt: null
      },
      select: { id: true }
    });
    return Boolean(row);
  }
}
