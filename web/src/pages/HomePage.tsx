import { useState } from 'react';
import { useNavigate } from 'react-router';

import { useAuth, useUser } from '../auth/AuthContext';
import { LogoMark } from '../components/LogoMark';
import { ThemeToggle } from '../components/ThemeToggle';

// App shell. P2.1 plugs the real screens (song library) in here; the
// container widens on tablets/laptops (sm/md/xl) and stays a single
// centered column on phones, in either orientation.
export function HomePage() {
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
        <div className="mx-auto flex h-14 w-full max-w-[720px] items-center justify-between gap-3 px-4 sm:px-6 md:max-w-[880px] lg:px-8 xl:max-w-[1020px]">
          <div className="flex items-center gap-2.5">
            <LogoMark size={26} />
            <span className="text-[15px] font-bold tracking-tight">
              OpenSetlist
            </span>
          </div>
          <div className="flex items-center gap-2">
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
        <div className="card rounded-2xl p-5">
          <p className="text-[13.5px] text-muted">
            Song library lands in P2.1.
          </p>
        </div>
      </div>
    </main>
  );
}
