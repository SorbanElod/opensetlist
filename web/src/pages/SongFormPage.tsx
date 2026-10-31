import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Check, X } from 'lucide-react';

import { ApiError } from '../api/client';
import {
  createSong,
  getSong,
  KEYS,
  updateSong,
  validateSong,
  type Song,
  type SongFieldErrors,
  type SongInput,
  type SongVisibility,
} from '../api/songs';
import { listTags, type Tag } from '../api/tags';

const VISIBILITIES: { value: SongVisibility; label: string }[] = [
  { value: 'group', label: 'Group library' },
  { value: 'private', label: 'Private' },
  // 'public' exists in the API but is not exposed in the UI yet
  // (cross-group sharing is post-alpha).
];

export function SongFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = id !== undefined;
  const navigate = useNavigate();

  const [song, setSong] = useState<Song | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [defaultKey, setDefaultKey] = useState<(typeof KEYS)[number]>('G');
  const [visibility, setVisibility] = useState<SongVisibility>('group');
  const [language, setLanguage] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<SongFieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The group's tag vocabulary — the autocomplete source for the token input.
  useEffect(() => {
    let cancelled = false;
    listTags()
      .then((t) => {
        if (!cancelled) setAllTags(t);
      })
      .catch(() => {
        /* autocomplete just stays empty */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Edit mode: load the song and prefill the form.
  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    getSong(id)
      .then((s) => {
        if (cancelled) return;
        setSong(s);
        setTitle(s.title);
        setAuthor(s.author ?? '');
        setDefaultKey(s.defaultKey as (typeof KEYS)[number]);
        setVisibility(s.visibility);
        setLanguage(s.language ?? '');
        setTags(s.tags);
      })
      .catch((err) => {
        if (!cancelled)
          setLoadError(
            err instanceof ApiError ? err.message : 'Failed to load song',
          );
      });
    return () => {
      cancelled = true;
    };
  }, [id, isEdit]);

  // Token input: Enter or comma commits the typed name (normalized like the
  // API does: trimmed + lowercase); unknown names are created on save.
  function addTag(raw: string) {
    const name = raw.trim().toLowerCase();
    if (!name) return;
    setTags((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setTagInput('');
  }

  function onTagKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault(); // don't submit the form on Enter in the token input
      addTag(tagInput);
    } else if (
      event.key === 'Backspace' &&
      tagInput === '' &&
      tags.length > 0
    ) {
      setTags((prev) => prev.slice(0, -1));
    }
  }

  const tagSuggestions = tagInput.trim()
    ? allTags
        .filter(
          (t) =>
            t.name.includes(tagInput.trim().toLowerCase()) &&
            !tags.includes(t.name),
        )
        .slice(0, 8)
    : [];

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const input: SongInput = {
      title,
      author: author.trim() || undefined,
      defaultKey,
      visibility,
      language: language.trim() || undefined,
      tags,
    };

    // Client-side mirror of the API schemas: fail fast, no request.
    const errors = validateSong(input);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setError(null);
    setSubmitting(true);
    try {
      if (isEdit && song) {
        const updated = await updateSong(song.id, {
          ...input,
          version: song.version,
        });
        navigate(`/songs/${updated.id}`, { replace: true });
      } else {
        const created = await createSong(input);
        navigate(`/songs/${created.id}`, { replace: true });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setError(
            'This song was modified by someone else — reload the page and try again.',
          );
        } else if (err.issues?.length) {
          // 400: map the API's issues (path = field name) onto the inputs.
          const mapped: SongFieldErrors = {};
          for (const issue of err.issues) {
            if (
              ['title', 'author', 'defaultKey', 'language', 'tags'].includes(
                issue.path,
              )
            )
              mapped[issue.path as keyof SongFieldErrors] = issue.message;
          }
          setFieldErrors(mapped);
        } else {
          setError(err.message);
        }
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (isEdit && loadError) {
    return (
      <div>
        <Link to="/songs" className="btn btn-ghost mb-2 -ml-2">
          <ArrowLeft size={15} /> Songs
        </Link>
        <div className="error-banner" role="alert">
          {loadError}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link to="/songs" className="btn btn-ghost mb-2 -ml-2">
        <ArrowLeft size={15} /> Songs
      </Link>

      <h1 className="mb-1 text-[22px] font-bold tracking-tight">
        {isEdit ? 'Edit song' : 'New song'}
      </h1>
      <p className="mb-5 text-[13px] text-muted">
        Metadata lives on the song; the music lives in its arrangements (P2.3).
      </p>

      <div className="card rounded-2xl p-5">
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} noValidate>
          <div className="field">
            <label className="flabel" htmlFor="title">
              Title
            </label>
            <input
              className="input"
              id="title"
              type="text"
              required
              aria-invalid={fieldErrors.title ? 'true' : undefined}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            {fieldErrors.title && (
              <p className="field-error">{fieldErrors.title}</p>
            )}
          </div>

          <div className="field">
            <label className="flabel" htmlFor="author">
              Author / source
            </label>
            <input
              className="input"
              id="author"
              type="text"
              aria-invalid={fieldErrors.author ? 'true' : undefined}
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            />
            {fieldErrors.author && (
              <p className="field-error">{fieldErrors.author}</p>
            )}
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="field">
              <label className="flabel" htmlFor="defaultKey">
                Key
              </label>
              <select
                className="input font-mono"
                id="defaultKey"
                aria-invalid={fieldErrors.defaultKey ? 'true' : undefined}
                value={defaultKey}
                onChange={(e) =>
                  setDefaultKey(e.target.value as (typeof KEYS)[number])
                }
              >
                {KEYS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              {fieldErrors.defaultKey && (
                <p className="field-error">{fieldErrors.defaultKey}</p>
              )}
            </div>
            <div className="field">
              <label className="flabel" htmlFor="language">
                Language
              </label>
              <input
                className="input font-mono"
                id="language"
                type="text"
                placeholder="hu"
                maxLength={2}
                aria-invalid={fieldErrors.language ? 'true' : undefined}
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              />
              {fieldErrors.language && (
                <p className="field-error">{fieldErrors.language}</p>
              )}
            </div>
          </div>

          <div className="field">
            <span className="flabel">Visibility</span>
            <div className="flex gap-2" role="group" aria-label="Visibility">
              {VISIBILITIES.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  aria-pressed={visibility === v.value}
                  className={`btn flex-1 justify-center ${
                    visibility === v.value ? 'btn-primary' : 'btn-outline'
                  }`}
                  onClick={() => setVisibility(v.value)}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="flabel" htmlFor="tag-input">
              Tags
            </label>
            {tags.length > 0 && (
              <div className="mb-1.5 flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-raised px-2 py-0.5 font-mono text-[12px]"
                  >
                    {t}
                    <button
                      type="button"
                      aria-label={`Remove tag ${t}`}
                      className="text-subtle hover:text-text"
                      onClick={() =>
                        setTags((prev) => prev.filter((x) => x !== t))
                      }
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative">
              <input
                className="input"
                id="tag-input"
                type="text"
                placeholder="Add a tag… (Enter to add)"
                aria-invalid={fieldErrors.tags ? 'true' : undefined}
                value={tagInput}
                onChange={(e) => {
                  setTagInput(e.target.value);
                  setTagMenuOpen(true);
                }}
                onKeyDown={onTagKeyDown}
                onFocus={() => setTagMenuOpen(true)}
                onBlur={() => setTagMenuOpen(false)}
              />
              {tagMenuOpen && tagSuggestions.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-raised p-1 shadow-lg">
                  {tagSuggestions.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className="w-full rounded-md px-2 py-1 text-left font-mono text-[13px] hover:bg-surface"
                        onMouseDown={(e) => {
                          e.preventDefault(); // keep focus; blur closes the menu
                          addTag(s.name);
                        }}
                      >
                        {s.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {fieldErrors.tags && (
              <p className="field-error">{fieldErrors.tags}</p>
            )}
          </div>

          <div className="mt-5 flex gap-2">
            <button
              className="btn btn-primary flex-1"
              type="submit"
              disabled={submitting}
            >
              <Check size={15} />
              {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Save song'}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => navigate(-1)}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
