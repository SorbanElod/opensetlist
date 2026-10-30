import { apiFetch } from './client';

// Mirrors PublicUser in api/src/auth/service.ts.
export type PublicUser = {
  id: string;
  email: string;
  name: string;
  isSuperadmin: boolean;
};

// Mirrors GroupRole in api/src/auth/authorize.ts.
export type GroupRole = 'reader' | 'member' | 'group_manager';

// One entry per group the user belongs to — multi-group-ready shape.
export type Membership = { groupId: string; role: GroupRole };

// register/login/me all return this shape.
export type MeResponse = { user: PublicUser; memberships: Membership[] };

export async function login(
  email: string,
  password: string,
): Promise<MeResponse> {
  return apiFetch<MeResponse>('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

export async function register(input: {
  name: string;
  email: string;
  password: string;
}): Promise<MeResponse> {
  // The API auto-logs in on register (sets the session cookie).
  return apiFetch<MeResponse>('/api/auth/register', {
    method: 'POST',
    body: input,
  });
}

export async function logout(): Promise<void> {
  await apiFetch<{ status: string }>('/api/auth/logout', { method: 'POST' });
}

export async function getMe(): Promise<MeResponse> {
  return apiFetch<MeResponse>('/api/auth/me');
}

// Client-side mirror of registerSchema in api/src/auth/schemas.ts: fail fast
// with friendly messages before hitting the network. The API stays the
// authority — its 400 issues are mapped onto fields by the register page.
export type RegisterForm = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export type RegisterField = keyof RegisterForm;

export type FieldErrors = Partial<Record<RegisterField, string>>;

// Deliberately looser than zod's email check; the server re-validates.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateRegister(form: RegisterForm): FieldErrors {
  const errors: FieldErrors = {};

  const name = form.name.trim();
  if (name.length < 1) errors.name = 'Name is required';
  else if (name.length > 100)
    errors.name = 'Name must be at most 100 characters';

  if (!EMAIL_PATTERN.test(form.email.trim()))
    errors.email = 'Enter a valid email address';

  if (form.password.length < 10)
    errors.password = 'Password must be at least 10 characters';
  else if (form.password.length > 512)
    errors.password = 'Password must be at most 512 characters';

  // confirmPassword is a client-only field: the API never sees it.
  if (form.confirmPassword !== form.password)
    errors.confirmPassword = 'Passwords do not match';

  return errors;
}
