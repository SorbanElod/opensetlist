import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Check, ChevronRight, Plus, Search, Upload, X } from 'lucide-react';

import { ApiError } from '../api/client';
import {
  importSongsJson,
  querySongs,
  type Song,
  type SongFilter,
} from '../api/songs';
import { deleteTag, listTags, type Tag } from '../api/tags';
import { canManage, canWrite, useAuth, useMyRole } from '../auth/AuthContext';

export function SongsPage() {
  const auth = useAuth();
  const role = useMyRole();
  const navigate = useNavigate();
  const [songs, setSongs] = useState<Song[] | null>(null);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [matchAll, setMatchAll] = useState(true);
  const [confirmingTag, setConfirmingTag] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canEdit =
    auth.status === 'authenticated' && canWrite(role, auth.user.isSuperadmin);
  const canManageTags =
    auth.status === 'authenticated' && canManage(role, auth.user.isSuperadmin);

  // The tag vocabulary (autocomplete/filter source) loads once.
  useEffect(() => {
    let cancelled = false;
    listTags()
      .then((tags) => {
        if (!cancelled) setAllTags(tags);
      })
      .catch(() => {
        /* the filter bar just stays empty */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Server-side query: the filter tree is built from the controls and sent as
  // POST /api/songs/query. Small debounce so typing doesn't spam the API.
  // setState only inside the promise callback (react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      const leaves: SongFilter[] = [];
      if (query.trim()) leaves.push({ search: query.trim() });
      if (selectedTags.length > 0)
        leaves.push(
          matchAll ? { tagsAll: selectedTags } : { tagsAny: selectedTags },
        );
      const filter: SongFilter | undefined =
        leaves.length === 0
          ? undefined
          : leaves.length === 1
            ? leaves[0]
            : { and: leaves };

      querySongs(filter)
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
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, selectedTags, matchAll, reload]);

  function toggleTag(name: string) {
    setSelectedTags((prev) =>
      prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name],
    );
  }

  // Two-click confirm, no window.confirm. Manager-only (the API enforces it).
  async function onDeleteTag(tag: Tag) {
    if (confirmingTag !== tag.id) {
      setConfirmingTag(tag.id);
      return;
    }
    setConfirmingTag(null);
    setError(null);
    try {
      await deleteTag(tag.id);
      setAllTags((prev) => prev.filter((t) => t.id !== tag.id));
      setSelectedTags((prev) => prev.filter((n) => n !== tag.name));
      setReload((r) => r + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete tag');
    }
  }

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
      setReload((r) => r + 1);
      setInfo(
        `Imported ${result.imported} song(s), ${result.arrangementsImported} arrangement(s), ${result.tagsImported} tag(s)`,
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

  const filtering = query.trim() !== '' || selectedTags.length > 0;

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

      {allTags.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <div
            className="flex overflow-hidden rounded-lg border border-border"
            role="group"
            aria-label="Tag match mode"
          >
            {(
              [
                { value: true, label: 'ALL' },
                { value: false, label: 'ANY' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.label}
                type="button"
                aria-pressed={matchAll === opt.value}
                className={`px-2 py-1 text-[11px] font-semibold ${
                  matchAll === opt.value
                    ? 'bg-accent text-on-accent'
                    : 'bg-raised text-muted'
                }`}
                onClick={() => setMatchAll(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {allTags.map((tag) => {
            const active = selectedTags.includes(tag.name);
            const confirming = confirmingTag === tag.id;
            return (
              <span
                key={tag.id}
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 font-mono text-[12px] ${
                  active
                    ? 'border-accent-border bg-accent-soft text-accent'
                    : 'border-border bg-raised text-muted'
                }`}
              >
                <button
                  type="button"
                  aria-pressed={active}
                  aria-label={`Filter by tag ${tag.name}`}
                  className="font-mono"
                  onClick={() => toggleTag(tag.name)}
                >
                  {tag.name}
                </button>
                {canManageTags && (
                  <button
                    type="button"
                    aria-label={
                      confirming
                        ? `Confirm delete tag ${tag.name}`
                        : `Delete tag ${tag.name}`
                    }
                    className="text-subtle hover:text-error"
                    onClick={() => void onDeleteTag(tag)}
                  >
                    {confirming ? <Check size={11} /> : <X size={11} />}
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}

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

      {songs !== null && songs.length === 0 && (
        <div className="card rounded-2xl p-5">
          <p className="text-[13.5px] text-muted">
            {filtering ? 'No songs match your filters.' : 'No songs yet.'}
          </p>
          {canEdit && !filtering && (
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
        {songs?.map((song) => (
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
                {song.tags.length > 0 && (
                  <span className="text-subtle">
                    {' '}
                    · {song.tags.join(' · ')}
                  </span>
                )}
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
