// @vitest-environment jsdom
// abcjs draws real SVG; in jsdom we only assert what ABC the page hands it.
vi.mock('abcjs', () => ({ renderAbc: vi.fn() }));

import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderAbc } from 'abcjs';

import type { SetlistDetail } from '../api/setlists';
import { renderApp } from '../test/renderApp';
import { stubFetch } from '../test/fetchMock';

const USER = {
  id: 'u1',
  email: 'elod@example.com',
  name: 'Előd',
  isSuperadmin: false,
  defaultView: 'chords',
};

const ARRANGEMENT_A1 = {
  id: 'a1',
  songId: 's1',
  title: 'Default',
  originalKey: 'G',
  bpm: 96,
  defaultSequence: ['V1', 'C1'],
  sections: [
    { label: 'V1', content: 'X:1\nK:G\nw: A-mazing grace\n"G"GAB c2B |' },
    { label: 'C1', content: 'X:1\nK:G\nw: How sweet the sound\n"C"G2 G2 |' },
  ],
  version: 1,
  createdAt: '2026-10-28T10:00:00.000Z',
};

const ARRANGEMENT_A2 = {
  id: 'a2',
  songId: 's2',
  title: 'Standard (G)',
  originalKey: 'G',
  bpm: 100,
  defaultSequence: ['V1', 'C1'],
  sections: [
    { label: 'V1', content: 'X:1\nK:G\nw: Joy to the world\n"G"G2 G2 |' },
    { label: 'C1', content: 'X:1\nK:G\nw: The Lord is come\n"C"G2 G2 |' },
  ],
  version: 1,
  createdAt: '2026-10-28T10:00:00.000Z',
};

const DETAIL: SetlistDetail = {
  setlist: {
    id: 'sl1',
    groupId: 'g1',
    title: 'Sunday service',
    eventDate: '2026-12-24',
    version: 4,
    createdAt: '2026-12-01T10:00:00.000Z',
    itemCount: 3,
  },
  items: [
    {
      id: 'i1',
      setlistId: 'sl1',
      position: 1,
      arrangementId: 'a1',
      transposedKey: 'D',
      customSequence: null,
      notes: 'Start slow',
      createdAt: '2026-12-01T10:00:00.000Z',
      arrangement: {
        id: 'a1',
        title: 'Default',
        songId: 's1',
        songTitle: 'Amazing Grace',
        originalKey: 'G',
        sectionLabels: ['V1', 'C1'],
        defaultSequence: ['V1', 'C1'],
      },
      effectiveSequence: ['V1', 'C1'],
    },
    {
      id: 'i2',
      setlistId: 'sl1',
      position: 2,
      arrangementId: null,
      transposedKey: null,
      customSequence: null,
      notes: 'Soundcheck at 9:00',
      createdAt: '2026-12-01T10:00:00.000Z',
      arrangement: null,
      effectiveSequence: null,
    },
    {
      id: 'i3',
      setlistId: 'sl1',
      position: 3,
      arrangementId: 'a2',
      transposedKey: null,
      customSequence: ['C1', 'V1'],
      notes: null,
      createdAt: '2026-12-01T10:00:00.000Z',
      arrangement: {
        id: 'a2',
        title: 'Standard (G)',
        songId: 's2',
        songTitle: 'Joy to the World',
        originalKey: 'G',
        sectionLabels: ['V1', 'C1'],
        defaultSequence: ['V1', 'C1'],
      },
      effectiveSequence: ['C1', 'V1'],
    },
  ],
};

