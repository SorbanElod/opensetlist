// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// abcjs draws real SVG; in jsdom we only care how the page calls it
// (especially chordsOff for the lyrics view).
vi.mock('abcjs', () => ({ renderAbc: vi.fn() }));
import { renderAbc } from 'abcjs';

import { renderApp } from '../test/renderApp';
import { stubFetch } from '../test/fetchMock';
import type { DefaultView } from '../api/auth';

const USER = {
  id: 'u1',
  email: 'elod@example.com',
  name: 'Előd',
  isSuperadmin: false,
  defaultView: 'chords' as DefaultView,
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
  // V1 twice: repeats are legal and must both render.
  defaultSequence: ['V1', 'C1', 'V1'],
  sections: [
    { label: 'V1', content: 'X:1\nK:G\n"G"G2 G2 |' },
    { label: 'C1', content: 'X:1\nK:G\n"C"c2 B2 |' },
  ],
  version: 1,
  createdAt: '2026-10-29T10:00:00.000Z',
};

function stubApi(defaultView: DefaultView = 'chords') {
  return stubFetch((path, init) => {
    if (path === '/api/auth/me' && (!init?.method || init.method === 'GET'))
      return {
        status: 200,
        body: {
          user: { ...USER, defaultView },
          memberships: [{ groupId: 'g1', role: 'member' }],
        },
      };
    if (path === '/api/auth/me' && init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body)) as {
        defaultView: DefaultView;
      };
      return {
        status: 200,
        body: {
          user: { ...USER, defaultView: body.defaultView },
          memberships: [{ groupId: 'g1', role: 'member' }],
        },
      };
    }
    if (path === '/api/arrangements/a1')
      return { status: 200, body: { arrangement: ARRANGEMENT } };
    if (path === '/api/songs/s1') return { status: 200, body: { song: SONG } };
    return { status: 404, body: {} };
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.mocked(renderAbc).mockClear();
});

describe('ArrangementViewPage', () => {
  it('renders sections in sequence order, repeats included', async () => {
    stubApi();
    renderApp('/arrangements/a1');

    const headings = await screen.findAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(['V1', 'C1', 'V1']);
    expect(
      await screen.findByRole('heading', { name: 'Acoustic', level: 1 }),
    ).toBeTruthy();
  });

  it('defaults to the stored view preference: lyrics renders chord-stripped ABC', async () => {
    stubApi('lyrics');
    renderApp('/arrangements/a1');

    await screen.findAllByRole('heading', { level: 2 });
    // Lyrics preference: every section rendered from the SAME ABC with the
    // chord symbols stripped — no '"G"' anywhere, notes intact. (renderAbc
    // fires in a setTimeout(0), so wait for the calls to land.)
    await waitFor(() => {
      const calls = vi.mocked(renderAbc).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        // No chord symbols anywhere; the notes survive stripping.
        expect(String(call[1])).not.toContain('"');
      }
      expect(calls.some((c) => String(c[1]).includes('G2 G2 |'))).toBe(true);
    });
  });

  it('chords view renders the raw ABC, and switching to lyrics is local-only (no refetch)', async () => {
    const fn = stubApi('chords');
    renderApp('/arrangements/a1');

    await screen.findAllByRole('heading', { level: 2 });
    const arrangementCalls = () =>
      fn.mock.calls.filter(([p]) => String(p) === '/api/arrangements/a1')
        .length;
    expect(arrangementCalls()).toBe(1);
    // Chords default: raw ABC passed through untouched.
    await waitFor(() => {
      expect(
        vi
          .mocked(renderAbc)
          .mock.calls.every((c) => String(c[1]).includes('"G"')),
      ).toBe(true);
    });

    fireEvent.click(screen.getByRole('button', { name: /lyrics/i }));

    // Still one fetch — switching is client-side only.
    expect(arrangementCalls()).toBe(1);
    await waitFor(() => {
      expect(
        vi
          .mocked(renderAbc)
          .mock.calls.some((c) => !String(c[1]).includes('"')),
      ).toBe(true);
    });
    expect(
      screen
        .getByRole('button', { name: /lyrics/i })
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('offers "Set as my default" when the view differs, and PATCHes /api/auth/me', async () => {
    const fn = stubApi('chords');
    renderApp('/arrangements/a1');

    fireEvent.click(await screen.findByRole('button', { name: /lyrics/i }));
    const save = await screen.findByRole('button', {
      name: /set as my default/i,
    });
    fireEvent.click(save);

    const patch = fn.mock.calls.find(
      ([p, init]) => String(p) === '/api/auth/me' && init?.method === 'PATCH',
    );
    expect(patch).toBeTruthy();
    expect(JSON.parse(String(patch![1]?.body))).toEqual({
      defaultView: 'lyrics',
    });

    // After saving, the current view IS the default: the button disappears.
    expect(await screen.findByRole('button', { name: /lyrics/i })).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: /set as my default/i }),
    ).toBeNull();
  });
});
