import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';

import { useAuth, useUser } from '../auth/AuthContext';
import { LogoMark } from './LogoMark';
import { ThemeToggle } from './ThemeToggle';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors ${
    isActive ? 'bg-raised text-text' : 'text-muted hover:text-text'
  }`;

// App shell: header (logo, nav, user, theme, logout) + routed page content.
// The container widens on tablets/laptops and stays a centered column on
// phones, in either orientation.
export function AppShell() {
  const user = useUser();
  const auth = useAuth();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  async function onLogout() {
    setLoggingOut(true);
    try {
      await auth.logout();
      navigate('/login', { replace: true });
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <main className="min-h-svh bg-bg text-text">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-[720px] items-center gap-4 px-4 sm:px-6 md:max-w-[880px] lg:px-8 xl:max-w-[1020px]">
          <NavLink to="/" className="flex items-center gap-2.5">
            <LogoMark size={26} />
            <span className="text-[15px] font-bold tracking-tight">
              OpenSetlist
            </span>
          </NavLink>
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={navLinkClass}>
              Home
            </NavLink>
            <NavLink to="/songs" className={navLinkClass}>
              Songs
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-[13px] text-muted sm:inline">
              {user.name}
            </span>
            <ThemeToggle />
            <button
              type="button"
              className="btn btn-outline"
              onClick={onLogout}
              disabled={loggingOut}
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[720px] px-4 py-6 sm:px-6 md:max-w-[880px] lg:px-8 xl:max-w-[1020px]">
        <Outlet />
      </div>
    </main>
  );
}
