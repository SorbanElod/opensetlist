import { randomUUID } from 'node:crypto';
import { createServer, type Server as HttpServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioc, type Socket } from 'socket.io-client';

import * as auth from './auth/service.js';
import { buildApp } from './app.js';
import { loadEnv } from './config.js';
import { buildTestDb } from './test-utils/db.js';
import {
  SETLIST_CHANGED_EVENT,
  attachRealtime,
  emitSetlistChanged,
} from './realtime.js';
import { getSingleGroupId } from './songs/service.js';

// Integration test: needs a real Postgres (DATABASE_URL) and a real socket
// round-trip over a loopback HTTP server. Skipped when no DB is set.
const dbUrl = process.env.DATABASE_URL;

describe.skipIf(!dbUrl)('realtime (issue #13)', () => {
  let db: Awaited<ReturnType<typeof buildTestDb>>['db'];
  let close: () => Promise<void>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let httpServer: HttpServer;
  let port: number;

  beforeAll(async () => {
    ({ db, close } = await buildTestDb(dbUrl!));
    app = await buildApp(
      loadEnv({
        DATABASE_URL: dbUrl!,
        NODE_ENV: 'development',
        LOG_LEVEL: 'fatal',
      }),
      db,
    );
    await app.ready();
    httpServer = createServer();
    attachRealtime(httpServer, db);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const address = httpServer.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    port = address.port;
  });

  afterAll(async () => {
    httpServer.close();
    await app.close();
    await close();
  });

  const registerUser = async () => {
    const email = `${randomUUID()}@example.com`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email,
        name: 'Test User',
        password: 'correct horse battery staple',
      },
    });
    expect(res.statusCode).toBe(201);
    const token = res.cookies.find(
      (c) => c.name === auth.SESSION_COOKIE,
    )!.value;
    return { token, user: res.json().user as { id: string } };
  };

  const connect = (token?: string): Promise<Socket> =>
    new Promise((resolve, reject) => {
      const socket = ioc(`http://127.0.0.1:${port}`, {
        extraHeaders: token
          ? { cookie: `${auth.SESSION_COOKIE}=${token}` }
          : undefined,
        reconnection: false,
      });
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', reject);
    });

  it('rejects a socket without a session cookie', async () => {
    await expect(connect()).rejects.toThrow(/unauthorized/);
  });

  it('accepts an authenticated socket and delivers setlist:changed with the payload', async () => {
    const { token } = await registerUser();
    const socket = await connect(token);
    const groupId = await getSingleGroupId(db);

    const received = new Promise((resolve) =>
      socket.on(SETLIST_CHANGED_EVENT, resolve),
    );
    emitSetlistChanged(groupId, 'sl-1');
    expect(await received).toEqual({ setlistId: 'sl-1' });

    const receivedNull = new Promise((resolve) =>
      socket.on(SETLIST_CHANGED_EVENT, resolve),
    );
    emitSetlistChanged(groupId);
    expect(await receivedNull).toEqual({ setlistId: null });

    socket.close();
  });

  it('a setlist mutation through the HTTP API emits setlist:changed to the group room', async () => {
    const { token } = await registerUser();
    const socket = await connect(token);

    const received = new Promise((resolve) =>
      socket.on(SETLIST_CHANGED_EVENT, resolve),
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/setlists',
      payload: { title: `Live ${randomUUID()}` },
      cookies: { [auth.SESSION_COOKIE]: token },
    });
    expect(res.statusCode).toBe(201);
    const setlistId = (res.json() as { setlist: { id: string } }).setlist.id;

    expect(await received).toEqual({ setlistId });
    socket.close();
  });
});
