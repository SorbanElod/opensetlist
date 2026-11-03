// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { listeners } = vi.hoisted(() => ({
  listeners: new Map<string, () => void>(),
}));

// The socket singleton is replaced by a fake emitter we can trigger.
vi.mock('./socket', () => ({
  getSocket: () => ({
    on: (event: string, cb: () => void) => listeners.set(event, cb),
    off: (event: string) => listeners.delete(event),
  }),
}));

import { useLiveRefetch } from './useLiveRefetch';

function TestComp({ refetch }: { refetch: () => void }) {
  useLiveRefetch(refetch);
  return <div>test</div>;
}

afterEach(() => {
  cleanup();
  listeners.clear();
});

describe('useLiveRefetch (issue #13)', () => {
  it('refetches on setlist:changed and on window focus, and unsubscribes on unmount', () => {
    const refetch = vi.fn();
    const { unmount } = render(<TestComp refetch={refetch} />);

    expect(refetch).toHaveBeenCalledTimes(0);
    listeners.get('setlist:changed')!();
    expect(refetch).toHaveBeenCalledTimes(1);

    fireEvent(window, new Event('focus'));
    expect(refetch).toHaveBeenCalledTimes(2);

    unmount();
    expect(listeners.has('setlist:changed')).toBe(false);
  });

  it('calls the latest refetch after re-renders', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<TestComp refetch={first} />);
    rerender(<TestComp refetch={second} />);
    listeners.get('setlist:changed')!();
    expect(first).toHaveBeenCalledTimes(0);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
