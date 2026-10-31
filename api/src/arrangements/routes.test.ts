import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as auth from '../auth/service.js';
import { buildApp } from '../app.js';
import { loadEnv } from '../config.js';
import { groupMembers } from '../db/schema.js';
import { buildTestDb } from '../test-utils/db.js';

// Integration tests: need a real Postgres (DATABASE_URL). Skipped when it is
// not set so `pnpm test` stays green on a bare checkout; CI provides the DB
// and therefore always runs them. Tests use unique emails/songs per run and
// never wipe tables, so they are safe against a reused dev database.
const dbUrl = process.env.DATABASE_URL;
const password = 'correct horse battery staple';

describe.skipIf(!dbUrl)('arrangements routes', () => {
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

  const createSong = async (token: string) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/songs',
      payload: {
        title: `Song ${randomUUID()}`,
        defaultKey: 'G',
        visibility: 'group',
      },
      cookies: { [auth.SESSION_COOKIE]: token },
    });
    expect(res.statusCode).toBe(201);
    return res.json().song as { id: string };
  };

  const validArrangement = () => ({
    title: 'Acoustic unplugged',
    originalKey: 'G',
    bpm: 96,
    sections: [
      {
        label: 'V1',
        content: 'X:1\nT:Verse 1\nM:4/4\nL:1/4\nK:G\nGAB c2B | A2 G2 |',
      },
      {
        label: 'C1',
        content: 'X:1\nT:Chorus\nM:4/4\nL:1/4\nK:G\nG2 G2 G2 G2 |',
      },
    ],
    // Repeats are legal: a sequence is a play order, not a set.
    defaultSequence: ['V1', 'C1', 'V1'],
  });

  it('rejects anonymous requests with 401', async () => {
    const list = await app.inject({
      method: 'GET',
      url: `/api/songs/${randomUUID()}/arrangements`,
    });
    expect(list.statusCode).toBe(401);

    const get = await app.inject({
      method: 'GET',
      url: `/api/arrangements/${randomUUID()}`,
    });
    expect(get.statusCode).toBe(401);
  });

  it('lets a reader list and read arrangements but not create them', async () => {
    const { token, user } = await registerUser();
    // The song must exist before demoting: creating it needs member.
    const song = await createSong(token);
    // Demote directly in the DB (see songs routes test for why) and restore
    // afterwards — this suite shares one database with the other files.
    const [membership] = await db
      .select({ role: groupMembers.role })
      .from(groupMembers)
      .where(eq(groupMembers.userId, user.id));
    const originalRole = membership!.role;

    try {
      await db
        .update(groupMembers)
        .set({ role: 'reader' })
        .where(eq(groupMembers.userId, user.id));

      const list = await app.inject({
        method: 'GET',
        url: `/api/songs/${song.id}/arrangements`,
        cookies: { [auth.SESSION_COOKIE]: token },
      });
      expect(list.statusCode).toBe(200);
      expect(Array.isArray(list.json().arrangements)).toBe(true);

      const create = await app.inject({
        method: 'POST',
        url: `/api/songs/${song.id}/arrangements`,
        payload: validArrangement(),
        cookies: { [auth.SESSION_COOKIE]: token },
      });
      expect(create.statusCode).toBe(403);
    } finally {
      await db
        .update(groupMembers)
        .set({ role: originalRole })
        .where(eq(groupMembers.userId, user.id));
    }
  });

  it('creates (201), lists, reads, updates, and deletes an arrangement', async () => {
    const { token } = await registerUser();
    const song = await createSong(token);
    const cookies = { [auth.SESSION_COOKIE]: token };

    const created = await app.inject({
      method: 'POST',
      url: `/api/songs/${song.id}/arrangements`,
      payload: validArrangement(),
      cookies,
    });
    expect(created.statusCode).toBe(201);
    const arrangement = created.json().arrangement;
    expect(arrangement.title).toBe('Acoustic unplugged');
    expect(arrangement.defaultSequence).toEqual(['V1', 'C1', 'V1']);
    expect(arrangement.version).toBe(1);

    const list = await app.inject({
      method: 'GET',
      url: `/api/songs/${song.id}/arrangements`,
      cookies,
    });
    expect(list.statusCode).toBe(200);
    expect(
      list
        .json()
        .arrangements.some((a: { id: string }) => a.id === arrangement.id),
    ).toBe(true);

    const got = await app.inject({
      method: 'GET',
      url: `/api/arrangements/${arrangement.id}`,
      cookies,
    });
    expect(got.statusCode).toBe(200);
    expect(got.json().arrangement.sections).toHaveLength(2);

    // Update with the version we saw: check-and-bump to 2.
    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/arrangements/${arrangement.id}`,
      payload: { ...validArrangement(), title: 'Acoustic (slow)', version: 1 },
      cookies,
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().arrangement.title).toBe('Acoustic (slow)');
    expect(updated.json().arrangement.version).toBe(2);

    // Same stale version again: the row moved on, so 409 not a silent write.
    const conflict = await app.inject({
      method: 'PATCH',
      url: `/api/arrangements/${arrangement.id}`,
      payload: { ...validArrangement(), version: 1 },
      cookies,
    });
    expect(conflict.statusCode).toBe(409);

    const missing = await app.inject({
      method: 'PATCH',
      url: `/api/arrangements/${randomUUID()}`,
      payload: { ...validArrangement(), version: 1 },
      cookies,
    });
    expect(missing.statusCode).toBe(404);

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/arrangements/${arrangement.id}`,
      payload: { version: 2 },
      cookies,
    });
    expect(deleted.statusCode).toBe(200);

    const afterDelete = await app.inject({
      method: 'GET',
      url: `/api/arrangements/${arrangement.id}`,
      cookies,
    });
    expect(afterDelete.statusCode).toBe(404);
  });

  it('rejects a sequence referencing an unknown section label with 400', async () => {
    const { token } = await registerUser();
    const song = await createSong(token);

    const res = await app.inject({
      method: 'POST',
      url: `/api/songs/${song.id}/arrangements`,
      payload: { ...validArrangement(), defaultSequence: ['V1', 'Bridge'] },
      cookies: { [auth.SESSION_COOKIE]: token },
    });

    expect(res.statusCode).toBe(400);
    const issues = res.json().issues as { path: string; message: string }[];
    expect(issues.some((i) => i.path === 'defaultSequence.1')).toBe(true);
  });

  it('rejects duplicate section labels with 400', async () => {
    const { token } = await registerUser();
    const song = await createSong(token);

    const res = await app.inject({
      method: 'POST',
      url: `/api/songs/${song.id}/arrangements`,
      payload: {
        ...validArrangement(),
        sections: [
          { label: 'V1', content: 'X:1\nK:G\nG2 G2 |' },
          { label: 'V1', content: 'X:1\nK:G\nA2 A2 |' },
        ],
        defaultSequence: ['V1'],
      },
      cookies: { [auth.SESSION_COOKIE]: token },
    });

    expect(res.statusCode).toBe(400);
    const issues = res.json().issues as { path: string }[];
    expect(issues.some((i) => i.path === 'sections')).toBe(true);
  });

  it('rejects an invalid key and a missing version with 400 before touching the DB', async () => {
    const { token } = await registerUser();
    const song = await createSong(token);
    const cookies = { [auth.SESSION_COOKIE]: token };

    const badKey = await app.inject({
      method: 'POST',
      url: `/api/songs/${song.id}/arrangements`,
      payload: { ...validArrangement(), originalKey: 'H' },
      cookies,
    });
    expect(badKey.statusCode).toBe(400);

    const created = await app.inject({
      method: 'POST',
      url: `/api/songs/${song.id}/arrangements`,
      payload: validArrangement(),
      cookies,
    });
    const arrangement = created.json().arrangement;

    const noVersion = await app.inject({
      method: 'PATCH',
      url: `/api/arrangements/${arrangement.id}`,
      payload: validArrangement(),
      cookies,
    });
    expect(noVersion.statusCode).toBe(400);
  });

  it('returns 404 when nesting under a song that does not exist', async () => {
    const { token } = await registerUser();

    const res = await app.inject({
      method: 'POST',
      url: `/api/songs/${randomUUID()}/arrangements`,
      payload: validArrangement(),
      cookies: { [auth.SESSION_COOKIE]: token },
    });
    expect(res.statusCode).toBe(404);
  });
});
