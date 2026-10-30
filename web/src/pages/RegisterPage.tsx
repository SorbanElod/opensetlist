import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';

import { ApiError } from '../api/client';
import {
  validateRegister,
  type FieldErrors,
  type RegisterField,
} from '../api/auth';
import { useAuth } from '../auth/AuthContext';
import { LogoMark } from '../components/LogoMark';
import { ThemeToggle } from '../components/ThemeToggle';

const FIELD_ORDER: RegisterField[] = [
  'name',
  'email',
  'password',
  'confirmPassword',
];

export function RegisterPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Client-side mirror of the API's Zod rules: fail fast, no request.
    const errors = validateRegister({ name, email, password, confirmPassword });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setError(null);
    setSubmitting(true);
    try {
      await auth.register({
        name: name.trim(),
        email: email.trim(),
        password,
      });
      navigate('/', { replace: true }); // register auto-logs in
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.issues?.length) {
          // 400: map the API's issues (path = field name) onto the inputs.
          const mapped: FieldErrors = {};
          for (const issue of err.issues) {
            if (FIELD_ORDER.includes(issue.path as RegisterField))
              mapped[issue.path as RegisterField] = issue.message;
          }
          setFieldErrors(mapped);
        } else if (err.status === 409) {
          setFieldErrors({ email: err.message }); // "Email already registered"
        } else {
          setError(err.message);
        }
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-svh flex-col bg-bg text-text">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center px-4 py-8">
        <div className="mb-6 flex items-center gap-2.5">
          <LogoMark />
          <span className="text-[17px] font-bold tracking-tight">
            OpenSetlist
          </span>
        </div>

        <div className="card rounded-2xl p-5">
          <h1 className="mb-1 text-[22px] font-bold tracking-tight">
            Create your account
          </h1>
          <p className="mb-5 text-[13px] text-muted">
            One group, shared song library
          </p>

          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={onSubmit} noValidate>
            <div className="field">
              <label className="flabel" htmlFor="name">
                Name
              </label>
              <input
                className="input"
                id="name"
                type="text"
                autoComplete="name"
                required
                aria-invalid={fieldErrors.name ? 'true' : undefined}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              {fieldErrors.name && (
                <p className="field-error">{fieldErrors.name}</p>
              )}
            </div>
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
                aria-invalid={fieldErrors.email ? 'true' : undefined}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {fieldErrors.email && (
                <p className="field-error">{fieldErrors.email}</p>
              )}
            </div>
            <div className="field">
              <label className="flabel" htmlFor="password">
                Password
              </label>
              <input
                className="input"
                id="password"
                type="password"
                autoComplete="new-password"
                required
                aria-invalid={fieldErrors.password ? 'true' : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {fieldErrors.password ? (
                <p className="field-error">{fieldErrors.password}</p>
              ) : (
                <p className="hint">
                  At least 10 characters — length beats complexity rules.
                </p>
              )}
            </div>
            <div className="field">
              <label className="flabel" htmlFor="confirmPassword">
                Confirm password
              </label>
              <input
                className="input"
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                aria-invalid={fieldErrors.confirmPassword ? 'true' : undefined}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              {fieldErrors.confirmPassword && (
                <p className="field-error">{fieldErrors.confirmPassword}</p>
              )}
            </div>
            <button
              className="btn btn-primary btn-block"
              type="submit"
              disabled={submitting}
            >
              {submitting ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-[13px] text-muted">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-accent">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
