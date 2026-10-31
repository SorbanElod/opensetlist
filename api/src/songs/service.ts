import { and, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';

import type { Db } from '../db/index.js';
import { arrangements, groups, songs, songTags, tags } from '../db/schema.js';
import { setSongTags, type Queryable } from '../tags/service.js';
import {
  KEYS,
  type CreateSongInput,
  type FilterNode,
  type ImportSongsInput,
  type UpdateSongInput,
} from './schemas.js';

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
  tags: string[];
};

export type SongResult =
  | { ok: true; song: SongView }
  | { ok: false; reason: 'not_found' | 'conflict' };

export type DeleteResult =
  { ok: true; id: string } | { ok: false; reason: 'not_found' | 'conflict' };

export type ImportResult = {
  songs: SongView[];
  arrangementsImported: number;
  tagsImported: number;
};

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

// Attach each song's tag names (from the junction) as a songId -> names map.
async function attachTags(
  db: Queryable,
  songIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (songIds.length === 0) return map;

  const rows = await db
    .select({ songId: songTags.songId, name: tags.name })
    .from(songTags)
    .innerJoin(tags, eq(songTags.tagId, tags.id))
    .where(inArray(songTags.songId, songIds));

  for (const row of rows) {
    const list = map.get(row.songId) ?? [];
    list.push(row.name);
    map.set(row.songId, list);
  }
  // Deterministic order (the junction query has no ORDER BY): alphabetical,
  // same as the tag vocabulary list.
  for (const list of map.values()) list.sort();
  return map;
}

// Lower a filter tree to a SQL condition on the songs table. Leaves become
// ilike / inArray-subquery conditions (visible SQL, no black box); and/or
// nodes recurse. tagsAll = one EXISTS per tag (all must be present),
// tagsAny = one subquery with name IN (...).
function filterToSql(
  db: Queryable,
  groupId: string,
  node: FilterNode,
): SQL | undefined {
  if ('and' in node) {
    const children = node.and
      .map((n) => filterToSql(db, groupId, n))
      .filter((c): c is SQL => c !== undefined);
    return children.length > 0 ? and(...children) : undefined;
  }
  if ('or' in node) {
    const children = node.or
      .map((n) => filterToSql(db, groupId, n))
      .filter((c): c is SQL => c !== undefined);
    return children.length > 0 ? or(...children) : undefined;
  }

  const conds: (SQL | undefined)[] = [];
  if (node.search) {
    const pattern = `%${node.search}%`;
    conds.push(or(ilike(songs.title, pattern), ilike(songs.author, pattern)));
  }
  if (node.tagsAny && node.tagsAny.length > 0) {
    conds.push(
      inArray(
        songs.id,
        db
          .select({ songId: songTags.songId })
          .from(songTags)
          .innerJoin(tags, eq(songTags.tagId, tags.id))
          .where(
            and(eq(tags.groupId, groupId), inArray(tags.name, node.tagsAny)),
          ),
      ),
    );
  }
  for (const name of node.tagsAll ?? []) {
    conds.push(
      inArray(
        songs.id,
        db
          .select({ songId: songTags.songId })
          .from(songTags)
          .innerJoin(tags, eq(songTags.tagId, tags.id))
          .where(and(eq(tags.groupId, groupId), eq(tags.name, name))),
      ),
    );
  }
  if (node.tagsLike) {
    conds.push(
      inArray(
        songs.id,
        db
          .select({ songId: songTags.songId })
          .from(songTags)
          .innerJoin(tags, eq(songTags.tagId, tags.id))
          .where(
            and(
              eq(tags.groupId, groupId),
              ilike(tags.name, `%${node.tagsLike}%`),
            ),
          ),
      ),
    );
  }
  return and(...conds);
}

export async function listSongs(
  db: Queryable,
  groupId: string,
  filter?: FilterNode,
): Promise<SongView[]> {
  // Newest first — the library list is a "recently added" view; the query
  // endpoint applies the filter on top.
  const conditions: (SQL | undefined)[] = [eq(songs.groupId, groupId)];
  if (filter) conditions.push(filterToSql(db, groupId, filter));

  const rows = await db
    .select()
    .from(songs)
    .where(and(...conditions))
    .orderBy(desc(songs.createdAt));

  const tagMap = await attachTags(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }));
}

