import { useCallback, useEffect, useState } from 'react';

export function useLibrarySourceNavigation() {
  const [selectedSourceId, setSelectedSourceIdState] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('source')
  );

  const setSelectedSourceId = useCallback((id: string | null) => {
    setSelectedSourceIdState(id);
    const params = new URLSearchParams(window.location.search);
    if (id) params.set('source', id);
    else params.delete('source');
    const query = params.toString();
    window.history.pushState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setSelectedSourceIdState(new URLSearchParams(window.location.search).get('source'));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  return { selectedSourceId, setSelectedSourceId };
}
