import { z } from 'zod';

import { keySchema } from '../songs/keys.js';

// Validation at the edges: everything crossing the HTTP boundary is parsed
// here, never trusted inside the service layer.

// Boring upper bounds so one request can't balloon: 50 sections per
// arrangement, 100 sequence entries, 40-char labels, 100k chars of ABC per
// section (a whole song in ABC is a few kB).
export const MAX_SECTIONS = 50;
export const MAX_SEQUENCE_ENTRIES = 100;
export const MAX_SECTION_LABEL_LENGTH = 40;
export const MAX_SECTION_CONTENT_LENGTH = 100_000;

export const sectionSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, 'Section label is required')
    .max(
      MAX_SECTION_LABEL_LENGTH,
      `Label must be at most ${MAX_SECTION_LABEL_LENGTH} characters`,
    ),
  // ABC Notation text. May be empty while drafting a section.
  content: z
    .string()
    .max(MAX_SECTION_CONTENT_LENGTH, 'Section content is too large'),
});

// default_sequence holds section labels, so it can only be validated against
// sections — a cross-field check, hence superRefine on the whole object.
function validateAgainstSections(
  value: { sections: { label: string }[]; defaultSequence: string[] },
  ctx: z.RefinementCtx,
) {
  const labels = value.sections.map((s) => s.label);
  if (new Set(labels).size !== labels.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['sections'],
      message: 'Section labels must be unique within an arrangement',
    });
  }
  const labelSet = new Set(labels);
  value.defaultSequence.forEach((entry, index) => {
    if (!labelSet.has(entry)) {
      ctx.addIssue({
        code: 'custom',
        path: ['defaultSequence', index],
        message: `Unknown section label "${entry}" — sequence entries must be existing section labels`,
      });
    }
  });
}

const arrangementBodySchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  originalKey: keySchema,
  bpm: z
    .number()
    .int()
    .min(30, 'BPM must be between 30 and 300')
    .max(300, 'BPM must be between 30 and 300')
    .nullish(),
  sections: z
    .array(sectionSchema)
    .max(MAX_SECTIONS, `At most ${MAX_SECTIONS} sections`),
  defaultSequence: z
    .array(z.string().trim().min(1).max(MAX_SECTION_LABEL_LENGTH))
    .max(
      MAX_SEQUENCE_ENTRIES,
      `At most ${MAX_SEQUENCE_ENTRIES} sequence entries`,
    ),
});

export const createArrangementSchema = arrangementBodySchema.superRefine(
  validateAgainstSections,
);

// The section editor always submits the whole arrangement at once, so PATCH
// takes the full body plus version (optimistic locking) — no partial-update
// merge-and-validate dance needed.
export const updateArrangementSchema = arrangementBodySchema
  .extend({ version: z.number().int().min(1) })
  .superRefine(validateAgainstSections);

export const deleteArrangementSchema = z.object({
  version: z.number().int().min(1),
});

export type CreateArrangementInput = z.infer<typeof arrangementBodySchema>;
export type UpdateArrangementInput = CreateArrangementInput & {
  version: number;
};