export async function getSong(
  db: Queryable,
  groupId: string,
  id: string,
): Promise<SongView | null> {
  const [row] = await db
    .select()
    .from(songs)
    .where(and(eq(songs.id, id), eq(songs.groupId, groupId)))
    .limit(1);

  if (!row) return null;
  const tagMap = await attachTags(db, [row.id]);
  return { ...row, tags: tagMap.get(row.id) ?? [] };
}

export async function createSong(
  db: Db,
  input: { groupId: string; ownerId: string; song: CreateSongInput },
): Promise<SongView> {
  // Song + tag rows + junction in one transaction: a tag failure rolls the
  // song back too.
  return db.transaction(async (tx) => {
    const [song] = await tx
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

    await setSongTags(
      tx,
      input.groupId,
      song!.id,
      input.song.tags,
      input.ownerId,
    );
    const tagMap = await attachTags(tx, [song!.id]);
    return { ...song!, tags: tagMap.get(song!.id) ?? [] };
  });
}

// Optimistic locking: the WHERE clause carries the version the client saw.
// A concurrent update bumps version first, so this statement matches 0 rows
// and we report a conflict instead of silently overwriting.
export async function updateSong(
  db: Db,
  input: {
    groupId: string;
    id: string;
    actorId: string;
    song: UpdateSongInput;
  },
): Promise<SongResult> {
  const { version, ...fields } = input.song;

  return db.transaction(async (tx) => {
    // Only send defined fields; normalize empty author to null.
    // tags is not a column — it goes through the junction below.
    const set: Record<string, unknown> = { version: sql`${songs.version} + 1` };
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined || key === 'tags') continue;
      set[key] = key === 'author' && value === '' ? null : value;
    }

    // Optimistic locking: the WHERE clause carries the version the client
    // saw. A concurrent update bumps version first, so this statement matches
    // 0 rows and we report a conflict instead of silently overwriting.
    const [updated] = await tx
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

    if (!updated) {
      const existing = await getSong(tx, input.groupId, input.id);
      if (!existing) return { ok: false, reason: 'not_found' };
      return { ok: false, reason: 'conflict' };
    }

    // tags present in the payload (even []) rewrites the junction; absent
    // leaves the song's tags untouched.
    if (fields.tags !== undefined) {
      await setSongTags(
        tx,
        input.groupId,
        updated.id,
        fields.tags,
        input.actorId,
      );
    }

    const tagMap = await attachTags(tx, [updated.id]);
    return {
      ok: true,
      song: { ...updated, tags: tagMap.get(updated.id) ?? [] },
    };
  });
}

// JSON seed import. One transaction: a mid-loop failure rolls back the whole
// import. Arrangements and tags in the file are created too — both arrive
// pre-validated through the piped schemas at the edge.
export async function importSongs(
  db: Db,
  input: { groupId: string; ownerId: string; data: ImportSongsInput },
): Promise<ImportResult> {
  return db.transaction(async (tx) => {
    const created: SongView[] = [];
    let arrangementsImported = 0;
    let tagsImported = 0;

    for (const s of input.data.songs) {
      // The seed format carries the key on arrangements; the song's
      // default_key falls back to the first arrangement's key, else 'C'.
      const firstKey = s.arrangements?.[0]?.originalKey;
      const defaultKey = KEYS.includes(firstKey as (typeof KEYS)[number])
        ? (firstKey as string)
        : 'C';
      const author =
        [s.authors?.lyrics, s.authors?.music].filter(Boolean).join(' · ') ||
        null;
      const songTagsInput = s.tags ?? [];
      tagsImported += songTagsInput.length;

      const [song] = await tx
        .insert(songs)
        .values({
          groupId: input.groupId,
          ownerId: input.ownerId,
          title: s.title,
          author,
          defaultKey,
          visibility: s.visibility ?? 'group',
          language: s.language ?? null,
        })
        .returning();

      await setSongTags(
        tx,
        input.groupId,
        song!.id,
        songTagsInput,
        input.ownerId,
      );
      // tags are attached in bulk at the end of the transaction
      created.push({ ...song!, tags: [] });

      for (const a of s.arrangements ?? []) {
        await tx.insert(arrangements).values({
          songId: song!.id,
          title: a.title,
          originalKey: a.originalKey,
          bpm: a.bpm ?? null,
          defaultSequence: a.defaultSequence,
          sections: a.sections,
        });
        arrangementsImported++;
      }
    }

    const tagMap = await attachTags(
      tx,
      created.map((s) => s.id),
    );
    return {
      songs: created.map((s) => ({ ...s, tags: tagMap.get(s.id) ?? [] })),
      arrangementsImported,
      tagsImported,
    };
  });
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
