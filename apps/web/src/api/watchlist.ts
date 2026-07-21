export interface WatchlistEntryDto {
  id: string;
  userId: string;
  symbol: string;
  createdAt: string;
}

async function parseJsonOrThrow<T>(response: Response, errorMessage: string): Promise<T> {
  if (!response.ok) {
    throw new Error(errorMessage);
  }
  return response.json();
}

export async function listWatchlist(): Promise<WatchlistEntryDto[]> {
  const response = await fetch('/api/watchlist');
  return parseJsonOrThrow(response, 'Failed to load watchlist');
}

export async function addToWatchlist(symbol: string): Promise<WatchlistEntryDto> {
  const response = await fetch('/api/watchlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ symbol })
  });
  return parseJsonOrThrow(response, 'Failed to add symbol to watchlist');
}

export async function removeFromWatchlist(symbol: string): Promise<void> {
  const response = await fetch(`/api/watchlist/${encodeURIComponent(symbol)}`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error('Failed to remove symbol from watchlist');
  }
}
