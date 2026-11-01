import { describe, expect, it } from 'vitest';

import { chordChartText, lyricsText, orderedSections } from './abcViews';
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

// Seed-style ABC: quoted chord names inline on music lines, w: lyric lines
// with hyphen-joined syllables ("a-ma-zing"). Each w: verse carries one
// syllable per note across ALL music lines (8 notes here), per ABC rules.
const ABC = [
  'X:1',
  'T:Amazing Grace — V1',
  'M:4/4',
  'K:G',
  '"G"G2 A2 | "C"c2 B2 |',
  '"D"d2 B2 "G"A2 G2 |',
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

describe('chordChartText', () => {
  it('prints chord symbols inline in front of the note they sit on, per verse', () => {
    expect(chordChartText(ABC)).toBe(
      'G a ma C zing grace\nD how sweet G the sound\n' +
        'G i once C was lost\nD but now G am found',
    );
  });

  it('falls back to plain chord symbols per music line when there are no lyrics', () => {
    const noLyrics = 'X:1\nK:G\n"G"G2 A2 | "C"c2 B2 |\n"D"d2 |';
    expect(chordChartText(noLyrics)).toBe('G  C\nD');
  });

  it('holds the previous syllable over skip (-) notes', () => {
    const abc = '"G"G2 A2 B2 |\nw: a - ma';
    expect(chordChartText(abc)).toBe('G a a ma');
  });
});
