import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiFetch } from './client';
import { stubFetch } from '../test/fetchMock';

afterEach(() => vi.unstubAllGlobals());

describe('apiFetch', () => {
  it('sends JSON with same-origin credentials and parses the response', async () => {
    const fn = stubFetch(() => ({ status: 200, body: { user: { id: '1' } } }));

    const result = await apiFetch<{ user: { id: string } }>('/api/auth/me', {
      method: 'POST',
      body: { a: 1 },
    });

    expect(result.user.id).toBe('1');
    const init = fn.mock.calls[0]![1]!;
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
  });

  it('sends no body and no content-type for GET', async () => {
    const fn = stubFetch(() => ({ status: 200, body: { user: { id: '1' } } }));

    await apiFetch('/api/auth/me');

    const init = fn.mock.calls[0]![1]!;
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(init.headers).toBeUndefined();
  });

  it('throws ApiError with the API message and issues on failure', async () => {
    stubFetch(() => ({
      status: 400,
      body: {
        message: 'Invalid input',
        issues: [{ path: 'password', message: 'too short' }],
      },
    }));

    const err = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: {},
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.message).toBe('Invalid input');
    expect(apiErr.status).toBe(400);
    expect(apiErr.issues).toEqual([{ path: 'password', message: 'too short' }]);
  });

  it('falls back to a generic message when the error body has none', async () => {
    stubFetch(() => ({ status: 500, body: {} }));

    await expect(apiFetch('/api/auth/me')).rejects.toThrow(
      'Request failed with status 500',
    );
  });
});
