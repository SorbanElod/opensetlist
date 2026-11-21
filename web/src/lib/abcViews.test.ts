import { describe, expect, it } from 'vitest';

import {
  arrangementHasSheet,
  chordChartLines,
  hasSheetMusic,
  lyricsText,
  orderedSections,
  sheetAbc,
  zoomStyle,
} from './abcViews';
import type { ArrangementSection } from '../api/arrangements';

const sections: ArrangementSection[] = [
  { label: 'V1', content: 'X:1\nK:G\nV1 abc' },
  { label: 'C1', content: 'X:1\nK:G\nC1 abc' },
  { label: 'V2', content: 'X:1\nK:G\nV2 abc' },
  { label: 'Bridge', content: 'X:1\nK:G\nBridge abc' },
];

const labels = (list: ArrangementSection[]) => list.map((s) => s.label);

describe('orderedSections', () => {
  it('follows the sequence order', () => {
    expect(labels(orderedSections(sections, ['C1', 'V1']))).toEqual([
      'C1',
      'V1',
      'V2',
      'Bridge',
    ]);
  });

  it('keeps repeated sequence entries (V1 C1 V1 C1)', () => {
    expect(labels(orderedSections(sections, ['V1', 'C1', 'V1', 'C1']))).toEqual(
      ['V1', 'C1', 'V1', 'C1', 'V2', 'Bridge'],
    );
  });

  it('appends sections missing from the sequence once, in original order', () => {
    expect(labels(orderedSections(sections, ['V2']))).toEqual([
      'V2',
      'V1',
      'C1',
      'Bridge',
    ]);
  });

  it('handles an empty sequence (everything appended) and empty sections', () => {
    expect(labels(orderedSections(sections, []))).toEqual([
      'V1',
      'C1',
      'V2',
      'Bridge',
    ]);
    expect(orderedSections([], ['V1'])).toEqual([]);
  });

  it('skips sequence entries with no matching section label', () => {
    expect(labels(orderedSections(sections, ['V1', 'Outro', 'C1']))).toEqual([
      'V1',
      'C1',
      'V2',
      'Bridge',
    ]);
  });
});

// Seed-style ABC: w: lyric lines with hyphen-joined syllables ("a-ma-zing").
const ABC = [
  'X:1',
  'T:Amazing Grace — V1',
  'M:4/4',
  'K:G',
  '"G"G2 A2 | "C"c2 B2 |',
  'w: a-ma-zing grace how sweet the sound',
  'w: i once was lost but now am found',
].join('\n');

describe('lyricsText', () => {
  it('joins hyphenated syllables back into words, one line per verse', () => {
    expect(lyricsText(ABC)).toBe(
      'amazing grace how sweet the sound\ni once was lost but now am found',
    );
  });

  it('handles skips (-) and extenders (_) without emitting them', () => {
    expect(lyricsText('w: a - ma _ zing')).toBe('a ma zing');
  });

  it('returns an empty string when there are no w: lines', () => {
    expect(lyricsText('X:1\nK:G\nG2 A2 |')).toBe('');
  });
});

describe('chordChartLines', () => {
  it('maps chords inline onto the syllable of the note they sit on, words marked', () => {
    // 4 notes; verse syllables a,ma,zing (one word) + grace (one word).
    const verses = chordChartLines(ABC);
    expect(verses).toHaveLength(2); // two w: verses
    expect(verses[0]).toEqual([
      [
        { chord: 'G', syllable: 'a', wordEnd: false },
        { chord: null, syllable: 'ma', wordEnd: false },
        { chord: 'C', syllable: 'zing', wordEnd: true },
        { chord: null, syllable: 'grace', wordEnd: true },
      ],
    ]);
    // Second verse aligns with the same music lines.
    expect(verses[1]?.[0]?.map((i) => i.syllable)).toEqual([
      'i',
      'once',
      'was',
      'lost',
    ]);
  });

  it('stops the line when the verse runs out of syllables (no bare chord rows)', () => {
    // 2 music lines x 2 notes, but the verse covers only 2 syllables.
    const verses = chordChartLines('"G"G2 A2 |\n"C"c2 B2 |\nw: a-ma');
    expect(verses[0]).toEqual([
      [
        { chord: 'G', syllable: 'a', wordEnd: false },
        { chord: null, syllable: 'ma', wordEnd: true },
      ],
      [], // second music line: no syllables left, nothing emitted
    ]);
  });

  it('renders a held note (w: "-") as an empty syllable that still shows its chord', () => {
    const verses = chordChartLines('"G"G2 A2 B2 |\nw: a - ma');
    expect(verses[0]?.[0]).toEqual([
      { chord: 'G', syllable: 'a', wordEnd: true },
      { chord: null, syllable: '', wordEnd: false },
      { chord: null, syllable: 'ma', wordEnd: true },
    ]);
  });

  it('falls back to bare chord symbols per music line when there are no lyrics', () => {
    const verses = chordChartLines('X:1\nK:G\n"G"G2 A2 | "C"c2 |\n"D"d2 |');
    expect(verses).toEqual([
      [
        [
          { chord: 'G', syllable: '', wordEnd: true },
          { chord: 'C', syllable: '', wordEnd: true },
        ],
        [{ chord: 'D', syllable: '', wordEnd: true }],
      ],
    ]);
  });
});

