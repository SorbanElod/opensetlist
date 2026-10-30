import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Check } from 'lucide-react';

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
  const [fieldErrors, setFieldErrors] = useState<SongFieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const input: SongInput = {
      title,
      author: author.trim() || undefined,
      defaultKey,
      visibility,
      language: language.trim() || undefined,
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
              ['title', 'author', 'defaultKey', 'language'].includes(issue.path)
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
