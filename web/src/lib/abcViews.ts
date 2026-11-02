import type { ArrangementSection } from '../api/arrangements';

// The three on-stage views (issue #10). All derive from the SAME stored ABC
// text at render time — nothing derived is ever persisted:
//   'sheet'  — full abcjs render (staff notation + chords + lyrics)
//   'chords' — the same abcjs render with the notation hidden by CSS, so
//              only the chord names and lyrics remain (see .chord-chart in
//              index.css)
//   'lyrics' — lyric words only, as plain text (lyricsText below)
export type ViewMode = 'sheet' | 'chords' | 'lyrics';

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

// Lyrics-only text: the w: lines with syllable hyphens joined back into
// words ("lo-rem ip-sum" -> "lorem ipsum"), one line per verse.
export function lyricsText(abc: string): string {
  return abc
    .split('\n')
    .filter((line) => /^w:/.test(line))
    .map((line) => {
      const words: string[] = [];
      for (const token of line.slice(2).trim().split(/\s+/)) {
        if (!token || token === '-' || token === '_') continue;
        const word = token.split('-').filter(Boolean).join('');
        if (word) words.push(word);
      }
      return words.join(' ');
    })
    .filter(Boolean)
    .join('\n');
}