function stubApi() {
  return stubFetch((path, init) => {
    if (path === '/api/auth/me')
      return {
        status: 200,
        body: { user: USER, memberships: [{ groupId: 'g1', role: 'member' }] },
      };
    if (path === '/api/setlists/sl1' && (init?.method ?? 'GET') === 'GET')
      return { status: 200, body: DETAIL };
    if (path === '/api/arrangements/a1')
      return { status: 200, body: { arrangement: ARRANGEMENT_A1 } };
    if (path === '/api/arrangements/a2')
      return { status: 200, body: { arrangement: ARRANGEMENT_A2 } };
    return { status: 404, body: {} };
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.mocked(renderAbc).mockClear();
});

describe('SetlistViewPage', () => {
  it('renders items in position order with the note card inline', async () => {
    stubApi();
    const { container } = renderApp('/setlists/sl1/view');

    await screen.findByText(/Amazing Grace — Default/);
    const cards = Array.from(
      container.querySelectorAll('[data-testid="setlist-view-item"]'),
    );
    expect(cards.length).toBe(3);
    expect(cards[0]!.textContent).toContain('Amazing Grace — Default');
    expect(cards[1]!.textContent).toContain('Soundcheck at 9:00');
    expect(cards[2]!.textContent).toContain('Joy to the World — Standard (G)');
  });

  it('shows the key override badge and item notes', async () => {
    stubApi();
    renderApp('/setlists/sl1/view');

    expect(await screen.findByText(/G → D/)).toBeTruthy();
    expect(screen.getByText('Start slow')).toBeTruthy();
  });

  it('renders sections in the custom sequence order of the item', async () => {
    stubApi();
    const { container } = renderApp('/setlists/sl1/view');

    await screen.findByText(/Joy to the World — Standard/);
    const cards = Array.from(
      container.querySelectorAll('[data-testid="setlist-view-item"]'),
    );
    const third = within(cards[2] as HTMLElement);
    const headings = third
      .getAllByRole('heading')
      .map((h) => h.textContent ?? '');
    const c1 = headings.indexOf('C1');
    const v1 = headings.indexOf('V1');
    expect(c1).toBeGreaterThanOrEqual(0);
    expect(v1).toBeGreaterThan(c1);
  });

  it('transposes the ABC at render time when switching to sheet view', async () => {
    stubApi();
    renderApp('/setlists/sl1/view');

    await screen.findByText(/Amazing Grace — Default/);
    // Default view is chords — abcjs not called yet.
    expect(vi.mocked(renderAbc).mock.calls.length).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: /sheet/i }));
    await screen.findByText(/Amazing Grace — Default/);

    const rendered = vi
      .mocked(renderAbc)
      .mock.calls.map(([, abc]) => String(abc));
    // Item 1 is transposed G -> D: K: line and chord symbols shift.
    expect(rendered.some((a) => a.includes('K:D') && a.includes('"D"'))).toBe(
      true,
    );
    // Item 3 stays in G.
    expect(rendered.some((a) => a.includes('K:G'))).toBe(true);
  });

  it('one-at-a-time mode shows a single item; prev/next and arrow keys move between items', async () => {
    stubApi();
    renderApp('/setlists/sl1/view');

    await screen.findByText(/Amazing Grace — Default/);
    fireEvent.click(screen.getByRole('button', { name: /one at a time/i }));

    // Only the first item is rendered; prev is disabled at the start.
    expect(screen.queryByText(/Joy to the World/)).toBeNull();
    expect(screen.getByText(/1 \/ 3/)).toBeTruthy();
    expect(
      (
        screen.getByRole('button', {
          name: 'Previous item',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    // Next -> the note card is item 2.
    fireEvent.click(screen.getByRole('button', { name: 'Next item' }));
    expect(await screen.findByText('Soundcheck at 9:00')).toBeTruthy();
    expect(screen.queryByText(/Amazing Grace — Default/)).toBeNull();
    expect(screen.getByText(/2 \/ 3/)).toBeTruthy();

    // Next -> last item; next disabled at the end.
    fireEvent.click(screen.getByRole('button', { name: 'Next item' }));
    expect(await screen.findByText(/Joy to the World — Standard/)).toBeTruthy();
    expect(screen.getByText(/3 \/ 3/)).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Next item' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    // ArrowLeft goes back to item 2.
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(await screen.findByText('Soundcheck at 9:00')).toBeTruthy();
    expect(screen.getByText(/2 \/ 3/)).toBeTruthy();
  });

  it('scales the whole item (notes included) in text views via the item-level zoom wrapper', async () => {
    stubApi();
    const { container } = renderApp('/setlists/sl1/view');

    await screen.findByText(/Amazing Grace — Default/);
    // Default view is chords: the item wrapper (outside the card) starts at 100%.
    const itemWrapper = container.querySelector(
      '[data-testid="setlist-view-item"]',
    )!;
    expect(itemWrapper.getAttribute('style')).toMatch(/zoom:\s*1(;|$)/);

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    // The wrapper holding header + notes + sections scales together, with
    // width compensation so the card keeps its on-screen width.
    expect(itemWrapper.getAttribute('style')).toContain('zoom: 1.1');
    expect(itemWrapper.getAttribute('style')).toContain('width:');
    expect(screen.getByText('Start slow')).toBeTruthy();

    // Zooming out: no width compensation — the card shrinks instead of
    // staying full-width with tiny text.
    const out = screen.getByRole('button', { name: 'Zoom out' });
    for (let i = 0; i < 6; i++) fireEvent.click(out);
    expect(itemWrapper.getAttribute('style')).toContain('zoom: 0.5');
    expect(itemWrapper.getAttribute('style')).not.toContain('width:');
  });

  it('zooms the sheet view through the abcjs scale param', async () => {
    stubApi();
    renderApp('/setlists/sl1/view');

    await screen.findByText(/Amazing Grace — Default/);
    fireEvent.click(screen.getByRole('button', { name: /sheet/i }));
    await waitFor(() => {
      expect(vi.mocked(renderAbc).mock.calls.length).toBeGreaterThan(0);
    });
    // 100%: fit-to-width responsive render.
    expect(vi.mocked(renderAbc).mock.calls[0]![2]).toEqual({
      responsive: 'resize',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    await waitFor(() => {
      expect(vi.mocked(renderAbc).mock.calls.at(-1)![2]).toEqual({
        scale: 1.1,
      });
    });
  });

  it('applies the top-level view toggle to all items', async () => {
    stubApi();
    renderApp('/setlists/sl1/view');

    await screen.findByText(/Amazing Grace — Default/);
    fireEvent.click(screen.getByRole('button', { name: /lyrics/i }));

    // Lyrics of both arrangement items are visible after one click.
    expect(await screen.findByText('Amazing grace')).toBeTruthy();
    expect(screen.getByText('Joy to the world')).toBeTruthy();
  });
});
