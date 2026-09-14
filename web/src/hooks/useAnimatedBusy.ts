import { useEffect, useRef, useState } from "react";

export type AnimatedBusy = {
  active: boolean;
  /**
   * Increments once per busy period. Key an animated element on it so each
   * period plays the animation from its start, without remounting (and
   * restarting) it while the period is still running.
   */
  epoch: number;
};

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
): AnimatedBusy {
  const [state, setState] = useState<AnimatedBusy>({
    active: busy,
    epoch: 0,
  });
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (busy) {
      startedAt.current ??= Date.now();
      setState((prev) =>
        prev.active ? prev : { active: true, epoch: prev.epoch + 1 },
      );
      return;
    }

    if (startedAt.current === null) return;

    const stop = () => {
      startedAt.current = null;
      setState((prev) => (prev.active ? { ...prev, active: false } : prev));
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

  return state;
}
