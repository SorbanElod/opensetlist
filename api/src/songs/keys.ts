import { z } from 'zod';

// The 12 pitch-class keys with flats — shared by songs and arrangements.
// Lives in its own module so songs/schemas and arrangements/schemas can both
// import it without a module-evaluation cycle (schemas import each other).
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
