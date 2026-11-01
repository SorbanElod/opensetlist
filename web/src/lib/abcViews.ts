import type { ArrangementSection } from '../api/arrangements';

// The three on-stage views (issue #10). All derive from the SAME stored ABC
// text at render time — nothing derived is ever persisted:
//   'sheet'  — full abcjs render (staff notation + chords + lyrics)
//   'chords' — chord chart as text: chord symbols inline over the lyric
//              syllables, no staff
//   'lyrics' — lyric words only, no staff, no chords
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

// Syllables of one w: lyric line, in note order. ABC lyric rules we handle:
// words are space-separated, syllables of one word are hyphen-joined
// ("lo-rem" = lo + rem on two notes), a standalone "-" skips a note (the
// previous syllable is held) and "_" is an extender. Returns null entries
// for the skips so the caller can reuse the previous syllable.
function syllablesOf(wLine: string): (string | null)[] {
  const out: (string | null)[] = [];
  for (const token of wLine.trim().split(/\s+/)) {
    if (!token || token === '-' || token === '_') {
      out.push(null);
      continue;
    }
    for (const syllable of token.split('-')) {
      if (syllable) out.push(syllable);
    }
  }
  return out;
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

// Chord chart as text, no staff. Per verse (w: line) and per music line, the
// chord symbols ("G", "C#m", …) are printed inline in front of the lyric
// syllable of the note they sit on — the classic chords-over-lyrics chart.
// A music line without any w: verse just yields its chord symbols in order.
//
// Tokenizing is deliberately simple: quoted tokens are chord names, any
// other token containing a pitch letter (A-G, a-g) or a rest (z/Z) counts
// as one note and consumes one syllable. Exotic notation (grace notes,
// slurs) may misalign syllables — worst case is a shifted word, never a
// crash, and the sheet view remains the authoritative render.
export function chordChartText(abc: string): string {
  const lines = abc.split('\n');
  const musicLines = lines.filter(
    (line) => line.trim() !== '' && !NON_MUSIC_LINE.test(line),
  );
  const verses = lines
    .filter((line) => /^w:/.test(line))
    .map((line) => syllablesOf(line.slice(2)));

  const chordLines = musicLines.map((line) => {
    const tokens = line.match(/"[^"]*"|\S+/g) ?? [];
    return tokens
      .filter((t) => /^"/.test(t))
      .map((t) => t.slice(1, -1))
      .join('  ');
  });

  if (verses.length === 0) {
    return chordLines.filter(Boolean).join('\n');
  }

  // One chart block per verse: chords inline with that verse's syllables.
  return verses
    .map((syllables) => {
      let next = 0;
      let lastSyllable = '';
      return musicLines
        .map((line) => {
          const tokens = line.match(/"[^"]*"|\S+/g) ?? [];
          const out: string[] = [];
          let pendingChord = '';
          for (const token of tokens) {
            if (/^"/.test(token)) {
              pendingChord = token.slice(1, -1);
              continue;
            }
            // Only note-ish tokens consume a syllable (bars, slurs don't).
            if (!/[A-Ga-gzZ]/.test(token)) continue;
            const syllable = syllables[next++] ?? null;
            if (syllable === null) {
              // "-"/"_" skip: hold the previous syllable over this note.
              out.push(
                pendingChord ? `${pendingChord} ${lastSyllable}` : lastSyllable,
              );
            } else {
              lastSyllable = syllable;
              out.push(pendingChord ? `${pendingChord} ${syllable}` : syllable);
            }
            pendingChord = '';
          }
          return out.join(' ');
        })
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');
}
