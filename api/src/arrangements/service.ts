import { and, desc, eq, sql } from 'drizzle-orm';

import type { Db } from '../db/index.js';
import {
  arrangements,
  songs,
  type ArrangementSection,
} from '../db/schema.js';
import { getSong } from '../songs/service.js';
import type {
  CreateArrangementInput,
  UpdateArrangementInput,
} from './schemas.js';

export type ArrangementView = {
  id: string;
  songId: string;
  title: string;
  originalKey: string;
  bpm: number | null;
  defaultSequence: string[];
  sections: ArrangementSection[];
  version: number;
  createdAt: Date;
};

export type ArrangementResult =
  | { ok: true; arrangement: ArrangementView }
  | { ok: false; reason: 'not_found' | 'conflict' };

export type DeleteResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'not_found' | 'conflict' };

// Arrangements carry no group_id — group scoping goes through the parent
// song (and arrangements cascade on song delete).

export async function listArrangements(
  db: Db,
  groupId: string,
  songId: string,
): Promise<ArrangementView[] | null> {
  // Null = the song doesn't exist in this group; the route maps that to 404.
  const song = await getSong(db, groupId, songId);
  if (!song) return null;

  // Newest first, same as the song library.
  return db
    .select()
    .from(arrangements)
    .where(eq(arrangements.songId, songId))
    .orderBy(desc(arrangements.createdAt));
}

export async function getArrangement(
  db: Db,
  groupId: string,
  id: string,
): Promise<ArrangementView | null> {
  // Join through songs so a caller can only reach arrangements of its own
  // group, even with a guessed arrangement id.
  const [row] = await db
    .select()
    .from(arrangements)
    .innerJoin(songs, eq(arrangements.songId, songs.id))
    .where(and(eq(arrangements.id, id), eq(songs.groupId, groupId)))
    .limit(1);

  return row?.arrangements ?? null;
}

export async function createArrangement(
  db: Db,
  input: { groupId: string; songId: string; arrangement: CreateArrangementInput },
): Promise<ArrangementView | null> {
  const song = await getSong(db, input.groupId, input.songId);
  if (!song) return null;

  const [created] = await db
    .insert(arrangements)
    .values({
      songId: input.songId,
      title: input.arrangement.title,
      originalKey: input.arrangement.originalKey,
      bpm: input.arrangement.bpm ?? null,
      defaultSequence: input.arrangement.defaultSequence,
      sections: input.arrangement.sections,
    })
    .returning();

  return created!;
}

export async function updateArrangement(
  db: Db,
  input: { groupId: string; id: string; arrangement: UpdateArrangementInput },
): Promise<ArrangementResult> {
  const existing = await getArrangement(db, input.groupId, input.id);
  if (!existing) return { ok: false, reason: 'not_found' };

  const { version, ...fields } = input.arrangement;

  // Optimistic locking: the WHERE clause carries the version the client saw.
  // A concurrent update bumps version first, so this matches 0 rows and we
  // report a conflict instead of silently overwriting.
  const [updated] = await db
    .update(arrangements)
    .set({
      title: fields.title,
      originalKey: fields.originalKey,
      bpm: fields.bpm ?? null,
      defaultSequence: fields.defaultSequence,
      sections: fields.sections,
      version: sql`${arrangements.version} + 1`,
    })
    .where(
      and(eq(arrangements.id, input.id), eq(arrangements.version, version)),
    )
    .returning();

  if (updated) return { ok: true, arrangement: updated };
  return { ok: false, reason: 'conflict' };
}

export async function deleteArrangement(
  db: Db,
  input: { groupId: string; id: string; version: number },
): Promise<DeleteResult> {
  const existing = await getArrangement(db, input.groupId, input.id);
  if (!existing) return { ok: false, reason: 'not_found' };

  const [deleted] = await db
    .delete(arrangements)
    .where(
      and(
        eq(arrangements.id, input.id),
        eq(arrangements.version, input.version),
      ),
    )
    .returning({ id: arrangements.id });

  if (deleted) return { ok: true, id: deleted.id };
  return { ok: false, reason: 'conflict' };
}
