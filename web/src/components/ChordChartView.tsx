import { Fragment } from 'react';

import { chordChartLines } from '../lib/abcViews';

// Chords view (issue #10): the chord chart as flowing text, Ultimate
// Guitar style — each chord name inline (accent, bold) right before the
// lyric syllable it sits on, syllables joined into words, lines wrap
// naturally on a phone. Derived from the same stored ABC at render time;
// nothing is persisted. abcjs can't do this layout (it pins chords and
// syllables at fixed note positions), so this renders the parsed token
// stream itself — see chordChartLines in lib/abcViews.
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
            <p key={lineIndex} className="mb-1 text-[15px] leading-relaxed">
              {items.map((item, itemIndex) => (
                <Fragment key={itemIndex}>
                  {item.chord && (
                    <span className="mr-0.5 font-bold text-accent">
                      {item.chord}
                    </span>
                  )}
                  <span>{item.syllable}</span>
                  {item.wordEnd ? ' ' : ''}
                </Fragment>
              ))}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}
