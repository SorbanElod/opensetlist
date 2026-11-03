import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type TextareaHTMLAttributes,
} from 'react';
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
import { PageHeader } from '../components/PageHeader';
import { Popover } from '../components/Popover';
import { orderedSections, sheetAbc } from '../lib/abcViews';

// Textarea that grows with its content (rows=1, height = scrollHeight): the
// page scrolls, never an inner scrollbar — nested scrolling panels in the
// section editor were confusing.
function AutoTextarea({
  value,
  onChange,
  ...rest
}: {
  value: string;
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      className="input resize-none overflow-hidden font-mono text-[12px]"
      value={value}
      onChange={onChange}
      {...rest}
    />
  );
}

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
  const [seqMenuOpen, setSeqMenuOpen] = useState(false);
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
  }

  function removeSection(index: number) {
    const label = sections[index]?.label.trim();
    setSections((prev) => prev.filter((_, i) => i !== index));
    // Removing a section invalidates sequence entries with its label — drop
    // them here so the form can never submit an invalid sequence.
    if (label) setSequence((prev) => prev.filter((e) => e !== label));
  }

  function addSection() {
    setSections((prev) => [
      ...prev,
      { label: `Section ${prev.length + 1}`, content: '' },
    ]);
  }

  function addToSequence(label: string) {
    const l = label.trim();
    if (!l) return;
    setSequence((prev) => [...prev, l]); // repeats are legal (V1 C1 V1 C1)
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

  // The live preview shows the WHOLE arrangement in play order (sequence
  // first, then any unmentioned sections) — same rule as the view pages.
  const previewSections = orderedSections(sections, sequence);

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

      <PageHeader
        title={isEdit ? 'Edit arrangement' : 'New arrangement'}
        subtitle={
          song
            ? `A musical variant of “${song.title}” — sections hold the ABC notation.`
            : 'Sections hold the ABC notation; the sequence is the play order.'
        }
      />

      <div className="card p-5">
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
              <ol className="mb-2 flex flex-col gap-1.5">
                {sequence.map((entry, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-2 rounded-md border border-border bg-raised px-2 py-1 font-mono text-[12px]"
                  >
                    <span>
                      {i + 1}. {entry}
                    </span>
                    {canEdit && (
                      <div className="flex shrink-0 gap-1">
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
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {canEdit && (
              <Popover
                open={seqMenuOpen}
                onClose={() => setSeqMenuOpen(false)}
                label="Add to sequence"
                panelClassName="w-full"
                anchor={
                  <button
                    type="button"
                    className="btn btn-outline btn-block"
                    aria-haspopup="dialog"
                    aria-expanded={seqMenuOpen}
                    onClick={() => setSeqMenuOpen((v) => !v)}
                  >
                    <Plus size={14} /> Add to sequence
                  </button>
                }
              >
                <div className="flabel">Pick a section</div>
                <ul className="mt-1 flex max-h-48 flex-col overflow-y-auto">
                  {sections.map((s, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        className="w-full rounded-md px-2 py-1.5 text-left font-mono text-[13px] hover:bg-raised"
                        onClick={() => {
                          addToSequence(s.label || `Section ${i + 1}`);
                          setSeqMenuOpen(false);
                        }}
                      >
                        {s.label || `Section ${i + 1}`}
                      </button>
                    </li>
                  ))}
                </ul>
              </Popover>
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
            {/* All sections in ONE panel, separated by whitespace only —
                not one card per section (matches the view pages). */}
            <div className="card px-4 py-2">
              {sections.map((section, i) => (
                <section key={i} className="py-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label
                      className="flabel mb-0"
                      htmlFor={`section-${i}-label`}
                    >
                      Section label
                    </label>
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
                  <input
                    id={`section-${i}-label`}
                    className="input mb-3 font-mono"
                    aria-label={`Section ${i + 1} label`}
                    value={section.label}
                    disabled={!canEdit}
                    onChange={(e) =>
                      updateSection(i, { label: e.target.value })
                    }
                  />
                  <label className="flabel" htmlFor={`section-${i}-abc`}>
                    ABC notation
                  </label>
                  <AutoTextarea
                    id={`section-${i}-abc`}
                    aria-label={`Section ${i + 1} ABC content`}
                    placeholder={'X:1\nT:Title\nM:4/4\nK:G\nGAB c2B |'}
                    value={section.content}
                    disabled={!canEdit}
                    onChange={(e) =>
                      updateSection(i, { content: e.target.value })
                    }
                  />
                </section>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <span className="flabel">
              Live preview — the whole arrangement in play order
            </span>
            {previewSections.length > 0 ? (
              <div className="card mt-2 px-4 py-2">
                {previewSections.map((s, i) => (
                  <section key={`${s.label}-${i}`} className="py-2">
                    <h2 className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-muted">
                      {s.label || `Section ${i + 1}`}
                    </h2>
                    {/* debounceMs: live preview re-renders ~200ms after the
                        last keystroke. sheetAbc strips T:/C: so title/author
                        are not repeated inside every section. */}
                    <AbcRenderer abc={sheetAbc(s.content)} debounceMs={200} />
                  </section>
                ))}
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
