import { useEffect, useRef } from 'react';

import { getSocket } from './socket';

// Live updates (issue #13): notify-only. On `setlist:changed` from the
// server — and on window focus as the fallback — refetch. No diff/OT:
// the page refetches whatever it shows.
export function useLiveRefetch(refetch: () => void) {
  // Always call the latest refetch without re-subscribing (ref writes stay
  // inside an effect — react-hooks/refs).
  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  useEffect(() => {
    const socket = getSocket();
    const onChanged = () => refetchRef.current();
    const onFocus = () => refetchRef.current();
    socket.on('setlist:changed', onChanged);
    window.addEventListener('focus', onFocus);
    return () => {
      socket.off('setlist:changed', onChanged);
      window.removeEventListener('focus', onFocus);
    };
  }, []);
}
