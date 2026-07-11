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
}
