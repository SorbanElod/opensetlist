import { describe, expect, it } from 'vitest';

import {
  collapseConsecutive,
  collapseRepeats,
  formatSequence,
} from './sequence';
import type { ArrangementSection } from '../api/arrangements';

// The "Táruljatok fel" play order from issue #69's acceptance.
const TARULJATOK = ['V1', 'V1', 'V1', 'R1', 'R1', 'R1', 'V2', 'R2', 'V3', 'R2'];

describe('collapseConsecutive', () => {
  it('collapses consecutive identical labels into one entry with a count', () => {
    const out = collapseConsecutive(TARULJATOK, (l) => l);
    expect(out.map((c) => [c.label, c.count])).toEqual([
      ['V1', 3],
      ['R1', 3],
      ['V2', 1],
      ['R2', 1],
      ['V3', 1],
      ['R2', 1],
    ]);
  });

  it('keeps non-consecutive repeats as separate entries (V1, C1, V1)', () => {
    const out = collapseConsecutive(['V1', 'C1', 'V1'], (l) => l);
    expect(out.map((c) => [c.label, c.count])).toEqual([
      ['V1', 1],
      ['C1', 1],
      ['V1', 1],
    ]);
  });

  it('records startIndex as the position in the EXPANDED list (never renumbered)', () => {
    const out = collapseConsecutive(TARULJATOK, (l) => l);
    expect(out.map((c) => c.startIndex)).toEqual([0, 3, 6, 7, 8, 9]);
  });

  it('trims labels before comparing (sequence entries may carry spaces)', () => {
    const out = collapseConsecutive(['V1', ' V1 ', 'V1'], (l) => l);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ label: 'V1', count: 3, startIndex: 0 });
  });

  it('handles empty input', () => {
    expect(collapseConsecutive([], (l: string) => l)).toEqual([]);
  });
});

describe('collapseRepeats', () => {
  it('collapses a section list in play order, keeping the section item', () => {
    const sections: ArrangementSection[] = [
      { label: 'V1', content: 'abc-v1' },
      { label: 'C1', content: 'abc-c1' },
    ];
    // orderedSections would push V1 three times for ["V1","V1","V1","C1"]
    const played = [sections[0]!, sections[0]!, sections[0]!, sections[1]!];
    const out = collapseRepeats(played);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      label: 'V1',
      count: 3,
      startIndex: 0,
    });
    expect(out[0]!.item.content).toBe('abc-v1');
    expect(out[1]).toMatchObject({ label: 'C1', count: 1, startIndex: 3 });
  });
});

describe('formatSequence', () => {
  it('renders consecutive repeats with a ×N badge in a summary line', () => {
    expect(formatSequence(TARULJATOK)).toBe(
      'V1 ×3 → R1 ×3 → V2 → R2 → V3 → R2',
    );
  });

  it('leaves non-consecutive repeats expanded', () => {
    expect(formatSequence(['V1', 'C1', 'V1'])).toBe('V1 → C1 → V1');
  });

  it('handles an empty sequence', () => {
    expect(formatSequence([])).toBe('');
  });
});
