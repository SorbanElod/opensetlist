import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Plus,
  Trash2,
} from 'lucide-react';

import { ApiError } from '../api/client';
import {
  createArrangement,
  deleteArrangement,
  getArrangement,
  updateArrangement,
  validateArrangement,
  type Arrangement,
  type ArrangementFieldErrors,
  type ArrangementInput,
  type ArrangementSection,
} from '../api/arrangements';
import { getSong, KEYS, type Song } from '../api/songs';
import { canWrite, useAuth, useMyRole } from '../auth/AuthContext';
import { AbcRenderer } from '../components/AbcRenderer';

// One page serves both modes: /songs/:songId/arrangements/new (create) and
// /arrangements/:id/edit (edit). The section editor submits the whole
// arrangement at once, matching the API's full-body PATCH.
export function ArrangementEditorPage() {
  const params = useParams<{ songId?: string; id?: string }>();
  const isEdit = params.id !== undefined;
  const createSongId = isEdit ? undefined : (params.songId ?? undefined);
  const navigate = useNavigate();
  const auth = useAuth();
  const role = useMyRole();

  const [song, setSong] = useState<Song | null>(null);
  const [arrangement, setArrangement] = useState<Arrangement | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [originalKey, setOriginalKey] = useState<(typeof KEYS)[number]>('G');
  const [bpmText, setBpmText] = useState('');
  const [sections, setSections] = useState<ArrangementSection[]>([]);
  const [sequence, setSequence] = useState<string[]>([]);
  const [sequenceToAdd, setSequenceToAdd] = useState('');
  const [previewIndex, setPreviewIndex] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<ArrangementFieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canEdit =
    auth.status === 'authenticated' && canWrite(role, auth.user.isSuperadmin);
  const backTo = `/songs/${(isEdit ? arrangement?.songId : createSongId) ?? ''}`;

  // Load: create mode fetches the parent song; edit mode fetches the
  // arrangement, prefills the form, then fetches its song for the header.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        if (isEdit && params.id) {
          const a = await getArrangement(params.id);
          if (cancelled) return;
          setArrangement(a);
          setTitle(a.title);
          setOriginalKey(a.originalKey as (typeof KEYS)[number]);
          setBpmText(a.bpm === null ? '' : String(a.bpm));
          setSections(a.sections);
          setSequence(a.defaultSequence);
          const s = await getSong(a.songId);
          if (!cancelled) setSong(s);
        } else if (createSongId) {
          const s = await getSong(createSongId);
          if (!cancelled) setSong(s);
        }
      } catch (err) {
        if (!cancelled)
          setLoadError(
            err instanceof ApiError ? err.message : 'Failed to load',
          );
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [isEdit, params.id, createSongId]);

  function updateSection(index: number, patch: Partial<ArrangementSection>) {
    setSections((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
    setPreviewIndex(index);
  }

  function moveSection(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= sections.length) return;
    setSections((prev) => {
      const next = [...prev];
      const a = next[index]!;
      const b = next[j]!;
      next[index] = b;
      next[j] = a;
      return next;
    });
    setPreviewIndex(j);
  }

  function removeSection(index: number) {
    const label = sections[index]?.label.trim();
    setSections((prev) => prev.filter((_, i) => i !== index));
    // Removing a section invalidates sequence entries with its label — drop
    // them here so the form can never submit an invalid sequence.
    if (label) setSequence((prev) => prev.filter((e) => e !== label));
    setPreviewIndex(0);
  }

  function addSection() {
    setSections((prev) => [
      ...prev,
      { label: `Section ${prev.length + 1}`, content: '' },
    ]);
    setPreviewIndex(sections.length);
  }

  function addToSequence() {
    const label = sequenceToAdd.trim();
    if (!label) return;
    setSequence((prev) => [...prev, label]); // repeats are legal (V1 C1 V1 C1)
    setSequenceToAdd('');
  }

  function removeFromSequence(index: number) {
    setSequence((prev) => prev.filter((_, i) => i !== index));
  }

  function moveSequence(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= sequence.length) return;
    setSequence((prev) => {
      const next = [...prev];
      const a = next[index]!;
      const b = next[j]!;
      next[index] = b;
      next[j] = a;
      return next;
    });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;

    const input: ArrangementInput = {
      title,
      originalKey,
      bpm: bpmText.trim() === '' ? null : Number(bpmText),
      sections: sections.map((s) => ({
        label: s.label.trim(),
        content: s.content,
      })),
      defaultSequence: sequence,
    };

    // Client-side mirror of the API schemas: fail fast, no request.
    const errors = validateArrangement(input);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setError(null);
    setSubmitting(true);
    try {
      if (isEdit && arrangement) {
        const updated = await updateArrangement(arrangement.id, {
          ...input,
          version: arrangement.version,
        });
        navigate(`/songs/${updated.songId}`, { replace: true });
      } else if (createSongId) {
        const created = await createArrangement(createSongId, input);
        navigate(`/songs/${created.songId}`, { replace: true });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setError(
            'This arrangement was modified by someone else — reload the page and try again.',
          );
        } else if (err.issues?.length) {
          // 400: map the API's issues (root path = field) onto the form.
          const mapped: ArrangementFieldErrors = {};
          for (const issue of err.issues) {
            const root = issue.path.split('.')[0];
            if (root === 'title' || root === 'originalKey' || root === 'bpm')
              mapped[root] = issue.message;
            else if (root === 'sections') mapped.sections = issue.message;
            else if (root === 'defaultSequence')
              mapped.defaultSequence = issue.message;
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

  async function onDelete() {
    if (!arrangement) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true); // two-click confirm, no window.confirm
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deleteArrangement(arrangement.id, arrangement.version);
      navigate(`/songs/${arrangement.songId}`, { replace: true });
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

  const preview =
    sections.length > 0
      ? sections[Math.min(previewIndex, sections.length - 1)]
      : null;

  if (loadError) {
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
      <Link to={backTo || '/songs'} className="btn btn-ghost mb-2 -ml-2">
        <ArrowLeft size={15} /> {song ? song.title : 'Songs'}
      </Link>

      <h1 className="mb-1 text-[22px] font-bold tracking-tight">
        {isEdit ? 'Edit arrangement' : 'New arrangement'}
      </h1>
      <p className="mb-5 text-[13px] text-muted">
        {song
          ? `A musical variant of “${song.title}” — sections hold the ABC notation.`
          : 'Sections hold the ABC notation; the sequence is the play order.'}
      </p>

      <div className="card rounded-2xl p-5">
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} noValidate>
          <div className="field">
            <label className="flabel" htmlFor="arr-title">
              Title
            </label>
            <input
              className="input"
              id="arr-title"
              type="text"
              required
              disabled={!canEdit}
              aria-invalid={fieldErrors.title ? 'true' : undefined}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            {fieldErrors.title && (
              <p className="field-error">{fieldErrors.title}</p>
            )}
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="field">
              <label className="flabel" htmlFor="arr-key">
                Original key
              </label>
              <select
                className="input font-mono"
                id="arr-key"
                disabled={!canEdit}
                aria-invalid={fieldErrors.originalKey ? 'true' : undefined}
                value={originalKey}
                onChange={(e) =>
                  setOriginalKey(e.target.value as (typeof KEYS)[number])
                }
              >
                {KEYS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              {fieldErrors.originalKey && (
                <p className="field-error">{fieldErrors.originalKey}</p>
              )}
            </div>
            <div className="field">
              <label className="flabel" htmlFor="arr-bpm">
                BPM (optional)
              </label>
              <input
                className="input font-mono"
                id="arr-bpm"
                type="number"
                inputMode="numeric"
                min={30}
                max={300}
                placeholder="96"
                disabled={!canEdit}
                aria-invalid={fieldErrors.bpm ? 'true' : undefined}
                value={bpmText}
                onChange={(e) => setBpmText(e.target.value)}
              />
              {fieldErrors.bpm && (
                <p className="field-error">{fieldErrors.bpm}</p>
              )}
            </div>
          </div>

          <div className="field">
            <span className="flabel">Default sequence</span>
            <p className="hint mb-2">
              Play order of sections, e.g. V1, C1, V2, C1. Repeats allowed.
            </p>
            {sequence.length > 0 && (
              <ol className="mb-2 flex flex-wrap gap-1.5">
                {sequence.map((entry, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-1 rounded-lg border border-border bg-raised px-2 py-1 font-mono text-[12px]"
                  >
                    <span>
                      {i + 1}. {entry}
                    </span>
                    {canEdit && (
                      <>
                        <button
                          type="button"
                          className="btn btn-ghost px-1"
                          aria-label={`Move ${entry} up`}
                          disabled={i === 0}
                          onClick={() => moveSequence(i, -1)}
                        >
                          <ArrowUp size={12} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost px-1"
                          aria-label={`Move ${entry} down`}
                          disabled={i === sequence.length - 1}
                          onClick={() => moveSequence(i, 1)}
                        >
                          <ArrowDown size={12} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost px-1"
                          aria-label={`Remove ${entry} from sequence`}
                          onClick={() => removeFromSequence(i)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {canEdit && (
              <div className="flex gap-2">
                <select
                  className="input flex-1"
                  aria-label="Add section to sequence"
                  value={sequenceToAdd}
                  onChange={(e) => setSequenceToAdd(e.target.value)}
                >
                  <option value="">Add a section…</option>
                  {sections.map((s, i) => (
                    <option key={i} value={s.label}>
                      {s.label || `Section ${i + 1}`}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={addToSequence}
                  disabled={!sequenceToAdd.trim()}
                >
                  <Plus size={14} /> Add
                </button>
              </div>
            )}
            {fieldErrors.defaultSequence && (
              <p className="field-error">{fieldErrors.defaultSequence}</p>
            )}
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="flabel">Sections (ABC)</span>
              {canEdit && (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={addSection}
                >
                  <Plus size={14} /> Add section
                </button>
              )}
            </div>
            {fieldErrors.sections && (
              <p className="field-error mb-2">{fieldErrors.sections}</p>
            )}
            {sections.length === 0 && (
              <p className="hint">
                No sections yet. Add one to start writing ABC notation.
              </p>
            )}
            <div className="flex flex-col gap-3">
              {sections.map((section, i) => (
                <div key={i} className="card rounded-xl p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <input
                      className="input flex-1 font-mono"
                      aria-label={`Section ${i + 1} label`}
                      value={section.label}
                      disabled={!canEdit}
                      onChange={(e) =>
                        updateSection(i, { label: e.target.value })
                      }
                    />
                    {canEdit && (
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          className="btn btn-ghost px-2"
                          aria-label={`Move section ${i + 1} up`}
                          disabled={i === 0}
                          onClick={() => moveSection(i, -1)}
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost px-2"
                          aria-label={`Move section ${i + 1} down`}
                          disabled={i === sections.length - 1}
                          onClick={() => moveSection(i, 1)}
                        >
                          <ArrowDown size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost px-2"
                          aria-label={`Remove section ${i + 1}`}
                          onClick={() => removeSection(i)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                  <textarea
                    className="input font-mono text-[12px]"
                    rows={6}
                    aria-label={`Section ${i + 1} ABC content`}
                    placeholder={'X:1\nT:Title\nM:4/4\nK:G\nGAB c2B |'}
                    value={section.content}
                    disabled={!canEdit}
                    onChange={(e) =>
                      updateSection(i, { content: e.target.value })
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <span className="flabel">Live preview</span>
            {preview ? (
              <div className="card mt-2 rounded-xl p-4">
                <select
                  className="input mb-3 font-mono"
                  aria-label="Preview section"
                  value={preview.label}
                  onChange={(e) =>
                    setPreviewIndex(
                      Math.max(
                        0,
                        sections.findIndex((s) => s.label === e.target.value),
                      ),
                    )
                  }
                >
                  {sections.map((s, i) => (
                    <option key={i} value={s.label}>
                      {s.label || `Section ${i + 1}`}
                    </option>
                  ))}
                </select>
                {/* debounceMs: live preview re-renders ~200ms after the last keystroke */}
                <AbcRenderer abc={preview.content} debounceMs={200} />
              </div>
            ) : (
              <p className="hint mt-2">
                The preview appears once a section has content.
              </p>
            )}
          </div>

          {canEdit && (
            <div className="mt-5 flex gap-2">
              <button
                className="btn btn-primary flex-1"
                type="submit"
                disabled={submitting}
              >
                <Check size={15} />
                {submitting
                  ? 'Saving…'
                  : isEdit
                    ? 'Save changes'
                    : 'Save arrangement'}
              </button>
              {isEdit && (
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
              )}
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => navigate(-1)}
              >
                Cancel
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
