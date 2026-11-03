import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eye,
  Focus,
  Guitar,
  List,
  Mic,
  Minus,
  Music,
  Pencil,
  Plus,
  StickyNote,
} from 'lucide-react';

import { ApiError } from '../api/client';
import { getArrangement, type Arrangement } from '../api/arrangements';
import { getSetlist, type SetlistDetail } from '../api/setlists';
import { canWrite, useAuth, useMyRole } from '../auth/AuthContext';
import { ArrangementRenderer } from '../components/ArrangementRenderer';
import { PageHeader } from '../components/PageHeader';
import type { ViewMode } from '../lib/abcViews';

// On-stage setlist view (issue #62): every item in position order on one
// page. Arrangement items render through the shared ArrangementRenderer with
// the item's effective sequence and transposed key applied; note-only rows
// render as note cards. One view toggle + zoom at the top drives all items
// (controlled mode of the renderer). Readers can open it, like the
// arrangement view.
export function SetlistViewPage() {
  const { id } = useParams<{ id: string }>();
  const auth = useAuth();
  const role = useMyRole();

  const [detail, setDetail] = useState<SetlistDetail | null>(null);
  // Full arrangements (with section ABC) per item — the setlist detail only
  // carries labels, so the view fetches each arrangement once.
  const [arrangements, setArrangements] = useState<Map<string, Arrangement>>(
    new Map(),
  );
  const [error, setError] = useState<string | null>(null);

  // Seeded from the stored preference like ArrangementRenderer; the route is
  // behind the auth gate, so the session is resolved at mount.
  const [view, setView] = useState<ViewMode>(() =>
    auth.status === 'authenticated' ? auth.user.defaultView : 'sheet',
  );
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 1.5;
  const [scale, setScale] = useState(1);
  function zoomBy(delta: number) {
    setScale((s) =>
      Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((s + delta) * 10) / 10)),
    );
  }

  // Layout mode (issue #62): 'all' = one long page; 'one' = a single item in
  // a viewport-height panel (short up/down scroll within the item), with
  // prev/next (left/right) navigation between items.
  const [mode, setMode] = useState<'all' | 'one'>('all');
  const [index, setIndex] = useState(0);
  const itemCount = detail?.items.length ?? 0;
  const currentIndex = Math.min(index, Math.max(itemCount - 1, 0));

  // Arrow keys navigate items in 'one' mode (buttons are the primary control;
  // keys are a convenience for laptop testing).
  useEffect(() => {
    if (mode !== 'one') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight')
        setIndex((i) => Math.min(i + 1, itemCount - 1));
      if (event.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, itemCount]);

  // setState only inside the promise callbacks (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getSetlist(id)
      .then(async (d) => {
        if (cancelled) return;
        setDetail(d);
        const ids = d.items
          .map((i) => i.arrangementId)
          .filter((a): a is string => a !== null);
        const full = await Promise.all(
          [...new Set(ids)].map((a) => getArrangement(a)),
        );
        if (cancelled) return;
        setArrangements(new Map(full.map((a) => [a.id, a])));
        setError(null);
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof ApiError ? err.message : 'Failed to load setlist',
          );
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const canEdit =
    auth.status === 'authenticated' && canWrite(role, auth.user.isSuperadmin);

  const segmentClass = (active: boolean) =>
    `flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors ${
      active ? 'bg-raised text-text' : 'text-muted hover:text-text'
    }`;

  // In 'one' mode only the current item is rendered, inside a
  // viewport-height panel (short up/down scroll within the item).
  const visibleItems =
    detail === null
      ? []
      : mode === 'one'
        ? detail.items.slice(currentIndex, currentIndex + 1)
        : detail.items;
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Item changed -> panel scrolls back to the beginning of the item.
  useEffect(() => {
    if (panelRef.current) panelRef.current.scrollTop = 0;
  }, [currentIndex, mode]);

  return (
    <div>
      <Link
        to={id ? `/setlists/${id}` : '/setlists'}
        className="btn btn-ghost mb-2 -ml-2"
      >
        <ArrowLeft size={15} /> {detail ? detail.setlist.title : 'Setlists'}
      </Link>

      {error && !detail && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      {!detail && !error && (
        <p className="py-8 text-center text-[13px] text-muted">Loading…</p>
      )}

      {detail && (
        <>
          <PageHeader
            title={detail.setlist.title}
            subtitle={
              detail.setlist.eventDate
                ? `Event date ${detail.setlist.eventDate} · ${detail.items.length} item${detail.items.length === 1 ? '' : 's'}`
                : `${detail.items.length} item${detail.items.length === 1 ? '' : 's'}`
            }
            actions={
              canEdit && (
                <Link
                  to={`/setlists/${detail.setlist.id}`}
                  className="btn btn-outline shrink-0"
                  aria-label="Edit setlist"
                >
                  <Pencil size={14} /> Edit
                </Link>
              )
            }
          />

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div
              className="inline-flex rounded-md border border-border bg-bg p-0.5"
              role="group"
              aria-label="Layout"
            >
              <button
                type="button"
                className={segmentClass(mode === 'all')}
                aria-pressed={mode === 'all'}
                onClick={() => setMode('all')}
              >
                <List size={14} /> All
              </button>
              <button
                type="button"
                className={segmentClass(mode === 'one')}
                aria-pressed={mode === 'one'}
                onClick={() => setMode('one')}
              >
                <Focus size={14} /> One at a time
              </button>
            </div>
            <div
              className="inline-flex rounded-md border border-border bg-bg p-0.5"
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
            {view !== 'sheet' && (
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
          </div>

          {detail.items.length === 0 ? (
            <div className="card p-5">
              <p className="text-[13.5px] text-muted">
                Empty setlist — add songs on the edit page.
              </p>
            </div>
          ) : (
            <>
              {mode === 'one' && (
                <div className="mb-3 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="btn btn-outline"
                    aria-label="Previous item"
                    disabled={currentIndex === 0}
                    onClick={() => setIndex((i) => Math.max(i - 1, 0))}
                  >
                    <ChevronLeft size={15} /> Prev
                  </button>
                  <span className="font-mono text-[12px] tabular-nums text-muted">
                    {detail.items[currentIndex]!.position} /{' '}
                    {detail.items.length}
                  </span>
                  <button
                    type="button"
                    className="btn btn-outline"
                    aria-label="Next item"
                    disabled={currentIndex >= detail.items.length - 1}
                    onClick={() =>
                      setIndex((i) => Math.min(i + 1, detail.items.length - 1))
                    }
                  >
                    Next <ChevronRight size={15} />
                  </button>
                </div>
              )}
              <div
                ref={mode === 'one' ? panelRef : undefined}
                className={
                  mode === 'one'
                    ? 'h-[calc(100svh-15rem)] overflow-y-auto'
                    : undefined
                }
              >
                {visibleItems.map((item) => {
                  const arrangement = item.arrangementId
                    ? arrangements.get(item.arrangementId)
                    : undefined;
                  if (!item.arrangement || !arrangement) {
                    return (
                      <div
                        key={item.id}
                        className="card mb-3 flex items-start gap-2.5 p-4"
                        data-testid="setlist-view-item"
                      >
                        <StickyNote
                          size={16}
                          className="mt-0.5 shrink-0 text-accent"
                        />
                        <div className="min-w-0">
                          <span className="font-mono text-[12px] text-subtle">
                            {item.position}
                          </span>
                          <p className="whitespace-pre-wrap break-words text-[13.5px]">
                            {item.notes}
                          </p>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={item.id}
                      className="card mb-3 p-5"
                      data-testid="setlist-view-item"
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="font-mono text-[12px] text-subtle">
                              {item.position}
                            </span>
                            <h2 className="truncate text-[15px] font-bold tracking-tight">
                              {item.arrangement.songTitle} — {arrangement.title}
                            </h2>
                          </div>
                          <p className="mt-0.5 font-mono text-[12px] text-muted">
                            {arrangement.originalKey}
                            {item.transposedKey
                              ? ` → ${item.transposedKey}`
                              : ''}
                            {arrangement.bpm !== null
                              ? ` · ${arrangement.bpm} BPM`
                              : ''}
                          </p>
                          {item.notes && (
                            <p className="mt-1 text-[12.5px] text-muted">
                              {item.notes}
                            </p>
                          )}
                        </div>
                        <Link
                          to={`/arrangements/${arrangement.id}`}
                          className="btn btn-ghost shrink-0 px-1.5"
                          aria-label={`Open ${item.arrangement.songTitle} arrangement page`}
                        >
                          <Eye size={15} />
                        </Link>
                      </div>
                      <ArrangementRenderer
                        arrangement={arrangement}
                        sequence={
                          item.effectiveSequence ?? arrangement.defaultSequence
                        }
                        transposedKey={item.transposedKey}
                        view={view}
                        scale={scale}
                        bare
                      />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
