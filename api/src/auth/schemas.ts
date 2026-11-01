import { z } from 'zod';

// Validation at the edges: everything crossing the HTTP boundary is parsed
// here, never trusted inside the service layer.

// Email normalization happens in the same step as validation — uniqueness
// depends on a canonical lowercase form.
const normalizedEmail = z
  .email()
  .transform((email) => email.trim().toLowerCase());

// NIST guidance: length beats composition rules. 10 chars minimum, no
// forced symbols/digits that just push users to predictable patterns.
export const registerSchema = z.object({
  email: normalizedEmail,
  name: z.string().trim().min(1).max(100),
  password: z.string().min(10).max(512),
});

// On login only check shape (not the 10-char rule): don't reveal password
// policy to someone probing the endpoint.
export const loginSchema = z.object({
  email: normalizedEmail,
  password: z.string().min(1),
});

// Self-service profile update (issue #10): only the preferred rendering
// view is user-settable — email/name/password changes are a later phase.
export const updateMeSchema = z.object({
  defaultView: z.enum(['sheet', 'chords', 'lyrics']),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateMeInput = z.infer<typeof updateMeSchema>;
