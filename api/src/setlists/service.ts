import { and, asc, desc, eq, max, sql } from 'drizzle-orm';

import type { Db } from '../db/index.js';
import { arrangements, setlistItems, setlists, songs } from '../db/schema.js';
import type {
  CreateItemInput,
  CreateSetlistInput,
  UpdateItemInput,
  UpdateSetlistInput,
} from './schemas.js';

// A transaction satisfies this too — helpers stay usable inside db.transaction.
type Writable = Pick<Db, 'select' | 'insert' | 'update' | 'delete'>;
// (lockSetlist/renumberPositions take Writable, which includes update.)

export type SetlistView = {
  id: string;
  groupId: string;
  title: string;
  eventDate: string | null;
  version: number;
  createdAt: Date;
  itemCount: number;
};

export type SetlistItemView = {
  id: string;
  setlistId: string;
  position: number;
  arrangementId: string | null;
  transposedKey: string | null;
  customSequence: string[] | null;
  notes: string | null;
  createdAt: Date;
};

// The arrangement side of a resolved item — only what the setlist UI needs
// (labels for the custom-sequence editor, default sequence for resolution).
export type ItemArrangement = {
  id: string;
  title: string;
  songId: string;
  songTitle: string;
  originalKey: string;
  sectionLabels: string[];
  defaultSequence: string[];
};

export type ResolvedItem = SetlistItemView & {
  arrangement: ItemArrangement | null;
  // null on note-only rows; otherwise the per-item override if set, else the
  // arrangement default (see resolveEffectiveSequence).
  effectiveSequence: string[] | null;
};

export type SetlistResult =
  | { ok: true; setlist: SetlistView }
  | { ok: false; reason: 'not_found' | 'conflict' };

export type DeleteResult =
  { ok: true; id: string } | { ok: false; reason: 'not_found' | 'conflict' };

export type ItemResult =
  | { ok: true; item: ResolvedItem; setlistVersion: number }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'conflict'
        | 'invalid_arrangement'
        | 'invalid_sequence'
        | 'invalid_item';
      message?: string;
    };

export type ItemsResult =
  | { ok: true; items: ResolvedItem[]; setlistVersion: number }
  | { ok: false; reason: 'not_found' | 'conflict' };

export type SetlistWithItems = {
  setlist: SetlistView;
  items: ResolvedItem[];
};

// Pure: the effective sequence of an item — the per-item override wins, else
// the arrangement default. An empty override array counts as "no override".
export function resolveEffectiveSequence(
  customSequence: string[] | null,
  arrangement: { defaultSequence: string[] },
): string[] {
  return customSequence && customSequence.length > 0
    ? customSequence
    : arrangement.defaultSequence;
}

function toItemArrangement(row: {
  arrangement: typeof arrangements.$inferSelect;
  songTitle: string;
}): ItemArrangement {
  return {
    id: row.arrangement.id,
    title: row.arrangement.title,
    songId: row.arrangement.songId,
    songTitle: row.songTitle,
    originalKey: row.arrangement.originalKey,
    sectionLabels: row.arrangement.sections.map((s) => s.label),
    defaultSequence: row.arrangement.defaultSequence,
  };
}

function toResolved(row: {
  item: SetlistItemView;
  arrangement: (typeof arrangements.$inferSelect & { songTitle?: string }) | null;
  songTitle: string | null;
}): ResolvedItem {
  const { item } = row;
  const arrangement =
    row.arrangement && row.songTitle
      ? toItemArrangement({
          arrangement: row.arrangement,
          songTitle: row.songTitle,
        })
      : null;
  return {
    ...item,
    arrangement,
    effectiveSequence:
      arrangement && item.arrangementId
        ? resolveEffectiveSequence(item.customSequence, arrangement)
        : null,
  };
}

async function listResolvedItems(
  db: Pick<Db, 'select'>,
  setlistId: string,
): Promise<ResolvedItem[]> {
  const rows = await db
    .select({
      item: setlistItems,
      arrangement: arrangements,
      songTitle: songs.title,
    })
    .from(setlistItems)
    .leftJoin(arrangements, eq(setlistItems.arrangementId, arrangements.id))
    .leftJoin(songs, eq(arrangements.songId, songs.id))
    .where(eq(setlistItems.setlistId, setlistId))
    .orderBy(asc(setlistItems.position));

  return rows.map((row) => toResolved(row));
}

