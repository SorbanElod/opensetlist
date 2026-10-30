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
  });
});
