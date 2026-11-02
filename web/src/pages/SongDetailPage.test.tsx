// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// abcjs draws real SVG; in jsdom we only care how the page calls it (the
// sheet view). The chords/lyrics views are plain text and need no abcjs.
vi.mock('abcjs', () => ({ renderAbc: vi.fn() }));
import { renderAbc } from 'abcjs';

import type { DefaultView, GroupRole } from '../api/auth';
import { renderApp } from '../test/renderApp';
import { stubFetch } from '../test/fetchMock';

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
const INTRO_ABC = 'X:1\nK:G\n"G"G2 G2 |\nw: in-tro';

// a1 is newer: listArrangements orders by created_at DESC, so a1 is first
// and therefore the implicit "default" arrangement (design decision #51).
const A1 = {
  id: 'a1',
  songId: 's1',
  title: 'Acoustic',
  originalKey: 'G',
  bpm: 96,
  defaultSequence: ['V1', 'C1', 'V1'],
  sections: [
    { label: 'V1', content: V1_ABC },
    { label: 'C1', content: C1_ABC },
  ],
  version: 1,
  createdAt: '2026-10-29T10:00:00.000Z',
};

const A2 = {
  id: 'a2',
  songId: 's1',
  title: 'Electric',
  originalKey: 'D',
  bpm: 140,
  defaultSequence: ['Intro'],
  sections: [{ label: 'Intro', content: INTRO_ABC }],
  version: 1,
  createdAt: '2026-10-20T10:00:00.000Z',
};

function stubApi({
  defaultView = 'sheet' as DefaultView,
  role = 'member' as GroupRole,
  arrangements = [A1, A2],
}: {
  defaultView?: DefaultView;
  role?: GroupRole;
  arrangements?: (typeof A1)[];
} = {}) {
  return stubFetch((path) => {
    if (path === '/api/auth/me')
      return {
        status: 200,
        body: {
          user: { ...USER, defaultView },
          memberships: [{ groupId: 'g1', role }],
        },
      };
    if (path === '/api/songs/s1') return { status: 200, body: { song: SONG } };
    if (path === '/api/songs/s1/arrangements')
      return { status: 200, body: { arrangements } };
    return { status: 404, body: {} };
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.mocked(renderAbc).mockClear();
});

describe('SongDetailPage (issue #51: inline default arrangement)', () => {
  it('renders the newest arrangement inline — sections in play order, no click-through', async () => {
    const fn = stubApi();
    renderApp('/songs/s1');

    // V1 twice (repeats legal), C1 once — straight from the sequence.
    expect(
      (await screen.findAllByRole('heading', { level: 2, name: 'V1' })).length,
    ).toBe(2);
    expect(
      screen.getAllByRole('heading', { level: 2, name: 'C1' }).length,
    ).toBe(1);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Amazing Grace' }),
    ).toBeTruthy();
    // The inline block names the rendered arrangement (the title also
    // appears in the arrangements list card and the switcher option).
    expect(screen.getAllByText('Acoustic').length).toBeGreaterThan(0);
    // Sheet view (the stored default) goes through abcjs with the raw ABC.
    await waitFor(() => {
      expect(vi.mocked(renderAbc).mock.calls.length).toBeGreaterThan(0);
    });
    // One fetch for the arrangements list — the inline render reuses it.
    const arrangementCalls = fn.mock.calls.filter(
      ([p]) => String(p) === '/api/songs/s1/arrangements',
    ).length;
    expect(arrangementCalls).toBe(1);
  });

  it('shows the arrangement switcher only with more than one arrangement; switching is client-side', async () => {
    const fn = stubApi();
    renderApp('/songs/s1');

    const switcher = await screen.findByRole('combobox', {
      name: 'Arrangement',
    });
    // Defaults to the newest arrangement.
    expect((switcher as HTMLSelectElement).value).toBe('a1');

    fireEvent.change(switcher, { target: { value: 'a2' } });

    // The other arrangement's sections render, still without refetching.
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Intro' }),
    ).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 2, name: 'V1' })).toBeNull();
    expect(screen.getAllByText('Electric').length).toBeGreaterThan(0);
    const arrangementCalls = fn.mock.calls.filter(
      ([p]) => String(p) === '/api/songs/s1/arrangements',
    ).length;
    expect(arrangementCalls).toBe(1);
  });

  it('hides the switcher when the song has a single arrangement', async () => {
    stubApi({ arrangements: [A1] });
    renderApp('/songs/s1');

    // V1 is in the sequence twice, so it renders twice.
    expect(
      (await screen.findAllByRole('heading', { level: 2, name: 'V1' })).length,
    ).toBe(2);
    expect(screen.queryByRole('combobox', { name: 'Arrangement' })).toBeNull();
  });

  it('seeds the Sheet | Chords | Lyrics toggle from the stored default view', async () => {
    stubApi({ defaultView: 'lyrics' });
    renderApp('/songs/s1');

    // Lyrics view straight away: words only, no abcjs render, no click —
    // the renderer seeds the view before rendering sections, so the sheet
    // view never flashes for a non-sheet default.
    expect((await screen.findAllByText('amazing grace')).length).toBe(2);
    expect(screen.getByText('how sweet')).toBeTruthy();
    expect(vi.mocked(renderAbc).mock.calls).toHaveLength(0);
    expect(
      screen
        .getByRole('button', { name: /lyrics/i })
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('keeps the empty state for songs without arrangements', async () => {
    stubApi({ arrangements: [] });
    renderApp('/songs/s1');

    expect(await screen.findByText(/No arrangements yet/)).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Arrangement' })).toBeNull();
    expect(screen.queryByRole('button', { name: /sheet/i })).toBeNull();
    expect(screen.queryByRole('heading', { level: 2, name: 'V1' })).toBeNull();
  });

  it('readers see the same inline content (no edit controls)', async () => {
    stubApi({ role: 'reader' });
    renderApp('/songs/s1');

    expect(
      (await screen.findAllByRole('heading', { level: 2, name: 'V1' })).length,
    ).toBe(2);
    expect(screen.queryByLabelText('Edit song')).toBeNull();
    expect(screen.queryByText('New arrangement')).toBeNull();
  });
});
