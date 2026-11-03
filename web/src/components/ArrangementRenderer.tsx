import { useState, type ReactNode } from 'react';
import { Guitar, Mic, Minus, Music, Plus } from 'lucide-react';

import { ApiError } from '../api/client';
import type { Arrangement } from '../api/arrangements';
import { useAuth } from '../auth/AuthContext';
import {
  lyricsText,
  orderedSections,
  sheetAbc,
  type ViewMode,
} from '../lib/abcViews';
import { transposeAbc } from '../lib/transpose';
import { AbcRenderer } from './AbcRenderer';
import { ChordChartView } from './ChordChartView';

// One render pipeline for an arrangement's sections (issues #10, #51), used
// by the on-stage page (/arrangements/:id), inline on the song detail page,
// AND per item on the setlist view — one pipeline, no forked logic
// (Single-Source, Multi-View). The three views all derive from the SAME
// stored ABC at render time, so switching views is local state only and
// costs no server round-trip. The default view comes from the user's stored
// preference; "Set as my default" persists the choice.
export function ArrangementRenderer({
  arrangement,
  trailing,
  sequence,
  transposedKey,
  view: viewProp,
  scale: scaleProp,
}: {
  arrangement: Arrangement;
  // Optional control docked at the right end of the view-toggle row (the
  // arrangement switcher on the song detail page).
  trailing?: ReactNode;
  // Setlist item overrides (issue #62): sequence replaces
  // arrangement.defaultSequence; transposedKey is applied to the ABC at
  // render time (never stored transposed).
  sequence?: string[];
  transposedKey?: string | null;
  // Controlled mode for the setlist view: when view/scale are passed, the
  // parent owns the toggle/zoom and the local controls are hidden.
  view?: ViewMode;
  scale?: number;
}) {
  const auth = useAuth();

  // Seeded once at mount from the stored preference. Both pages using this
  // renderer sit behind the auth gate, so the session is already resolved at
  // mount and the first render already has the right view — no sheet flash.
  // Later preference changes (this component's own "Set as my default") only
  // reseed on remount, never yank the view mid-song.
  const [viewState, setViewState] = useState<ViewMode>(() =>
    auth.status === 'authenticated' ? auth.user.defaultView : 'sheet',
  );
  const [savingDefault, setSavingDefault] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // View zoom (local state, not persisted): applied via CSS `zoom` so both
  // text and the abcjs SVG scale. Bounds 50%–150%, steps of 10%.
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 1.5;
  const [scaleState, setScaleState] = useState(1);
  const view = viewProp ?? viewState;
  const scale = scaleProp ?? scaleState;
  function zoomBy(delta: number) {
    setScaleState((s) =>
      Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((s + delta) * 10) / 10)),
    );
  }

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
  // legal), unmentioned sections append once — see lib/abcViews. The
  // setlist view passes the item's effective sequence as `sequence`.
  const sections = orderedSections(
    arrangement.sections,
    sequence ?? arrangement.defaultSequence,
  );

  const segmentClass = (active: boolean) =>
    `flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors ${
      active ? 'bg-raised text-text' : 'text-muted hover:text-text'
    }`;

  // The three views of one ABC source: sheet renders via abcjs, chords is a
  // flowing HTML chord chart and lyrics plain text — all derived from the
  // same ABC at render time (see lib/abcViews).
  function renderSection(rawContent: string) {
    // Transposed key is applied at render time only — the stored ABC is
    // never rewritten (issue #12).
    const content = transposedKey
      ? transposeAbc(rawContent, arrangement.originalKey, transposedKey)
      : rawContent;
    // Sheet view: no zoom for now (abcjs responsive mode ignores its scale
    // param and CSS zoom truncates the staff — follow-up issue). Text views
    // scale via the compensated zoom wrapper around all sections.
    if (view === 'sheet') return <AbcRenderer abc={sheetAbc(content)} />;
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
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* In controlled mode (setlist view) the parent owns the view, so
            the toggle and "set as default" are hidden. */}
        {viewProp === undefined && (
          <div
            className="inline-flex rounded-md border border-border bg-bg p-0.5"
            role="group"
            aria-label="View"
          >
            <button
              type="button"
              className={segmentClass(view === 'sheet')}
              aria-pressed={view === 'sheet'}
              onClick={() => setViewState('sheet')}
            >
              <Music size={14} /> Sheet
            </button>
            <button
              type="button"
              className={segmentClass(view === 'chords')}
              aria-pressed={view === 'chords'}
              onClick={() => setViewState('chords')}
            >
              <Guitar size={14} /> Chords
            </button>
            <button
              type="button"
              className={segmentClass(view === 'lyrics')}
              aria-pressed={view === 'lyrics'}
              onClick={() => setViewState('lyrics')}
            >
              <Mic size={14} /> Lyrics
            </button>
          </div>
        )}
        {/* Zoom is hidden in sheet view for now — scaling the abcjs staff
            without truncating it needs a follow-up (see issue). */}
        {scaleProp === undefined && view !== 'sheet' && (
          <div
            className="inline-flex items-center rounded-md border border-border bg-bg p-0.5"
            role="group"
            aria-label="Zoom"
          >
            <button
              type="button"
              aria-label="Zoom out"
              disabled={scale <= ZOOM_MIN}
              onClick={() => zoomBy(-0.1)}
              className="flex h-[26px] w-[26px] items-center justify-center rounded text-muted transition-colors hover:text-text disabled:opacity-40 disabled:hover:text-muted"
            >
              <Minus size={13} />
            </button>
            <span className="w-9 text-center text-[11px] tabular-nums text-muted">
              {Math.round(scale * 100)}%
            </span>
            <button
              type="button"
              aria-label="Zoom in"
              disabled={scale >= ZOOM_MAX}
              onClick={() => zoomBy(0.1)}
              className="flex h-[26px] w-[26px] items-center justify-center rounded text-muted transition-colors hover:text-text disabled:opacity-40 disabled:hover:text-muted"
            >
              <Plus size={13} />
            </button>
          </div>
        )}
        {viewProp === undefined && !isDefault && (
          <button
            type="button"
            className="btn btn-outline"
            onClick={onSaveDefault}
            disabled={savingDefault}
          >
            {savingDefault ? 'Saving…' : 'Set as my default'}
          </button>
        )}
        {trailing && (
          <div className="ml-auto flex items-center">{trailing}</div>
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

      {/* All sections in ONE panel with no separators — just whitespace;
          each section's label heading is the only structure. */}
      <div className="card px-4 py-2" data-testid="arrangement-sections">
        {/* Text views: `zoom` scales text, labels and the spacing between
            sections; the width compensation keeps the card at its normal
            on-screen width (text wraps, nothing is cut off). Sheet view:
            no compensation here — the SVG scales via its own zoom wrapper
            and scrolls inside the section instead of overflowing the page. */}
        <div
          style={
            view === 'sheet' ? {} : { zoom: scale, width: `${100 / scale}%` }
          }
          data-testid="scaled-content"
        >
          {sections.map((section, i) => (
            <section key={`${section.label}-${i}`} className="py-2">
              <h2 className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-muted">
                {section.label}
              </h2>
              {/* All views derive from the same stored ABC at render
                  time — nothing derived is persisted. */}
              {renderSection(section.content)}
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
