import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type UserRole = 'system_admin' | 'department_admin' | 'user';

export interface User {
  id: number;
  username: string;
  realName: string;
  departmentId: number;
  positionId?: number;
  departmentName?: string;
  positionName?: string;
  isAdmin: boolean;
  role: UserRole;
}

interface AuthState {
  installed: boolean;
  user: User | null;
  token: string | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState & {
  setToken: (t: string | null) => void;
  setUser: (u: User | null) => void;
  logout: () => void;
  checkSetup: () => Promise<void>;
  checkMe: () => Promise<void>;
} | null>(null);

const TOKEN_KEY = 'token';

export function normalizeUser(u: Record<string, unknown>): User {
  const role =
    u.role === 'system_admin' || u.role === 'department_admin'
      ? (u.role as UserRole)
      : ((u.isAdmin ? 'system_admin' : 'user') as UserRole);
  return {
    id: u.id as number,
    username: u.username as string,
    realName: u.realName as string,
    departmentId: u.departmentId as number,
    positionId: u.positionId as number | undefined,
    departmentName: u.departmentName as string | undefined,
    positionName: u.positionName as string | undefined,
    isAdmin: !!(u.isAdmin ?? role === 'system_admin'),
    role,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [installed, setInstalled] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(true);

  const setToken = useCallback((t: string | null) => {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
    setTokenState(t);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, [setToken]);

  const checkSetup = useCallback(async () => {
    try {
      const res = await fetch('/api/setup/status');
      const data = await res.json();
      setInstalled(!!data.installed);
    } catch {
      setInstalled(true);
    }
  }, []);

  const checkMe = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setUser(normalizeUser(data));
      } else {
        logout();
      }
    } catch {
      logout();
    }
  }, [token, logout]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await checkSetup();
      if (cancelled) return;
      if (token) await checkMe();
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [checkSetup, token]);

  return (
    <AuthContext.Provider
      value={{
        installed,
        user,
        token,
        loading,
        setToken,
        setUser,
        logout,
        checkSetup,
        checkMe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
