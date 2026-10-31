import { apiFetch } from './client';
import { KEYS } from './songs';

// Mirrors ArrangementSection in api/src/db/schema.ts.
export type ArrangementSection = { label: string; content: string };

// Mirrors ArrangementView in api/src/arrangements/service.ts (createdAt
// arrives as a string over JSON).
export type Arrangement = {
  id: string;
  songId: string;
  title: string;
  originalKey: string;
  bpm: number | null;
  defaultSequence: string[];
  sections: ArrangementSection[];
  version: number;
  createdAt: string;
};

export type ArrangementInput = {
  title: string;
  originalKey: string;
  bpm?: number | null;
  sections: ArrangementSection[];
  defaultSequence: string[];
};

export async function listArrangements(songId: string): Promise<Arrangement[]> {
  const { arrangements } = await apiFetch<{ arrangements: Arrangement[] }>(
    `/api/songs/${songId}/arrangements`,
  );
  return arrangements;
}

export async function getArrangement(id: string): Promise<Arrangement> {
  const { arrangement } = await apiFetch<{ arrangement: Arrangement }>(
    `/api/arrangements/${id}`,
  );
  return arrangement;
}

export async function createArrangement(
  songId: string,
  input: ArrangementInput,
): Promise<Arrangement> {
  const { arrangement } = await apiFetch<{ arrangement: Arrangement }>(
    `/api/songs/${songId}/arrangements`,
    { method: 'POST', body: input },
  );
  return arrangement;
}

// version is the one the client last saw — the server check-and-bumps and
// answers 409 on a stale one (optimistic locking).
export async function updateArrangement(
  id: string,
  input: ArrangementInput & { version: number },
): Promise<Arrangement> {
  const { arrangement } = await apiFetch<{ arrangement: Arrangement }>(
    `/api/arrangements/${id}`,
    { method: 'PATCH', body: input },
  );
  return arrangement;
}

export async function deleteArrangement(
  id: string,
  version: number,
): Promise<void> {
  await apiFetch<{ status: string }>(`/api/arrangements/${id}`, {
    method: 'DELETE',
    body: { version },
  });
}

// Client-side mirror of the API schemas: fail fast, no request. The API
// stays the authority — its 400 issues are mapped onto fields by the form.
export type ArrangementField =
  'title' | 'originalKey' | 'bpm' | 'sections' | 'defaultSequence';
export type ArrangementFieldErrors = Partial<Record<ArrangementField, string>>;

export function validateArrangement(
  input: ArrangementInput,
): ArrangementFieldErrors {
  const errors: ArrangementFieldErrors = {};

  const title = input.title.trim();
  if (!title) errors.title = 'Title is required';
  else if (title.length > 200)
    errors.title = 'Title must be at most 200 characters';

  if (!KEYS.includes(input.originalKey as (typeof KEYS)[number]))
    errors.originalKey = 'Pick a key';

  if (
    input.bpm != null &&
    (!Number.isInteger(input.bpm) || input.bpm < 30 || input.bpm > 300)
  )
    errors.bpm = 'BPM must be between 30 and 300';

  if (input.sections.length > 50) errors.sections = 'At most 50 sections';
  const labels = input.sections.map((s) => s.label.trim());
  for (const section of input.sections) {
    if (!section.label.trim()) {
      errors.sections = 'Every section needs a label';
      break;
    }
    if (section.label.trim().length > 40)
      errors.sections = 'Labels must be at most 40 characters';
    if (section.content.length > 100_000)
      errors.sections = 'Section content is too large';
  }
  if (labels.length > 0 && new Set(labels).size !== labels.length)
    errors.sections = 'Section labels must be unique within an arrangement';

  if (input.defaultSequence.length > 100)
    errors.defaultSequence = 'At most 100 sequence entries';
  else {
    const labelSet = new Set(labels);
    if (input.defaultSequence.some((entry) => !labelSet.has(entry.trim())))
      errors.defaultSequence =
        'Every sequence entry must be an existing section label';
  }

  return errors;
}
