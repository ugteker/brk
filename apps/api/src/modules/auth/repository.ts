import type { PrismaClient } from '@prisma/client';
import type { UserRecord } from './types';

export interface UserRepositoryLike {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  findByGoogleId(googleId: string): Promise<UserRecord | null>;
  createWithPassword(email: string, passwordHash: string, displayName?: string | null): Promise<UserRecord>;
  createWithGoogle(email: string, googleId: string, displayName?: string | null): Promise<UserRecord>;
  linkGoogleId(userId: string, googleId: string): Promise<UserRecord>;
}

type UserDb = Pick<PrismaClient, 'user'>;

export class UserRepository implements UserRepositoryLike {
  constructor(private readonly db: UserDb) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    return this.db.user.findUnique({ where: { email } });
  }

  async findById(id: string): Promise<UserRecord | null> {
    return this.db.user.findUnique({ where: { id } });
  }

  async findByGoogleId(googleId: string): Promise<UserRecord | null> {
    return this.db.user.findUnique({ where: { googleId } });
  }

  async createWithPassword(email: string, passwordHash: string, displayName: string | null = null): Promise<UserRecord> {
    return this.db.user.create({ data: { email, passwordHash, displayName } });
  }

  async createWithGoogle(email: string, googleId: string, displayName: string | null = null): Promise<UserRecord> {
    return this.db.user.create({ data: { email, googleId, displayName } });
  }

  async linkGoogleId(userId: string, googleId: string): Promise<UserRecord> {
    return this.db.user.update({ where: { id: userId }, data: { googleId } });
  }
}
