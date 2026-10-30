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
