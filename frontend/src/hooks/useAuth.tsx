import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { api } from '../api/client';
import type { User } from '../api/types';
import { clearAllFeedCache } from '../utils/feedCache';
import { clearSessionSnapshots } from '../utils/sessionPageCache';
import { peekAuthSeed } from '../utils/authBoot';

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
  // peek 不清种子，StrictMode 重挂 / initializer 双调仍与 SSR 同构
  const [user, setUser] = useState<User | null>(() => {
    const s = peekAuthSeed();
    return s.hasSeed ? s.user : null;
  });
  const [loading, setLoading] = useState(() => !peekAuthSeed().hasSeed);

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

  // 有 SSR 种子时仍后台校验；无种子则首屏拉取
  // 不清空 auth 种子：StrictMode 重挂会再次跑 useState initializer，破坏性 clear 会导致 user 空窗闪动
  useEffect(() => { void refresh(); }, [refresh]);

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
