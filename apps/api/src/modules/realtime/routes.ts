import type { FastifyInstance } from 'fastify';
import { REALTIME_POLL_MS, REALTIME_HEARTBEAT_MS, type RealtimeEventDto, type RealtimeTopic } from './types';

export interface RealtimeEventRepository {
  listAfter(userId: string, cursor: number): Promise<Array<{
    id: number;
    topic: string;
    entityId: string | null;
    createdAt: Date;
  }>>;
  oldestIdForUser(userId: string): Promise<number | null>;
}

export interface RealtimeRoutesDeps {
  repository: RealtimeEventRepository;
}

export function parsePositiveCursor(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  if (!/^\d+$/.test(value)) return null;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) return null;
  return n;
}

export function resolveCursor(queryCursor: unknown, lastEventId: unknown): number {
  const q = parsePositiveCursor(queryCursor);
  const h = parsePositiveCursor(lastEventId);
  return Math.max(q ?? 0, h ?? 0);
}

export function formatSse(event: string, data: unknown, id?: number): string {
  const idLine = id !== undefined ? `id: ${id}\n` : '';
  return `${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export async function registerRealtimeRoutes(app: FastifyInstance, deps: RealtimeRoutesDeps): Promise<void> {
  app.get('/api/realtime/stream', async (req, reply) => {
    const userId = req.userId!;

    void reply.hijack();
    const res = reply.raw;

    let closed = false;
    let resolveClose!: () => void;
    const closePromise = new Promise<void>(r => { resolveClose = r; });
    req.raw.once('close', () => {
      closed = true;
      resolveClose();
    });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const queryParams = req.query as Record<string, unknown>;
    let cursor = resolveCursor(queryParams.cursor, req.headers['last-event-id']);

    function write(chunk: string) {
      if (!closed) {
        try { res.write(chunk); } catch { /* client gone */ }
      }
    }

    try {
      const oldestId = await deps.repository.oldestIdForUser(userId);
      if (cursor > 0 && oldestId !== null && cursor < oldestId - 1) {
        write(formatSse('resync', {}));
      }

      const initialEvents = await deps.repository.listAfter(userId, cursor);
      for (const event of initialEvents) {
        const dto: RealtimeEventDto = {
          id: event.id,
          topic: event.topic as RealtimeTopic,
          entityId: event.entityId,
          createdAt: event.createdAt.toISOString(),
        };
        write(formatSse('change', dto, event.id));
        cursor = event.id;
      }

      let lastEventAt = Date.now();

      while (true) {
        const result = await Promise.race([
          sleep(REALTIME_POLL_MS).then(() => 'tick' as const),
          closePromise.then(() => 'closed' as const),
        ]);
        if (result === 'closed') break;

        try {
          const events = await deps.repository.listAfter(userId, cursor);
          if (events.length > 0) {
            for (const event of events) {
              const dto: RealtimeEventDto = {
                id: event.id,
                topic: event.topic as RealtimeTopic,
                entityId: event.entityId,
                createdAt: event.createdAt.toISOString(),
              };
              write(formatSse('change', dto, event.id));
              cursor = event.id;
            }
            lastEventAt = Date.now();
          } else if (Date.now() - lastEventAt >= REALTIME_HEARTBEAT_MS) {
            write(': keepalive\n\n');
            lastEventAt = Date.now();
          }
        } catch {
          break;
        }
      }
    } catch {
      // initial setup error — fall through to end
    }

    if (!closed) {
      try { res.end(); } catch { /* client gone */ }
    }
  });
}
