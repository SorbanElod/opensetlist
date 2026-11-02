// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// abcjs draws real SVG; in jsdom we only care that the editor calls it.
vi.mock('abcjs', () => ({ renderAbc: vi.fn() }));

import { renderApp } from '../test/renderApp';
import { stubFetch } from '../test/fetchMock';

const USER = {
  id: 'u1',
  email: 'elod@example.com',
  name: 'Előd',
  isSuperadmin: false,
  defaultView: 'chords',
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

const ARRANGEMENT = {
  id: 'a1',
  songId: 's1',
  title: 'Acoustic',
  originalKey: 'G',
  bpm: 96,
  defaultSequence: ['V1'],
  sections: [{ label: 'V1', content: 'X:1\nK:G\nG2 G2 |' }],
  version: 1,
  createdAt: '2026-10-29T10:00:00.000Z',
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

describe('ArrangementEditorPage', () => {
  it('blocks an empty title with a client-side error and never posts', async () => {
    const fn = stubFetch((path) => {
      const me = meMember(path);
      if (me) return me;
      if (path === '/api/songs/s1')
        return { status: 200, body: { song: SONG } };
      return { status: 404, body: {} };
    });

    renderApp('/songs/s1/arrangements/new');
    fireEvent.click(
      await screen.findByRole('button', { name: /save arrangement/i }),
    );

    expect(await screen.findByText('Title is required')).toBeTruthy();
    expect(
      fn.mock.calls.filter(([p]) => String(p).includes('/arrangements')),
    ).toHaveLength(0);
  });

  it('adds a section, puts it in the sequence, and creates the arrangement', async () => {
    let posted: unknown;
    stubFetch((path, init) => {
      const me = meMember(path);
      if (me) return me;
      if (path === '/api/songs/s1' && (!init?.method || init.method === 'GET'))
        return { status: 200, body: { song: SONG } };
      if (
        path === '/api/songs/s1/arrangements' &&
        (!init?.method || init.method === 'GET')
      )
        return { status: 200, body: { arrangements: [] } };
      if (path === '/api/songs/s1/arrangements' && init?.method === 'POST') {
        posted = JSON.parse(String(init.body));
        return {
          status: 201,
          body: { arrangement: { ...ARRANGEMENT, ...(posted as object) } },
        };
      }
      return { status: 404, body: {} };
    });

    renderApp('/songs/s1/arrangements/new');
    fireEvent.change(await screen.findByLabelText('Title'), {
      target: { value: 'Acoustic' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add section/i }));
    fireEvent.change(screen.getByLabelText('Section 1 label'), {
      target: { value: 'V1' },
    });
    fireEvent.change(screen.getByLabelText('Section 1 ABC content'), {
      target: { value: 'X:1\nK:G\nG2 G2 |' },
    });
    fireEvent.change(screen.getByLabelText('Add section to sequence'), {
      target: { value: 'V1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    fireEvent.click(screen.getByRole('button', { name: /save arrangement/i }));

    // Navigated to the song detail page of the created arrangement.
    expect(
      await screen.findByRole('heading', { name: 'Amazing Grace' }),
    ).toBeTruthy();
    expect(posted).toMatchObject({
      title: 'Acoustic',
      originalKey: 'G',
      sections: [{ label: 'V1', content: 'X:1\nK:G\nG2 G2 |' }],
      defaultSequence: ['V1'],
    });
  });

  it('prefills in edit mode and shows the conflict banner on a stale 409', async () => {
    stubFetch((path, init) => {
      const me = meMember(path);
      if (me) return me;
      if (
        path === '/api/arrangements/a1' &&
        (!init?.method || init.method === 'GET')
      )
        return { status: 200, body: { arrangement: ARRANGEMENT } };
      if (path === '/api/arrangements/a1' && init?.method === 'PATCH')
        return {
          status: 409,
          body: {
            message:
              'Arrangement was modified by someone else — reload and try again',
          },
        };
      if (path === '/api/songs/s1')
        return { status: 200, body: { song: SONG } };
      return { status: 404, body: {} };
    });

    renderApp('/arrangements/a1/edit');
    fireEvent.change(await screen.findByDisplayValue('Acoustic'), {
      target: { value: 'Acoustic (slow)' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('modified by someone else');
  });
});
