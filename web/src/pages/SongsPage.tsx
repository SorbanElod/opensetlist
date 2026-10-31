import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Check,
  ChevronRight,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

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
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagLike, setTagLike] = useState<string | null>(null);
  const [matchAll, setMatchAll] = useState(true);
  const [tagInput, setTagInput] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState<Tag[]>([]);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const [confirmingTag, setConfirmingTag] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canEdit =
    auth.status === 'authenticated' && canWrite(role, auth.user.isSuperadmin);
  const canManageTags =
    auth.status === 'authenticated' && canManage(role, auth.user.isSuperadmin);

  // Tag picker suggestions: debounced server-side search, so the picker works
  // with hundreds of tags without loading the whole vocabulary.
  useEffect(() => {
    if (!tagMenuOpen) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      listTags(tagInput.trim() || undefined)
        .then((t) => {
          if (!cancelled) setTagSuggestions(t);
        })
        .catch(() => {
          /* suggestions just stay empty */
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [tagInput, tagMenuOpen]);

  // Server-side query: the filter tree is built from the controls and sent as
  // POST /api/songs/query. Small debounce so typing doesn't spam the API.
  // setState only inside the promise callback (react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      const leaves: SongFilter[] = [];
      if (query.trim()) leaves.push({ search: query.trim() });
      if (tagLike) leaves.push({ tagsLike: tagLike });
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
  }, [query, selectedTags, matchAll, tagLike, reload]);

  function addTag(raw: string) {
    const name = raw.trim().toLowerCase();
    if (!name) return;
    setSelectedTags((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setTagInput('');
  }

  function onTagKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      addTag(tagInput);
    }
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
      setTagSuggestions((prev) => prev.filter((t) => t.id !== tag.id));
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

  const filtering =
    query.trim() !== '' || selectedTags.length > 0 || tagLike !== null;
  const exactSuggestions = tagSuggestions.filter(
    (t) => !selectedTags.includes(t.name),
  );
  const inputIsNewTag =
    tagInput.trim() !== '' &&
    !tagSuggestions.some((t) => t.name === tagInput.trim().toLowerCase());

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

      <div className="relative mb-3">
        <input
          className="input"
          type="text"
          aria-label="Filter by tag"
          placeholder="Filter by tag… (type to search)"
          value={tagInput}
          onChange={(e) => {
            setTagInput(e.target.value);
            setTagMenuOpen(true);
          }}
          onKeyDown={onTagKeyDown}
          onFocus={() => setTagMenuOpen(true)}
          onBlur={() => setTimeout(() => setTagMenuOpen(false), 150)}
        />
        {tagMenuOpen && (exactSuggestions.length > 0 || inputIsNewTag) && (
          <ul className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-raised p-1 shadow-lg">
            {exactSuggestions.map((s) => (
              <li key={s.id} className="flex items-center">
                <button
                  type="button"
                  className="flex-1 rounded-md px-2 py-1 text-left font-mono text-[13px] hover:bg-surface"
                  onMouseDown={(e) => {
                    e.preventDefault(); // keep focus; blur closes the menu
                    addTag(s.name);
                  }}
                >
                  {s.name}
                </button>
                {canManageTags && (
                  <button
                    type="button"
                    aria-label={
                      confirmingTag === s.id
                        ? `Confirm delete tag ${s.name}`
                        : `Delete tag ${s.name}`
                    }
                    className="px-2 text-subtle hover:text-error"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      void onDeleteTag(s);
                    }}
                  >
                    {confirmingTag === s.id ? (
                      <Check size={12} />
                    ) : (
                      <Trash2 size={12} />
                    )}
                  </button>
                )}
              </li>
            ))}
            {inputIsNewTag && (
              <li>
                <button
                  type="button"
                  className="w-full rounded-md px-2 py-1 text-left text-[13px] italic text-muted hover:bg-surface"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setTagLike(tagInput.trim().toLowerCase());
                    setTagInput('');
                  }}
                >
                  any tag containing “{tagInput.trim().toLowerCase()}”
                </button>
              </li>
            )}
          </ul>
        )}
      </div>

      {(selectedTags.length > 0 || tagLike !== null) && (
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
          {selectedTags.map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1 rounded-lg border border-accent-border bg-accent-soft px-2 py-0.5 font-mono text-[12px] text-accent"
            >
              {name}
              <button
                type="button"
                aria-label={`Remove tag filter ${name}`}
                className="text-subtle hover:text-text"
                onClick={() =>
                  setSelectedTags((prev) => prev.filter((t) => t !== name))
                }
              >
                <X size={11} />
              </button>
            </span>
          ))}
          {tagLike !== null && (
            <span className="inline-flex items-center gap-1 rounded-lg border border-accent-border bg-accent-soft px-2 py-0.5 font-mono text-[12px] text-accent">
              ~{tagLike}
              <button
                type="button"
                aria-label={`Remove tag filter ~${tagLike}`}
                className="text-subtle hover:text-text"
                onClick={() => setTagLike(null)}
              >
                <X size={11} />
              </button>
            </span>
          )}
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
