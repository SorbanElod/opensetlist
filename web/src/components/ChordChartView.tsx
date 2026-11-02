import { chordChartLines } from '../lib/abcViews';

// Chords view (issue #10): the chord chart as flowing columns, Ultimate
// Guitar style — each lyric syllable is an inline-block with its chord name
// stacked above it (accent, bold), syllables of a word touching, words
// separated by a gap, lines wrap naturally on a phone. Derived from the
// same stored ABC at render time; nothing is persisted. abcjs can't do this
// layout (it pins chords and syllables at fixed note positions), so this
// renders the parsed token stream itself — see chordChartLines in
// lib/abcViews.
export function ChordChartView({ abc }: { abc: string }) {
  const verses = chordChartLines(abc);
  const hasContent = verses.some((lines) =>
    lines.some((items) => items.some((i) => i.chord || i.syllable)),
  );

  if (!hasContent) {
    return <p className="hint">No chords or lyrics in this section.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {verses.map((lines, verseIndex) => (
        <div key={verseIndex}>
          {lines.map((items, lineIndex) => (
            <p key={lineIndex} className="mb-2 text-[15px] leading-snug">
              {items.map((item, itemIndex) => (
                <span
                  key={itemIndex}
                  className={`inline-block align-bottom ${
                    item.wordEnd ? 'mr-2' : ''
                  }`}
                >
                  {/* fixed-height chord row keeps syllable baselines aligned
                      even on notes without a chord */}
                  <span className="block h-4 text-[12px] font-bold leading-tight text-accent">
                    {item.chord ?? ''}
                  </span>
                  <span className="block">{item.syllable}</span>
                </span>
              ))}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}
