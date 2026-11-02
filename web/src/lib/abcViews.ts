import type { ArrangementSection } from '../api/arrangements';

// The three on-stage views (issue #10). All derive from the SAME stored ABC
// text at render time — nothing derived is ever persisted:
//   'sheet'  — full abcjs render (staff notation + chords + lyrics)
//   'chords' — chord chart as flowing HTML: chord names inline in the lyric
//              flow, right before the syllable they sit on (Ultimate
//              Guitar style), words joined — see chordChartLines
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

// Lines that carry no music: ABC header fields (X:, T:, M:, K:, …), %%…
// directives and % comments.
const NON_MUSIC_LINE = /^([A-Za-z][A-Za-z0-9_]*:|%%|%)/;

// One item of the chord chart: a lyric syllable and the chord name sitting
// on its note (null when the note has no chord). wordEnd marks the last
// syllable of a word, so the renderer can put a space after it.
export type ChordChartItem = {
  chord: string | null;
  syllable: string;
  wordEnd: boolean;
};

// The chord chart as structured items: per verse (w: line), per music line,
// the syllables with their chords — the same alignment abcjs would draw, but
// as flowing text (abcjs itself can only place them at fixed note
// positions, which reads like a dump). Quoted "..." tokens on music lines
// are chord names; any other token containing a pitch letter (A-G, a-g) or a
// rest (z/Z) counts as one note and consumes one syllable. A "-"/"_" in the
// w: line holds the previous syllable over that note (rendered empty).
// Worst case for exotic notation (grace notes, slurs) is a shifted word,
// never a crash — the sheet view remains the authoritative render.
export function chordChartLines(abc: string): ChordChartItem[][][] {
  const lines = abc.split('\n');
  const musicLines = lines.filter(
    (line) => line.trim() !== '' && !NON_MUSIC_LINE.test(line),
  );
  const wLines = lines.filter((line) => /^w:/.test(line));

  // Syllable stream per verse, with word-end markers: words are
  // space-separated in w:, syllables of one word are hyphen-joined
  // ("lo-rem" = lo + rem on two notes).
  const verses = wLines.map((w) => {
    const stream: { syllable: string | null; wordEnd: boolean }[] = [];
    for (const token of w.slice(2).trim().split(/\s+/)) {
      if (!token || token === '-' || token === '_') {
        stream.push({ syllable: null, wordEnd: false });
        continue;
      }
      const parts = token.split('-').filter(Boolean);
      parts.forEach((part, i) =>
        stream.push({ syllable: part, wordEnd: i === parts.length - 1 }),
      );
    }
    return stream;
  });

  // No lyrics: just the chord symbols per music line.
  if (verses.length === 0) {
    return [
      musicLines.map((line) =>
        (line.match(/"[^"]*"|\S+/g) ?? [])
          .filter((t) => /^"/.test(t))
          .map((t) => ({ chord: t.slice(1, -1), syllable: '', wordEnd: true })),
      ),
    ];
  }

  return verses.map((stream) => {
    let next = 0;
    return musicLines.map((line) => {
      const tokens = line.match(/"[^"]*"|\S+/g) ?? [];
      const items: ChordChartItem[] = [];
      let pendingChord: string | null = null;
      for (const token of tokens) {
        if (/^"/.test(token)) {
          pendingChord = token.slice(1, -1);
          continue;
        }
        if (!/[A-Ga-gzZ]/.test(token)) continue; // bar lines, slurs, …
        const s = stream[next++] ?? { syllable: null, wordEnd: false };
        items.push({
          chord: pendingChord,
          syllable: s.syllable ?? '',
          wordEnd: s.wordEnd,
        });
        pendingChord = null;
      }
      return items;
    });
  });
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
