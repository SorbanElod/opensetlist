import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';

import { useAuth, useUser } from '../auth/AuthContext';
import { LogoMark } from './LogoMark';
import { ThemeToggle } from './ThemeToggle';

// Nav links fill the header height; the active route gets a 2px accent
// underline along the header's bottom edge (issue #56) — sharper and more
// deliberate than a pill background.
const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `relative flex h-full items-center px-3 text-[13px] font-semibold transition-colors ${
    isActive ? 'text-text' : 'text-muted hover:text-text'
  }`;

function navLabel(isActive: boolean, label: string) {
  return (
    <>
      {label}
      {isActive && (
        <span
          aria-hidden
          className="absolute inset-x-2 bottom-0 h-[2px] bg-accent"
        />
      )}
    </>
  );
}

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
      {/* sticky: long song lists scroll under the header, nav stays reachable
          on stage (issue #56). */}
      <header className="sticky top-0 z-20 border-b border-border bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-[720px] items-center gap-4 px-4 sm:px-6 md:max-w-[880px] lg:px-8 xl:max-w-[1020px]">
          <NavLink to="/" className="flex items-center gap-2.5">
            <LogoMark size={28} />
            <span className="text-[15px] font-bold tracking-tight">
              OpenSetlist
            </span>
          </NavLink>
          <nav className="flex h-full items-center gap-1 self-stretch">
            <NavLink to="/" end className={navLinkClass}>
              {({ isActive }) => navLabel(isActive, 'Home')}
            </NavLink>
            <NavLink to="/songs" className={navLinkClass}>
              {({ isActive }) => navLabel(isActive, 'Songs')}
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-[13px] text-muted sm:inline">
              {user.name}
            </span>
            <ThemeToggle />
            <button
              type="button"
              className="btn btn-ghost"
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
