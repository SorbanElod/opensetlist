import { describe, expect, it } from 'vitest';

import { transposeAbc } from './transpose';

const ABC = [
  'X:1',
  'T:"My Song"', // quoted title must NOT be transposed
  'M:4/4',
  'L:1/4',
  'K:G',
  'w: A-mazing grace',
  '"G"GAB "C"c2B | "D"A2 "G"G2 |',
  '% a comment with "F" in it',
].join('\n');

describe('transposeAbc', () => {
  it('transposes the K: line, quoted chord symbols AND the note letters', () => {
    const out = transposeAbc(ABC, 'G', 'D'); // +7 semitones
    expect(out).toContain('K:D');
    // chords G->D, C->G, D->A; notes G,A,B,c,B,A,G,G -> D,E,F#,g,F#,E,D,D
    expect(out).toContain('"D"DEF# "G"g2F# | "A"E2 "D"D2 |');
  });

  it('keeps chord qualities and slash bass notes, transposing roots and notes', () => {
    const out = transposeAbc('K:C\n"Cmaj7"C | "G/B"G | "Am7"A |', 'C', 'G');
    expect(out).toContain('K:G');
    expect(out).toContain('"Gmaj7"G | "D/F#"D | "Em7"E |');
  });

  it('handles flat roots and preserves minor mode suffixes on K:', () => {
    const out = transposeAbc('K:Bbm\n"Bb"B |', 'Bb', 'F'); // +7
    expect(out).toContain('K:Fm');
    expect(out).toContain('"F"F# |');
  });

  it('leaves rests, bar lines and octave markers alone, keeps note case', () => {
    const out = transposeAbc('K:C\nz2 "C"C, | "G"G\' |', 'C', 'G');
    expect(out).toContain('z2 "G"G, | "D"D\' |');
  });

  it('returns the input unchanged when the delta is 0 or a key is unknown', () => {
    expect(transposeAbc(ABC, 'G', 'G')).toBe(ABC);
    expect(transposeAbc(ABC, 'G', 'H')).toBe(ABC);
  });

  it('never touches lyrics, titles, or comments', () => {
    const out = transposeAbc(ABC, 'G', 'D');
    expect(out).toContain('T:"My Song"');
    expect(out).toContain('w: A-mazing grace');
    expect(out).toContain('% a comment with "F" in it');
  });

  it('transposes downwards with wrap-around (D -> G is -7, i.e. +5)', () => {
    const out = transposeAbc('K:D\n"D"D |', 'D', 'G');
    expect(out).toContain('K:G');
    expect(out).toContain('"G"G |');
  });
});
