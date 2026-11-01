import type { ArrangementSection } from '../api/arrangements';

// The two on-stage views (issue #10). Both render from the SAME stored ABC
// text — 'lyrics' just strips the chord symbols at render time (see
// stripChords). Nothing derived is ever persisted.
export type ViewMode = 'chords' | 'lyrics';

// Removes chord symbols from ABC music lines, leaving notes and lyrics.
// In ABC, "..." on a music line is always a chord name ("C", "Gmaj7",
// "C/G"); header/directive lines (T:, K:, %%, %…) keep their quotes, so a
// quoted title like T:"My Song" is metadata and survives.
export function stripChords(abc: string): string {
  return abc
    .split('\n')
    .map((line) =>
      /^([A-Za-z][A-Za-z0-9_]*:|%%|%)/.test(line)
        ? line
        : line.replace(/"[^"]*"/g, ''),
    )
    .join('\n');
}

// Sections in play order: every sequence entry resolves to its section
// (repeats are legal — V1 C1 V1 C1), then any section the sequence does not
// mention is appended once, in its original order, so no content is silently
// dropped. Unknown sequence labels are skipped (the API validates the
// sequence on write, so this is belt-and-braces).
//
// P3 note: the effective sequence is "setlist item override -> arrangement
// default". This function takes the sequence as a parameter, so the setlist
// page just passes the override instead of arrangement.defaultSequence.
export function orderedSections(
  sections: ArrangementSection[],
  sequence: string[],
): ArrangementSection[] {
  const byLabel = new Map(sections.map((s) => [s.label.trim(), s]));
  const ordered: ArrangementSection[] = [];
  const used = new Set<string>();

  for (const entry of sequence) {
    const section = byLabel.get(entry.trim());
    // A repeated label means "play this section again" — pushed again.
    if (section) {
      ordered.push(section);
      used.add(section.label);
    }
  }

  for (const section of sections) {
    if (!used.has(section.label)) ordered.push(section);
  }

  return ordered;
}
