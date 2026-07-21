import { useNavigate as rrUseNavigate } from 'react-router-dom';

// A thin wrapper around react-router's useNavigate that falls back to a no-op
// when a Router context is not available (tests sometimes render components
// without a Router). This keeps components safe to render in isolation.
export function useSafeNavigate() {
  try {
    // call the hook; if no Router is present, it will throw and we'll catch below
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = (rrUseNavigate as any)();
    return nav;
  } catch (e) {
    return () => {};
  }
}
