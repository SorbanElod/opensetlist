import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Pencil, Play, Plus, Trash2 } from 'lucide-react';

import { ApiError } from '../api/client';
import { listArrangements, type Arrangement } from '../api/arrangements';
import { deleteSong, getSong, type Song } from '../api/songs';
import { canWrite, useAuth, useMyRole } from '../auth/AuthContext';
import { ArrangementRenderer } from '../components/ArrangementRenderer';
import { EmptyState } from '../components/EmptyState';
import { ListRow } from '../components/ListRow';

export function SongDetailPage() {
  const { id } = useParams<{ id: string }>();
  const auth = useAuth();
  const role = useMyRole();
  const navigate = useNavigate();

  const [song, setSong] = useState<Song | null>(null);
  const [arrangements, setArrangements] = useState<Arrangement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Local-only selection for the inline renderer (issue #51) — never
  // persisted. Defaults to the newest arrangement (see below).
  const [selectedArrangementId, setSelectedArrangementId] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getSong(id)
      .then((s) => {
        if (!cancelled) setSong(s);
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof ApiError ? err.message : 'Failed to load song',
          );
      });
    listArrangements(id)
      .then((list) => {
        if (!cancelled) setArrangements(list);
      })
      .catch(() => {
        if (!cancelled) setArrangements([]);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const canEdit =
    auth.status === 'authenticated' && canWrite(role, auth.user.isSuperadmin);

  // The "default" arrangement is implicit — the newest one: the first row of
  // listArrangements, which the API orders by created_at DESC (design
  // decision in issue #51: no persisted default_arrangement_id).
  const selectedArrangement =
    arrangements?.find((a) => a.id === selectedArrangementId) ??
    arrangements?.[0] ??
    null;

  async function onDelete() {
    if (!song) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true); // two-click confirm, no window.confirm
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deleteSong(song.id, song.version);
      navigate('/songs', { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Something went wrong. Please try again.',
      );
      setConfirmingDelete(false);
      setDeleting(false);
    }
  }

  return (
    <div>
      <Link to="/songs" className="btn btn-ghost mb-2 -ml-2">
        <ArrowLeft size={15} /> Songs
      </Link>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      {!song && !error && (
        <p className="py-8 text-center text-[13px] text-muted">Loading…</p>
      )}

      {song && (
        <div className="card p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-[20px] font-bold tracking-tight">
                {song.title}
              </h1>
              <p className="mt-0.5 text-[13px] text-muted">
                {song.author ?? 'Unknown author'}
              </p>
            </div>
            {canEdit && (
              <div className="flex shrink-0 gap-1.5">
                <Link
                  to={`/songs/${song.id}/edit`}
                  className="btn btn-outline"
                  aria-label="Edit song"
                >
                  <Pencil size={14} /> Edit
                </Link>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={onDelete}
                  disabled={deleting}
                >
                  <Trash2 size={14} />
                  {deleting
                    ? 'Deleting…'
                    : confirmingDelete
                      ? 'Confirm delete?'
                      : 'Delete'}
                </button>
              </div>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-3 text-[13px]">
            <div>
              <dt className="flabel">Key</dt>
              <dd className="font-mono font-semibold">{song.defaultKey}</dd>
            </div>
            <div>
              <dt className="flabel">Language</dt>
              <dd className="font-mono">{song.language ?? '—'}</dd>
            </div>
            <div>
              <dt className="flabel">Visibility</dt>
              <dd>{song.visibility}</dd>
            </div>
            <div>
              <dt className="flabel">Added</dt>
              <dd className="text-muted">
                {new Date(song.createdAt).toLocaleDateString()}
              </dd>
            </div>
          </dl>

          {/* Issue #51: the newest arrangement renders inline, right below
              the metadata — no click-through to the on-stage page. All
              arrangements are already fetched, so switching arrangements or
              views costs no extra server round-trips. Readers see the same
              inline content (the read API already allows it). */}
          {selectedArrangement && (
            <div className="mt-6 border-t border-border pt-5">
              <p className="mb-2 min-w-0 truncate text-[15px] font-semibold">
                {selectedArrangement.title}
                <span className="ml-2 font-mono text-[11.5px] font-normal tabular-nums text-muted">
                  {selectedArrangement.originalKey}
                  {selectedArrangement.bpm !== null
                    ? ` · ${selectedArrangement.bpm} BPM`
                    : ''}
                </span>
              </p>
              <ArrangementRenderer
                arrangement={selectedArrangement}
                trailing={
                  arrangements !== null && arrangements.length > 1 ? (
                    <select
                      className="input w-auto shrink-0 font-mono text-[12.5px]"
                      aria-label="Arrangement"
                      value={selectedArrangement.id}
                      onChange={(e) => setSelectedArrangementId(e.target.value)}
                    >
                      {arrangements.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.title}
                        </option>
                      ))}
                    </select>
                  ) : undefined
                }
              />
            </div>
          )}

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold">Arrangements</h2>
              {canEdit && (
                <Link
                  to={`/songs/${song.id}/arrangements/new`}
                  className="btn btn-outline"
                >
                  <Plus size={14} /> New arrangement
                </Link>
              )}
            </div>

            {arrangements === null && (
              <p className="text-[13px] text-muted">Loading…</p>
            )}
            {arrangements !== null && arrangements.length === 0 && (
              <EmptyState>
                No arrangements yet — the music lives here.
              </EmptyState>
            )}

            <ul className="list">
              {arrangements?.map((a) => (
                <ListRow
                  key={a.id}
                  as="li"
                  title={a.title}
                  meta={
                    <span className="font-mono tabular-nums">
                      {a.originalKey}
                      {a.bpm !== null ? ` · ${a.bpm} BPM` : ''} ·{' '}
                      {a.sections.length} section
                      {a.sections.length === 1 ? '' : 's'}
                    </span>
                  }
                  trailing={
                    <>
                      {/* View is the on-stage page (issue #10) — every role,
                          readers included, can open it. */}
                      <Link
                        to={`/arrangements/${a.id}`}
                        className="btn btn-outline shrink-0"
                        aria-label={`View ${a.title}`}
                      >
                        <Play size={14} /> View
                      </Link>
                      {canEdit && (
                        <Link
                          to={`/arrangements/${a.id}/edit`}
                          className="btn btn-outline shrink-0"
                          aria-label={`Edit ${a.title}`}
                        >
                          <Pencil size={14} /> Edit
                        </Link>
                      )}
                    </>
                  }
                />
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
