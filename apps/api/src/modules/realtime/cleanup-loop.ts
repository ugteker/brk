import { REALTIME_RETENTION_MS } from './types';
import { logger } from '../../lib/logger';

interface CleanupRepository {
  deleteOlderThan(cutoff: Date): Promise<void>;
}

interface CleanupLoopOptions {
  repository: CleanupRepository;
  now?: () => Date;
}

const REALTIME_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export function startRealtimeCleanupLoop(options: CleanupLoopOptions): () => void {
  const { repository, now = () => new Date() } = options;
  let stopped = false;

  async function loop() {
    while (!stopped) {
      try {
        await repository.deleteOlderThan(new Date(now().getTime() - REALTIME_RETENTION_MS));
      } catch (err) {
        logger.error(`[realtime] cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      if (stopped) break;
      await sleep(REALTIME_CLEANUP_INTERVAL_MS);
    }
  }

  void loop();

  return () => { stopped = true; };
}
