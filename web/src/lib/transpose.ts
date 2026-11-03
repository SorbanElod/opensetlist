import { KEYS } from '../api/songs';

// Render-time transposition (issue #12/#62): a setlist item's transposed_key
// is NEVER stored as ABC — the stored ABC stays in the original key and the
// view transposes on the fly, so editing the arrangement never conflicts with
// a performance key.
//
// Only two things carry absolute pitch in ABC: the K: header field and
// quoted chord symbols on music lines ("Cmaj7", "G/B"). Chord qualities are
// intervals relative to the root, so shifting the root by N semitones
// preserves the quality — we transpose the root (and a slash bass note) and
// leave the rest of the chord name untouched. Lyrics (w:) and titles
// (T:"...") can contain quotes, so header/comment lines are never touched.

// Pitch-class lookup, including the enharmonic spellings that can appear in
// chord roots even though the KEYS enum only uses one spelling per class.
const SEMITONE: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  'E#': 5,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
  Cb: 11,
  'B#': 0,
};

// Header fields (X:, T:, K:, w:, …), directives and comments — never music.
const NON_MUSIC_LINE = /^([A-Za-z][A-Za-z0-9_]*:|%%|%)/;

function transposeNote(note: string, delta: number): string {
  const match = /^([A-Ga-g])([#b]?)(.*)$/.exec(note);
  if (!match) return note;
  const pc = SEMITONE[match[1]!.toUpperCase() + match[2]!];
  if (pc === undefined) return note;
  const shifted = KEYS[(pc + delta) % 12]!;
  // Preserve the original case of the root letter (abcjs chord roots are
  // conventionally uppercase; some sources write them lowercase).
  const root =
    match[1]!.toLowerCase() === match[1] ? shifted.toLowerCase() : shifted;
  return root + match[3]!;
}

// "Bbmaj7" -> transposed root + unchanged quality; "G/B" -> both sides.
// transposeNote already splits root+accidental from the quality suffix.
function transposeChord(chord: string, delta: number): string {
  return chord
    .split('/')
    .map((part) => transposeNote(part, delta))
    .join('/');
}

// Transpose an ABC source from one key to another. Returns the input
// unchanged when either key is unknown or the delta is 0.
export function transposeAbc(
  abc: string,
  fromKey: string,
  toKey: string,
): string {
  const from = SEMITONE[fromKey];
  const to = SEMITONE[toKey];
  if (from === undefined || to === undefined) return abc;
  const delta = (((to - from) % 12) + 12) % 12;
  if (delta === 0) return abc;

  return abc
    .split('\n')
    .map((line) => {
      if (NON_MUSIC_LINE.test(line.trimStart())) {
        // K: field: replace just the key token, keep any mode suffix
        // (K:Gm -> K:Am) and trailing options (clef=...).
        if (/^K:/.test(line.trimStart())) {
          return line.replace(
            /^(\s*K:\s*)([A-Ga-g][#b]?)/,
            (_all, prefix: string, note: string) =>
              prefix + transposeNote(note, delta),
          );
        }
        return line;
      }
      // Music line: transpose quoted chord symbols only.
      return line.replace(
        /"([^"]*)"/g,
        (_all, chord: string) => `"${transposeChord(chord, delta)}"`,
      );
    })
    .join('\n');
}
