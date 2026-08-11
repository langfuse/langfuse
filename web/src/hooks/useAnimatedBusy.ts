import { useEffect, useRef, useState } from "react";

/**
 * Holds a short-lived busy flag on for whole animation cycles. A local refresh
 * often resolves in ~200ms, which shows as a single frame of spinner — this
 * keeps it on until the running animation has completed a full turn (and rounds
 * a slower fetch up to its next whole turn, so it never stops mid-rotation).
 */
export function useAnimatedBusy(busy: boolean, cycleMs = 1000): boolean {
  const [held, setHeld] = useState(busy);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (busy) {
      startedAt.current ??= Date.now();
      setHeld(true);
      return;
    }

    if (startedAt.current === null) return;

    const elapsed = Date.now() - startedAt.current;
    const cycles = Math.max(1, Math.ceil(elapsed / cycleMs));
    const remaining = startedAt.current + cycles * cycleMs - Date.now();
    const stop = () => {
      startedAt.current = null;
      setHeld(false);
    };

    if (remaining <= 0) {
      stop();
      return;
    }

    const id = setTimeout(stop, remaining);
    return () => clearTimeout(id);
  }, [busy, cycleMs]);

  return held;
}
