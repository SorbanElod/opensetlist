import { and, desc, eq, sql } from 'drizzle-orm';

import type { Db } from '../db/index.js';
import { groups, songs } from '../db/schema.js';
import type { CreateSongInput, UpdateSongInput } from './schemas.js';

export type SongView = {
  id: string;
  title: string;
  author: string | null;
  defaultKey: string;
  visibility: 'private' | 'group' | 'public';
  language: string | null;
  ownerId: string;
  version: number;
  createdAt: Date;
};

export type SongResult =
  | { ok: true; song: SongView }
  | { ok: false; reason: 'not_found' | 'conflict' };

export type DeleteResult =
  { ok: true; id: string } | { ok: false; reason: 'not_found' | 'conflict' };

// The service takes groupId explicitly (not "the" group): multi-group later
// reuses every function unchanged, exactly like the members module.

// MVP single-group lookup — same helper as members. Registration bootstraps
// the one group, so this only fails before the first user exists.
export async function getSingleGroupId(db: Db): Promise<string> {
  const [group] = await db.select().from(groups).limit(1);

  if (!group) {
    throw new Error('No group exists yet — register a user first');
  }

  return group.id;
}

export async function listSongs(db: Db, groupId: string): Promise<SongView[]> {
  // Newest first — the library list is a "recently added" view until
  // search/sort land with it.
  return db
    .select()
    .from(songs)
    .where(eq(songs.groupId, groupId))
    .orderBy(desc(songs.createdAt));
}

export async function getSong(
  db: Db,
  groupId: string,
  id: string,
): Promise<SongView | null> {
  const [row] = await db
    .select()
    .from(songs)
    .where(and(eq(songs.id, id), eq(songs.groupId, groupId)))
    .limit(1);

  return row ?? null;
}

export async function createSong(
  db: Db,
  input: { groupId: string; ownerId: string; song: CreateSongInput },
): Promise<SongView> {
  const [song] = await db
    .insert(songs)
    .values({
      groupId: input.groupId,
      ownerId: input.ownerId,
      title: input.song.title,
      author: input.song.author ? input.song.author : null,
      defaultKey: input.song.defaultKey,
      visibility: input.song.visibility,
      language: input.song.language ?? null,
    })
    .returning();

  return song!;
}

// Optimistic locking: the WHERE clause carries the version the client saw.
// A concurrent update bumps version first, so this statement matches 0 rows
// and we report a conflict instead of silently overwriting.
export async function updateSong(
  db: Db,
  input: { groupId: string; id: string; song: UpdateSongInput },
): Promise<SongResult> {
  const { version, ...fields } = input.song;

  // Only send defined fields; normalize empty author to null.
  const set: Record<string, unknown> = { version: sql`${songs.version} + 1` };
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    set[key] = key === 'author' && value === '' ? null : value;
  }

  const [updated] = await db
    .update(songs)
    .set(set)
    .where(
      and(
        eq(songs.id, input.id),
        eq(songs.groupId, input.groupId),
        eq(songs.version, version),
      ),
    )
    .returning();

  if (updated) return { ok: true, song: updated };

  const existing = await getSong(db, input.groupId, input.id);
  if (!existing) return { ok: false, reason: 'not_found' };
  return { ok: false, reason: 'conflict' };
}

export async function deleteSong(
  db: Db,
  input: { groupId: string; id: string; version: number },
): Promise<DeleteResult> {
  const [deleted] = await db
    .delete(songs)
    .where(
      and(
        eq(songs.id, input.id),
        eq(songs.groupId, input.groupId),
        eq(songs.version, input.version),
      ),
    )
    .returning({ id: songs.id });

  if (deleted) return { ok: true, id: deleted.id };

  const existing = await getSong(db, input.groupId, input.id);
  if (!existing) return { ok: false, reason: 'not_found' };
  return { ok: false, reason: 'conflict' };
}
