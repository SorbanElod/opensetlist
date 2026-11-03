// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SetlistItem } from '../api/setlists';
import { renderApp } from '../test/renderApp';
import { stubFetch } from '../test/fetchMock';

const USER = {
  id: 'u1',
  email: 'elod@example.com',
  name: 'Előd',
  isSuperadmin: false,
  defaultView: 'chords',
};

const ARRANGEMENT = {
  id: 'a1',
  title: 'Default',
  songId: 's1',
  songTitle: 'Amazing Grace',
  originalKey: 'G',
  sectionLabels: ['V1', 'C1'],
  defaultSequence: ['V1', 'C1', 'V1'],
};

// Stateful stub: mutations update `items`, the GET returns current state, so
// the tests exercise the refetch-after-mutation wiring.
function makeDetail() {
  const items: SetlistItem[] = [
    {
      id: 'i1',
      setlistId: 'sl1',
      position: 1,
      arrangementId: 'a1',
      transposedKey: null,
      customSequence: null,
      notes: null,
      createdAt: '2026-12-01T10:00:00.000Z',
      arrangement: ARRANGEMENT,
      effectiveSequence: ['V1', 'C1', 'V1'],
    },
    {
      id: 'i2',
      setlistId: 'sl1',
      position: 2,
      arrangementId: 'a1',
      transposedKey: 'D',
      customSequence: ['C1', 'C1'],
      notes: 'capo 3',
      createdAt: '2026-12-01T10:00:00.000Z',
      arrangement: ARRANGEMENT,
      effectiveSequence: ['C1', 'C1'],
    },
    {
      id: 'i3',
      setlistId: 'sl1',
      position: 3,
      arrangementId: null,
      transposedKey: null,
      customSequence: null,
      notes: 'Soundcheck at 9:00',
      createdAt: '2026-12-01T10:00:00.000Z',
      arrangement: null,
      effectiveSequence: null,
    },
  ];
  let version = 4;
  return {
    get items() {
      return items;
    },
    get version() {
      return version;
    },
    bump() {
      version += 1;
    },
  };
}

function stubAuthed(detail: ReturnType<typeof makeDetail>) {
  return stubFetch((path, init) => {
    if (path === '/api/auth/me')
      return {
        status: 200,
        body: { user: USER, memberships: [{ groupId: 'g1', role: 'member' }] },
      };
    if (path === '/api/setlists/sl1' && (init?.method ?? 'GET') === 'GET') {
      return {
        status: 200,
        body: {
          setlist: {
            id: 'sl1',
            groupId: 'g1',
            title: 'Sunday service',
            eventDate: '2026-12-24',
            version: detail.version,
            createdAt: '2026-12-01T10:00:00.000Z',
            itemCount: detail.items.length,
          },
          items: detail.items,
        },
      };
    }
    if (path === '/api/setlists/sl1/items' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as {
        arrangementId?: string | null;
        notes?: string;
        version: number;
      };
      expect(body.version).toBe(detail.version);
      const item: SetlistItem = {
        id: `i-new-${detail.items.length}`,
        setlistId: 'sl1',
        position: detail.items.length + 1,
        arrangementId: body.arrangementId ?? null,
        transposedKey: null,
        customSequence: null,
        notes: body.notes ?? null,
        createdAt: '2026-12-02T10:00:00.000Z',
        arrangement: body.arrangementId ? ARRANGEMENT : null,
        effectiveSequence: body.arrangementId
          ? ARRANGEMENT.defaultSequence
          : null,
      };
      detail.items.push(item);
      detail.bump();
      return { status: 201, body: { item, setlistVersion: detail.version } };
    }
    const moveMatch = path.match(/^\/api\/setlists\/sl1\/items\/(.+)\/move$/);
    if (moveMatch && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as {
        direction: 'up' | 'down';
        version: number;
      };
      expect(body.version).toBe(detail.version);
      const index = detail.items.findIndex((i) => i.id === moveMatch[1]);
      const target = body.direction === 'up' ? index - 1 : index + 1;
      if (target >= 0 && target < detail.items.length) {
        const [moved] = detail.items.splice(index, 1);
        detail.items.splice(target, 0, moved!);
        detail.items.forEach((i, n) => (i.position = n + 1));
      }
      detail.bump();
      return {
        status: 200,
        body: { items: detail.items, setlistVersion: detail.version },
      };
    }
    if (path === '/api/songs') {
      return {
        status: 200,
        body: {
          songs: [
            {
              id: 's1',
              title: 'Amazing Grace',
              author: null,
              defaultKey: 'G',
              visibility: 'group',
              language: null,
              ownerId: 'u1',
              version: 1,
              createdAt: '2026-10-28T10:00:00.000Z',
              tags: [],
            },
          ],
        },
      };
    }
    if (path === '/api/songs/s1/arrangements') {
      return {
        status: 200,
        body: {
          arrangements: [
            {
              id: 'a1',
              songId: 's1',
              title: 'Default',
              originalKey: 'G',
              bpm: null,
              defaultSequence: ['V1', 'C1', 'V1'],
              sections: [
                { label: 'V1', content: 'X:1' },
                { label: 'C1', content: 'X:1' },
              ],
              version: 1,
              createdAt: '2026-10-28T10:00:00.000Z',
            },
          ],
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

describe('SetlistDetailPage', () => {
  it('renders items with key/sequence overrides and note rows', async () => {
    stubAuthed(makeDetail());
    renderApp('/setlists/sl1');

    expect((await screen.findAllByText('Amazing Grace — Default')).length).toBe(
      2,
    );
    // First item: default key + default sequence; second: transposed + custom.
    expect(screen.getAllByText(/G · V1 → C1 → V1/).length).toBe(1);
    expect(screen.getByText(/G → D · C1 → C1/)).toBeTruthy();
    expect(screen.getByText('capo 3')).toBeTruthy();
    expect(screen.getByText('Soundcheck at 9:00')).toBeTruthy();

    // On-stage view link (issue #62) is present for everyone.
    const viewLink = screen.getByRole('link', { name: 'View setlist' });
    expect(viewLink.getAttribute('href')).toBe('/setlists/sl1/view');
  });

  it('moves an item up and reflects the new order after refetch', async () => {
    const detail = makeDetail();
    const fetchMock = stubAuthed(detail);
    renderApp('/setlists/sl1');

    const moveButtons = await screen.findAllByRole('button', {
      name: /move item 3 up/i,
    });
    fireEvent.click(moveButtons[0]!);

    await waitFor(() =>
      expect(detail.items.map((i) => i.id)).toEqual(['i1', 'i3', 'i2']),
    );
    const moveCall = fetchMock.mock.calls.find(([path]) =>
      String(path).endsWith('/items/i3/move'),
    );
    expect(JSON.parse(String(moveCall![1]?.body))).toEqual({
      direction: 'up',
      version: 4,
    });
    // Note row now shows at position 2.
    expect(await screen.findByText('2')).toBeTruthy();
  });

  it('adds a note-only item', async () => {
    const detail = makeDetail();
    stubAuthed(detail);
    renderApp('/setlists/sl1');

    fireEvent.click(await screen.findByRole('button', { name: /add note/i }));
    const form = screen.getByLabelText('Note').closest('form')!;
    fireEvent.change(screen.getByLabelText('Note'), {
      target: { value: 'Offering during last song' },
    });
    fireEvent.click(
      Array.from(form.querySelectorAll('button')).find(
        (b) => b.textContent === 'Add note',
      )!,
    );

    expect(await screen.findByText('Offering during last song')).toBeTruthy();
    expect(detail.items.some((i) => i.arrangementId === null)).toBe(true);
  });
});
