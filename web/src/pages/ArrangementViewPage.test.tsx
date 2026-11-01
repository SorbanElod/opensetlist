// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// abcjs draws real SVG; in jsdom we only care how the page calls it (the
// sheet view). The chords/lyrics views are plain text and need no abcjs.
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
  defaultView: 'sheet' as DefaultView,
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

const V1_ABC = 'X:1\nK:G\n"G"G2 A2 | "C"c2 B2 |\nw: a-ma-zing grace';
const C1_ABC = 'X:1\nK:G\n"D"d2 B2 |\nw: how sweet';

const ARRANGEMENT = {
  id: 'a1',
  songId: 's1',
  title: 'Acoustic',
  originalKey: 'G',
  bpm: 96,
  // V1 twice: repeats are legal and must both render.
  defaultSequence: ['V1', 'C1', 'V1'],
  sections: [
    { label: 'V1', content: V1_ABC },
    { label: 'C1', content: C1_ABC },
  ],
  version: 1,
  createdAt: '2026-10-29T10:00:00.000Z',
};

function stubApi(defaultView: DefaultView = 'sheet') {
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

  it('sheet view renders the raw ABC through abcjs (notation + chords)', async () => {
    stubApi('sheet');
    renderApp('/arrangements/a1');

    await screen.findAllByRole('heading', { level: 2 });
    // renderAbc fires in a setTimeout(0), so wait for the calls to land.
    await waitFor(() => {
      expect(vi.mocked(renderAbc).mock.calls.length).toBeGreaterThan(0);
    });
    // 3 sections in sequence order (V1, C1, V1) -> raw ABC passed through.
    const abcs = vi.mocked(renderAbc).mock.calls.map((c) => String(c[1]));
    expect(abcs).toEqual([V1_ABC, C1_ABC, V1_ABC]);
    expect(
      screen
        .getByRole('button', { name: /sheet/i })
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('chords view shows the text chord chart (chords over syllables, no staff, no quotes)', async () => {
    stubApi('chords');
    renderApp('/arrangements/a1');

    // Default preference chords: no abcjs render at all.
    await screen.findAllByRole('heading', { level: 2 });
    expect(vi.mocked(renderAbc).mock.calls).toHaveLength(0);
    // V1 is sequenced twice, so its chart renders twice.
    expect((await screen.findAllByText(/G a ma C zing grace/)).length).toBe(2);
    expect(screen.getByText(/D how sweet/)).toBeTruthy();
    expect(screen.queryByText(/"G"/)).toBeNull();
  });

  it('lyrics view shows words only — no chord symbols, no abcjs render', async () => {
    stubApi('lyrics');
    renderApp('/arrangements/a1');

    await screen.findAllByRole('heading', { level: 2 });
    expect(vi.mocked(renderAbc).mock.calls).toHaveLength(0);
    expect((await screen.findAllByText('amazing grace')).length).toBe(2);
    expect(screen.getByText('how sweet')).toBeTruthy();
    expect(screen.queryByText(/\bG\b a ma/)).toBeNull();
  });

  it('switches between all three views locally without refetching the arrangement', async () => {
    const fn = stubApi('sheet');
    renderApp('/arrangements/a1');

    await screen.findAllByRole('heading', { level: 2 });
    const arrangementCalls = () =>
      fn.mock.calls.filter(([p]) => String(p) === '/api/arrangements/a1')
        .length;
    expect(arrangementCalls()).toBe(1);

    // sheet -> chords: text chart appears, still one fetch.
    fireEvent.click(screen.getByRole('button', { name: /chords/i }));
    expect((await screen.findAllByText(/G a ma C zing grace/)).length).toBe(2);
    expect(arrangementCalls()).toBe(1);

    // chords -> lyrics: words only.
    fireEvent.click(screen.getByRole('button', { name: /lyrics/i }));
    expect((await screen.findAllByText('amazing grace')).length).toBe(2);
    expect(arrangementCalls()).toBe(1);

    // lyrics -> sheet: abcjs renders the raw ABC again.
    fireEvent.click(screen.getByRole('button', { name: /sheet/i }));
    await waitFor(() => {
      expect(
        vi.mocked(renderAbc).mock.calls.some((c) => String(c[1]) === V1_ABC),
      ).toBe(true);
    });
    expect(arrangementCalls()).toBe(1);
  });

  it('offers "Set as my default" when the view differs, and PATCHes /api/auth/me', async () => {
    const fn = stubApi('sheet');
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
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /set as my default/i }),
      ).toBeNull();
    });
  });
});
