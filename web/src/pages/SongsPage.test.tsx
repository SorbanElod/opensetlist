// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderApp } from '../test/renderApp';
import { stubFetch } from '../test/fetchMock';

const USER = {
  id: 'u1',
  email: 'elod@example.com',
  name: 'Előd',
  isSuperadmin: false,
};

const SONGS = [
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
  },
];

function stubAuthed(role: string, songs = SONGS) {
  return stubFetch((path) => {
    if (path === '/api/auth/me')
      return {
        status: 200,
        body: { user: USER, memberships: [{ groupId: 'g1', role }] },
      };
    if (path === '/api/songs') return { status: 200, body: { songs } };
    return { status: 404, body: {} };
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SongsPage', () => {
  it('lists songs and filters them by search', async () => {
    stubAuthed('member');
    renderApp('/songs');

    expect(await screen.findByText('Amazing Grace')).toBeTruthy();
    expect(screen.getByText('Be Thou My Vision')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Search songs'), {
      target: { value: 'grace' },
    });
    expect(screen.getByText('Amazing Grace')).toBeTruthy();
    expect(screen.queryByText('Be Thou My Vision')).toBeNull();
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

  it('imports songs from a JSON file and shows the result', async () => {
    const fn = stubFetch((path, init) => {
      if (path === '/api/auth/me')
        return {
          status: 200,
          body: {
            user: USER,
            memberships: [{ groupId: 'g1', role: 'member' }],
          },
        };
      if (path === '/api/songs/import')
        return {
          status: 201,
          body: { imported: 1, skippedArrangements: 3, songs: [SONGS[0]] },
        };
      if (path === '/api/songs' && (!init?.method || init.method === 'GET'))
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
    expect(status.textContent).toContain('Imported 1 song');
    expect(status.textContent).toContain('3 arrangement(s) skipped');

    const importCall = fn.mock.calls.find(
      ([p]) => String(p) === '/api/songs/import',
    );
    expect(importCall).toBeTruthy();
    expect(JSON.parse(String(importCall![1]?.body))).toEqual({
      songs: [{ title: 'Amazing Grace' }],
    });
  });
});
