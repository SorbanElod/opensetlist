import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SESSION_COOKIE, hashPassword, registerUser } from '../auth/service.js';
import { groupMembers, users } from '../db/schema.js';
import { buildTestDb } from '../test-utils/db.js';
import { loadEnv } from '../config.js';
import { buildApp } from '../app.js';

// Permission matrix at the HTTP level. Role assignments are set up directly
// in the database so no test depends on registration order (the shared dev
// database already has members from earlier runs).
const dbUrl = process.env.DATABASE_URL;
const PASSWORD = 'correct horse battery staple';

describe.skipIf(!dbUrl)('authorize() permission matrix', () => {
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

  // registerUser creates the user in the single group as member (or
  // group_manager on a truly fresh database); the explicit update makes the
  // role deterministic regardless of database state.
  async function userWithRole(role: 'reader' | 'member' | 'group_manager') {
    const user = await registerUser(db, {
      email: newEmail(),
      name: 'Matrix User',
      passwordHash: await hashPassword(PASSWORD),
    });

    await db
      .update(groupMembers)
      .set({ role })
      .where(eq(groupMembers.userId, user.id));

    return user;
  }

  async function membershipIdOf(userId: string): Promise<string> {
    const [row] = await db
      .select()
      .from(groupMembers)
      .where(eq(groupMembers.userId, userId));

    return row!.id;
  }

  async function login(email: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: PASSWORD },
    });

    return res.cookies.find((c) => c.name === SESSION_COOKIE)!.value;
  }

  const call = (
    method: 'GET' | 'PATCH' | 'DELETE',
    id: string,
    { cookie, payload }: { cookie?: string; payload?: object } = {},
  ) =>
    app.inject({
      method,
      url: `/api/members${id ? `/${id}` : ''}`,
      payload,
      cookies: cookie ? { [SESSION_COOKIE]: cookie } : {},
    });

  it('rejects anonymous requests with 401, not 403', async () => {
    const res = await call('GET', '');

    expect(res.statusCode).toBe(401);
  });

  it('lets a reader list members but nothing else', async () => {
    const cookie = await login((await userWithRole('reader')).email);

    expect((await call('GET', '', { cookie })).statusCode).toBe(200);
    expect(
      (
        await call('PATCH', randomUUID(), {
          cookie,
          payload: { role: 'member' },
        })
      ).statusCode,
    ).toBe(403);
    expect((await call('DELETE', randomUUID(), { cookie })).statusCode).toBe(
      403,
    );
  });

  it('lets a member read but not manage (403)', async () => {
    const cookie = await login((await userWithRole('member')).email);

    expect((await call('GET', '', { cookie })).statusCode).toBe(200);
    expect(
      (
        await call('PATCH', randomUUID(), {
          cookie,
          payload: { role: 'reader' },
        })
      ).statusCode,
    ).toBe(403);
    expect((await call('DELETE', randomUUID(), { cookie })).statusCode).toBe(
      403,
    );
  });

  it('lets a group_manager change a role and remove a member', async () => {
    const managerCookie = await login(
      (await userWithRole('group_manager')).email,
    );
    const target = await userWithRole('reader');
    const targetMembership = await membershipIdOf(target.id);

    const patch = await call('PATCH', targetMembership, {
      cookie: managerCookie,
      payload: { role: 'member' },
    });

    expect(patch.statusCode).toBe(200);
    expect(patch.json().member.role).toBe('member');
    expect(patch.json().member.userId).toBe(target.id);

    const del = await call('DELETE', targetMembership, {
      cookie: managerCookie,
    });

    expect(del.statusCode).toBe(200);
    const [gone] = await db
      .select()
      .from(groupMembers)
      .where(eq(groupMembers.id, targetMembership));
    expect(gone).toBeUndefined();
  });

  it('lets a superadmin through without any membership row', async () => {
    const superadmin = await userWithRole('member');

    await db
      .update(users)
      .set({ isSuperadmin: true })
      .where(eq(users.id, superadmin.id));
    // Delete the membership: the bypass must work with NO group_members row.
    await db.delete(groupMembers).where(eq(groupMembers.userId, superadmin.id));

    const cookie = await login(superadmin.email);
    const target = await userWithRole('reader');
    const targetMembership = await membershipIdOf(target.id);

    const patch = await call('PATCH', targetMembership, {
      cookie,
      payload: { role: 'member' },
    });

    expect(patch.statusCode).toBe(200);
    expect(patch.json().member.role).toBe('member');
  });

  it('rejects an invalid role with 400 and an unknown member with 404', async () => {
    const cookie = await login((await userWithRole('group_manager')).email);

    const badRole = await call('PATCH', randomUUID(), {
      cookie,
      payload: { role: 'admin' },
    });
    expect(badRole.statusCode).toBe(400);

    const unknown = await call('PATCH', randomUUID(), {
      cookie,
      payload: { role: 'reader' },
    });
    expect(unknown.statusCode).toBe(404);
  });
});
