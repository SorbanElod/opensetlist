import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Pencil, Play, Plus, Trash2 } from 'lucide-react';

import { ApiError } from '../api/client';
import { listArrangements, type Arrangement } from '../api/arrangements';
import { deleteSong, getSong, type Song } from '../api/songs';
import { canWrite, useAuth, useMyRole } from '../auth/AuthContext';

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
        <div className="card rounded-2xl p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-[22px] font-bold tracking-tight">
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
              <p className="text-[13px] text-muted">
                No arrangements yet — the music lives here.
              </p>
            )}

            <ul className="flex flex-col gap-1.5">
              {arrangements?.map((a) => (
                <li
                  key={a.id}
                  className="card flex items-center gap-3 rounded-xl px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold">
                      {a.title}
                    </p>
                    <p className="truncate font-mono text-[11.5px] text-muted">
                      {a.originalKey}
                      {a.bpm !== null ? ` · ${a.bpm} BPM` : ''} ·{' '}
                      {a.sections.length} section
                      {a.sections.length === 1 ? '' : 's'}
                    </p>
                  </div>
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
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
