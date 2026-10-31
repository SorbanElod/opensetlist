import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChevronRight, Plus, Search, Upload } from 'lucide-react';

import { ApiError } from '../api/client';
import { importSongsJson, listSongs, type Song } from '../api/songs';
import { canWrite, useAuth, useMyRole } from '../auth/AuthContext';

export function SongsPage() {
  const auth = useAuth();
  const role = useMyRole();
  const navigate = useNavigate();
  const [songs, setSongs] = useState<Song[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Subscribe pattern: setState only inside the promise callbacks, never
  // synchronously in the effect body (react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    listSongs()
      .then((list) => {
        if (cancelled) return;
        setSongs(list);
        setError(null);
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

  // Refetch after import — called from an event handler, where setState is fine.
  async function refresh() {
    setSongs(await listSongs());
  }

  const canEdit =
    auth.status === 'authenticated' && canWrite(role, auth.user.isSuperadmin);

  async function onImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-importing the same file
    if (!file) return;

    setError(null);
    setInfo(null);
    try {
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
      });
      const result = await importSongsJson(text);
      await refresh();
      setInfo(
        `Imported ${result.imported} song(s), ${result.arrangementsImported} arrangement(s)` +
          (result.skippedTags > 0
            ? ` — ${result.skippedTags} tag(s) skipped until P2.2`
            : ''),
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Import failed',
      );
    }
  }

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
          <div className="flex gap-1.5">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={15} /> Import JSON
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate('/songs/new')}
            >
              <Plus size={15} /> New song
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              aria-label="Import songs from JSON"
              onChange={onImportFile}
            />
          </div>
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
      {info && (
        <p
          role="status"
          className="mb-3 rounded-lg border border-accent-border bg-accent-soft px-3 py-2 text-[12.5px] text-accent"
        >
          {info}
        </p>
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
