import { and, asc, eq, ilike, type SQL } from 'drizzle-orm';

import type { Db } from '../db/index.js';
import { songTags, tags } from '../db/schema.js';

export type TagView = { id: string; name: string; createdAt: Date };

// Anything with insert/select/delete — both the db and a transaction tx
// satisfy this, so the helpers also work inside importSongs' transaction.
export type Queryable = Pick<Db, 'insert' | 'select' | 'delete'>;

export async function listTags(
  db: Queryable,
  groupId: string,
  search?: string,
): Promise<TagView[]> {
  // Alphabetical — the vocabulary reads like a list, not a feed. The cap
  // keeps the picker payload small when the group has hundreds of tags.
  const conditions: (SQL | undefined)[] = [eq(tags.groupId, groupId)];
  if (search?.trim()) conditions.push(ilike(tags.name, `%${search.trim()}%`));

  return db
    .select({ id: tags.id, name: tags.name, createdAt: tags.createdAt })
    .from(tags)
    .where(and(...conditions))
    .orderBy(asc(tags.name))
    .limit(20);
}

export async function deleteTag(
  db: Db,
  groupId: string,
  id: string,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' }> {
  const [row] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.id, id), eq(tags.groupId, groupId)))
    .limit(1);

  if (!row) return { ok: false, reason: 'not_found' };

  // song_tags rows cascade via the FK — the tag disappears from every song.
  await db.delete(tags).where(eq(tags.id, id));
  return { ok: true };
}

// Rewrite a song's tag set: idempotent tag creation (unique(group_id, name)
// + onConflictDoNothing absorbs concurrent creates of the same name), then
// replace the junction rows. Names arrive normalized from the Zod transform.
export async function setSongTags(
  db: Queryable,
  groupId: string,
  songId: string,
  names: string[],
  createdBy: string,
): Promise<void> {
  const tagIds: string[] = [];
  for (const name of names) {
    await db
      .insert(tags)
      .values({ groupId, name, createdBy })
      .onConflictDoNothing();
    const [row] = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.groupId, groupId), eq(tags.name, name)))
      .limit(1);
    tagIds.push(row!.id);
  }

  await db.delete(songTags).where(eq(songTags.songId, songId));
  if (tagIds.length > 0) {
    await db
      .insert(songTags)
      .values(tagIds.map((tagId) => ({ songId, tagId })));
  }
}
