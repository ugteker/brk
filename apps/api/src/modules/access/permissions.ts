import type { AccessDecision, AccessRequest } from './types';
import type { AccessRepositoryLike } from './repository';

export class DomainAccessResolver {
  constructor(private readonly repository: AccessRepositoryLike) {}

  async resolve(input: AccessRequest): Promise<AccessDecision> {
    if (input.actorRole === 'admin') {
      return { allowed: true, reason: 'admin' };
    }

    const ownerUserId = await this.repository.findOwnerUserId(input.resourceType, input.resourceId);
    if (ownerUserId === input.actorUserId) {
      return { allowed: true, reason: 'owner' };
    }

    const granted = await this.repository.hasGrant({
      granteeUserId: input.actorUserId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      permission: input.action
    });
    if (granted) {
      return { allowed: true, reason: 'grant' };
    }

    return { allowed: false, reason: 'denied' };
  }
}
