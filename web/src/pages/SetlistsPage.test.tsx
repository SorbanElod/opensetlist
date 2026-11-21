// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Setlist } from '../api/setlists';
import { renderApp } from '../test/renderApp';
import { stubFetch } from '../test/fetchMock';

const USER = {
  id: 'u1',
  email: 'elod@example.com',
  name: 'Előd',
  isSuperadmin: false,
  defaultView: 'chords',
};

const SETLISTS: Setlist[] = [
  {
    id: 'sl1',
    groupId: 'g1',
    title: 'Sunday service',
    eventDate: '2026-12-24',
    version: 3,
    createdAt: '2026-12-01T10:00:00.000Z',
    itemCount: 5,
  },
  {
    id: 'sl2',
    groupId: 'g1',
    title: 'Youth night',
    eventDate: null,
    version: 1,
    createdAt: '2026-11-20T10:00:00.000Z',
    itemCount: 0,
  },
];

function stubAuthed(role: string, setlists: Setlist[] = SETLISTS) {
  return stubFetch((path, init) => {
    if (path === '/api/auth/me')
      return {
        status: 200,
        body: { user: USER, memberships: [{ groupId: 'g1', role }] },
      };
    if (path === '/api/setlists' && (init?.method ?? 'GET') === 'GET') {
      return { status: 200, body: { setlists } };
    }
    if (path === '/api/setlists' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { title: string };
      return {
        status: 201,
        body: {
          setlist: {
            id: 'sl-new',
            groupId: 'g1',
            title: body.title,
            eventDate: '2026-12-31',
            version: 1,
            createdAt: '2026-12-02T10:00:00.000Z',
            itemCount: 0,
          },
        },
      };
    }
    if (path === '/api/setlists/sl-new') {
      return {
        status: 200,
        body: {
          setlist: {
            id: 'sl-new',
            groupId: 'g1',
            title: 'Christmas Eve',
            eventDate: '2026-12-31',
            version: 1,
            createdAt: '2026-12-02T10:00:00.000Z',
            itemCount: 0,
          },
          items: [],
        },
      };
    }
    return { status: 404, body: {} };
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SetlistsPage', () => {
  it('lists setlists with item counts and event dates', async () => {
    stubAuthed('member');
    renderApp('/setlists');

    expect(await screen.findByText('Sunday service')).toBeTruthy();
    expect(screen.getByText('5 items · 2026-12-24')).toBeTruthy();
    expect(screen.getByText('Youth night')).toBeTruthy();
    expect(screen.getByText('0 items')).toBeTruthy();
  });

  it('creates a setlist and navigates to its detail page', async () => {
    const fetchMock = stubAuthed('member');
    renderApp('/setlists');

    fireEvent.click(
      await screen.findByRole('button', { name: /new setlist/i }),
    );
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Christmas Eve' },
    });
    fireEvent.change(screen.getByLabelText(/event date/i), {
      target: { value: '2026-12-31' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create setlist/i }));

    await screen.findByText('Empty setlist.', { exact: false });
    const post = fetchMock.mock.calls.find(
      ([path, init]) =>
        path === '/api/setlists' && (init?.method as string) === 'POST',
    );
    expect(post).toBeTruthy();
    expect(JSON.parse(String(post![1]?.body))).toEqual({
      title: 'Christmas Eve',
      eventDate: '2026-12-31',
    });
  });

  it('hides the create button for readers', async () => {
    stubAuthed('reader');
    renderApp('/setlists');

    expect(await screen.findByText('Sunday service')).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /new setlist/i })).toBeNull(),
    );
  });
});
