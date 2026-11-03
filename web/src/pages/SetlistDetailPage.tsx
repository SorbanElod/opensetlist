import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  ChevronDown,
  ChevronUp,
  Eye,
  ListPlus,
  Pencil,
  Plus,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react';

import { ApiError } from '../api/client';
import { listArrangements, type Arrangement } from '../api/arrangements';
import { KEYS, listSongs, type Song } from '../api/songs';
import { useLiveRefetch } from '../api/useLiveRefetch';
import {
  addItem,
  deleteItem,
  deleteSetlist,
  getSetlist,
  moveItem,
  updateItem,
  updateSetlist,
  type SetlistDetail,
  type SetlistItem,
} from '../api/setlists';
import { canWrite, useAuth, useMyRole } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';

// The detail page is the working surface for one event: an ordered list of
// arrangement items + note-only rows. Every mutation sends the setlist
// version it last saw (optimistic locking); a 409 means someone else edited
// concurrently, so we show the message and refetch.
export function SetlistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const auth = useAuth();
  const role = useMyRole();
  const [detail, setDetail] = useState<SetlistDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingHeader, setEditingHeader] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [confirmingDeleteSetlist, setConfirmingDeleteSetlist] = useState(false);
  const [confirmingItemId, setConfirmingItemId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canEdit =
    auth.status === 'authenticated' && canWrite(role, auth.user.isSuperadmin);

  const [reload, setReload] = useState(0);

  // setState only inside the promise callbacks (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getSetlist(id)
      .then((d) => {
        if (!cancelled) {
          setDetail(d);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof ApiError ? err.message : 'Failed to load setlist',
          );
      });
    return () => {
      cancelled = true;
    };
  }, [id, reload]);

  const load = useCallback(() => setReload((r) => r + 1), []);

  // Live updates (issue #13): refetch on setlist:changed and on focus.
  useLiveRefetch(load);

  // A mutation can 409 (stale version): reload and surface the conflict.
  async function runMutation(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError('Setlist was modified by someone else — reloaded.');
        await load();
      } else {
        setError(
          err instanceof ApiError ? err.message : 'Something went wrong',
        );
      }
    } finally {
      setBusy(false);
    }
  }

  if (!detail) {
    return (
      <div>
        {error ? (
          <div className="error-banner" role="alert">
            {error}
          </div>
        ) : (
          <p className="text-[13.5px] text-muted">Loading…</p>
        )}
      </div>
    );
  }

  const { setlist, items } = detail;

  async function onMove(item: SetlistItem, direction: 'up' | 'down') {
    await runMutation(() =>
      moveItem(setlist.id, item.id, direction, setlist.version),
    );
  }

  async function onDeleteItem(item: SetlistItem) {
    if (confirmingItemId !== item.id) {
      setConfirmingItemId(item.id);
      return;
    }
    setConfirmingItemId(null);
    await runMutation(() => deleteItem(setlist.id, item.id, setlist.version));
  }

  async function onDeleteSetlist() {
    if (!confirmingDeleteSetlist) {
      setConfirmingDeleteSetlist(true);
      return;
    }
    setBusy(true);
    try {
      await deleteSetlist(setlist.id, setlist.version);
      navigate('/setlists');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to delete setlist',
      );
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={setlist.title}
        subtitle={
          setlist.eventDate
            ? `Event date ${setlist.eventDate} · ${items.length} item${items.length === 1 ? '' : 's'}`
            : `${items.length} item${items.length === 1 ? '' : 's'}`
        }
        actions={
          <>
            {/* On-stage view (issue #62): every role, readers included. */}
            <Link
              to={`/setlists/${setlist.id}/view`}
              className="btn btn-outline"
              aria-label="View setlist"
            >
              <Eye size={15} /> View
            </Link>
            {canEdit && (
              <>
                <button
                  type="button"
                  className="btn btn-ghost"
                  aria-label="Edit setlist title and date"
                  onClick={() => setEditingHeader((v) => !v)}
                >
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  aria-label={
                    confirmingDeleteSetlist
                      ? 'Confirm delete setlist'
                      : 'Delete setlist'
                  }
                  onClick={() => void onDeleteSetlist()}
                  disabled={busy}
                >
                  <Trash2 size={15} />
                </button>
              </>
            )}
          </>
        }
      />

      {editingHeader && canEdit && (
        <HeaderEditor
          setlist={setlist}
          onDone={() => setEditingHeader(false)}
          onSaved={() => void load()}
          setError={setError}
        />
      )}

      {error && (
        <div className="error-banner mb-3" role="alert">
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <div className="card p-5">
          <p className="text-[13.5px] text-muted">
            Empty setlist. Add songs from your library or free-text notes below.
          </p>
        </div>
      ) : (
        <ol className="list mb-3">
          {items.map((item, index) => (
            <li key={item.id}>
              <div className="list-row items-start">
                <span className="w-6 shrink-0 pt-0.5 text-center font-mono text-[12px] text-subtle">
                  {item.position}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-semibold">
                    {item.arrangement
                      ? `${item.arrangement.songTitle} — ${item.arrangement.title}`
                      : 'Note'}
                  </div>
                  <div className="truncate text-[11.5px] text-muted">
                    {item.arrangement
                      ? `${item.arrangement.originalKey}${item.transposedKey ? ` → ${item.transposedKey}` : ''} · ${(item.effectiveSequence ?? []).join(' → ')}`
                      : item.notes}
                  </div>
                  {item.arrangement && item.notes && (
                    <div className="truncate text-[11.5px] text-muted">
                      {item.notes}
                    </div>
                  )}
                </div>
                {canEdit && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      className="btn btn-ghost px-1.5"
                      aria-label={`Move item ${item.position} up`}
                      disabled={busy || index === 0}
                      onClick={() => void onMove(item, 'up')}
                    >
                      <ChevronUp size={15} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost px-1.5"
                      aria-label={`Move item ${item.position} down`}
                      disabled={busy || index === items.length - 1}
                      onClick={() => void onMove(item, 'down')}
                    >
                      <ChevronDown size={15} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost px-1.5"
                      aria-label={`Edit item ${item.position}`}
                      onClick={() =>
                        setEditingItemId((v) =>
                          v === item.id ? null : item.id,
                        )
                      }
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost px-1.5 hover:text-error"
                      aria-label={
                        confirmingItemId === item.id
                          ? `Confirm delete item ${item.position}`
                          : `Delete item ${item.position}`
                      }
                      disabled={busy}
                      onClick={() => void onDeleteItem(item)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
              {editingItemId === item.id && canEdit && (
                <ItemEditor
                  setlistId={setlist.id}
                  version={setlist.version}
                  item={item}
                  onDone={() => setEditingItemId(null)}
                  onSaved={() => void load()}
                  setError={setError}
                />
              )}
            </li>
          ))}
        </ol>
      )}

      {canEdit && (
        <AddSection
          setlistId={setlist.id}
          version={setlist.version}
          onSaved={() => void load()}
          setError={setError}
        />
      )}
    </div>
  );
}

// Title + event date editor (members).
function HeaderEditor({
  setlist,
  onDone,
  onSaved,
  setError,
}: {
  setlist: SetlistDetail['setlist'];
  onDone: () => void;
  onSaved: () => void;
  setError: (msg: string | null) => void;
}) {
  const [title, setTitle] = useState(setlist.title);
  const [eventDate, setEventDate] = useState(setlist.eventDate ?? '');
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await updateSetlist(setlist.id, {
        title: title.trim(),
        eventDate: eventDate || null,
        version: setlist.version,
      });
      onDone();
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save');
      setSaving(false);
    }
  }

  return (
    <form className="card mb-3 p-4" onSubmit={onSubmit}>
      <label className="flabel" htmlFor="edit-setlist-title">
        Title
      </label>
      <input
        className="input mb-3"
        id="edit-setlist-title"
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        maxLength={200}
      />
      <label className="flabel" htmlFor="edit-setlist-date">
        Event date (optional)
      </label>
      <input
        className="input mb-3 font-mono"
        id="edit-setlist-date"
        type="date"
        value={eventDate}
        onChange={(e) => setEventDate(e.target.value)}
      />
      <div className="flex gap-2">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={saving || !title.trim()}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn btn-outline" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// Per-item overrides: transposed key, custom sequence (chips, add/remove/
// reorder with buttons — no drag & drop), notes. Saving sends the merged
// fields; the server validates customSequence against the arrangement's
// section labels.
function ItemEditor({
  setlistId,
  version,
  item,
  onDone,
  onSaved,
  setError,
}: {
  setlistId: string;
  version: number;
  item: SetlistItem;
  onDone: () => void;
  onSaved: () => void;
  setError: (msg: string | null) => void;
}) {
  const arrangement = item.arrangement;
  const [transposedKey, setTransposedKey] = useState(item.transposedKey ?? '');
  const [sequence, setSequence] = useState<string[]>(
    item.customSequence ?? arrangement?.defaultSequence ?? [],
  );
  const [usesDefaultSequence, setUsesDefaultSequence] = useState(
    item.customSequence === null,
  );
  const [notes, setNotes] = useState(item.notes ?? '');
  const [addingLabel, setAddingLabel] = useState('');
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateItem(setlistId, item.id, {
        version,
        transposedKey: arrangement ? transposedKey || null : null,
        customSequence: arrangement
          ? usesDefaultSequence
            ? null
            : sequence
          : null,
        notes: notes.trim() || null,
      });
      onDone();
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save item');
      setSaving(false);
    }
  }

  function moveLabel(index: number, direction: -1 | 1) {
    setSequence((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  return (
    <form className="card mt-2 p-3" onSubmit={onSubmit}>
      {arrangement && (
        <>
          <label className="flabel" htmlFor={`key-${item.id}`}>
            Key (transposed at render time)
          </label>
          <select
            className="input mb-3 font-mono"
            id={`key-${item.id}`}
            value={transposedKey}
            onChange={(e) => setTransposedKey(e.target.value)}
          >
            <option value="">Original ({arrangement.originalKey})</option>
            {KEYS.filter((k) => k !== arrangement.originalKey).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>

          <span className="flabel">Sequence</span>
          {usesDefaultSequence ? (
            <p className="mb-3 text-[12.5px] text-muted">
              Using the arrangement default (
              {arrangement.defaultSequence.join(' → ')}).
              <button
                type="button"
                className="ml-1 font-semibold text-accent"
                onClick={() => setUsesDefaultSequence(false)}
              >
                Customize
              </button>
            </p>
          ) : (
            <div className="mb-3">
              <div className="mb-1.5 flex flex-wrap gap-1.5">
                {sequence.map((label, index) => (
                  <span
                    key={`${label}-${index}`}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-raised px-1.5 py-0.5 font-mono text-[12px]"
                  >
                    {label}
                    <button
                      type="button"
                      aria-label={`Move ${label} up`}
                      className="text-subtle hover:text-text"
                      disabled={index === 0}
                      onClick={() => moveLabel(index, -1)}
                    >
                      <ChevronUp size={12} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${label} down`}
                      className="text-subtle hover:text-text"
                      disabled={index === sequence.length - 1}
                      onClick={() => moveLabel(index, 1)}
                    >
                      <ChevronDown size={12} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${label}`}
                      className="text-subtle hover:text-error"
                      onClick={() =>
                        setSequence((prev) =>
                          prev.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-1.5">
                <select
                  className="input flex-1 font-mono"
                  aria-label="Add section to sequence"
                  value={addingLabel}
                  onChange={(e) => setAddingLabel(e.target.value)}
                >
                  <option value="">Add section…</option>
                  {arrangement.sectionLabels.map((label) => (
                    <option key={label} value={label}>
                      {label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={!addingLabel}
                  onClick={() => {
                    setSequence((prev) => [...prev, addingLabel]);
                    setAddingLabel('');
                  }}
                >
                  <Plus size={14} />
                </button>
              </div>
              <button
                type="button"
                className="mt-1.5 text-[12px] font-semibold text-accent"
                onClick={() => setUsesDefaultSequence(true)}
              >
                Reset to arrangement default
              </button>
            </div>
          )}
        </>
      )}

      <label className="flabel" htmlFor={`notes-${item.id}`}>
        Notes
      </label>
      <textarea
        className="input mb-3 min-h-16"
        id={`notes-${item.id}`}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={
          item.arrangement
            ? 'e.g. capo 3, skip intro'
            : 'Note text (required for note-only rows)'
        }
        maxLength={2000}
      />

      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save item'}
        </button>
        <button type="button" className="btn btn-outline" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// Add an arrangement item (song → arrangement picker) or a note-only row.
function AddSection({
  setlistId,
  version,
  onSaved,
  setError,
}: {
  setlistId: string;
  version: number;
  onSaved: () => void;
  setError: (msg: string | null) => void;
}) {
  const [mode, setMode] = useState<'song' | 'note' | null>(null);
  const [songs, setSongs] = useState<Song[] | null>(null);
  const [songId, setSongId] = useState('');
  const [arrangements, setArrangements] = useState<Arrangement[] | null>(null);
  const [arrangementId, setArrangementId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function openSongPicker() {
    setMode('song');
    setError(null);
    try {
      setSongs(await listSongs());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load songs');
    }
  }

  async function onSongChange(id: string) {
    setSongId(id);
    setArrangementId('');
    setArrangements(null);
    if (!id) return;
    try {
      setArrangements(await listArrangements(id));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to load arrangements',
      );
    }
  }

  async function onAddSong(event: FormEvent) {
    event.preventDefault();
    if (!arrangementId) return;
    setSaving(true);
    setError(null);
    try {
      await addItem(setlistId, { arrangementId, version });
      setMode(null);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add item');
      setSaving(false);
    }
  }

  async function onAddNote(event: FormEvent) {
    event.preventDefault();
    if (!note.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await addItem(setlistId, {
        arrangementId: null,
        notes: note.trim(),
        version,
      });
      setMode(null);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add note');
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-2 flex gap-2">
        <button
          type="button"
          className="btn btn-outline flex-1"
          onClick={() => void openSongPicker()}
        >
          <ListPlus size={15} /> Add song
        </button>
        <button
          type="button"
          className="btn btn-outline flex-1"
          onClick={() => {
            setMode('note');
            setError(null);
          }}
        >
          <StickyNote size={15} /> Add note
        </button>
      </div>

      {mode === 'song' && (
        <form className="card p-4" onSubmit={onAddSong}>
          <label className="flabel" htmlFor="add-song">
            Song
          </label>
          <select
            className="input mb-3"
            id="add-song"
            value={songId}
            onChange={(e) => void onSongChange(e.target.value)}
          >
            <option value="">Choose a song…</option>
            {(songs ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
          {arrangements !== null && (
            <>
              <label className="flabel" htmlFor="add-arrangement">
                Arrangement
              </label>
              <select
                className="input mb-3"
                id="add-arrangement"
                value={arrangementId}
                onChange={(e) => setArrangementId(e.target.value)}
              >
                <option value="">Choose an arrangement…</option>
                {arrangements.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title} (key {a.originalKey})
                  </option>
                ))}
              </select>
            </>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving || !arrangementId}
            >
              {saving ? 'Adding…' : 'Add to setlist'}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setMode(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {mode === 'note' && (
        <form className="card p-4" onSubmit={onAddNote}>
          <label className="flabel" htmlFor="add-note">
            Note
          </label>
          <textarea
            className="input mb-3 min-h-16"
            id="add-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Soundcheck at 9:00, offering during the last song"
            maxLength={2000}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving || !note.trim()}
            >
              {saving ? 'Adding…' : 'Add note'}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setMode(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
