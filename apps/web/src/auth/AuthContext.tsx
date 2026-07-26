import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  getCurrentUser,
  login as apiLogin,
  logout as apiLogout,
  signup as apiSignup,
  updateAccountLanguage,
  type AuthUser,
  type SignupResult
} from '../api/auth';
import i18n from '../i18n';

interface AuthContextValue {
  user: AuthUser | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<SignupResult>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');

  useEffect(() => {
    let alive = true;
    async function loadSession() {
      try {
        const current = await getCurrentUser();
        if (!alive) return;
        setUser(current);
        setStatus(current ? 'authenticated' : 'unauthenticated');
      } catch {
        if (!alive) return;
        setUser(null);
        setStatus('unauthenticated');
      }
    }
    loadSession();
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const loggedInUser = await apiLogin(email, password);
      setUser(loggedInUser);
      setStatus('authenticated');
    },
    []
  );

  // Signup no longer logs the user in directly - the account stays unverified until the user
  // clicks the confirmation link emailed to them, so we just hand the caller the server's
  // "check your email" response instead of setting a session here.
  const signup = useCallback(async (email: string, password: string) => apiSignup(email, password), []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  // Keeps the account's persisted report/notification language in sync with whatever language
  // the app is actually displayed in - covers both an explicit toggle and a user who was simply
  // already on their preferred language on first login (browser-detected, never toggled).
  useEffect(() => {
    if (status !== 'authenticated') return;
    const syncLanguage = (lng: string) => {
      const normalized = lng.startsWith('de') ? 'de' : 'en';
      setUser((prev) => {
        if (!prev || prev.language === normalized) return prev;
        void updateAccountLanguage(normalized);
        return { ...prev, language: normalized };
      });
    };
    syncLanguage(i18n.language);
    i18n.on('languageChanged', syncLanguage);
    return () => {
      i18n.off('languageChanged', syncLanguage);
    };
  }, [status]);

  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider value={{ user, status, isAdmin, login, signup, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
