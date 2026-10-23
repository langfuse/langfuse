import { useState } from "react";

/**
 * Open state of a media chip's peek. `armed` turns true on the first open and
 * stays true, so the URL is fetched lazily once and re-hovers read the cache;
 * every open also asks the resolver to renew an expiring or failed URL.
 */
export function useMediaPeek() {
  const [armed, setArmed] = useState(false);
  const [open, setOpen] = useState(false);

  const onOpenChange = (
    nextOpen: boolean,
    refreshIfNeeded: () => Promise<void>,
  ) => {
    setOpen(nextOpen);
    if (!nextOpen) return;

    setArmed(true);
    refreshIfNeeded().catch(() => undefined);
  };

  return { armed, open, onOpenChange };
}
