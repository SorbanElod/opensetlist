import { vi } from 'vitest';

export type FetchHandler = (
  path: string,
  init?: RequestInit,
) => { status: number; body?: unknown };

// Our api client only reads ok/status/text(), so a plain object is enough —
// no need for a real Response.
export function jsonResponse(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  } as unknown as Response;
}

export function stubFetch(handler: FetchHandler) {
  const fn = vi.fn(async (input: unknown, init?: RequestInit) => {
    const path = typeof input === 'string' ? input : (input as Request).url;
    const { status, body } = handler(path, init);
    return jsonResponse(status, body);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}
