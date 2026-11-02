import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import * as authApi from '../api/auth';
import type {
  DefaultView,
  GroupRole,
  Membership,
  PublicUser,
} from '../api/auth';

type AuthState =
  | { status: 'loading' }
  | {
      status: 'authenticated';
      user: PublicUser;
      memberships: Membership[];
    }
  | { status: 'unauthenticated' };

type AuthContextValue = AuthState & {
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    name: string;
    email: string;
    password: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  // Persists the preferred on-stage view (issue #10) via PATCH /api/auth/me
  // and updates the local session state from the server's response.
  setDefaultView: (view: DefaultView) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  // Boot: the httpOnly cookie either holds a live session or it doesn't.
  useEffect(() => {
    let cancelled = false;
    authApi
      .getMe()
      .then((me) => {
        if (!cancelled)
          setState({
            status: 'authenticated',
            user: me.user,
            memberships: me.memberships ?? [],
          });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'unauthenticated' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const me = await authApi.login(email, password);
    setState({
      status: 'authenticated',
      user: me.user,
      memberships: me.memberships ?? [],
    });
  }, []);

  const register = useCallback(
    async (input: { name: string; email: string; password: string }) => {
      const me = await authApi.register(input);
      // The API auto-logs in on register (sets the session cookie).
      setState({
        status: 'authenticated',
        user: me.user,
        memberships: me.memberships ?? [],
      });
    },
    [],
  );

  const logout = useCallback(async () => {
    await authApi.logout();
    setState({ status: 'unauthenticated' });
  }, []);

  const setDefaultView = useCallback(async (view: DefaultView) => {
    const me = await authApi.updateMe({ defaultView: view });
    setState({
      status: 'authenticated',
      user: me.user,
      memberships: me.memberships ?? [],
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{ ...state, login, register, logout, setDefaultView }}
    >
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

// The caller's role in the (MVP: single) group. Null while loading or when
// the user has no membership (e.g. a platform superadmin).
export function useMyRole(): GroupRole | null {
  const auth = useAuth();
  if (auth.status !== 'authenticated') return null;
  return auth.memberships[0]?.role ?? null;
}

// Write access = member or group_manager in the group, or platform superadmin
// (the API's authorize() applies the same rule server-side).
export function canWrite(
  role: GroupRole | null,
  isSuperadmin: boolean,
): boolean {
  return isSuperadmin || role === 'member' || role === 'group_manager';
}

// Manager-only actions (e.g. deleting a tag from the vocabulary) = the
// group's admin, or platform superadmin.
export function canManage(
  role: GroupRole | null,
  isSuperadmin: boolean,
): boolean {
  return isSuperadmin || role === 'group_manager';
}