describe('sheetAbc', () => {
  it('strips T: and C: header lines but keeps the fields abcjs needs', () => {
    const abc =
      'X:1\nT:Amazing Grace — V1\nC:John Newton\nM:3/4\nK:G\n"G"G2 A2 |\nw: a-ma-zing grace';
    const out = sheetAbc(abc);
    expect(out).not.toContain('T:');
    expect(out).not.toContain('C:');
    expect(out).toContain('X:1');
    expect(out).toContain('M:3/4');
    expect(out).toContain('K:G');
    expect(out).toContain('w: a-ma-zing grace');
  });

  it('leaves music lines untouched (quoted chords are not C: fields)', () => {
    const abc = 'X:1\nK:G\n"C"c2 B2 |\nw: how sweet';
    expect(sheetAbc(abc)).toBe(abc);
  });
});

describe('hasSheetMusic', () => {
  it('detects a melody: a music line with a pitch note', () => {
    expect(hasSheetMusic(ABC)).toBe(true); // "G"G2 A2 | ...
    expect(hasSheetMusic('X:1\nK:G\nGAB c2B |\nw: a-ma-zing')).toBe(true);
  });

  it('treats chords over rests as sheet-less (the photo-chord-sheet convention)', () => {
    // Chord symbols sit on rests, lyrics on w: lines — no pitch anywhere.
    expect(
      hasSheetMusic(
        'X:1\nT:Táruljatok fel\nK:G\n"G" z4 | "C" z4 |\nw: Tá-ru-la-tok fel',
      ),
    ).toBe(false);
  });

  it('treats header-only and w:-only content as sheet-less', () => {
    expect(hasSheetMusic('X:1\nT:Title\nM:4/4\nK:G\n')).toBe(false);
    expect(hasSheetMusic('X:1\nK:G\nw: a-ma-zing grace')).toBe(false);
  });

  it('does not count quoted chord symbols or rests as pitches', () => {
    expect(hasSheetMusic('X:1\nK:G\n"G" z2 "C" Z2 |')).toBe(false);
    // ...but a single real note in the same line makes it a sheet.
    expect(hasSheetMusic('"G" z2 "C" c2 |')).toBe(true);
  });

  it('ignores comments and %% directives, and empty content', () => {
    expect(hasSheetMusic('% a comment\n%%text\nK:G\n')).toBe(false);
    expect(hasSheetMusic('')).toBe(false);
    expect(hasSheetMusic('   \n  ')).toBe(false);
  });
});

describe('arrangementHasSheet', () => {
  it('is true when any section has a melody (arrangement-level, issue #69)', () => {
    expect(
      arrangementHasSheet({
        sections: [
          { label: 'V1', content: 'K:G\n"G" z4 |\nw: a' }, // sheet-less
          { label: 'C1', content: 'K:G\n"G"G2 A2 |\nw: b' }, // melody
        ],
      }),
    ).toBe(true);
  });

  it('is false for a chords+lyrics-only arrangement and for no sections', () => {
    expect(
      arrangementHasSheet({
        sections: [{ label: 'V1', content: 'K:G\n"G" z4 |\nw: a' }],
      }),
    ).toBe(false);
    expect(arrangementHasSheet({ sections: [] })).toBe(false);
  });
});

describe('zoomStyle', () => {
  it('compensates width only when zooming in (prevents overflow)', () => {
    expect(zoomStyle(1)).toEqual({ zoom: 1 });
    expect(zoomStyle(1.5)).toEqual({ zoom: 1.5, width: `${100 / 1.5}%` });
  });

  it('does not compensate when zooming out (card stays compact, not full-width with tiny text)', () => {
    expect(zoomStyle(0.5)).toEqual({ zoom: 0.5 });
  });
});