// Arrangement lookup scoped to the group through the parent song — an item
// must never reference another group's arrangement.
async function getGroupArrangement(
  db: Pick<Db, 'select'>,
  groupId: string,
  arrangementId: string,
) {
  const [row] = await db
    .select({ arrangement: arrangements, songTitle: songs.title })
    .from(arrangements)
    .innerJoin(songs, eq(arrangements.songId, songs.id))
    .where(and(eq(arrangements.id, arrangementId), eq(songs.groupId, groupId)))
    .limit(1);
  return row ?? null;
}

// Note-only rows need text and cannot carry key/sequence overrides. Checked
// on the merged row, because a PATCH may change the kind of item.
function validateItem(item: {
  arrangementId: string | null;
  transposedKey: string | null;
  customSequence: string[] | null;
  notes: string | null;
}): string | null {
  if (item.arrangementId === null) {
    if (!item.notes || item.notes.trim() === '') {
      return 'A note-only item needs text in notes';
    }
    if (item.transposedKey || (item.customSequence?.length ?? 0) > 0) {
      return 'A note-only item cannot have a key or sequence override';
    }
  }
  return null;
}

// Custom sequence entries must be existing section labels of the item's
// arrangement (same rule as default_sequence in arrangements/schemas.ts).
function validateCustomSequence(
  customSequence: string[] | null,
  arrangement: { sections: { label: string }[] },
): boolean {
  if (!customSequence || customSequence.length === 0) return true;
  const labels = new Set(arrangement.sections.map((s) => s.label));
  return customSequence.every((entry) => labels.has(entry));
}

// Optimistic locking on the aggregate: bump the setlist's version only if it
// still matches the version the client saw. Returns the bumped row.
async function lockSetlist(
  tx: Writable,
  groupId: string,
  setlistId: string,
  version: number,
): Promise<
  | { ok: true; setlist: typeof setlists.$inferSelect }
  | { ok: false; reason: 'not_found' | 'conflict' }
> {
  const [existing] = await tx
    .select()
    .from(setlists)
    .where(and(eq(setlists.id, setlistId), eq(setlists.groupId, groupId)))
    .limit(1);
  if (!existing) return { ok: false, reason: 'not_found' };

  const [bumped] = await tx
    .update(setlists)
    .set({ version: sql`${setlists.version} + 1` })
    .where(
      and(
        eq(setlists.id, setlistId),
        eq(setlists.groupId, groupId),
        eq(setlists.version, version),
      ),
    )
    .returning();
  if (!bumped) return { ok: false, reason: 'conflict' };
  return { ok: true, setlist: bumped };
}

// Positions stay contiguous 1..n after every structural change: two-phase
// write (negate, then assign) so the unique (setlist_id, position) constraint
// is never violated mid-update.
async function renumberPositions(
  tx: Writable,
  setlistId: string,
): Promise<void> {
  const rows = await tx
    .select({ id: setlistItems.id, position: setlistItems.position })
    .from(setlistItems)
    .where(eq(setlistItems.setlistId, setlistId))
    .orderBy(asc(setlistItems.position));

  for (const row of rows) {
    await tx
      .update(setlistItems)
      .set({ position: -row.position })
      .where(eq(setlistItems.id, row.id));
  }
  for (let i = 0; i < rows.length; i++) {
    await tx
      .update(setlistItems)
      .set({ position: i + 1 })
      .where(eq(setlistItems.id, rows[i]!.id));
  }
}

export async function listSetlists(
  db: Pick<Db, 'select'>,
  groupId: string,
): Promise<SetlistView[]> {
  const rows = await db
    .select({
      id: setlists.id,
      groupId: setlists.groupId,
      title: setlists.title,
      eventDate: setlists.eventDate,
      version: setlists.version,
      createdAt: setlists.createdAt,
      itemCount: sql<number>`(select count(*) from ${setlistItems} where ${setlistItems.setlistId} = ${setlists.id})`.mapWith(Number),
    })
    .from(setlists)
    .where(eq(setlists.groupId, groupId))
    .orderBy(desc(setlists.createdAt));

  return rows;
}

export async function getSetlistWithItems(
  db: Pick<Db, 'select'>,
  groupId: string,
  id: string,
): Promise<SetlistWithItems | null> {
  const [setlist] = await db
    .select()
    .from(setlists)
    .where(and(eq(setlists.id, id), eq(setlists.groupId, groupId)))
    .limit(1);
  if (!setlist) return null;

  const items = await listResolvedItems(db, id);
  return {
    setlist: { ...setlist, itemCount: items.length },
    items,
  };
}

export async function createSetlist(
  db: Pick<Db, 'insert'>,
  input: { groupId: string; setlist: CreateSetlistInput },
): Promise<SetlistView> {
  const [row] = await db
    .insert(setlists)
    .values({
      groupId: input.groupId,
      title: input.setlist.title,
      eventDate: input.setlist.eventDate ?? null,
    })
    .returning();
  return { ...row!, itemCount: 0 };
}

