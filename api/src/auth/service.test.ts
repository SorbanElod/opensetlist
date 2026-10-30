import { describe, expect, it } from 'vitest';

import * as auth from './service.js';

const password = 'correct horse battery staple';

describe('password hashing', () => {
  it('produces an argon2id hash that verifies the right password only', async () => {
    const hash = await auth.hashPassword(password);

    // $argon2id$ prefix identifies the algorithm and variant.
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await auth.verifyPassword(password, hash)).toBe(true);
    expect(await auth.verifyPassword('wrong password', hash)).toBe(false);
  });

  it('salts: the same password hashes differently every time', async () => {
    const [a, b] = await Promise.all([
      auth.hashPassword(password),
      auth.hashPassword(password),
    ]);

    expect(a).not.toBe(b);
  });
});

describe('session tokens', () => {
  it('creates 256-bit URL-safe tokens whose hash matches', () => {
    const { token, tokenHash } = auth.newSessionToken();

    // base64url of 32 bytes = 43 chars, no +/= padding.
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenHash).toBe(auth.hashSessionToken(token));
  });

  it('never repeats a token', () => {
    const tokens = new Set(
      Array.from({ length: 1000 }, () => auth.newSessionToken().token),
    );

    expect(tokens.size).toBe(1000);
  });

  it('expires 30 days out', () => {
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const delta = auth.sessionExpiry().getTime() - Date.now();

    expect(delta).toBeGreaterThanOrEqual(thirtyDays - 5000);
    expect(delta).toBeLessThanOrEqual(thirtyDays + 5000);
  });
});
