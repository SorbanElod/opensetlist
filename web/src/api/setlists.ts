import { apiFetch } from './client';

// Mirrors SetlistView in api/src/setlists/service.ts (createdAt arrives as a
// string over JSON).
export type Setlist = {
  id: string;
  groupId: string;
  title: string;
  eventDate: string | null;
  version: number;
  createdAt: string;
  itemCount: number;
};

// Mirrors ItemArrangement in api/src/setlists/service.ts.
export type SetlistItemArrangement = {
  id: string;
  title: string;
  songId: string;
  songTitle: string;
  originalKey: string;
  sectionLabels: string[];
  defaultSequence: string[];
};

// Mirrors ResolvedItem in api/src/setlists/service.ts: arrangement and
// effectiveSequence are null on note-only rows.
export type SetlistItem = {
  id: string;
  setlistId: string;
  position: number;
  arrangementId: string | null;
  transposedKey: string | null;
  customSequence: string[] | null;
  notes: string | null;
  createdAt: string;
  arrangement: SetlistItemArrangement | null;
  effectiveSequence: string[] | null;
};

export type SetlistDetail = {
  setlist: Setlist;
  items: SetlistItem[];
};

export type SetlistInput = {
  title: string;
  eventDate?: string | null;
};

// Item mutations carry the parent setlist's version (optimistic locking).
export type ItemInput = {
  arrangementId?: string | null;
  transposedKey?: string | null;
  customSequence?: string[] | null;
  notes?: string | null;
  version: number;
};

export type ItemMutationResult = {
  item: SetlistItem;
  setlistVersion: number;
};

export type ItemsMutationResult = {
  items: SetlistItem[];
  setlistVersion: number;
};

export async function listSetlists(): Promise<Setlist[]> {
  const { setlists } = await apiFetch<{ setlists: Setlist[] }>('/api/setlists');
  return setlists;
}

export async function createSetlist(input: SetlistInput): Promise<Setlist> {
  const { setlist } = await apiFetch<{ setlist: Setlist }>('/api/setlists', {
    method: 'POST',
    body: input,
  });
  return setlist;
}

export async function getSetlist(id: string): Promise<SetlistDetail> {
  return apiFetch<SetlistDetail>(`/api/setlists/${id}`);
}

export async function updateSetlist(
  id: string,
  input: SetlistInput & { version: number },
): Promise<Setlist> {
  const { setlist } = await apiFetch<{ setlist: Setlist }>(
    `/api/setlists/${id}`,
    { method: 'PATCH', body: input },
  );
  return setlist;
}

export async function deleteSetlist(
  id: string,
  version: number,
): Promise<void> {
  await apiFetch(`/api/setlists/${id}`, {
    method: 'DELETE',
    body: { version },
  });
}

export async function addItem(
  setlistId: string,
  input: ItemInput,
): Promise<ItemMutationResult> {
  return apiFetch<ItemMutationResult>(`/api/setlists/${setlistId}/items`, {
    method: 'POST',
    body: input,
  });
}

export async function updateItem(
  setlistId: string,
  itemId: string,
  input: ItemInput,
): Promise<ItemMutationResult> {
  return apiFetch<ItemMutationResult>(
    `/api/setlists/${setlistId}/items/${itemId}`,
    { method: 'PATCH', body: input },
  );
}

export async function deleteItem(
  setlistId: string,
  itemId: string,
  version: number,
): Promise<ItemsMutationResult> {
  return apiFetch<ItemsMutationResult>(
    `/api/setlists/${setlistId}/items/${itemId}`,
    { method: 'DELETE', body: { version } },
  );
}

export async function moveItem(
  setlistId: string,
  itemId: string,
  direction: 'up' | 'down',
  version: number,
): Promise<ItemsMutationResult> {
  return apiFetch<ItemsMutationResult>(
    `/api/setlists/${setlistId}/items/${itemId}/move`,
    { method: 'POST', body: { direction, version } },
  );
}
