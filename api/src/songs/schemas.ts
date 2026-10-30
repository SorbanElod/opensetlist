import { z } from 'zod';

// Validation at the edges: everything crossing the HTTP boundary is parsed
// here, never trusted inside the service layer.

// The 12 pitch-class keys with flats — same vocabulary as the song form.
export const KEYS = [
  'C',
  'C#',
  'D',
  'Eb',
  'E',
  'F',
  'F#',
  'G',
  'Ab',
  'A',
  'Bb',
  'B',
] as const;

export const keySchema = z.enum(KEYS);

// 'public' exists in the enum already; exposing it in the API/UI is a
// later decision (cross-group sharing), no migration needed for it.
export const visibilitySchema = z.enum(['private', 'group', 'public']);

// ISO 639-1 two-letter code, e.g. "hu", "en".
export const languageSchema = z
  .string()
  .regex(/^[a-z]{2}$/, 'Use a 2-letter ISO 639-1 code, e.g. "hu"');

export const createSongSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  author: z.string().trim().max(200).optional(),
  defaultKey: keySchema,
  visibility: visibilitySchema.default('group'),
  language: languageSchema.optional(),
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
// keys; arrangements and tags are accepted but skipped until #9/#20 land.
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
        // Only original_key is read (to derive the song's default key);
        // the arrangements themselves are not stored yet (#9).
        arrangements: z
          .array(z.object({ original_key: z.string().optional() }))
          .optional(),
        tags: z.array(z.string()).optional(), // not stored yet (#20)
      }),
    )
    .min(1)
    .max(100),
});

export type ImportSongsInput = z.infer<typeof importSongsSchema>;
