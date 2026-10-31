// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Song } from '../api/songs';
import { renderApp } from '../test/renderApp';
import { stubFetch } from '../test/fetchMock';

const USER = {
  id: 'u1',
  email: 'elod@example.com',
  name: 'Előd',
  isSuperadmin: false,
};

const SONGS: Song[] = [
  {
    id: 's1',
    title: 'Amazing Grace',
    author: 'John Newton',
    defaultKey: 'G',
    visibility: 'group',
    language: 'en',
    ownerId: 'u1',
    version: 1,
    createdAt: '2026-10-28T10:00:00.000Z',
    tags: ['easter'],
  },
  {
    id: 's2',
    title: 'Be Thou My Vision',
    author: 'Irish traditional',
    defaultKey: 'D',
    visibility: 'group',
    language: null,
    ownerId: 'u1',
    version: 1,
    createdAt: '2026-10-27T10:00:00.000Z',
    tags: [],
  },
  {
    id: 's3',
    title: 'Christmas Eve Song',
    author: null,
    defaultKey: 'C',
    visibility: 'group',
    language: null,
    ownerId: 'u1',
    version: 1,
    createdAt: '2026-10-26T10:00:00.000Z',
    tags: ['christmas'],
  },
];

const TAGS = [
  { id: 't1', name: 'easter', createdAt: '2026-10-28T10:00:00.000Z' },
  { id: 't2', name: 'campfire', createdAt: '2026-10-28T10:00:00.000Z' },
  { id: 't3', name: 'christmas', createdAt: '2026-10-28T10:00:00.000Z' },
];

type QueryFilter = {
  search?: string;
  tagsAll?: string[];
  tagsAny?: string[];
  tagsLike?: string;
};

