import { afterEach, describe, expect, it, vi } from 'vitest';

import { getMe, login, register, validateRegister } from './auth';
import { stubFetch } from '../test/fetchMock';

afterEach(() => vi.unstubAllGlobals());

// Client-side mirror of registerSchema in api/src/auth/schemas.ts.
describe('validateRegister', () => {
  const valid = {
    name: 'Előd',
    email: 'elod@example.com',
    password: 'hunter2hunter2',
    confirmPassword: 'hunter2hunter2',
  };

  it('accepts valid input', () => {
    expect(validateRegister(valid)).toEqual({});
  });

  it('rejects an empty name', () => {
    expect(validateRegister({ ...valid, name: '   ' }).name).toBe(
      'Name is required',
    );
  });

  it('rejects a malformed email', () => {
    expect(validateRegister({ ...valid, email: 'nope' }).email).toBeTruthy();
  });

  it('rejects a password under 10 characters', () => {
    expect(
      validateRegister({
        ...valid,
        password: 'short',
        confirmPassword: 'short',
      }).password,
    ).toBe('Password must be at least 10 characters');
  });

  it('rejects a mismatched confirmation', () => {
    expect(
      validateRegister({ ...valid, confirmPassword: 'different123' })
        .confirmPassword,
    ).toBe('Passwords do not match');
  });
});

describe('auth endpoints', () => {
  const user = { id: 'u1', email: 'e@x.hu', name: 'E', isSuperadmin: false };

  it('login posts credentials to /api/auth/login and returns the user', async () => {
    const fn = stubFetch((path) =>
      path === '/api/auth/login'
        ? { status: 200, body: { user } }
        : { status: 404, body: {} },
    );

    const result = await login('e@x.hu', 'pw');

    expect(result.id).toBe('u1');
    const [path, init] = fn.mock.calls[0]!;
    expect(String(path)).toBe('/api/auth/login');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      email: 'e@x.hu',
      password: 'pw',
    });
  });

  it('register posts name/email/password to /api/auth/register', async () => {
    const fn = stubFetch((path) =>
      path === '/api/auth/register'
        ? { status: 201, body: { user } }
        : { status: 404, body: {} },
    );

    await register({ name: 'E', email: 'e@x.hu', password: 'hunter2hunter2' });

    const [path, init] = fn.mock.calls[0]!;
    expect(String(path)).toBe('/api/auth/register');
    expect(JSON.parse(String(init?.body))).toEqual({
      name: 'E',
      email: 'e@x.hu',
      password: 'hunter2hunter2',
    });
  });

  it('getMe issues a GET to /api/auth/me', async () => {
    const fn = stubFetch((path) =>
      path === '/api/auth/me'
        ? { status: 200, body: { user } }
        : { status: 404, body: {} },
    );

    await getMe();

    const [path, init] = fn.mock.calls[0]!;
    expect(String(path)).toBe('/api/auth/me');
    expect(init?.method).toBe('GET');
  });
});
