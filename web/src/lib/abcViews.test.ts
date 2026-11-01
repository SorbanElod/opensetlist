import { describe, expect, it } from 'vitest';

import { orderedSections, stripChords } from './abcViews';
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

describe('stripChords', () => {
  it('removes inline chord symbols but keeps the notes', () => {
    expect(stripChords('"G"G2 G2 | "C"c2 B2 |')).toBe('G2 G2 | c2 B2 |');
  });

  it('removes chord-only lines, leaving an empty line', () => {
    expect(stripChords('"Cmaj7"\nGAB c2 |')).toBe('\nGAB c2 |');
  });

  it('handles slash chords and decorations', () => {
    expect(stripChords('"C/G"G2 | "Dsus4"d2 |')).toBe('G2 | d2 |');
  });

  it('keeps header/directive lines untouched, including quoted titles', () => {
    const abc = 'T:"My Song"\nM:4/4\nK:G\n%%score\n% a comment\n"G"G2 |';
    expect(stripChords(abc)).toBe(
      'T:"My Song"\nM:4/4\nK:G\n%%score\n% a comment\nG2 |',
    );
  });

  it('keeps lyrics lines (w:) untouched', () => {
    expect(stripChords('w: a -- ma -- zing grace')).toBe(
      'w: a -- ma -- zing grace',
    );
  });
});
