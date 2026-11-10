import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setUnauthorizedHandler } from '@/services/api';
import { storage } from '@/services/storage';
import type { User } from '@/types/api';

interface AuthValue {
  user: User | null;
  ready: boolean;
  /** Admin and Work Entry users can add records. */
  canCreate: boolean;
  /** Admin, or Work Entry users given edit permission, can correct old records. */
  canEdit: boolean;
  isAdmin: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const clear = useCallback(async () => {
    await storage.clearToken();
    await storage.clearAllCache();
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => void clear());
    (async () => {
      const token = await storage.getToken();
      if (token) {
        try {
          const { user: me } = await api.me();
          setUser(me);
        } catch (err) {
          // Offline at start-up: keep the session; screens will show cached data.
          const e = err as { isNetwork?: boolean };
          if (e.isNetwork) {
            const cached = await storage.getCache<User>('me');
            if (cached) setUser(cached);
          } else {
            await clear();
          }
        }
      }
      setReady(true);
    })();
  }, [clear]);

  useEffect(() => {
    if (user) void storage.setCache('me', user);
  }, [user]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.login(username.trim(), password);
    await storage.setToken(res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Even offline, the token is removed from this phone.
    }
    await clear();
  }, [clear]);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      ready,
      canCreate: user?.role === 'admin' || user?.role === 'entry',
      canEdit: Boolean(user?.canEdit),
      isAdmin: user?.role === 'admin',
      login,
      logout,
    }),
    [user, ready, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
