import type { ArrangementSection } from '../api/arrangements';

// Compact repeat display (issue #69): consecutive identical sequence labels
// collapse to one entry with a ×N badge — V1, V1, V1 renders as "V1 ×3".
// This is PRESENTATION-ONLY: startIndex always refers to the position in the
// EXPANDED list, so anything anchored to sequence indexes (annotations later,
// sequence_index semantics) keeps using the full linear sequence — the stored
// arrays are never rewritten or renumbered.
export type Collapsed<T> = {
  item: T;
  label: string;
  count: number;
  // Index of the first occurrence in the expanded sequence.
  startIndex: number;
};

// Collapse CONSECUTIVE identical labels only — non-consecutive repeats
// (V1, C1, V1) stay separate entries.
export function collapseConsecutive<T>(
  items: T[],
  labelOf: (item: T) => string,
): Collapsed<T>[] {
  const out: Collapsed<T>[] = [];
  items.forEach((item, index) => {
    const label = labelOf(item).trim();
    const last = out[out.length - 1];
    if (last && last.label === label) {
      last.count += 1;
    } else {
      out.push({ item, label, count: 1, startIndex: index });
    }
  });
  return out;
}

// Sections in play order (see orderedSections in abcViews), collapsed for
// display: each collapsed group renders its section once, with a ×N badge.
export function collapseRepeats(
  sections: ArrangementSection[],
): Collapsed<ArrangementSection>[] {
  return collapseConsecutive(sections, (s) => s.label);
}

// Text rendering of a sequence ("V1 → C1 → V1") with consecutive repeats
// collapsed: "V1 ×3 → R1 ×3 → V2" — used where a sequence is shown as a
// summary line (setlist detail meta, "using arrangement default").
export function formatSequence(labels: string[]): string {
  return collapseConsecutive(labels, (l) => l)
    .map((c) => (c.count > 1 ? `${c.label} ×${c.count}` : c.label))
    .join(' → ');
}
