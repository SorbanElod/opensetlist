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

describe.skipIf(!dbUrl)('songs routes', () => {
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

  const validSong = () => ({
    title: 'Amazing Grace',
    author: 'John Newton',
    defaultKey: 'G',
    visibility: 'group',
    language: 'en',
  });

  it('rejects anonymous requests with 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/songs' });
    expect(res.statusCode).toBe(401);
  });

  it('lets a reader list and read songs but not create them', async () => {
    const { token, user } = await registerUser();
    // Demote directly in the DB: role changes through the API need a
    // group_manager, which on a fresh CI database may not exist yet.
    // Restore the original role afterwards — this suite shares one database
    // with the other test files, and the auth suite asserts that the oldest
    // member holds group_manager.
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
        url: '/api/songs',
        cookies: { [auth.SESSION_COOKIE]: token },
      });
      expect(list.statusCode).toBe(200);
      expect(Array.isArray(list.json().songs)).toBe(true);

      const create = await app.inject({
        method: 'POST',
        url: '/api/songs',
        payload: validSong(),
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

  it('creates a song (201), lists it, and reads it by id', async () => {
    const { token } = await registerUser();

    const created = await app.inject({
      method: 'POST',
      url: '/api/songs',
      payload: validSong(),
      cookies: { [auth.SESSION_COOKIE]: token },
    });
    expect(created.statusCode).toBe(201);
    const song = created.json().song;
    expect(song.title).toBe('Amazing Grace');
    expect(song.defaultKey).toBe('G');
    expect(song.language).toBe('en');
    expect(song.version).toBe(1);

    const list = await app.inject({
      method: 'GET',
      url: '/api/songs',
      cookies: { [auth.SESSION_COOKIE]: token },
    });
    expect(list.json().songs.map((s: { id: string }) => s.id)).toContain(
      song.id,
    );

    const got = await app.inject({
      method: 'GET',
      url: `/api/songs/${song.id}`,
      cookies: { [auth.SESSION_COOKIE]: token },
    });
    expect(got.statusCode).toBe(200);
    expect(got.json().song.title).toBe('Amazing Grace');
  });

  it('rejects invalid payloads with 400 before touching the DB', async () => {
    const { token } = await registerUser();
    const cookie = { [auth.SESSION_COOKIE]: token };

    const before = await app.inject({
      method: 'GET',
      url: '/api/songs',
      cookies: cookie,
    });
    const countBefore = before.json().songs.length;

    const bad = await app.inject({
      method: 'POST',
      url: '/api/songs',
      payload: { title: '', defaultKey: 'H', language: 'english' },
      cookies: cookie,
    });
    expect(bad.statusCode).toBe(400);
    const body = bad.json();
    expect(body.message).toBe('Invalid input');
    const paths = body.issues.map((i: { path: string }) => i.path);
    expect(paths).toContain('title');
    expect(paths).toContain('defaultKey');
    expect(paths).toContain('language');

    const after = await app.inject({
      method: 'GET',
      url: '/api/songs',
      cookies: cookie,
    });
    expect(after.json().songs.length).toBe(countBefore);
  });

  it('returns 404 for an unknown song id', async () => {
    const { token } = await registerUser();
    const res = await app.inject({
      method: 'GET',
      url: `/api/songs/${randomUUID()}`,
      cookies: { [auth.SESSION_COOKIE]: token },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().message).toBe('Song not found');
  });

  it('updates with check-and-bump: stale version gets 409, fresh version wins', async () => {
    const { token } = await registerUser();
    const cookie = { [auth.SESSION_COOKIE]: token };

    const created = await app.inject({
      method: 'POST',
      url: '/api/songs',
      payload: validSong(),
      cookies: cookie,
    });
    const song = created.json().song;

    const stale = await app.inject({
      method: 'PATCH',
      url: `/api/songs/${song.id}`,
      payload: { title: 'Stale edit', version: song.version + 5 },
      cookies: cookie,
    });
    expect(stale.statusCode).toBe(409);

    const ok = await app.inject({
      method: 'PATCH',
      url: `/api/songs/${song.id}`,
      payload: {
        title: 'Amazing Grace (reprise)',
        language: 'hu',
        version: song.version,
      },
      cookies: cookie,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().song.title).toBe('Amazing Grace (reprise)');
    expect(ok.json().song.language).toBe('hu');
    expect(ok.json().song.version).toBe(song.version + 1);

    // The stale writer retrying with the old version still conflicts.
    const staleAgain = await app.inject({
      method: 'PATCH',
      url: `/api/songs/${song.id}`,
      payload: { title: 'Stale edit', version: song.version },
      cookies: cookie,
    });
    expect(staleAgain.statusCode).toBe(409);
  });

  it('rejects an invalid update with 400', async () => {
    const { token } = await registerUser();
    const cookie = { [auth.SESSION_COOKIE]: token };

    const created = await app.inject({
      method: 'POST',
      url: '/api/songs',
      payload: validSong(),
      cookies: cookie,
    });
    const song = created.json().song;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/songs/${song.id}`,
      payload: { defaultKey: 'H', version: song.version },
      cookies: cookie,
    });
    expect(res.statusCode).toBe(400);
  });

  it('imports songs from a JSON seed (maps authors/visibility, derives key, skips arrangements)', async () => {
    const { token } = await registerUser();
    const cookie = { [auth.SESSION_COOKIE]: token };

    const res = await app.inject({
      method: 'POST',
      url: '/api/songs/import',
      cookies: cookie,
      payload: {
        songs: [
          {
            title: 'Lorem Ipsum Dolor',
            authors: { lyrics: 'Lorem Szerző', music: 'Ipsum Zeneszerző' },
            visibility: 'GROUP',
            arrangements: [{ original_key: 'G' }, { original_key: 'E' }],
          },
          {
            title: 'Lőrém Ípszűm Dőlőr',
            authors: { lyrics: 'Lőrém Szerző' },
            arrangements: [{ original_key: 'E' }],
          },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.imported).toBe(2);
    expect(body.skippedArrangements).toBe(3);
    const first = body.songs.find(
      (s: { title: string }) => s.title === 'Lorem Ipsum Dolor',
    );
    expect(first.author).toBe('Lorem Szerző · Ipsum Zeneszerző');
    expect(first.visibility).toBe('group');
    expect(first.defaultKey).toBe('G'); // derived from the first arrangement
    const second = body.songs.find(
      (s: { title: string }) => s.title === 'Lőrém Ípszűm Dőlőr',
    );
    expect(second.author).toBe('Lőrém Szerző');
    expect(second.defaultKey).toBe('E');

    // The created songs show up in the list (matched by id — the shared test
    // DB may already contain same-titled rows from earlier runs).
    const list = await app.inject({
      method: 'GET',
      url: '/api/songs',
      cookies: cookie,
    });
    const listedIds = list.json().songs.map((s: { id: string }) => s.id);
    for (const s of body.songs) expect(listedIds).toContain(s.id);
  });

  it('rejects an invalid import payload with 400', async () => {
    const { token } = await registerUser();
    const res = await app.inject({
      method: 'POST',
      url: '/api/songs/import',
      cookies: { [auth.SESSION_COOKIE]: token },
      payload: { songs: [] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe('Invalid input');
  });

  it('deletes with the current version; stale version gets 409, then GET is 404', async () => {
    const { token } = await registerUser();
    const cookie = { [auth.SESSION_COOKIE]: token };

    const created = await app.inject({
      method: 'POST',
      url: '/api/songs',
      payload: validSong(),
      cookies: cookie,
    });
    const song = created.json().song;

    const stale = await app.inject({
      method: 'DELETE',
      url: `/api/songs/${song.id}`,
      payload: { version: song.version + 1 },
      cookies: cookie,
    });
    expect(stale.statusCode).toBe(409);

    const ok = await app.inject({
      method: 'DELETE',
      url: `/api/songs/${song.id}`,
      payload: { version: song.version },
      cookies: cookie,
    });
    expect(ok.statusCode).toBe(200);

    const got = await app.inject({
      method: 'GET',
      url: `/api/songs/${song.id}`,
      cookies: cookie,
    });
    expect(got.statusCode).toBe(404);
  });
});
