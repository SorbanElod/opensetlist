import { randomUUID } from 'node:crypto';
import { count, eq, inArray } from 'drizzle-orm';
import cookiePlugin from '@fastify/cookie';
import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { authRoutes } from './routes.js';
import * as auth from './service.js';
import { groupMembers, groups, sessions } from '../db/schema.js';
import { buildTestDb } from '../test-utils/db.js';
import { loadEnv } from '../config.js';
import { buildApp } from '../app.js';

// Integration tests: need a real Postgres (DATABASE_URL). Skipped when it is
// not set so `pnpm test` stays green on a bare checkout; CI provides the DB
// and therefore always runs them.
const dbUrl = process.env.DATABASE_URL;
const password = 'correct horse battery staple';

describe.skipIf(!dbUrl)('auth routes', () => {
  let db: Awaited<ReturnType<typeof buildTestDb>>['db'];
  let close: () => Promise<void>;
  let app: Awaited<ReturnType<typeof buildApp>>;

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
  });

  afterAll(async () => {
    await app.close();
    await close();
  });

  const newEmail = () => `${randomUUID()}@example.com`;
  const register = (email = newEmail()) =>
    app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email, name: 'Test User', password },
    });
  const sessionCookie = (res: { cookies: { name: string; value: string }[] }) =>
    res.cookies.find((c) => c.name === auth.SESSION_COOKIE)?.value;
  const meWith = (token?: string) =>
    app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: token ? { [auth.SESSION_COOKIE]: token } : {},
    });

  it('registers, auto-logs in with an httpOnly cookie, and never echoes the password or hash', async () => {
    const email = newEmail();
    const res = await register(email);

    expect(res.statusCode).toBe(201);
    const body = res.json();

    expect(body.user.email).toBe(email);
    expect(body.user).not.toHaveProperty('password');
    expect(body.user).not.toHaveProperty('passwordHash');

    const cookie = res.cookies.find((c) => c.name === auth.SESSION_COOKIE);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Lax');

    // The cookie works without logging in again.
    const me = await meWith(sessionCookie(res));
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe(email);
  });

  it('first registrant on an empty group becomes group_manager, later ones join as member', async () => {
    // Scoped to this test's own registrations: the suite shares one database
    // across test files, so "the oldest member overall" is not a stable
    // invariant — only the group's emptiness at test start decides the
    // bootstrap branch.
    const [group] = await db.select().from(groups).limit(1);
    let groupWasEmpty = !group;
    if (group) {
      const rows = await db
        .select({ n: count() })
        .from(groupMembers)
        .where(eq(groupMembers.groupId, group.id));
      groupWasEmpty = (rows[0]?.n ?? 0) === 0;
    }

    const first = await register();
    const second = await register();

    const roles = await db
      .select()
      .from(groupMembers)
      .where(
        inArray(groupMembers.userId, [
          first.json().user.id,
          second.json().user.id,
        ]),
      );
    expect(roles).toHaveLength(2);
    const roleOf = (userId: string) =>
      roles.find((m) => m.userId === userId)?.role;

    if (groupWasEmpty) {
      // Fresh database (CI): the very first registrant bootstraps the group.
      expect(roleOf(first.json().user.id)).toBe('group_manager');
      expect(roleOf(second.json().user.id)).toBe('member');
    } else {
      // Reused/dev database: bootstrap already happened, both join as member.
      expect(roles.every((m) => m.role === 'member')).toBe(true);
    }
  });

  it('logs in with the right password and sets a working cookie', async () => {
    const email = newEmail();
    await register(email);

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password },
    });

    expect(res.statusCode).toBe(200);
    const me = await meWith(sessionCookie(res));
    expect(me.json().user.email).toBe(email);
  });

  it('rejects wrong password and unknown email with the same message', async () => {
    const email = newEmail();
    await register(email);

    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: 'definitely wrong pass' },
    });
    const unknownEmail = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: newEmail(), password },
    });

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    // Identical bodies: the API never confirms which emails exist.
    expect(wrongPassword.json()).toEqual(unknownEmail.json());
  });

  it('rejects a duplicate email with 409, not a 500', async () => {
    const email = newEmail();
    await register(email);

    const res = await register(email);

    expect(res.statusCode).toBe(409);
  });

  it('logs out: cookie cleared and session revoked', async () => {
    const res = await register();
    const token = sessionCookie(res);

    const logout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      cookies: { [auth.SESSION_COOKIE]: token! },
    });

    expect(logout.statusCode).toBe(200);

    const me = await meWith(token);
    expect(me.statusCode).toBe(401);
  });

  it('treats an expired session as unauthenticated', async () => {
    const res = await register();
    const user = res.json().user;

    // Forge a session that is already expired — only possible by writing
    // the row directly, which is the point: expiry is enforced in SQL.
    const { token, tokenHash } = auth.newSessionToken();
    await db.insert(sessions).values({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() - 1000),
    });

    const me = await meWith(token);
    expect(me.statusCode).toBe(401);
  });

  it('rejects invalid registration input with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'not-an-email', name: '', password: 'short' },
    });

    expect(res.statusCode).toBe(400);
    const issues: { path: string }[] = res.json().issues;
    expect(issues.map((i) => i.path)).toContain('email');
    expect(issues.map((i) => i.path)).toContain('password');
  });

  it('never writes the password to the log, even at trace level', async () => {
    // In-memory log sink; trace is Fastify's most verbose level, so if the
    // password is not there, it is logged nowhere.
    const chunks: string[] = [];
    const logged = Fastify({
      logger: {
        level: 'trace',
        stream: { write: (c: string) => chunks.push(c) },
      },
    });

    await logged.register(cookiePlugin);
    await logged.register(authRoutes, { db });

    const email = newEmail();
    const uniquePassword = `pw-${randomUUID()}`;
    await logged.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email, name: 'Leaky', password: uniquePassword },
    });
    await logged.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: uniquePassword },
    });
    await logged.close();

    const everything = chunks.join('');
    expect(everything).not.toContain(uniquePassword);
  });
});