export async function updateSetlist(
  db: Db,
  input: { groupId: string; id: string; setlist: UpdateSetlistInput },
): Promise<SetlistResult> {
  const { version, ...fields } = input.setlist;

  return db.transaction(async (tx) => {
    const set: Record<string, unknown> = { version: sql`${setlists.version} + 1` };
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      set[key] = value;
    }

    const [updated] = await tx
      .update(setlists)
      .set(set)
      .where(
        and(
          eq(setlists.id, input.id),
          eq(setlists.groupId, input.groupId),
          eq(setlists.version, version),
        ),
      )
      .returning();

    if (!updated) {
      const [existing] = await tx
        .select({ id: setlists.id })
        .from(setlists)
        .where(
          and(eq(setlists.id, input.id), eq(setlists.groupId, input.groupId)),
        )
        .limit(1);
      return {
        ok: false,
        reason: existing ? 'conflict' : 'not_found',
      } satisfies SetlistResult;
    }

    const items = await listResolvedItems(tx, updated.id);
    return {
      ok: true,
      setlist: { ...updated, itemCount: items.length },
    } satisfies SetlistResult;
  });
}

export async function deleteSetlist(
  db: Db,
  input: { groupId: string; id: string; version: number },
): Promise<DeleteResult> {
  // Items cascade (schema FK), so deleting the setlist is one statement.
  const [deleted] = await db
    .delete(setlists)
    .where(
      and(
        eq(setlists.id, input.id),
        eq(setlists.groupId, input.groupId),
        eq(setlists.version, input.version),
      ),
    )
    .returning({ id: setlists.id });

  if (!deleted) {
    const [existing] = await db
      .select({ id: setlists.id })
      .from(setlists)
      .where(and(eq(setlists.id, input.id), eq(setlists.groupId, input.groupId)))
      .limit(1);
    return { ok: false, reason: existing ? 'conflict' : 'not_found' };
  }
  return { ok: true, id: deleted.id };
}

export async function addItem(
  db: Db,
  input: { groupId: string; setlistId: string; item: CreateItemInput },
): Promise<ItemResult> {
  const { version, ...fields } = input.item;

  return db.transaction(async (tx) => {
    // Validate first (reads only): a 400 must not consume a version bump.
    let arrangement: Awaited<ReturnType<typeof getGroupArrangement>> = null;
    if (fields.arrangementId) {
      arrangement = await getGroupArrangement(
        tx,
        input.groupId,
        fields.arrangementId,
      );
      if (!arrangement) {
        return { ok: false, reason: 'invalid_arrangement' } satisfies ItemResult;
      }
    }

    const merged = {
      arrangementId: fields.arrangementId ?? null,
      transposedKey: fields.transposedKey ?? null,
      customSequence: fields.customSequence ?? null,
      notes: fields.notes ?? null,
    };
    const itemError = validateItem(merged);
    if (itemError) return { ok: false, reason: 'invalid_item', message: itemError };
    if (
      arrangement &&
      !validateCustomSequence(merged.customSequence, arrangement.arrangement)
    ) {
      return {
        ok: false,
        reason: 'invalid_sequence',
        message:
          'Custom sequence entries must be existing section labels of the arrangement',
      } satisfies ItemResult;
    }

    const locked = await lockSetlist(tx, input.groupId, input.setlistId, version);
    if (!locked.ok) return locked;

    const [maxPos] = await tx
      .select({ position: max(setlistItems.position) })
      .from(setlistItems)
      .where(eq(setlistItems.setlistId, input.setlistId));
    const position = (maxPos?.position ?? 0) + 1;

    const [row] = await tx
      .insert(setlistItems)
      .values({ setlistId: input.setlistId, position, ...merged })
      .returning();

    const item: SetlistItemView = row!;
    return {
      ok: true,
      item: toResolved({
        item,
        arrangement: arrangement?.arrangement ?? null,
        songTitle: arrangement?.songTitle ?? null,
      }),
      setlistVersion: locked.setlist.version,
    } satisfies ItemResult;
  });
}

