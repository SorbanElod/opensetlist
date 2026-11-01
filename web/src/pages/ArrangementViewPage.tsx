import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Guitar, Mic, Pencil } from 'lucide-react';

import { ApiError } from '../api/client';
import { getArrangement, type Arrangement } from '../api/arrangements';
import { getSong, type Song } from '../api/songs';
import { canWrite, useAuth, useMyRole } from '../auth/AuthContext';
import { AbcRenderer } from '../components/AbcRenderer';
import { orderedSections, stripChords, type ViewMode } from '../lib/abcViews';

// On-stage view (issue #10): renders the arrangement's ABC sections in play
// order. The default view comes from the user's stored preference
// (guitarist -> chords, singer -> lyrics); switching Chords/Lyrics is local
// state only — both views render from the same fetched ABC, so switching
// costs no server round-trip. "Set as my default" persists the choice.
export function ArrangementViewPage() {
  const { id } = useParams<{ id: string }>();
  const auth = useAuth();
  const role = useMyRole();

  const [song, setSong] = useState<Song | null>(null);
  const [arrangement, setArrangement] = useState<Arrangement | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<ViewMode>('chords');
  const viewInitialized = useRef(false);
  const [savingDefault, setSavingDefault] = useState(false);

  // Seed the view from the stored preference exactly once, when the session
  // resolves — later changes to the preference (this page's own save) must
  // not yank the view mid-song.
  useEffect(() => {
    if (auth.status === 'authenticated' && !viewInitialized.current) {
      viewInitialized.current = true;
      setView(auth.user.defaultView);
    }
  }, [auth]);

  // One fetch for the whole page: the arrangement carries every section's
  // ABC, so view switching never refetches.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getArrangement(id)
      .then(async (a) => {
        if (cancelled) return;
        setArrangement(a);
        const s = await getSong(a.songId);
        if (!cancelled) setSong(s);
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof ApiError
              ? err.message
              : 'Failed to load arrangement',
          );
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const canEdit =
    auth.status === 'authenticated' && canWrite(role, auth.user.isSuperadmin);
  const isDefault =
    auth.status === 'authenticated' && auth.user.defaultView === view;

  async function onSaveDefault() {
    setSavingDefault(true);
    setError(null);
    try {
      await auth.setDefaultView(view);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not save your default view. Please try again.',
      );
    } finally {
      setSavingDefault(false);
    }
  }

  const sections = arrangement
    ? orderedSections(arrangement.sections, arrangement.defaultSequence)
    : [];

  const segmentClass = (active: boolean) =>
    `flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors ${
      active ? 'bg-raised text-text' : 'text-muted hover:text-text'
    }`;

  return (
    <div>
      <Link
        to={song ? `/songs/${song.id}` : '/songs'}
        className="btn btn-ghost mb-2 -ml-2"
      >
        <ArrowLeft size={15} /> {song ? song.title : 'Songs'}
      </Link>

      {error && !arrangement && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      {!arrangement && !error && (
        <p className="py-8 text-center text-[13px] text-muted">Loading…</p>
      )}

      {arrangement && (
        <div className="card rounded-2xl p-5">
          <div className="mb-1 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-[22px] font-bold tracking-tight">
                {arrangement.title}
              </h1>
              <p className="mt-0.5 text-[13px] text-muted">
                {song ? song.title : ''} ·{' '}
                <span className="font-mono">
                  {arrangement.originalKey}
                  {arrangement.bpm !== null ? ` · ${arrangement.bpm} BPM` : ''}
                </span>
              </p>
            </div>
            {canEdit && (
              <Link
                to={`/arrangements/${arrangement.id}/edit`}
                className="btn btn-outline shrink-0"
                aria-label={`Edit ${arrangement.title}`}
              >
                <Pencil size={14} /> Edit
              </Link>
            )}
          </div>

          {error && (
            <div className="error-banner mt-3" role="alert">
              {error}
            </div>
          )}

          <div className="mb-4 mt-3 flex items-center gap-2">
            <div
              className="inline-flex rounded-lg border border-border bg-bg p-0.5"
              role="group"
              aria-label="View"
            >
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

          {sections.length === 0 && (
            <p className="hint">
              This arrangement has no sections yet — add ABC sections in the
              editor.
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
                {/* Same stored ABC for both views; the lyrics view strips
                    chord symbols at render time — nothing is persisted. */}
                <AbcRenderer
                  abc={
                    view === 'lyrics'
                      ? stripChords(section.content)
                      : section.content
                  }
                />
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
