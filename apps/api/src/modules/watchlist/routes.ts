import type { FastifyInstance } from 'fastify';
import { normalizeWatchlistSymbol, type WatchlistRepositoryLike } from './repository';

export interface WatchlistRoutesDeps {
  watchlistRepository: WatchlistRepositoryLike;
}

// Symbols are short tickers (optionally exchange-prefixed like NASDAQ:AAPL) - reject anything
// that clearly isn't one so the watchlist can't be polluted with arbitrary strings.
const SYMBOL_PATTERN = /^[A-Z0-9.:^=-]{1,24}$/;

export async function registerWatchlistRoutes(app: FastifyInstance, deps: WatchlistRoutesDeps): Promise<void> {
  app.get('/api/watchlist', async (req, reply) => {
    const entries = await deps.watchlistRepository.list(req.userId!);
    return reply.status(200).send(entries);
  });

  app.post('/api/watchlist', async (req, reply) => {
    const body = (req.body ?? {}) as { symbol?: string };
    const symbol = typeof body.symbol === 'string' ? normalizeWatchlistSymbol(body.symbol) : '';
    if (!SYMBOL_PATTERN.test(symbol)) {
      return reply.status(400).send({ code: 'validation_error', message: 'symbol must be a valid ticker (1-24 chars)' });
    }
    const entry = await deps.watchlistRepository.add(req.userId!, symbol);
    return reply.status(201).send(entry);
  });

  app.delete('/api/watchlist/:symbol', async (req, reply) => {
    const { symbol } = req.params as { symbol: string };
    await deps.watchlistRepository.remove(req.userId!, symbol);
    return reply.status(204).send();
  });
}
