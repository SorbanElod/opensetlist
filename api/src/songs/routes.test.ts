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

  it('imports songs with their arrangements from a JSON seed (maps authors/visibility, derives key)', async () => {
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
            tags: ['easter', 'Campfire'],
            arrangements: [
              {
                title: 'Standard (G)',
                original_key: 'G',
                bpm: 92,
                default_sequence: ['V1', 'C', 'V1'],
                sections: [
                  {
                    label: 'V1',
                    kind: 'VERSE', // extra seed keys are stripped
                    content: 'X:1\nT:V1\nM:4/4\nK:G\nG2 G2 |',
                  },
                  {
                    label: 'C',
                    kind: 'CHORUS',
                    content: 'X:2\nT:C\nM:4/4\nK:G\nC2 C2 |',
                  },
                ],
              },
              {
                title: 'Transposed (E)',
                original_key: 'E',
                default_sequence: ['V1'],
                sections: [{ label: 'V1', content: 'X:1\nK:E\nE2 E2 |' }],
              },
            ],
          },
          {
            title: 'Lőrém Ípszűm Dőlőr',
            authors: { lyrics: 'Lőrém Szerző' },
            arrangements: [
              {
                title: 'Standard (E)',
                original_key: 'E',
                default_sequence: [],
                sections: [],
              },
            ],
          },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.imported).toBe(2);
    expect(body.arrangementsImported).toBe(3);
    expect(body.tagsImported).toBe(2);
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

    // The arrangements really landed, with sections and sequence intact.
    const arrList = await app.inject({
      method: 'GET',
      url: `/api/songs/${first.id}/arrangements`,
      cookies: cookie,
    });
    expect(arrList.statusCode).toBe(200);
    const arrangements = arrList.json().arrangements as {
      title: string;
      bpm: number | null;
      defaultSequence: string[];
      sections: { label: string; content: string }[];
    }[];
    expect(arrangements).toHaveLength(2);
    const standard = arrangements.find((a) => a.title === 'Standard (G)')!;
    expect(standard.bpm).toBe(92);
    expect(standard.defaultSequence).toEqual(['V1', 'C', 'V1']);
    expect(standard.sections).toHaveLength(2);
    expect(standard.sections[0]?.content).toContain('K:G');

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

  it('filters songs via POST /api/songs/query (and/or/search, tags normalized)', async () => {
    const { token } = await registerUser();
    const cookies = { [auth.SESSION_COOKIE]: token };
    const suffix = randomUUID().slice(0, 8);

    const mk = async (title: string, tags: string[]) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/songs',
        payload: { title, defaultKey: 'C', visibility: 'group', tags },
        cookies,
      });
      expect(res.statusCode).toBe(201);
      return res.json().song as { title: string; tags: string[] };
    };
    const a = await mk(`QueryA ${suffix}`, ['easter', 'campfire']);
    const b = await mk(`QueryB ${suffix}`, ['easter']);
    const c = await mk(`QueryC ${suffix}`, ['christmas']);
    expect(a.tags).toEqual(['campfire', 'easter']); // alphabetical

    const query = async (filter: unknown) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/songs/query',
        cookies,
        payload: { filter },
      });
      expect(res.statusCode).toBe(200);
      return (res.json().songs as { title: string }[]).map((s) => s.title);
    };

    // tagsAll = AND: only the song carrying both tags
    const andRes = await query({ tagsAll: ['easter', 'campfire'] });
    expect(andRes).toContain(a.title);
    expect(andRes).not.toContain(b.title);
    expect(andRes).not.toContain(c.title);

    // tagsAny inside or = OR: campfire OR christmas
    const orRes = await query({ or: [{ tagsAny: ['campfire', 'christmas'] }] });
    expect(orRes).toContain(a.title);
    expect(orRes).toContain(c.title);
    expect(orRes).not.toContain(b.title);

    // nested: (search suffix) AND (tagsAll easter)
    const combo = await query({
      and: [{ search: suffix }, { tagsAll: ['easter'] }],
    });
    expect(combo).toContain(a.title);
    expect(combo).toContain(b.title);
    expect(combo).not.toContain(c.title);

    // filter tag names are normalized: uppercase input matches stored lowercase
    const norm = await query({ tagsAll: ['EASTER'] });
    expect(norm).toContain(a.title);
    expect(norm).toContain(b.title);

    // an empty leaf is rejected with 400
    const bad = await app.inject({
      method: 'POST',
      url: '/api/songs/query',
      cookies,
      payload: { filter: {} },
    });
    expect(bad.statusCode).toBe(400);

    // no filter at all returns the whole library
    const all = await app.inject({
      method: 'POST',
      url: '/api/songs/query',
      cookies,
      payload: {},
    });
    expect(all.statusCode).toBe(200);
    expect(all.json().songs.length).toBeGreaterThanOrEqual(3);
  });

  it('rejects an import whose arrangement sequence references an unknown label with 400', async () => {
    const { token } = await registerUser();
    const res = await app.inject({
      method: 'POST',
      url: '/api/songs/import',
      cookies: { [auth.SESSION_COOKIE]: token },
      payload: {
        songs: [
          {
            title: 'Broken seed song',
            arrangements: [
              {
                title: 'Bad sequence',
                original_key: 'G',
                default_sequence: ['V1', 'Bridge'],
                sections: [{ label: 'V1', content: 'X:1\nK:G\nG2 G2 |' }],
              },
            ],
          },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
    const issues = res.json().issues as { path: string }[];
    expect(issues.some((i) => i.path.includes('defaultSequence'))).toBe(true);
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
