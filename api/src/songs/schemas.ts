import { z } from 'zod';

import {
  createArrangementSchema,
  MAX_SECTIONS,
  MAX_SECTION_LABEL_LENGTH,
  MAX_SEQUENCE_ENTRIES,
  sectionSchema,
  type CreateArrangementInput,
} from '../arrangements/schemas.js';
import {
  MAX_TAGS_PER_SONG,
  tagNameSchema,
  tagsFieldSchema,
} from '../tags/schemas.js';
import { KEYS, keySchema } from './keys.js';

// Validation at the edges: everything crossing the HTTP boundary is parsed
// here, never trusted inside the service layer.

// Re-exported for existing importers (songs/service.ts); the definition
// lives in keys.ts to keep the arrangements/schemas <-> songs/schemas
// import graph acyclic.
export { KEYS, keySchema };

// 'public' exists in the enum already; exposing it in the API/UI is a
// later decision (cross-group sharing), no migration needed for it.
export const visibilitySchema = z.enum(['private', 'group', 'public']);

// ISO 639-1 two-letter code, e.g. "hu", "en".
export const languageSchema = z
  .string()
  .regex(/^[a-z]{2}$/, 'Use a 2-letter ISO 639-1 code, e.g. "hu"');

// --- Song query filter: a small recursive tree ----------------------------
// leaf: { search?, tagsAll?, tagsAny? } — every present field must match
// node: { and: [...] } | { or: [...] } — children combine with AND / OR.
// Arbitrary nesting; the service lowers it to plain Drizzle SQL conditions.
export type FilterLeaf = {
  search?: string;
  tagsAll?: string[];
  tagsAny?: string[];
};
export type FilterNode =
  FilterLeaf | { and: FilterNode[] } | { or: FilterNode[] };

const MAX_FILTER_CHILDREN = 20;

const filterLeafSchema = z
  .object({
    search: z.string().trim().max(200).optional(),
    tagsAll: z.array(tagNameSchema).max(MAX_TAGS_PER_SONG).optional(),
    tagsAny: z.array(tagNameSchema).max(MAX_TAGS_PER_SONG).optional(),
  })
  .refine(
    (leaf) =>
      leaf.search !== undefined ||
      (leaf.tagsAll?.length ?? 0) > 0 ||
      (leaf.tagsAny?.length ?? 0) > 0,
    { message: 'Filter leaf needs at least one of search / tagsAll / tagsAny' },
  );

export const filterSchema: z.ZodType<FilterNode> = z.lazy(() =>
  z.union([
    filterLeafSchema,
    z.object({ and: z.array(filterSchema).min(1).max(MAX_FILTER_CHILDREN) }),
    z.object({ or: z.array(filterSchema).min(1).max(MAX_FILTER_CHILDREN) }),
  ]),
);

// POST /api/songs/query body. No filter = the whole library.
export const querySongsSchema = z.object({
  filter: filterSchema.optional(),
});

export const createSongSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  author: z.string().trim().max(200).optional(),
  defaultKey: keySchema,
  visibility: visibilitySchema.default('group'),
  language: languageSchema.optional(),
  // Tag names; normalized + deduped by tagsFieldSchema, created inline
  // (idempotently) by the service when the song is written.
  tags: tagsFieldSchema.default([]),
});

// Every field optional except version: the client sends the version it last
// saw so the server can check-and-bump (optimistic locking).
export const updateSongSchema = createSongSchema.partial().extend({
  version: z.number().int().min(1),
});

export const deleteSongSchema = z.object({
  version: z.number().int().min(1),
});

export type CreateSongInput = z.infer<typeof createSongSchema>;
export type UpdateSongInput = z.infer<typeof updateSongSchema>;

// JSON import (dev seeding via api/fixtures/dev-seed.json; a polished import
// UI is post-alpha). Tolerant of the draft seed format: zod strips unknown
// keys. Arrangements are imported — transformed to the API shape and piped
// through createArrangementSchema, so the cross-field rules (unique labels,
// sequence ⊆ labels) apply here too. Tags are stored as well (#20).
export const importSongsSchema = z.object({
  songs: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        authors: z
          .object({
            lyrics: z.string().optional(),
            music: z.string().optional(),
          })
          .optional(),
        visibility: z
          .enum(['private', 'group', 'public', 'PRIVATE', 'GROUP', 'PUBLIC'])
          .transform(
            (v): 'private' | 'group' | 'public' =>
              v.toLowerCase() as 'private' | 'group' | 'public',
          )
          .optional(),
        language: languageSchema.optional(),
        // Snake_case seed keys -> API shape -> the same validation the
        // arrangements API applies (key enum, unique labels, sequence ⊆
        // labels). Extra seed keys (kind, time_signature, ...) are stripped.
        arrangements: z
          .array(
            z
              .object({
                title: z.string().trim().min(1).max(200),
                original_key: keySchema,
                bpm: z.number().int().min(30).max(300).nullish(),
                default_sequence: z
                  .array(z.string().trim().min(1).max(MAX_SECTION_LABEL_LENGTH))
                  .max(MAX_SEQUENCE_ENTRIES),
                sections: z.array(sectionSchema).max(MAX_SECTIONS),
              })
              .transform((a): CreateArrangementInput => ({
                title: a.title,
                originalKey: a.original_key,
                bpm: a.bpm ?? null,
                defaultSequence: a.default_sequence,
                sections: a.sections,
              }))
              .pipe(createArrangementSchema),
          )
          .optional(),
        tags: tagsFieldSchema.optional(),
      }),
    )
    .min(1)
    .max(100),
});

export type ImportSongsInput = z.infer<typeof importSongsSchema>;
