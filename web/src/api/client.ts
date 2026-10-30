// Thin fetch wrapper: every API call goes through here, so JSON handling,
// credentials, and error normalization live in exactly one place.

export type ApiIssue = { path: string; message: string };

export type ApiErrorBody = {
  message: string;
  issues?: ApiIssue[];
};

export class ApiError extends Error {
  readonly status: number;
  readonly issues?: ApiIssue[];

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.issues = body.issues;
  }
}

export async function apiFetch<T>(
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? 'GET',
    // same-origin is fetch's default, but explicit: the httpOnly session
    // cookie must ride along on every /api call (first-party via the Vite
    // dev proxy, see vite.config.ts).
    credentials: 'same-origin',
    headers:
      options.body === undefined
        ? undefined
        : { 'Content-Type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  const data: unknown = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const body = (data ?? {}) as Partial<ApiErrorBody>;
    throw new ApiError(response.status, {
      message: body.message ?? `Request failed with status ${response.status}`,
      issues: body.issues,
    });
  }

  return data as T;
}
