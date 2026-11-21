import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Plus, X } from 'lucide-react';

import { ApiError } from '../api/client';
import { createSetlist, listSetlists, type Setlist } from '../api/setlists';
import { useLiveRefetch } from '../api/useLiveRefetch';
import { canWrite, useAuth, useMyRole } from '../auth/AuthContext';
import { EmptyState } from '../components/EmptyState';
import { ListRow } from '../components/ListRow';
import { PageHeader } from '../components/PageHeader';

export function SetlistsPage() {
  const auth = useAuth();
  const role = useMyRole();
  const navigate = useNavigate();
  const [setlists, setSetlists] = useState<Setlist[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [saving, setSaving] = useState(false);

  const canEdit =
    auth.status === 'authenticated' && canWrite(role, auth.user.isSuperadmin);

  const load = useCallback(() => {
    listSetlists()
      .then((list) => {
        setSetlists(list);
        setError(null);
      })
      .catch((err) => {
        setError(
          err instanceof ApiError ? err.message : 'Failed to load setlists',
        );
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates (issue #13): refetch on setlist:changed and on focus.
  useLiveRefetch(load);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const setlist = await createSetlist({
        title: title.trim(),
        eventDate: eventDate || null,
      });
      navigate(`/setlists/${setlist.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to create setlist',
      );
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Setlists"
        subtitle="Ordered song selections for an event"
        actions={
          canEdit && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowForm((v) => !v)}
            >
              {showForm ? <X size={15} /> : <Plus size={15} />}
              {showForm ? 'Cancel' : 'New setlist'}
            </button>
          )
        }
      />

      {showForm && canEdit && (
        <form className="card mb-3 p-4" onSubmit={onCreate}>
          <label className="flabel" htmlFor="setlist-title">
            Title
          </label>
          <input
            className="input mb-3"
            id="setlist-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Sunday service — 2026-12-24"
            required
            maxLength={200}
          />
          <label className="flabel" htmlFor="setlist-date">
            Event date (optional)
          </label>
          <input
            className="input mb-3 font-mono"
            id="setlist-date"
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
          />
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={saving || !title.trim()}
          >
            {saving ? 'Creating…' : 'Create setlist'}
          </button>
        </form>
      )}

      {error && (
        <div className="error-banner mb-3" role="alert">
          {error}
        </div>
      )}

      {setlists === null ? (
        <p className="text-[13.5px] text-muted">Loading…</p>
      ) : setlists.length === 0 ? (
        <EmptyState>
          No setlists yet. Create one for your next service — it is an ordered
          list of songs plus free-text notes.
        </EmptyState>
      ) : (
        <ul className="list">
          {setlists.map((setlist) => (
            <ListRow
              as="li"
              key={setlist.id}
              to={`/setlists/${setlist.id}`}
              title={setlist.title}
              meta={`${setlist.itemCount} item${setlist.itemCount === 1 ? '' : 's'}${setlist.eventDate ? ` · ${setlist.eventDate}` : ''}`}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
