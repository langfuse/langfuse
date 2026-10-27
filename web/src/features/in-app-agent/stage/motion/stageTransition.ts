type StageTransitionResult = "finished" | "interrupted";

export type StageTransition = {
  /** Current progress, 0 (page) to 1 (bubble). */
  getProgress: () => number;
  /** Animates from wherever the flight is now; a new call interrupts the old. */
  animateTo: (
    target: 0 | 1,
    options: { durationMs: number; ease: (t: number) => number },
  ) => Promise<StageTransitionResult>;
  /** Jumps without animating, e.g. when motion is reduced. */
  jumpTo: (progress: number) => void;
  cancel: () => void;
};

/**
 * Drives one rAF loop for the stage flight. Page texture and chat layer both
 * read the same progress value inside `apply`, so they cannot drift apart
 * even when the main thread drops a frame.
 */
export function createStageTransition(
  apply: (progress: number) => void,
): StageTransition {
  let progress = 0;
  let frame = 0;
  let settle: ((result: StageTransitionResult) => void) | null = null;

  const stop = (result: StageTransitionResult) => {
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    settle?.(result);
    settle = null;
  };

  return {
    getProgress: () => progress,
    animateTo(target, { durationMs, ease }) {
      stop("interrupted");
      const from = progress;
      const distance = Math.abs(target - from);
      if (distance === 0 || durationMs <= 0) {
        progress = target;
        apply(progress);
        return Promise.resolve("finished");
      }
      // An interrupted flight only travels the rest of the way, so it gets
      // the matching share of the duration.
      const duration = durationMs * distance;
      return new Promise<StageTransitionResult>((resolve) => {
        settle = resolve;
        let startedAt: number | null = null;
        const tick = (now: number) => {
          if (startedAt === null) {
            startedAt = now;
          }
          const t = Math.min(1, (now - startedAt) / duration);
          progress = from + (target - from) * ease(t);
          apply(progress);
          if (t >= 1) {
            frame = 0;
            settle = null;
            resolve("finished");
            return;
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      });
    },
    jumpTo(next) {
      stop("interrupted");
      progress = next;
      apply(progress);
    },
    cancel() {
      stop("interrupted");
    },
  };
}
