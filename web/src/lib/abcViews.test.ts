import { describe, expect, it } from 'vitest';

import { chordChartLines, lyricsText, orderedSections } from './abcViews';
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
