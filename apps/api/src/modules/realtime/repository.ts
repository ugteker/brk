import type { RealtimeEventTransaction, RealtimeTopic } from './types';

interface RealtimeEventRow {
  id: number;
  userId: string;
  topic: string;
  entityId: string | null;
  createdAt: Date;
}

interface RealtimeDb {
  realtimeEvent: {
    create(args: { data: { userId: string; topic: string; entityId: string | null } }): Promise<RealtimeEventRow>;
    findMany(args: {
      where: { userId: string; id: { gt: number } };
      orderBy: { id: 'asc' };
    }): Promise<RealtimeEventRow[]>;
    findFirst(args: {
      where: { userId: string };
      orderBy: { id: 'asc' };
    }): Promise<RealtimeEventRow | null>;
    deleteMany(args: { where: { createdAt: { lt: Date } } }): Promise<unknown>;
  };
}

export class RealtimeRepository {
  constructor(private readonly db: RealtimeDb) {}

  async append(
    tx: RealtimeEventTransaction,
    input: { userId: string; topic: RealtimeTopic; entityId?: string }
  ): Promise<void> {
    await tx.realtimeEvent.create({
      data: {
        userId: input.userId,
        topic: input.topic,
        entityId: input.entityId ?? null
      }
    });
  }

  async listAfter(userId: string, cursor: number): Promise<RealtimeEventRow[]> {
    return this.db.realtimeEvent.findMany({
      where: { userId, id: { gt: cursor } },
      orderBy: { id: 'asc' }
    });
  }

  async oldestIdForUser(userId: string): Promise<number | null> {
    const row = await this.db.realtimeEvent.findFirst({
      where: { userId },
      orderBy: { id: 'asc' }
    });
    return row ? row.id : null;
  }

  async deleteOlderThan(cutoff: Date): Promise<void> {
    await this.db.realtimeEvent.deleteMany({
      where: { createdAt: { lt: cutoff } }
    });
  }
}
