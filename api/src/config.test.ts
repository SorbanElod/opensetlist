import { describe, expect, it } from 'vitest';

import { loadEnv } from './config.js';

const DATABASE_URL = 'postgres://user:pass@localhost:5432/opensetlist';

describe('loadEnv', () => {
  it('fills defaults when only DATABASE_URL is given', () => {
    const env = loadEnv({ DATABASE_URL });

    expect(env).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      HOST: '127.0.0.1',
      LOG_LEVEL: 'info',
      DATABASE_URL,
    });
  });

  it('rejects a missing DATABASE_URL at startup, not at first query', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it('coerces PORT from a string to a number', () => {
    const env = loadEnv({ DATABASE_URL, PORT: '4000' });

    expect(env.PORT).toBe(4000);
    expect(env.PORT).not.toBe('4000');
  });

  it('rejects an invalid PORT instead of silently using it', () => {
    expect(() => loadEnv({ DATABASE_URL, PORT: 'not-a-number' })).toThrow();
  });
});
