import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as auth from '../auth/service.js';
import type { GroupRole } from '../auth/authorize.js';
import { buildApp } from '../app.js';
import { loadEnv } from '../config.js';
import { groupMembers } from '../db/schema.js';
import { buildTestDb } from '../test-utils/db.js';

// Integration tests: need a real Postgres (DATABASE_URL). Skipped when it is
// not set so `pnpm test` stays green on a bare checkout; CI provides the DB
// and therefore always runs them. Tests use unique emails/tags per run and
// never wipe tables, so they are safe against a reused dev database.
const dbUrl = process.env.DATABASE_URL;
const password = 'correct horse battery staple';

describe.skipIf(!dbUrl)('tags routes', () => {
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

  const registerUser = async () => {
    const email = `${randomUUID()}@example.com`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email, name: 'Test User', password },
    });
    expect(res.statusCode).toBe(201);
    const token = res.cookies.find(
      (c) => c.name === auth.SESSION_COOKIE,
    )!.value;
    return { token, user: res.json().user as { id: string; email: string } };
  };

  // Role changes go directly through the DB (see songs routes test for why);
  // the original role is always restored — this suite shares one database
  // with the other files, and the auth suite asserts bootstrap roles.
  const setRole = async (userId: string, role: GroupRole) => {
    const [membership] = await db
      .select({ role: groupMembers.role })
      .from(groupMembers)
      .where(eq(groupMembers.userId, userId));
    await db
      .update(groupMembers)
      .set({ role })
      .where(eq(groupMembers.userId, userId));
    return membership!.role;
  };

  it('rejects anonymous requests with 401', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/tags' });
    expect(list.statusCode).toBe(401);

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/tags/${randomUUID()}`,
    });
    expect(del.statusCode).toBe(401);
  });

  it('lets a reader list tags but not delete them', async () => {
    const { token, user } = await registerUser();
    const cookies = { [auth.SESSION_COOKIE]: token };
    const original = await setRole(user.id, 'reader');

    try {
      const list = await app.inject({
        method: 'GET',
        url: '/api/tags',
        cookies,
      });
      expect(list.statusCode).toBe(200);
      expect(Array.isArray(list.json().tags)).toBe(true);

      const del = await app.inject({
        method: 'DELETE',
        url: `/api/tags/${randomUUID()}`,
        cookies,
      });
      expect(del.statusCode).toBe(403);
    } finally {
      await setRole(user.id, original);
    }
  });

  it('creates tags inline with songs (normalized + deduped), deletes only for group_manager, cascades to songs', async () => {
    const { token, user } = await registerUser();
    const cookies = { [auth.SESSION_COOKIE]: token };

    const created = await app.inject({
      method: 'POST',
      url: '/api/songs',
      payload: {
        title: `Tagged ${randomUUID()}`,
        defaultKey: 'G',
        visibility: 'group',
        tags: ['Easter', 'campfire', 'easter'],
      },
      cookies,
    });
    expect(created.statusCode).toBe(201);
    // "Easter"/"easter" normalize to one tag, deduped; tags come back alphabetical.
    expect(created.json().song.tags).toEqual(['campfire', 'easter']);
    const songId = created.json().song.id;

    const list = await app.inject({ method: 'GET', url: '/api/tags', cookies });
    const easter = list
      .json()
      .tags.find((t: { name: string }) => t.name === 'easter') as {
      id: string;
      name: string;
    };
    expect(easter).toBeTruthy();

    // member cannot delete a tag
    const original = await setRole(user.id, 'member');
    try {
      const forbidden = await app.inject({
        method: 'DELETE',
        url: `/api/tags/${easter.id}`,
        cookies,
      });
      expect(forbidden.statusCode).toBe(403);
    } finally {
      await setRole(user.id, original);
    }

    // group_manager can; the junction cascades so the song loses the tag
    await setRole(user.id, 'group_manager');
    try {
      const del = await app.inject({
        method: 'DELETE',
        url: `/api/tags/${easter.id}`,
        cookies,
      });
      expect(del.statusCode).toBe(200);

      const song = await app.inject({
        method: 'GET',
        url: `/api/songs/${songId}`,
        cookies,
      });
      expect(song.json().song.tags).toEqual(['campfire']);

      const again = await app.inject({
        method: 'DELETE',
        url: `/api/tags/${easter.id}`,
        cookies,
      });
      expect(again.statusCode).toBe(404);
    } finally {
      await setRole(user.id, original);
    }
  });
});
