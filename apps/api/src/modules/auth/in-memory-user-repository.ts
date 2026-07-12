import type { UserRepositoryLike } from './repository';
import type { UserRecord } from './types';

export class InMemoryUserRepository implements UserRepositoryLike {
  private users = new Map<string, UserRecord>();
  private nextId = 1;

  async findByEmail(email: string): Promise<UserRecord | null> {
    return [...this.users.values()].find((u) => u.email === email) ?? null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    return this.users.get(id) ?? null;
  }

  async findByGoogleId(googleId: string): Promise<UserRecord | null> {
    return [...this.users.values()].find((u) => u.googleId === googleId) ?? null;
  }

  async createWithPassword(email: string, passwordHash: string, displayName: string | null = null): Promise<UserRecord> {
    const user: UserRecord = {
      id: `user-${this.nextId++}`,
      email,
      passwordHash,
      googleId: null,
      displayName,
      emailVerified: false,
      emailVerificationToken: null,
      emailVerificationExpiresAt: null,
      locked: false,
      passwordResetToken: null,
      passwordResetExpiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.users.set(user.id, user);
    return user;
  }

  async createWithGoogle(email: string, googleId: string, displayName: string | null = null): Promise<UserRecord> {
    const user: UserRecord = {
      id: `user-${this.nextId++}`,
      email,
      passwordHash: null,
      googleId,
      displayName,
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpiresAt: null,
      locked: false,
      passwordResetToken: null,
      passwordResetExpiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.users.set(user.id, user);
    return user;
  }

  async linkGoogleId(userId: string, googleId: string): Promise<UserRecord> {
    const existing = this.users.get(userId);
    if (!existing) throw new Error('not_found');
    const updated = { ...existing, googleId, updatedAt: new Date() };
    this.users.set(userId, updated);
    return updated;
  }

  async setEmailVerificationToken(userId: string, token: string, expiresAt: Date): Promise<void> {
    const existing = this.users.get(userId);
    if (!existing) throw new Error('not_found');
    this.users.set(userId, { ...existing, emailVerificationToken: token, emailVerificationExpiresAt: expiresAt, updatedAt: new Date() });
  }

  async verifyEmailByToken(token: string): Promise<UserRecord | null> {
    const user = [...this.users.values()].find((u) => u.emailVerificationToken === token);
    if (!user) return null;
    if (!user.emailVerificationExpiresAt || user.emailVerificationExpiresAt.getTime() < Date.now()) return null;

    const updated: UserRecord = {
      ...user,
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpiresAt: null,
      updatedAt: new Date()
    };
    this.users.set(user.id, updated);
    return updated;
  }

  async setEmailVerified(userId: string, verified: boolean): Promise<void> {
    const existing = this.users.get(userId);
    if (!existing) throw new Error('not_found');
    this.users.set(userId, { ...existing, emailVerified: verified, updatedAt: new Date() });
  }

  async setPasswordResetToken(userId: string, token: string, expiresAt: Date): Promise<void> {
    const existing = this.users.get(userId);
    if (!existing) throw new Error('not_found');
    this.users.set(userId, { ...existing, passwordResetToken: token, passwordResetExpiresAt: expiresAt, updatedAt: new Date() });
  }

  async resetPasswordByToken(token: string, newPasswordHash: string): Promise<UserRecord | null> {
    const user = [...this.users.values()].find((u) => u.passwordResetToken === token);
    if (!user) return null;
    if (!user.passwordResetExpiresAt || user.passwordResetExpiresAt.getTime() < Date.now()) return null;

    const updated: UserRecord = {
      ...user,
      passwordHash: newPasswordHash,
      passwordResetToken: null,
      passwordResetExpiresAt: null,
      updatedAt: new Date()
    };
    this.users.set(user.id, updated);
    return updated;
  }

  async listUsers(): Promise<UserRecord[]> {
    return [...this.users.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async setLocked(userId: string, locked: boolean): Promise<UserRecord> {
    const existing = this.users.get(userId);
    if (!existing) throw new Error('not_found');
    const updated = { ...existing, locked, updatedAt: new Date() };
    this.users.set(userId, updated);
    return updated;
  }

  async deleteUser(userId: string): Promise<void> {
    if (!this.users.has(userId)) throw new Error('not_found');
    this.users.delete(userId);
  }
}
