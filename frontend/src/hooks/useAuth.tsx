import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { api } from '../api/client';
import type { User } from '../api/types';
import { clearAllFeedCache } from '../utils/feedCache';
import { clearSessionSnapshots } from '../utils/sessionPageCache';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx>({
  user: null, loading: true,
  refresh: async () => {}, logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.me();
      setUser(data.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // 初始化只拉一次用户信息
  useEffect(() => { refresh(); }, [refresh]);

  const prevUserId = useRef<number | null | 'init'>('init');
  useEffect(() => {
    if (loading) return;
    const id = user?.id ?? null;
    if (prevUserId.current === 'init') {
      prevUserId.current = id;
      return;
    }
    if (prevUserId.current !== id) {
      prevUserId.current = id;
      clearSessionSnapshots();
      clearAllFeedCache();
    }
  }, [user, loading]);

  const logout = async () => {
    await api.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
