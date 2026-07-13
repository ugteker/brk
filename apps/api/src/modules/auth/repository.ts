import type { PrismaClient } from '@prisma/client';
import type { UserRecord } from './types';

export interface UserRepositoryLike {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  findByGoogleId(googleId: string): Promise<UserRecord | null>;
  createWithPassword(
    email: string,
    passwordHash: string,
    displayName?: string | null,
    role?: UserRecord['role']
  ): Promise<UserRecord>;
  createWithGoogle(
    email: string,
    googleId: string,
    displayName?: string | null,
    role?: UserRecord['role']
  ): Promise<UserRecord>;
  linkGoogleId(userId: string, googleId: string): Promise<UserRecord>;
  setEmailVerificationToken(userId: string, token: string, expiresAt: Date): Promise<void>;
  verifyEmailByToken(token: string): Promise<UserRecord | null>;
  setEmailVerified(userId: string, verified: boolean): Promise<void>;
  setRole(userId: string, role: UserRecord['role']): Promise<UserRecord>;
  setPasswordResetToken(userId: string, token: string, expiresAt: Date): Promise<void>;
  resetPasswordByToken(token: string, newPasswordHash: string): Promise<UserRecord | null>;
  listUsers(): Promise<UserRecord[]>;
  setLocked(userId: string, locked: boolean): Promise<UserRecord>;
  deleteUser(userId: string): Promise<void>;
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

  async createWithPassword(
    email: string,
    passwordHash: string,
    displayName: string | null = null,
    role: UserRecord['role'] = 'user'
  ): Promise<UserRecord> {
    // emailVerified defaults to false in the schema - password signups must confirm via email.
    return this.db.user.create({ data: { email, passwordHash, displayName, role } });
  }

  async createWithGoogle(
    email: string,
    googleId: string,
    displayName: string | null = null,
    role: UserRecord['role'] = 'user'
  ): Promise<UserRecord> {
    // Google already verified this address on our behalf, so skip the confirmation step.
    return this.db.user.create({ data: { email, googleId, displayName, emailVerified: true, role } });
  }

  async linkGoogleId(userId: string, googleId: string): Promise<UserRecord> {
    return this.db.user.update({ where: { id: userId }, data: { googleId } });
  }

  async setEmailVerificationToken(userId: string, token: string, expiresAt: Date): Promise<void> {
    await this.db.user.update({
      where: { id: userId },
      data: { emailVerificationToken: token, emailVerificationExpiresAt: expiresAt }
    });
  }

  async verifyEmailByToken(token: string): Promise<UserRecord | null> {
    const user = await this.db.user.findUnique({ where: { emailVerificationToken: token } });
    if (!user) return null;
    if (!user.emailVerificationExpiresAt || user.emailVerificationExpiresAt.getTime() < Date.now()) return null;

    return this.db.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerificationToken: null, emailVerificationExpiresAt: null }
    });
  }

  async setEmailVerified(userId: string, verified: boolean): Promise<void> {
    await this.db.user.update({ where: { id: userId }, data: { emailVerified: verified } });
  }

  async setRole(userId: string, role: UserRecord['role']): Promise<UserRecord> {
    return this.db.user.update({ where: { id: userId }, data: { role } });
  }

  async setPasswordResetToken(userId: string, token: string, expiresAt: Date): Promise<void> {
    await this.db.user.update({
      where: { id: userId },
      data: { passwordResetToken: token, passwordResetExpiresAt: expiresAt }
    });
  }

  async resetPasswordByToken(token: string, newPasswordHash: string): Promise<UserRecord | null> {
    const user = await this.db.user.findUnique({ where: { passwordResetToken: token } });
    if (!user) return null;
    if (!user.passwordResetExpiresAt || user.passwordResetExpiresAt.getTime() < Date.now()) return null;

    return this.db.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash, passwordResetToken: null, passwordResetExpiresAt: null }
    });
  }

  async listUsers(): Promise<UserRecord[]> {
    return this.db.user.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async setLocked(userId: string, locked: boolean): Promise<UserRecord> {
    return this.db.user.update({ where: { id: userId }, data: { locked } });
  }

  async deleteUser(userId: string): Promise<void> {
    await this.db.user.delete({ where: { id: userId } });
  }
}
