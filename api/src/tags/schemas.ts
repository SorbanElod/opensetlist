import { z } from 'zod';

// Tag names are the group's vocabulary, normalized once at the edge:
// trimmed + lowercased, so "Easter" and "easter" are the same tag and the
// unique(group_id, name) constraint absorbs duplicates.
export const tagNameSchema = z
  .string()
  .trim()
  .min(1, 'Tag name is required')
  .max(40, 'Tag must be at most 40 characters')
  .transform((s) => s.toLowerCase());

export const MAX_TAGS_PER_SONG = 20;

// A song's tag set: normalized names, deduped after normalization.
export const tagsFieldSchema = z
  .array(tagNameSchema)
  .max(MAX_TAGS_PER_SONG, `At most ${MAX_TAGS_PER_SONG} tags per song`)
  .transform((names) => [...new Set(names)]);