export async function updateItem(
  db: Db,
  input: {
    groupId: string;
    setlistId: string;
    itemId: string;
    item: UpdateItemInput;
  },
): Promise<ItemResult> {
  const { version, ...fields } = input.item;

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(setlistItems)
      .where(
        and(
          eq(setlistItems.id, input.itemId),
          eq(setlistItems.setlistId, input.setlistId),
        ),
      )
      .limit(1);
    if (!existing) return { ok: false, reason: 'not_found' } satisfies ItemResult;

    // Merge with the existing row: PATCH sends only changed fields, and the
    // note-only / sequence rules apply to the merged result.
    const merged = {
      arrangementId:
        fields.arrangementId !== undefined
          ? fields.arrangementId
          : existing.arrangementId,
      transposedKey:
        fields.transposedKey !== undefined
          ? fields.transposedKey
          : existing.transposedKey,
      customSequence:
        fields.customSequence !== undefined
          ? fields.customSequence
          : existing.customSequence,
      notes: fields.notes !== undefined ? fields.notes : existing.notes,
    };

    let arrangement: Awaited<ReturnType<typeof getGroupArrangement>> = null;
    if (merged.arrangementId) {
      arrangement = await getGroupArrangement(tx, input.groupId, merged.arrangementId);
      if (!arrangement) {
        return { ok: false, reason: 'invalid_arrangement' } satisfies ItemResult;
      }
    }

    const itemError = validateItem(merged);
    if (itemError) return { ok: false, reason: 'invalid_item', message: itemError };
    if (
      arrangement &&
      !validateCustomSequence(merged.customSequence, arrangement.arrangement)
    ) {
      return {
        ok: false,
        reason: 'invalid_sequence',
        message:
          'Custom sequence entries must be existing section labels of the arrangement',
      } satisfies ItemResult;
    }

    // Validate first (reads only): a 400 must not consume a version bump.
    const locked = await lockSetlist(tx, input.groupId, input.setlistId, version);
    if (!locked.ok) return locked;

    const [updated] = await tx
      .update(setlistItems)
      .set(merged)
      .where(eq(setlistItems.id, input.itemId))
      .returning();

    return {
      ok: true,
      item: toResolved({
        item: updated!,
        arrangement: arrangement?.arrangement ?? null,
        songTitle: arrangement?.songTitle ?? null,
      }),
      setlistVersion: locked.setlist.version,
    } satisfies ItemResult;
  });
}

export async function deleteItem(
  db: Db,
  input: { groupId: string; setlistId: string; itemId: string; version: number },
): Promise<ItemsResult | { ok: false; reason: 'not_found' | 'conflict' }> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: setlistItems.id })
      .from(setlistItems)
      .where(
        and(
          eq(setlistItems.id, input.itemId),
          eq(setlistItems.setlistId, input.setlistId),
        ),
      )
      .limit(1);
    if (!existing) return { ok: false, reason: 'not_found' };

    const locked = await lockSetlist(tx, input.groupId, input.setlistId, input.version);
    if (!locked.ok) return locked;

    await tx
      .delete(setlistItems)
      .where(eq(setlistItems.id, input.itemId));
    await renumberPositions(tx, input.setlistId);

    const items = await listResolvedItems(tx, input.setlistId);
    return { ok: true, items, setlistVersion: locked.setlist.version };
  });
}

// Move = swap with the neighbor, then renumber (positions stay 1..n).
// Moving past either end is a no-op success — the button is simply disabled
// in the UI, but the API stays total.
export async function moveItem(
  db: Db,
  input: {
    groupId: string;
    setlistId: string;
    itemId: string;
    direction: 'up' | 'down';
    version: number;
  },
): Promise<ItemsResult> {
  return db.transaction(async (tx) => {
    // Read first: a 404 must not consume a version bump.
    const rows = await tx
      .select({ id: setlistItems.id, position: setlistItems.position })
      .from(setlistItems)
      .where(eq(setlistItems.setlistId, input.setlistId))
      .orderBy(asc(setlistItems.position));

    const index = rows.findIndex((r) => r.id === input.itemId);
    if (index === -1) return { ok: false, reason: 'not_found' };

    const locked = await lockSetlist(tx, input.groupId, input.setlistId, input.version);
    if (!locked.ok) return locked;

    const swapWith = input.direction === 'up' ? index - 1 : index + 1;
    if (swapWith >= 0 && swapWith < rows.length) {
      const tmp = rows[index]!;
      rows[index] = rows[swapWith]!;
      rows[swapWith] = tmp;
      // Two-phase write so the unique (setlist_id, position) constraint is
      // never violated mid-swap: negate current positions, then assign the
      // new order 1..n.
      for (const row of rows) {
        await tx
          .update(setlistItems)
          .set({ position: -row.position })
          .where(eq(setlistItems.id, row.id));
      }
      for (let i = 0; i < rows.length; i++) {
        await tx
          .update(setlistItems)
          .set({ position: i + 1 })
          .where(eq(setlistItems.id, rows[i]!.id));
      }
    }

    const items = await listResolvedItems(tx, input.setlistId);
    return { ok: true, items, setlistVersion: locked.setlist.version };
  });
}
