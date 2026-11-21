import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as auth from '../auth/service.js';
import { buildApp } from '../app.js';
import { loadEnv } from '../config.js';
import { groupMembers } from '../db/schema.js';
import { buildTestDb } from '../test-utils/db.js';
import { resolveEffectiveSequence } from './service.js';

// Effective sequence resolution is a pure function — these run without a DB.
describe('resolveEffectiveSequence', () => {
  const arrangement = { defaultSequence: ['V1', 'C1', 'V1'] };

  it('falls back to the arrangement default when there is no override', () => {
    expect(resolveEffectiveSequence(null, arrangement)).toEqual([
      'V1',
      'C1',
      'V1',
    ]);
  });

  it('treats an empty override array as no override', () => {
    expect(resolveEffectiveSequence([], arrangement)).toEqual([
      'V1',
      'C1',
      'V1',
    ]);
  });

  it('prefers the per-item override, repeats included', () => {
    expect(resolveEffectiveSequence(['C1', 'C1'], arrangement)).toEqual([
      'C1',
      'C1',
    ]);
  });
});

// Integration tests: need a real Postgres (DATABASE_URL). Skipped when it is
// not set so `pnpm test` stays green on a bare checkout; CI provides the DB.
// Tests use unique emails per run and never wipe tables.
const dbUrl = process.env.DATABASE_URL;
const password = 'correct horse battery staple';

