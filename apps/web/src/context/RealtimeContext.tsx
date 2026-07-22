/**
 * RealtimeContext — single persistent global realtime SSE connection.
 *
 * Mounted once (nested inside AppDataProvider, see App.tsx) so the whole app shares one
 * `EventSource` for `/api/realtime/stream` instead of each page opening its own. Route-level
 * components subscribe to the topics they care about via `useRealtimeSubscription` without
 * ever touching the connection lifecycle themselves.
 */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { parseRealtimeChange, type RealtimeChange, type RealtimeTopic } from '../api/realtime';
import { readCursor, streamUrl, writeCursor } from '../realtime/cursor';

export type RealtimeEvent = RealtimeChange | { topic: 'resync' };
export type RealtimeHandler = (event: RealtimeEvent) => void;

interface RealtimeSubscriber {
  topics: ReadonlySet<RealtimeTopic>;
  handler: RealtimeHandler;
}

interface RealtimeContextValue {
  subscribe: (topics: readonly RealtimeTopic[], handler: RealtimeHandler) => () => void;
  reconnecting: boolean;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const subscribersRef = useRef<Map<symbol, RealtimeSubscriber>>(new Map());
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setReconnecting(false);
      return;
    }

    const userId = user.id;

    function dispatch(event: RealtimeEvent) {
      for (const { topics, handler } of subscribersRef.current.values()) {
        if (event.topic === 'resync' || topics.has(event.topic)) {
          handler(event);
        }
      }
    }

    const cursor = readCursor(window.localStorage, userId);
    const source = new EventSource(streamUrl(userId, cursor), { withCredentials: true });

    source.addEventListener('change', (event) => {
      const change = parseRealtimeChange((event as MessageEvent<string>).data);
      if (!change) return;
      writeCursor(window.localStorage, userId, change.id);
      setReconnecting(false);
      dispatch(change);
    });

    source.addEventListener('resync', () => {
      setReconnecting(false);
      dispatch({ topic: 'resync' });
    });

    // Do not close the stream on error — EventSource retries the connection on its own.
    // Just surface a "reconnecting" indicator, cleared once a valid change/resync arrives.
    source.addEventListener('error', () => {
      setReconnecting(true);
    });

    return () => {
      source.close();
      setReconnecting(false);
    };
  }, [user?.id]);

  const subscribe = (topics: readonly RealtimeTopic[], handler: RealtimeHandler) => {
    const key = Symbol('realtime-subscriber');
    subscribersRef.current.set(key, { topics: new Set(topics), handler });
    return () => {
      subscribersRef.current.delete(key);
    };
  };

  return <RealtimeContext.Provider value={{ subscribe, reconnecting }}>{children}</RealtimeContext.Provider>;
}

/**
 * Subscribes `handler` to realtime changes for `topics` for the lifetime of the calling
 * component. `topics` is only used to derive a stable subscription key (its content, not its
 * array identity) — passing a fresh array literal on every render will not resubscribe.
 * `handler` is always the latest one passed in, even between subscription updates.
 */
export function useRealtimeSubscription(topics: readonly RealtimeTopic[], handler: RealtimeHandler): void {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtimeSubscription must be used within a RealtimeProvider');

  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const topicsKey = topics.join(',');

  useEffect(() => {
    return ctx.subscribe(topics, (event) => handlerRef.current(event));
    // topicsKey captures the meaningful identity of `topics`; ctx.subscribe is stable for the
    // lifetime of the provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicsKey]);
}
