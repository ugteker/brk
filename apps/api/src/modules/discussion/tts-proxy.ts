import { ProxyAgent } from 'undici';
import { logger } from '../../lib/logger';

/**
 * Optional outbound proxy for Studio TTS requests only. Invalid values must not break
 * startup; we disable proxying for TTS and warn instead.
 */
export function createTtsProxyDispatcher(proxyUrl: string | undefined): ProxyAgent | undefined {
  if (!proxyUrl) return undefined;
  try {
    return new ProxyAgent(proxyUrl);
  } catch (error) {
    logger.warn(
      `[tts] Ignoring invalid TTS_PROXY_URL (must start with http:// or https://, e.g. ******host:port): ${error instanceof Error ? error.message : String(error)}`
    );
    return undefined;
  }
}