describe.skipIf(!dbUrl)('setlists routes', () => {
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

  const cookies = (token: string) => ({ [auth.SESSION_COOKIE]: token });

  const createSong = async (token: string) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/songs',
      payload: { title: `Song ${randomUUID()}`, defaultKey: 'G' },
      cookies: cookies(token),
    });
    expect(res.statusCode).toBe(201);
    return res.json().song as { id: string };
  };

  const createArrangement = async (token: string, songId: string) => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/songs/${songId}/arrangements`,
      payload: {
        title: 'Default',
        originalKey: 'G',
        sections: [
          { label: 'V1', content: 'X:1\nK:G\nGAB c2B |' },
          { label: 'C1', content: 'X:1\nK:G\nG2 G2 G2 G2 |' },
        ],
        defaultSequence: ['V1', 'C1', 'V1'],
      },
      cookies: cookies(token),
    });
    expect(res.statusCode).toBe(201);
    return res.json().arrangement as { id: string };
  };

  const createSetlist = async (token: string) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/setlists',
      payload: { title: `Setlist ${randomUUID()}`, eventDate: '2026-12-24' },
      cookies: cookies(token),
    });
    expect(res.statusCode).toBe(201);
    return res.json().setlist as {
      id: string;
      title: string;
      eventDate: string | null;
      version: number;
    };
  };

  const getDetail = async (token: string, id: string) => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/setlists/${id}`,
      cookies: cookies(token),
    });
    expect(res.statusCode).toBe(200);
    return res.json() as {
      setlist: { id: string; version: number };
      items: {
        id: string;
        position: number;
        arrangementId: string | null;
        customSequence: string[] | null;
        notes: string | null;
        effectiveSequence: string[] | null;
        arrangement: { title: string; songTitle: string } | null;
      }[];
    };
  };

  it('rejects anonymous requests with 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/setlists' });
    expect(res.statusCode).toBe(401);
  });

  it('lets a reader list and read setlists but not create them', async () => {
    const { token, user } = await registerUser();
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
        url: '/api/setlists',
        cookies: cookies(token),
      });
      expect(list.statusCode).toBe(200);

      const create = await app.inject({
        method: 'POST',
        url: '/api/setlists',
        payload: { title: 'Nope' },
        cookies: cookies(token),
      });
      expect(create.statusCode).toBe(403);
    } finally {
      await db
        .update(groupMembers)
        .set({ role: originalRole })
        .where(eq(groupMembers.userId, user.id));
    }
  });

  it('creates, reads, updates (with 409 on stale version), and deletes a setlist', async () => {
    const { token } = await registerUser();
    const setlist = await createSetlist(token);
    expect(setlist.eventDate).toBe('2026-12-24');

    const list = await app.inject({
      method: 'GET',
      url: '/api/setlists',
      cookies: cookies(token),
    });
    expect(
      list.json().setlists.some((s: { id: string }) => s.id === setlist.id),
    ).toBe(true);

    const detail = await getDetail(token, setlist.id);
    expect(detail.setlist.id).toBe(setlist.id);
    expect(detail.items).toEqual([]);

    const renamed = await app.inject({
      method: 'PATCH',
      url: `/api/setlists/${setlist.id}`,
      payload: { title: 'Renamed', version: setlist.version },
      cookies: cookies(token),
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().setlist.version).toBe(setlist.version + 1);

    // Stale version -> 409, no silent overwrite.
    const stale = await app.inject({
      method: 'PATCH',
      url: `/api/setlists/${setlist.id}`,
      payload: { title: 'Stale', version: setlist.version },
      cookies: cookies(token),
    });
    expect(stale.statusCode).toBe(409);

    const staleDelete = await app.inject({
      method: 'DELETE',
      url: `/api/setlists/${setlist.id}`,
      payload: { version: setlist.version },
      cookies: cookies(token),
    });
    expect(staleDelete.statusCode).toBe(409);

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/setlists/${setlist.id}`,
      payload: { version: setlist.version + 1 },
      cookies: cookies(token),
    });
    expect(del.statusCode).toBe(200);

    const gone = await app.inject({
      method: 'GET',
      url: `/api/setlists/${setlist.id}`,
      cookies: cookies(token),
    });
    expect(gone.statusCode).toBe(404);
  });

  it('adds arrangement + note items, resolves effective sequence, rejects bad overrides', async () => {
    const { token } = await registerUser();
    const song = await createSong(token);
    const arrangement = await createArrangement(token, song.id);
    const setlist = await createSetlist(token);
    const url = `/api/setlists/${setlist.id}/items`;

    // Arrangement item: effective sequence = arrangement default.
    const addSong = await app.inject({
      method: 'POST',
      url,
      payload: { arrangementId: arrangement.id, version: setlist.version },
      cookies: cookies(token),
    });
    expect(addSong.statusCode).toBe(201);
    const songItem = addSong.json().item;
    expect(songItem.position).toBe(1);
    expect(songItem.effectiveSequence).toEqual(['V1', 'C1', 'V1']);
    expect(songItem.arrangement.songTitle).toBeTruthy();
    const v2 = addSong.json().setlistVersion as number;

    // Note-only item without notes -> 400.
    const badNote = await app.inject({
      method: 'POST',
      url,
      payload: { arrangementId: null, version: v2 },
      cookies: cookies(token),
    });
    expect(badNote.statusCode).toBe(400);

    // Note-only item with notes -> 201, no effective sequence.
    const note = await app.inject({
      method: 'POST',
      url,
      payload: {
        arrangementId: null,
        notes: 'Soundcheck at 9:00',
        version: v2,
      },
      cookies: cookies(token),
    });
    expect(note.statusCode).toBe(201);
    expect(note.json().item.effectiveSequence).toBeNull();
    expect(note.json().item.position).toBe(2);
    const v3 = note.json().setlistVersion as number;

    // Custom sequence with a valid label -> override wins.
    const custom = await app.inject({
      method: 'PATCH',
      url: `/api/setlists/${setlist.id}/items/${songItem.id}`,
      payload: { customSequence: ['C1', 'C1'], version: v3 },
      cookies: cookies(token),
    });
    expect(custom.statusCode).toBe(200);
    expect(custom.json().item.effectiveSequence).toEqual(['C1', 'C1']);
    const v4 = custom.json().setlistVersion as number;

    // Custom sequence with an unknown label -> 400.
    const badSeq = await app.inject({
      method: 'PATCH',
      url: `/api/setlists/${setlist.id}/items/${songItem.id}`,
      payload: { customSequence: ['Bridge'], version: v4 },
      cookies: cookies(token),
    });
    expect(badSeq.statusCode).toBe(400);

    // Arrangement from another group / nonexistent -> 400.
    const badArr = await app.inject({
      method: 'POST',
      url,
      payload: { arrangementId: randomUUID(), version: v4 },
      cookies: cookies(token),
    });
    expect(badArr.statusCode).toBe(400);

    // Stale version on item mutation -> 409.
    const stale = await app.inject({
      method: 'POST',
      url,
      payload: { arrangementId: arrangement.id, version: setlist.version },
      cookies: cookies(token),
    });
    expect(stale.statusCode).toBe(409);
  });

  it('moves items up/down and renumbers positions on delete', async () => {
    const { token } = await registerUser();
    const song = await createSong(token);
    const arrangement = await createArrangement(token, song.id);
    const setlist = await createSetlist(token);
    const url = `/api/setlists/${setlist.id}/items`;

    const ids: string[] = [];
    let version = setlist.version;
    for (let i = 0; i < 3; i++) {
      const res = await app.inject({
        method: 'POST',
        url,
        payload: { arrangementId: arrangement.id, version },
        cookies: cookies(token),
      });
      expect(res.statusCode).toBe(201);
      ids.push(res.json().item.id);
      version = res.json().setlistVersion;
    }

    // Move the third item up twice -> it lands first.
    let move = await app.inject({
      method: 'POST',
      url: `/api/setlists/${setlist.id}/items/${ids[2]}/move`,
      payload: { direction: 'up', version },
      cookies: cookies(token),
    });
    expect(move.statusCode).toBe(200);
    version = move.json().setlistVersion;
    move = await app.inject({
      method: 'POST',
      url: `/api/setlists/${setlist.id}/items/${ids[2]}/move`,
      payload: { direction: 'up', version },
      cookies: cookies(token),
    });
    expect(move.statusCode).toBe(200);
    version = move.json().setlistVersion;

    let items = move.json().items as { id: string; position: number }[];
    expect(items.map((i) => i.id)).toEqual([ids[2], ids[0], ids[1]]);
    expect(items.map((i) => i.position)).toEqual([1, 2, 3]);

    // Moving the first item up is a no-op success.
    const noop = await app.inject({
      method: 'POST',
      url: `/api/setlists/${setlist.id}/items/${ids[2]}/move`,
      payload: { direction: 'up', version },
      cookies: cookies(token),
    });
    expect(noop.statusCode).toBe(200);
    expect((noop.json().items as { id: string }[])[0]!.id).toBe(ids[2]);
    version = noop.json().setlistVersion;

    // Delete the middle item -> positions renumber to 1..2.
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/setlists/${setlist.id}/items/${ids[0]}`,
      payload: { version },
      cookies: cookies(token),
    });
    expect(del.statusCode).toBe(200);
    items = del.json().items as { id: string; position: number }[];
    expect(items.map((i) => i.id)).toEqual([ids[2], ids[1]]);
    expect(items.map((i) => i.position)).toEqual([1, 2]);
  });
});
