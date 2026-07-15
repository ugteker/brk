export type ResourceType = 'agent' | 'source' | 'playbook';
export type AccessAction = 'read' | 'create' | 'update' | 'delete' | 'run' | (string & {});
export type AccessActorRole = 'user' | 'admin';

export interface AccessRequest {
  actorUserId: string;
  actorRole: AccessActorRole;
  resourceType: ResourceType;
  resourceId: string;
  action: AccessAction;
}

export interface AccessDecision {
  allowed: boolean;
  reason: 'admin' | 'owner' | 'grant' | 'denied';
}
