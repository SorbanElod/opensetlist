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

const SONG = {
  id: 's1',
  title: 'Amazing Grace',
  author: 'John Newton',
  defaultKey: 'G',
  visibility: 'group',
  language: 'en',
  ownerId: 'u1',
  version: 1,
  createdAt: '2026-10-28T10:00:00.000Z',
  tags: [],
};

const meMember = (path: string) =>
  path === '/api/auth/me'
    ? {
        status: 200,
        body: { user: USER, memberships: [{ groupId: 'g1', role: 'member' }] },
      }
    : undefined;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SongFormPage', () => {
  it('blocks an empty submit with a client-side error and never calls the API', async () => {
    const fn = stubFetch((path) => {
      const me = meMember(path);
      if (me) return me;
      return { status: 500, body: {} };
    });

    renderApp('/songs/new');
    fireEvent.click(await screen.findByRole('button', { name: /save song/i }));

    expect(await screen.findByText('Title is required')).toBeTruthy();
    expect(
      fn.mock.calls.filter(([p]) => String(p) === '/api/songs'),
    ).toHaveLength(0);
  });

  it('creates a song and navigates to its detail page', async () => {
    stubFetch((path, init) => {
      const me = meMember(path);
      if (me) return me;
      if (path === '/api/songs' && init?.method === 'POST')
        return { status: 201, body: { song: SONG } };
      if (path === '/api/songs/s1')
        return { status: 200, body: { song: SONG } };
      return { status: 404, body: {} };
    });

    renderApp('/songs/new');
    fireEvent.change(await screen.findByLabelText('Title'), {
      target: { value: 'Amazing Grace' },
    });
    fireEvent.change(screen.getByLabelText('Author / source'), {
      target: { value: 'John Newton' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save song/i }));

    // Detail page of the created song (h1 + author line).
    expect(
      await screen.findByRole('heading', { name: 'Amazing Grace' }),
    ).toBeTruthy();
  });

  it('prefills the form in edit mode and shows the conflict banner on a stale 409', async () => {
    stubFetch((path, init) => {
      const me = meMember(path);
      if (me) return me;
      if (path === '/api/songs/s1' && (!init?.method || init.method === 'GET'))
        return { status: 200, body: { song: SONG } };
      if (path === '/api/songs/s1' && init?.method === 'PATCH')
        return {
          status: 409,
          body: {
            message: 'Song was modified by someone else — reload and try again',
          },
        };
      return { status: 404, body: {} };
    });

    renderApp('/songs/s1/edit');

    // Wait for the song to load and prefill the title input.
    fireEvent.change(await screen.findByDisplayValue('Amazing Grace'), {
      target: { value: 'Amazing Grace (reprise)' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('modified by someone else');
  });

  it('adds tags via the token input (autocomplete + typed new) and sends them on submit', async () => {
    let posted: unknown;
    stubFetch((path, init) => {
      const me = meMember(path);
      if (me) return me;
      if (path === '/api/tags')
        return {
          status: 200,
          body: {
            tags: [
              {
                id: 't1',
                name: 'easter',
                createdAt: '2026-10-28T10:00:00.000Z',
              },
            ],
          },
        };
      if (path === '/api/songs' && init?.method === 'POST') {
        posted = JSON.parse(String(init.body));
        return {
          status: 201,
          body: {
            song: { ...SONG, tags: (posted as { tags?: string[] }).tags ?? [] },
          },
        };
      }
      if (path === '/api/songs/s1')
        return { status: 200, body: { song: SONG } };
      return { status: 404, body: {} };
    });

    renderApp('/songs/new');
    fireEvent.change(await screen.findByLabelText('Title'), {
      target: { value: 'Amazing Grace' },
    });

    // Pick the existing tag from the autocomplete.
    const tagInput = screen.getByLabelText('Tags');
    fireEvent.change(tagInput, { target: { value: 'eas' } });
    fireEvent.mouseDown(await screen.findByText('easter'));
    expect(await screen.findByLabelText('Remove tag easter')).toBeTruthy();

    // Type a brand-new tag; Enter commits it, normalized to lowercase.
    fireEvent.change(tagInput, { target: { value: 'Campfire' } });
    fireEvent.keyDown(tagInput, { key: 'Enter' });
    expect(screen.getByLabelText('Remove tag campfire')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /save song/i }));
    await screen.findByRole('heading', { name: 'Amazing Grace' });
    expect((posted as { tags: string[] }).tags).toEqual(['easter', 'campfire']);
  });
});
