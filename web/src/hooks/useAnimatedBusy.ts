import { useEffect, useRef, useState } from "react";

/**
 * Holds a short-lived busy flag on for whole animation cycles.
 *
 * Two problems it solves. A local refresh often resolves in ~200ms, which shows
 * as a single frame of animation. And one refresh is usually several sequential
 * queries — rows, then the batched I/O for those rows, then counts — so the raw
 * flag drops between stages and the animation would restart mid-refresh. The
 * flag is therefore released only after everything has been quiet for
 * `settleMs`, rounded up to a whole cycle so it never stops mid-rotation.
 */
export function useAnimatedBusy(
  busy: boolean,
  cycleMs = 1000,
  settleMs = 400,
): boolean {
  const [held, setHeld] = useState(busy);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (busy) {
      startedAt.current ??= Date.now();
      setHeld(true);
      return;
    }

    if (startedAt.current === null) return;

    const stop = () => {
      startedAt.current = null;
      setHeld(false);
    };

    const settledAt = Date.now() + settleMs;
    const cycles = Math.max(
      1,
      Math.ceil((settledAt - startedAt.current) / cycleMs),
    );
    const remaining = startedAt.current + cycles * cycleMs - Date.now();

    if (remaining <= 0) {
      stop();
      return;
    }

    const id = setTimeout(stop, remaining);
    return () => clearTimeout(id);
  }, [busy, cycleMs, settleMs]);

  return held;
}