function stubAuthed(role: string, songs = SONGS) {
  return stubFetch((path, init) => {
    if (path === '/api/auth/me')
      return {
        status: 200,
        body: { user: USER, memberships: [{ groupId: 'g1', role }] },
      };
    if (path.startsWith('/api/tags')) {
      const search =
        new URL(path, 'http://test').searchParams.get('search') ?? '';
      return {
        status: 200,
        body: {
          tags: TAGS.filter((t) => !search || t.name.includes(search)),
        },
      };
    }
    if (path === '/api/songs/query') {
      // Apply the leaf filters the page sends, so the test exercises the wiring.
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        filter?: QueryFilter;
      };
      let result = songs;
      const f = body.filter;
      if (f?.search)
        result = result.filter((s) =>
          s.title.toLowerCase().includes(f!.search!.toLowerCase()),
        );
      if (f?.tagsAll)
        result = result.filter((s) =>
          f.tagsAll!.every((t) => s.tags.includes(t)),
        );
      if (f?.tagsAny)
        result = result.filter((s) =>
          f.tagsAny!.some((t) => s.tags.includes(t)),
        );
      if (f?.tagsLike)
        result = result.filter((s) =>
          s.tags.some((t) => t.includes(f!.tagsLike!)),
        );
      return { status: 200, body: { songs: result } };
    }
    return { status: 404, body: {} };
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SongsPage', () => {
  it('lists songs with their tags and filters server-side by search', async () => {
    stubAuthed('member');
    renderApp('/songs');

    expect(await screen.findByText('Amazing Grace')).toBeTruthy();
    expect(screen.getByText('Be Thou My Vision')).toBeTruthy();
    // tag shown on the row (and searchable via the tag picker)
    expect(screen.getAllByText(/easter/).length).toBeGreaterThanOrEqual(1);

    fireEvent.change(screen.getByLabelText('Search songs'), {
      target: { value: 'grace' },
    });
    // the query is debounced (200ms), so wait for the filtered result
    await waitFor(() =>
      expect(screen.queryByText('Be Thou My Vision')).toBeNull(),
    );
    expect(screen.getByText('Amazing Grace')).toBeTruthy();
  });

  it('filters by a tag picked through the search-as-you-type picker', async () => {
    stubAuthed('member');
    renderApp('/songs');

    await screen.findByText('Amazing Grace');
    const picker = screen.getByLabelText('Filter by tag');
    fireEvent.change(picker, { target: { value: 'eas' } });
    // suggestion from GET /api/tags?search=eas (debounced)
    fireEvent.mouseDown(await screen.findByRole('button', { name: 'easter' }));

    expect(
      await screen.findByLabelText('Remove tag filter easter'),
    ).toBeTruthy();
    // only Amazing Grace carries "easter" — wait out the debounced query
    await waitFor(() =>
      expect(screen.queryByText('Be Thou My Vision')).toBeNull(),
    );
    expect(screen.getByText('Amazing Grace')).toBeTruthy();
  });

  it('offers a substring tag filter (tagsLike) when no exact tag matches', async () => {
    stubAuthed('member');
    renderApp('/songs');

    await screen.findByText('Amazing Grace');
    const picker = screen.getByLabelText('Filter by tag');
    fireEvent.change(picker, { target: { value: 'christ' } });
    fireEvent.mouseDown(
      await screen.findByRole('button', { name: /any tag containing/ }),
    );

    expect(
      await screen.findByLabelText('Remove tag filter ~christ'),
    ).toBeTruthy();
    // only the christmas song matches ~christ
    await waitFor(() => expect(screen.queryByText('Amazing Grace')).toBeNull());
    expect(screen.getByText('Christmas Eve Song')).toBeTruthy();
  });

  it('shows the New song button to members', async () => {
    stubAuthed('member');
    renderApp('/songs');

    expect(
      await screen.findByRole('button', { name: /new song/i }),
    ).toBeTruthy();
  });

  it('hides the New song button from readers', async () => {
    stubAuthed('reader');
    renderApp('/songs');

    await screen.findByText('Amazing Grace');
    expect(screen.queryByRole('button', { name: /new song/i })).toBeNull();
    expect(screen.queryByLabelText('Import songs from JSON')).toBeNull();
  });

  it('lets a group_manager delete a tag from the picker (two-click confirm)', async () => {
    const fn = stubAuthed('group_manager');
    renderApp('/songs');

    await screen.findByText('Amazing Grace');
    const picker = screen.getByLabelText('Filter by tag');
    fireEvent.change(picker, { target: { value: 'eas' } });
    await screen.findByRole('button', { name: 'easter' });
    fireEvent.mouseDown(screen.getByLabelText('Delete tag easter'));
    fireEvent.mouseDown(screen.getByLabelText('Confirm delete tag easter'));

    await waitFor(() => {
      expect(
        fn.mock.calls.some(
          ([p, init]) =>
            String(p) === '/api/tags/t1' && init?.method === 'DELETE',
        ),
      ).toBe(true);
    });
  });

  it('imports songs from a JSON file and shows the result', async () => {
    const fn = stubFetch((path) => {
      if (path === '/api/auth/me')
        return {
          status: 200,
          body: {
            user: USER,
            memberships: [{ groupId: 'g1', role: 'member' }],
          },
        };
      if (path.startsWith('/api/tags'))
        return { status: 200, body: { tags: [] } };
      if (path === '/api/songs/import')
        return {
          status: 201,
          body: {
            imported: 1,
            arrangementsImported: 3,
            tagsImported: 2,
            songs: [SONGS[0]],
          },
        };
      if (path === '/api/songs/query')
        return { status: 200, body: { songs: [SONGS[0]] } };
      return { status: 404, body: {} };
    });

    renderApp('/songs');
    const input = await screen.findByLabelText('Import songs from JSON');
    const file = new File(
      [JSON.stringify({ songs: [{ title: 'Amazing Grace' }] })],
      'seed.json',
      { type: 'application/json' },
    );
    fireEvent.change(input, { target: { files: [file] } });

    const status = await screen.findByRole('status');
    expect(status.textContent).toContain(
      'Imported 1 song(s), 3 arrangement(s), 2 tag(s)',
    );

    const importCall = fn.mock.calls.find(
      ([p]) => String(p) === '/api/songs/import',
    );
    expect(importCall).toBeTruthy();
    expect(JSON.parse(String(importCall![1]?.body))).toEqual({
      songs: [{ title: 'Amazing Grace' }],
    });
  });
});
