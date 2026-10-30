import { apiFetch } from './client';

// The 12 pitch-class keys — mirrors KEYS in api/src/songs/schemas.ts.
export const KEYS = [
  'C',
  'C#',
  'D',
  'Eb',
  'E',
  'F',
  'F#',
  'G',
  'Ab',
  'A',
  'Bb',
  'B',
] as const;

export type SongVisibility = 'private' | 'group' | 'public';

// Mirrors SongView in api/src/songs/service.ts (createdAt arrives as a string).
export type Song = {
  id: string;
  title: string;
  author: string | null;
  defaultKey: string;
  visibility: SongVisibility;
  language: string | null;
  ownerId: string;
  version: number;
  createdAt: string;
};

export type SongInput = {
  title: string;
  author?: string;
  defaultKey: string;
  visibility: SongVisibility;
  language?: string;
};

export async function listSongs(): Promise<Song[]> {
  const { songs } = await apiFetch<{ songs: Song[] }>('/api/songs');
  return songs;
}

export async function getSong(id: string): Promise<Song> {
  const { song } = await apiFetch<{ song: Song }>(`/api/songs/${id}`);
  return song;
}

export async function createSong(input: SongInput): Promise<Song> {
  const { song } = await apiFetch<{ song: Song }>('/api/songs', {
    method: 'POST',
    body: input,
  });
  return song;
}

// version is the one the client last saw — the server check-and-bumps and
// answers 409 on a stale one (optimistic locking).
export async function updateSong(
  id: string,
  input: Partial<SongInput> & { version: number },
): Promise<Song> {
  const { song } = await apiFetch<{ song: Song }>(`/api/songs/${id}`, {
    method: 'PATCH',
    body: input,
  });
  return song;
}

export async function deleteSong(id: string, version: number): Promise<void> {
  await apiFetch<{ status: string }>(`/api/songs/${id}`, {
    method: 'DELETE',
    body: { version },
  });
}

// Client-side mirror of the songs schemas: fail fast, no request. The API
// stays the authority — its 400 issues are mapped onto fields by the form.
export type SongField = 'title' | 'author' | 'defaultKey' | 'language';
export type SongFieldErrors = Partial<Record<SongField, string>>;

const LANGUAGE_PATTERN = /^[a-z]{2}$/;

export function validateSong(input: SongInput): SongFieldErrors {
  const errors: SongFieldErrors = {};

  const title = input.title.trim();
  if (title.length < 1) errors.title = 'Title is required';
  else if (title.length > 200)
    errors.title = 'Title must be at most 200 characters';

  if (input.author && input.author.trim().length > 200)
    errors.author = 'Author must be at most 200 characters';

  if (!KEYS.includes(input.defaultKey as (typeof KEYS)[number]))
    errors.defaultKey = 'Pick a key';

  if (input.language && !LANGUAGE_PATTERN.test(input.language))
    errors.language = 'Use a 2-letter ISO 639-1 code, e.g. "hu"';

  return errors;
}
