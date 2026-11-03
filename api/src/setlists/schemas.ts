import { z } from 'zod';

import {
  MAX_SECTION_LABEL_LENGTH,
  MAX_SEQUENCE_ENTRIES,
} from '../arrangements/schemas.js';
import { keySchema } from '../songs/keys.js';

// Validation at the edges: everything crossing the HTTP boundary is parsed
// here, never trusted inside the service layer.

export const MAX_SETLIST_TITLE_LENGTH = 200;
export const MAX_ITEM_NOTES_LENGTH = 2000;

// 'YYYY-MM-DD', matching the Postgres date column (drizzle maps it to string).
const eventDateSchema = z.iso.date();

export const createSetlistSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Title is required')
    .max(MAX_SETLIST_TITLE_LENGTH),
  eventDate: eventDateSchema.nullish(),
});

// Every field optional except version: the client sends the version it last
// saw so the server can check-and-bump (optimistic locking, same as songs).
export const updateSetlistSchema = createSetlistSchema.partial().extend({
  version: z.number().int().min(1),
});

export const deleteSetlistSchema = z.object({
  version: z.number().int().min(1),
});

// --- Items ----------------------------------------------------------------
// An item is either an arrangement item (arrangementId set; transposedKey /
// customSequence / notes optional) or a note-only row (arrangementId null,
// notes required). The note-only rules are enforced on the merged row in the
// service — a PATCH can flip an item's kind, so the edge only checks shapes.
const itemFields = {
  arrangementId: z.uuid().nullish(),
  transposedKey: keySchema.nullish(),
  customSequence: z
    .array(z.string().trim().min(1).max(MAX_SECTION_LABEL_LENGTH))
    .max(MAX_SEQUENCE_ENTRIES)
    .nullish(),
  notes: z.string().trim().max(MAX_ITEM_NOTES_LENGTH).nullish(),
};

// Item mutations carry the parent setlist's version: items have no version
// column of their own, the setlist is the optimistic-locking aggregate.
export const createItemSchema = z.object(itemFields).extend({
  version: z.number().int().min(1),
});

export const updateItemSchema = z
  .object(itemFields)
  .partial()
  .extend({ version: z.number().int().min(1) });

export const moveItemSchema = z.object({
  direction: z.enum(['up', 'down']),
  version: z.number().int().min(1),
});

export const deleteItemSchema = z.object({
  version: z.number().int().min(1),
});

export type CreateSetlistInput = z.infer<typeof createSetlistSchema>;
export type UpdateSetlistInput = z.infer<typeof updateSetlistSchema>;
export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type MoveItemInput = z.infer<typeof moveItemSchema>;
