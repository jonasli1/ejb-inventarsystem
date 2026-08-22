import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, refreshAccessToken } from '@/lib/api-client';
import { tokenStore } from '@/lib/token-store';
import type { MeResponse, TokenResponse } from '@/lib/api-types';
import type { PermissionKey } from '@/lib/permissions';

interface AuthContextValue {
  status: 'loading' | 'authenticated' | 'unauthenticated';
  me: MeResponse | null;
  loginLocal: (email: string, password: string) => Promise<void>;
  applyTokens: (tokens: TokenResponse) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  hasPermission: (key: PermissionKey) => boolean;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthContextValue['status']>('loading');
  const [me, setMe] = useState<MeResponse | null>(null);

  const fetchMe = useCallback(async () => {
    const res = await api.get<MeResponse>('/auth/me');
    setMe(res.data);
    setStatus('authenticated');
  }, []);

  const bootstrap = useCallback(async () => {
    if (!tokenStore.getRefreshToken()) {
      setStatus('unauthenticated');
      return;
    }
    const newAccessToken = await refreshAccessToken();
    if (!newAccessToken) {
      setMe(null);
      setStatus('unauthenticated');
      return;
    }
    try {
      await fetchMe();
    } catch {
      tokenStore.clear();
      setMe(null);
      setStatus('unauthenticated');
    }
  }, [fetchMe]);

  useEffect(() => {
    void bootstrap();
    return tokenStore.subscribe(() => {
      if (!tokenStore.getAccessToken() && !tokenStore.getRefreshToken()) {
        setMe(null);
        setStatus('unauthenticated');
      }
    });
  }, [bootstrap]);

  const loginLocal = useCallback(
    async (email: string, password: string) => {
      const res = await api.post<TokenResponse>('/auth/login', { email, password });
      tokenStore.setTokens(res.data);
      await fetchMe();
    },
    [fetchMe],
  );

  const applyTokens = useCallback(
    async (tokens: TokenResponse) => {
      tokenStore.setTokens(tokens);
      await fetchMe();
    },
    [fetchMe],
  );

  const logout = useCallback(async () => {
    const refreshToken = tokenStore.getRefreshToken();
    tokenStore.clear();
    setMe(null);
    setStatus('unauthenticated');
    if (refreshToken) {
      try {
        await api.post('/auth/logout', { refreshToken });
      } catch {
        // best-effort; the token is already cleared locally
      }
    }
  }, []);

  const hasPermission = useCallback(
    (key: PermissionKey) => !!me?.permissions.includes(key),
    [me],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ status, me, loginLocal, applyTokens, logout, refreshMe: fetchMe, hasPermission }),
    [status, me, loginLocal, applyTokens, logout, fetchMe, hasPermission],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
