import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';

import { ApiError } from '../api/client';
import { deleteSong, getSong, type Song } from '../api/songs';
import { canWrite, useAuth, useMyRole } from '../auth/AuthContext';

export function SongDetailPage() {
  const { id } = useParams<{ id: string }>();
  const auth = useAuth();
  const role = useMyRole();
  const navigate = useNavigate();

  const [song, setSong] = useState<Song | null>(null);
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

          <p className="mt-4 text-[11.5px] text-subtle">
            Arrangements &amp; ABC sections land in P2.3.
          </p>
        </div>
      )}
    </div>
  );
}
