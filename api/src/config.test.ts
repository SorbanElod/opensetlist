import { describe, expect, it } from 'vitest';

import { loadEnv } from './config.js';

describe('loadEnv', () => {
  it('fills defaults for an empty environment', () => {
    const env = loadEnv({});

    expect(env).toEqual({
      PORT: 3000,
      HOST: '127.0.0.1',
      LOG_LEVEL: 'info',
    });
  });

  it('coerces PORT from a string to a number', () => {
    const env = loadEnv({ PORT: '4000' });

    expect(env.PORT).toBe(4000);
    expect(env.PORT).not.toBe('4000');
  });

  it('rejects an invalid PORT instead of silently using it', () => {
    expect(() => loadEnv({ PORT: 'not-a-number' })).toThrow();
  });
});
