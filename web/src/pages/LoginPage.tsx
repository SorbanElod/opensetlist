import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';

import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { LogoMark } from '../components/LogoMark';
import { ThemeToggle } from '../components/ThemeToggle';

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await auth.login(email.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      // The API returns one message for unknown email AND wrong password
      // (no account enumeration) — surface it verbatim. The password is
      // never logged or included in any error.
      setError(
        err instanceof ApiError
          ? err.message
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-svh flex-col bg-bg text-text">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      {/* min-h-svh + centered column: works in portrait and landscape, and
          shrinks with the mobile browser chrome. */}
      <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center px-4 py-8">
        <div className="mb-6 flex items-center gap-2.5">
          <LogoMark />
          <span className="text-[17px] font-bold tracking-tight">
            OpenSetlist
          </span>
        </div>

        <div className="card rounded-2xl p-5">
          <h1 className="mb-1 text-[22px] font-bold tracking-tight">
            Welcome back
          </h1>
          <p className="mb-5 text-[13px] text-muted">Log in to your account</p>

          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={onSubmit} noValidate>
            <div className="field">
              <label className="flabel" htmlFor="email">
                Email
              </label>
              <input
                className="input"
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="flabel" htmlFor="password">
                Password
              </label>
              <input
                className="input"
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button
              className="btn btn-primary btn-block"
              type="submit"
              disabled={submitting}
            >
              {submitting ? 'Logging in…' : 'Log in'}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-[13px] text-muted">
          No account yet?{' '}
          <Link to="/register" className="font-semibold text-accent">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
