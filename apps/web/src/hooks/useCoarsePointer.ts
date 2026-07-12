import { useEffect, useState } from 'react';

/**
 * Detects touch/coarse-pointer devices (phones, tablets) via the `(pointer: coarse)` media
 * query. Used to skip hover-only affordances (like tooltips) that require a first "hover" tap
 * to open before a second tap can actually register as a click on iOS/Android touch browsers.
 */
export function useCoarsePointer(): boolean {
  const [isCoarse, setIsCoarse] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  );

  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse)');
    const handler = (event: MediaQueryListEvent) => setIsCoarse(event.matches);
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }, []);

  return isCoarse;
}
