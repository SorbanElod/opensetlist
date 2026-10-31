import { apiFetch } from './client';

// Mirrors TagView in api/src/tags/service.ts (createdAt arrives as a string).
export type Tag = {
  id: string;
  name: string; // already lowercase-normalized by the API
  createdAt: string;
};

export async function listTags(): Promise<Tag[]> {
  const { tags } = await apiFetch<{ tags: Tag[] }>('/api/tags');
  return tags;
}

// group_manager only — the API enforces it. Removes the tag from every song.
export async function deleteTag(id: string): Promise<void> {
  await apiFetch<{ status: string }>(`/api/tags/${id}`, { method: 'DELETE' });
}
