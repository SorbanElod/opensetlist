import { apiFetch } from './client';

// Mirrors TagView in api/src/tags/service.ts (createdAt arrives as a string).
export type Tag = {
  id: string;
  name: string; // already lowercase-normalized by the API
  createdAt: string;
};

// search narrows server-side (ilike, cap 20) so the picker stays usable with
// hundreds of tags.
export async function listTags(search?: string): Promise<Tag[]> {
  const qs = search?.trim()
    ? `?search=${encodeURIComponent(search.trim())}`
    : '';
  const { tags } = await apiFetch<{ tags: Tag[] }>(`/api/tags${qs}`);
  return tags;
}

// group_manager only — the API enforces it. Removes the tag from every song.
export async function deleteTag(id: string): Promise<void> {
  await apiFetch<{ status: string }>(`/api/tags/${id}`, { method: 'DELETE' });
}
