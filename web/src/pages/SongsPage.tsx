import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChevronRight, Plus, Search } from 'lucide-react';

import { ApiError } from '../api/client';
import { listSongs, type Song } from '../api/songs';
import { canWrite, useAuth, useMyRole } from '../auth/AuthContext';

export function SongsPage() {
  const auth = useAuth();
  const role = useMyRole();
  const navigate = useNavigate();
  const [songs, setSongs] = useState<Song[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    listSongs()
      .then((list) => {
        if (!cancelled) setSongs(list);
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof ApiError ? err.message : 'Failed to load songs',
          );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const canEdit =
    auth.status === 'authenticated' && canWrite(role, auth.user.isSuperadmin);

  const filtered = (songs ?? []).filter((s) =>
    `${s.title} ${s.author ?? ''}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-[22px] font-bold tracking-tight">Songs</h1>
        {canEdit && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate('/songs/new')}
          >
            <Plus size={15} /> New song
          </button>
        )}
      </div>

      <div className="relative mb-3">
        <Search
          size={15}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle"
        />
        <input
          className="input pl-10"
          type="search"
          placeholder="Search titles, authors…"
          aria-label="Search songs"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      {songs === null && !error && (
        <p className="py-8 text-center text-[13px] text-muted">Loading…</p>
      )}

      {songs !== null && filtered.length === 0 && (
        <div className="card rounded-2xl p-5">
          <p className="text-[13.5px] text-muted">
            {query ? 'No songs match your search.' : 'No songs yet.'}
          </p>
          {canEdit && !query && (
            <Link
              to="/songs/new"
              className="mt-3 inline-flex font-semibold text-accent"
            >
              Add the first song
            </Link>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {filtered.map((song) => (
          <button
            key={song.id}
            type="button"
            className="card flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:border-border-strong hover:bg-raised"
            onClick={() => navigate(`/songs/${song.id}`)}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-semibold">
                {song.title}
              </div>
              <div className="truncate text-[11.5px] text-muted">
                {song.author ?? '—'}
              </div>
            </div>
            <span className="shrink-0 rounded-md bg-raised px-2 py-0.5 font-mono text-[12.5px] font-semibold text-text">
              {song.defaultKey}
            </span>
            <span className="hidden shrink-0 text-[10.5px] text-subtle sm:inline">
              {new Date(song.createdAt).toLocaleDateString()}
            </span>
            <ChevronRight size={16} className="shrink-0 text-subtle" />
          </button>
        ))}
      </div>
    </div>
  );
}
