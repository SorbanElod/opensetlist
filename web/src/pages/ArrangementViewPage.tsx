import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Pencil } from 'lucide-react';

import { ApiError } from '../api/client';
import { getArrangement, type Arrangement } from '../api/arrangements';
import { getSong, type Song } from '../api/songs';
import { canWrite, useAuth, useMyRole } from '../auth/AuthContext';
import { ArrangementRenderer } from '../components/ArrangementRenderer';

// On-stage view (issue #10): the arrangement's sections rendered through the
// shared ArrangementRenderer — the same pipeline the song detail page uses
// inline (issue #51). This page keeps only its own chrome: header, back
// link, edit.
export function ArrangementViewPage() {
  const { id } = useParams<{ id: string }>();
  const auth = useAuth();
  const role = useMyRole();

  const [song, setSong] = useState<Song | null>(null);
  const [arrangement, setArrangement] = useState<Arrangement | null>(null);
  const [error, setError] = useState<string | null>(null);

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

          {/* View toggle + sections in play order: the one render pipeline
              shared with the song detail page (issue #51). */}
          <div className="mt-3">
            <ArrangementRenderer arrangement={arrangement} />
          </div>
        </div>
      )}
    </div>
  );
}
