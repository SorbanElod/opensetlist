import { useState } from 'react';
import { Guitar, Mic, Music } from 'lucide-react';

import { ApiError } from '../api/client';
import type { Arrangement } from '../api/arrangements';
import { useAuth } from '../auth/AuthContext';
import { lyricsText, orderedSections, type ViewMode } from '../lib/abcViews';
import { AbcRenderer } from './AbcRenderer';
import { ChordChartView } from './ChordChartView';

// One render pipeline for an arrangement's sections (issues #10, #51), used
// by the on-stage page (/arrangements/:id) AND inline on the song detail
// page — one pipeline, no forked logic (Single-Source, Multi-View). The
// three views all derive from the SAME stored ABC at render time, so
// switching views is local state only and costs no server round-trip. The
// default view comes from the user's stored preference; "Set as my default"
// persists the choice.
export function ArrangementRenderer({
  arrangement,
}: {
  arrangement: Arrangement;
}) {
  const auth = useAuth();

  // Seeded once at mount from the stored preference. Both pages using this
  // renderer sit behind the auth gate, so the session is already resolved at
  // mount and the first render already has the right view — no sheet flash.
  // Later preference changes (this component's own "Set as my default") only
  // reseed on remount, never yank the view mid-song.
  const [view, setView] = useState<ViewMode>(() =>
    auth.status === 'authenticated' ? auth.user.defaultView : 'sheet',
  );
  const [savingDefault, setSavingDefault] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isDefault =
    auth.status === 'authenticated' && auth.user.defaultView === view;

  async function onSaveDefault() {
    setSavingDefault(true);
    setSaveError(null);
    try {
      await auth.setDefaultView(view);
    } catch (err) {
      setSaveError(
        err instanceof ApiError
          ? err.message
          : 'Could not save your default view. Please try again.',
      );
    } finally {
      setSavingDefault(false);
    }
  }

  // Sections in play order: sequence entries resolve to sections (repeats
  // legal), unmentioned sections append once — see lib/abcViews.
  const sections = orderedSections(
    arrangement.sections,
    arrangement.defaultSequence,
  );

  const segmentClass = (active: boolean) =>
    `flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors ${
      active ? 'bg-raised text-text' : 'text-muted hover:text-text'
    }`;

  // The three views of one ABC source: sheet renders via abcjs, chords is a
  // flowing HTML chord chart and lyrics plain text — all derived from the
  // same ABC at render time (see lib/abcViews).
  function renderSection(content: string) {
    if (view === 'sheet') return <AbcRenderer abc={content} />;
    if (view === 'chords') return <ChordChartView abc={content} />;
    const text = lyricsText(content);
    return text.trim() ? (
      // Same typeface and size as the chords view's syllable row — only the
      // chords are missing here. pre-wrap keeps the verse line breaks.
      <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-text">
        {text}
      </p>
    ) : (
      <p className="hint">No lyrics (w: lines) in this section.</p>
    );
  }

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <div
          className="inline-flex rounded-lg border border-border bg-bg p-0.5"
          role="group"
          aria-label="View"
        >
          <button
            type="button"
            className={segmentClass(view === 'sheet')}
            aria-pressed={view === 'sheet'}
            onClick={() => setView('sheet')}
          >
            <Music size={14} /> Sheet
          </button>
          <button
            type="button"
            className={segmentClass(view === 'chords')}
            aria-pressed={view === 'chords'}
            onClick={() => setView('chords')}
          >
            <Guitar size={14} /> Chords
          </button>
          <button
            type="button"
            className={segmentClass(view === 'lyrics')}
            aria-pressed={view === 'lyrics'}
            onClick={() => setView('lyrics')}
          >
            <Mic size={14} /> Lyrics
          </button>
        </div>
        {!isDefault && (
          <button
            type="button"
            className="btn btn-outline"
            onClick={onSaveDefault}
            disabled={savingDefault}
          >
            {savingDefault ? 'Saving…' : 'Set as my default'}
          </button>
        )}
      </div>

      {saveError && (
        <div className="error-banner mb-3" role="alert">
          {saveError}
        </div>
      )}

      {sections.length === 0 && (
        <p className="hint">
          This arrangement has no sections yet — add ABC sections in the editor.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {sections.map((section, i) => (
          <section
            key={`${section.label}-${i}`}
            className="card rounded-xl p-4"
          >
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
              {section.label}
            </h2>
            {/* All views derive from the same stored ABC at render
                time — nothing derived is persisted. */}
            {renderSection(section.content)}
          </section>
        ))}
      </div>
    </>
  );
}
