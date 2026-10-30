import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import * as authApi from '../api/auth';
import type { PublicUser } from '../api/auth';

type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: PublicUser }
  | { status: 'unauthenticated' };

type AuthContextValue = AuthState & {
  login: (email: string, password: string) => Promise<PublicUser>;
  register: (input: {
    name: string;
    email: string;
    password: string;
  }) => Promise<PublicUser>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  // Boot: the httpOnly cookie either holds a live session or it doesn't.
  useEffect(() => {
    let cancelled = false;
    authApi
      .getMe()
      .then((user) => {
        if (!cancelled) setState({ status: 'authenticated', user });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'unauthenticated' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const user = await authApi.login(email, password);
    setState({ status: 'authenticated', user });
    return user;
  }, []);

  const register = useCallback(
    async (input: { name: string; email: string; password: string }) => {
      const user = await authApi.register(input);
      // The API auto-logs in on register (sets the session cookie).
      setState({ status: 'authenticated', user });
      return user;
    },
    [],
  );

  const logout = useCallback(async () => {
    await authApi.logout();
    setState({ status: 'unauthenticated' });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

// For components rendered behind the RequireAuth gate.
export function useUser(): PublicUser {
  const auth = useAuth();
  if (auth.status !== 'authenticated')
    throw new Error('useUser requires an authenticated session');
  return auth.user;
}
